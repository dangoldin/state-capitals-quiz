#!/usr/bin/env node
// Checks data.js for mistakes that would make a quiz question wrong or unfair.
// Run: node scripts/check-data.js
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { geoContains, geoDistance } from "d3-geo";
import { feature } from "topojson-client";

const root = path.join(import.meta.dirname, "..", "site");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(root, "data.js"), "utf8") +
    "\nthis.COUNTRIES = COUNTRIES; this.US_STATES = US_STATES;",
  ctx,
);
const { COUNTRIES, US_STATES } = ctx;
vm.runInContext(fs.readFileSync(path.join(root, "facts.js"), "utf8") + "\nthis.FACTS = FACTS;", ctx);
const { FACTS } = ctx;

const errors = [];
const fail = (msg) => errors.push(msg);

// Same matching rules as normalize() in app.js.
const normalize = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/[.,'’ʻ`\-]/g, "")
    .trim()
    .replace(/\s+/g, " ");

const CONTINENTS = ["africa", "asia", "europe", "northAmerica", "southAmerica", "oceania"];
const isStrings = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x);

// 1. Shape of each country
if (COUNTRIES.length !== 193) fail(`expected 193 UN member states, found ${COUNTRIES.length}`);
for (const c of COUNTRIES) {
  const id = c.code || JSON.stringify(c).slice(0, 40);
  if (!/^[A-Z]{2}$/.test(c.code)) fail(`${id}: bad code`);
  if (!/^\d{3}$/.test(c.num)) fail(`${id}: bad numeric code`);
  if (!CONTINENTS.includes(c.continent)) fail(`${id}: bad continent ${c.continent}`);
  if (!c.name) fail(`${id}: no name`);
  if (!c.capital) fail(`${id}: no capital`);
  if (!(c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180)) fail(`${id}: bad lat/lng`);
  for (const k of ["aka", "capitalAlso", "capitalAka", "otherLanguages"]) {
    if (k in c && !isStrings(c[k])) fail(`${id}: ${k} must be a non-empty list of strings`);
  }
  const cur = c.currency || {};
  if (!cur.name || !cur.code) fail(`${id}: currency needs name and code`);
  if (cur.also && cur.also.includes(cur.name)) fail(`${id}: currency.also repeats the main currency`);
  if (!isStrings(c.languages)) fail(`${id}: languages must be a non-empty list`);
  const langs = [...(c.languages || []), ...(c.otherLanguages || [])];
  if (new Set(langs).size !== langs.length) fail(`${id}: a language is listed twice`);
}

// 2. Unique codes and names
const dupes = (values) => values.filter((v, i) => values.indexOf(v) !== i);
for (const d of dupes(COUNTRIES.map((c) => c.code))) fail(`duplicate code ${d}`);
for (const d of dupes(COUNTRIES.map((c) => c.num))) fail(`duplicate numeric code ${d}`);

// 3. A typed answer must point to one country only. Typos are allowed only
//    against capital and capitalAlso, so those need 3 or more letters.
for (const c of COUNTRIES) {
  for (const t of [c.capital, ...(c.capitalAlso || [])]) {
    if (typeof t === "string" && normalize(t).length < 3) fail(`${c.code}: capital "${t}" is too short for typo matching`);
  }
}
function checkTypedAnswers(label, answersOf) {
  const owner = new Map();
  for (const c of COUNTRIES) {
    for (const a of new Set(answersOf(c).map(normalize))) {
      if (owner.has(a)) fail(`${label} "${a}" belongs to both ${owner.get(a)} and ${c.code}`);
      else owner.set(a, c.code);
    }
  }
}
checkTypedAnswers("capital", (c) => [c.capital, ...(c.capitalAlso || []), ...(c.capitalAka || [])]);
checkTypedAnswers("country name", (c) => [c.name, ...(c.aka || [])]);

// 4. Every country has a flag, and no flag is left over
const flagDir = path.join(root, "flags");
const flagFiles = new Set(fs.existsSync(flagDir) ? fs.readdirSync(flagDir) : []);
for (const c of COUNTRIES) {
  const f = c.code.toLowerCase() + ".svg";
  if (!flagFiles.has(f)) fail(`${c.code}: missing flags/${f}`);
  flagFiles.delete(f);
}
for (const f of flagFiles) if (f.endsWith(".svg")) fail(`flags/${f} has no country`);

// 5. Multiple choice needs 3 wrong options that are not a correct answer for
//    the country. Currencies find them on the same continent. Languages
//    cannot: the Americas mostly share English and Spanish, so the language
//    game must also take wrong options from other continents.
function checkChoices(label, sameContinent, correctOf, optionOf) {
  for (const c of COUNTRIES) {
    const correct = new Set(correctOf(c));
    const pool = new Set(
      COUNTRIES.filter((o) => o !== c && (!sameContinent || o.continent === c.continent))
        .map(optionOf)
        .filter(Boolean)
        .filter((o) => !correct.has(o)),
    );
    if (pool.size < 3) fail(`${c.code}: only ${pool.size} wrong ${label} options`);
  }
}
checkChoices(
  "currency",
  true,
  (c) => [c.currency?.name, ...(c.currency?.also || [])],
  (o) => o.currency?.name,
);
checkChoices(
  "language",
  false,
  (c) => [...(c.languages || []), ...(c.otherLanguages || [])],
  (o) => o.languages?.[0],
);

// 6. US states
if (US_STATES.length !== 50) fail(`expected 50 US states, found ${US_STATES.length}`);
for (const d of dupes(US_STATES.map(([s]) => s))) fail(`duplicate state ${d}`);
for (const row of US_STATES) {
  const [state, cap, lat, lng] = row;
  if (row.length !== 4 || !state || typeof cap !== "string" || !cap || !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180))
    fail(`state row ${JSON.stringify(row)}: needs [name, capital, lat, lng]`);
}

// 7. Maps: every country and state has a shape, and every capital point is
//    on or next to its own shape. Coastal capitals sit on the shore, so allow
//    a small distance (the full-detail Natural Earth data needs up to 9 km).
const MAX_KM = 10;
const mapCtx = { window: {} };
vm.createContext(mapCtx);
for (const f of ["world.js", "us-states.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "map", f), "utf8"), mapCtx);
}
const kmFromShape = (shape, point) => {
  if (geoContains(shape, point)) return 0;
  let min = Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") min = Math.min(min, geoDistance(c, point));
    else c.forEach(walk);
  };
  walk(shape.geometry.coordinates);
  return min * 6371;
};
const world = mapCtx.window.WORLD_MAP;
const countryShapes = new Map(
  feature(world, world.objects.countries).features.map((f) => [f.properties.iso2, f]),
);
for (const c of COUNTRIES) {
  const shape = countryShapes.get(c.code);
  if (!shape) {
    fail(`${c.code}: no shape on the world map`);
    continue;
  }
  const km = kmFromShape(shape, [c.lng, c.lat]);
  if (km > MAX_KM) fail(`${c.code}: capital ${c.capital} is ${km.toFixed(1)} km from the country on the map`);
}
const us = mapCtx.window.US_MAP;
const stateShapes = new Map(
  feature(us, us.objects.states).features.map((f) => [f.properties.name, f]),
);
for (const [state, cap, lat, lng] of US_STATES) {
  const shape = stateShapes.get(state);
  if (!shape) {
    fail(`${state}: no shape on the US map`);
    continue;
  }
  const km = kmFromShape(shape, [lng, lat]);
  if (km > MAX_KM) fail(`${state}: capital ${cap} is ${km.toFixed(1)} km from the state on the map`);
}
for (const d of dupes(US_STATES.map(([, cap]) => normalize(cap || "")))) fail(`two states share the capital "${d}"`);

// 8. Chase facts: one entry per country, positive numbers, and land borders
//    that go both ways (A borders B ⇔ B borders A).
for (const c of COUNTRIES) {
  const f = FACTS[c.code];
  if (!f) {
    fail(`${c.code}: no entry in facts.js`);
    continue;
  }
  if (!(f.area > 0)) fail(`${c.code}: area must be a positive number`);
  if (!(Number.isInteger(f.population) && f.population > 0)) fail(`${c.code}: population must be a positive whole number`);
  if (typeof f.landlocked !== "boolean") fail(`${c.code}: landlocked must be true or false`);
  if (!Array.isArray(f.neighbors)) fail(`${c.code}: neighbors must be a list`);
  for (const n of f.neighbors || []) {
    if (!FACTS[n]) fail(`${c.code}: neighbor ${n} is not a UN member in the data`);
    else if (!FACTS[n].neighbors.includes(c.code)) fail(`${c.code} borders ${n}, but ${n} does not list ${c.code}`);
  }
  if (f.landlocked && !(f.neighbors || []).length) fail(`${c.code}: a landlocked country must have neighbors`);
}
for (const k of Object.keys(FACTS)) if (!COUNTRIES.some((c) => c.code === k)) fail(`facts.js: ${k} is not a country in data.js`);

if (errors.length) {
  console.error(errors.map((e) => "✗ " + e).join("\n"));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`✓ data.js and facts.js OK: ${COUNTRIES.length} countries, ${US_STATES.length} states, all flags present, all capitals on the maps.`);

#!/usr/bin/env node
// Tests the chase case engine: every step must lead to exactly one country.
// Run: node scripts/test-chase.js [cases per level]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const site = path.join(import.meta.dirname, "..", "site");
const ctx = {};
vm.createContext(ctx);
for (const f of ["data.js", "facts.js", "chase-engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(site, f), "utf8"), ctx);
}
vm.runInContext("this.E = ChaseEngine; this.C = COUNTRIES;", ctx);
const { E } = ctx;

const N = Number(process.argv[2]) || 5000;
const errors = [];
const fail = (m) => errors.length < 30 && errors.push(m);
const stats = {};

for (const level of E.LEVELS) {
  const types = {};
  let together = 0, stepsTotal = 0;
  for (let i = 0; i < N; i++) {
    const seed = i * 7919 + 13;
    const c = E.makeCase({ seed, level });
    const id = `${level} seed ${seed}`;
    // Same seed, same case.
    if (JSON.stringify(E.makeCase({ seed, level }).steps.map((s) => s.to)) !== JSON.stringify(c.steps.map((s) => s.to)))
      fail(`${id}: not repeatable`);
    const seen = new Set([c.start]);
    let from = c.start;
    for (const [j, s] of c.steps.entries()) {
      stepsTotal++;
      if (s.from !== from) fail(`${id} step ${j}: from ${s.from}, expected ${from}`);
      if (seen.has(s.to)) fail(`${id} step ${j}: ${s.to} visited twice`);
      seen.add(s.to);
      from = s.to;
      const sol = E.solve(s.clues);
      if (sol.length !== 1 || sol[0] !== s.to) fail(`${id} step ${j}: clues fit [${sol}], expected ${s.to}: ${s.clues.map((x) => x.text).join(" | ")}`);
      if (s.clues.length < 2) fail(`${id} step ${j}: fewer than 2 clues`);
      for (const cl of s.clues) {
        types[cl.type] = (types[cl.type] || 0) + 1;
        if (!cl.text) fail(`${id} step ${j}: empty clue text`);
        if (cl.type === "flag" && !cl.flag) fail(`${id} step ${j}: flag clue without a flag`);
      }
      // Clues that only work together (no single clue is enough).
      if (s.clues.every((cl) => E.solve([cl]).length > 1)) together++;
      if (E.solve([E.extraClue(s.to)]).join() !== s.to) fail(`${id} step ${j}: the extra clue does not name ${s.to}`);
      if (level === "easy") {
        const o = s.options || [];
        if (o.length !== 4 || new Set(o).size !== 4 || !o.includes(s.to)) fail(`${id} step ${j}: bad options ${o}`);
        for (const k of o) if (k !== s.to && s.clues.every((cl) => cl.fits(k))) fail(`${id} step ${j}: option ${k} also fits`);
      }
    }
    // The revealed traits name exactly the thief.
    const traits = c.steps.filter((s) => s.trait && s.trait.group !== "snack").map((s) => s.trait);
    const who = E.suspectsMatching(traits);
    if (who.length !== 1 || who[0].id !== c.thief) fail(`${id}: traits name [${who.map((w) => w.id)}], thief ${c.thief}`);
  }
  stats[level] = { cases: N, steps: stepsTotal, "clues that only work together": `${Math.round((together / stepsTotal) * 100)}%`, clueTypes: types };
}

// Any two traits from different groups name exactly one suspect.
for (const a of E.TRAIT_GROUPS) for (const b of E.TRAIT_GROUPS) {
  if (a >= b) continue;
  for (const s of E.SUSPECTS) {
    const m = E.suspectsMatching([{ group: a, value: s[a] }, { group: b, value: s[b] }]);
    if (m.length !== 1) fail(`traits ${a}+${b} of ${s.id} match ${m.length} suspects`);
  }
}

console.log(JSON.stringify(stats, null, 1));
if (errors.length) {
  console.error(errors.map((e) => "✗ " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ chase engine OK: ${N} cases per level, every step has exactly one answer.`);

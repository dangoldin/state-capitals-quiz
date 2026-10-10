// The Great Atlas Chase: the case engine. Pure functions with no page code,
// so scripts/test-chase.js can test them in Node. It reads COUNTRIES
// (data.js) and FACTS (facts.js) as globals.
const ChaseEngine = (() => {
  const CONTINENT_NAMES = {
    africa: "Africa",
    asia: "Asia",
    europe: "Europe",
    northAmerica: "North America",
    southAmerica: "South America",
    oceania: "Oceania",
  };
  // The same pairs as FLAG_TWINS in app.js: these flags look almost the same,
  // so a flag clue alone cannot tell them apart.
  const FLAG_TWINS = { MC: "ID", ID: "MC", TD: "RO", RO: "TD" };
  const LEVELS = ["easy", "normal", "hard"];
  const HOPS = { easy: 3, normal: 4, hard: 5 };
  const DAYS = 7;

  const byCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  const ALL = COUNTRIES.map((c) => c.code);

  // --- Random numbers (mulberry32), so a seed always gives the same case.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  function shuffle(r, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function distanceKm(a, b) {
    const ca = byCode[a];
    const cb = byCode[b];
    const rad = Math.PI / 180;
    const dLat = (cb.lat - ca.lat) * rad;
    const dLng = (cb.lng - ca.lng) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(ca.lat * rad) * Math.cos(cb.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  const firstLetter = (name) =>
    name.normalize("NFD").replace(/[̀-ͯ]/g, "")[0].toUpperCase();
  const speaks = (c, lang) => c.languages.includes(lang) || (c.otherLanguages || []).includes(lang);
  const pays = (c, money) => c.currency.name === money || (c.currency.also || []).includes(money);

  // --- Largest/smallest/most/fewest per continent. A winner counts only when
  // it leads the runner-up by at least 20% (see SOURCES.md).
  const SUPERLATIVES = [
    { key: "largest", field: "area", dir: 1, text: (ct) => `It is the largest country in ${ct}.` },
    { key: "smallest", field: "area", dir: -1, text: (ct) => `It is the smallest country in ${ct}.` },
    { key: "most", field: "population", dir: 1, text: (ct) => `More people live there than in any other country in ${ct}.` },
    { key: "fewest", field: "population", dir: -1, text: (ct) => `Fewer people live there than in any other country in ${ct}.` },
  ];
  // Russia is in the Europe deck, but a child could fairly call it the
  // largest country in Asia.
  const SUPERLATIVE_EXCLUDED = new Set(["asia/largest"]);
  const superlativeWinners = {}; // code -> [{ key, continent, text }]
  for (const ct of Object.keys(CONTINENT_NAMES)) {
    const cs = COUNTRIES.filter((c) => c.continent === ct);
    for (const s of SUPERLATIVES) {
      if (SUPERLATIVE_EXCLUDED.has(`${ct}/${s.key}`)) continue;
      const sorted = cs
        .map((c) => ({ code: c.code, v: FACTS[c.code][s.field] }))
        .sort((a, b) => s.dir * (b.v - a.v));
      const [w, r2] = sorted;
      const margin = Math.abs(w.v - r2.v) / Math.max(w.v, r2.v);
      if (margin < 0.2) continue;
      (superlativeWinners[w.code] ||= []).push({
        key: s.key,
        continent: ct,
        text: s.text(CONTINENT_NAMES[ct]),
      });
    }
  }

  // --- Clues. A clue is { type, text, flag?, fits(code) }; `solve` keeps the
  // countries that fit every clue in a step.
  function clue(type, text, fits, extra = {}) {
    return { type, text, fits, ...extra };
  }

  function cluesFor(code, level) {
    const c = byCode[code];
    const f = FACTS[code];
    const out = [];
    // Easy and up
    out.push(
      clue("capital", `She bought a plane ticket to ${c.capital}.`, (k) => {
        const o = byCode[k];
        return o.capital === c.capital || (o.capitalAlso || []).includes(c.capital);
      }),
    );
    out.push(
      clue(
        "flag",
        "Her suitcase has a sticker with this flag.",
        (k) => k === code || FLAG_TWINS[code] === k,
        { flag: code },
      ),
    );
    out.push(
      clue(
        "continent",
        `The airline says her plane lands in ${CONTINENT_NAMES[c.continent]}.`,
        (k) => byCode[k].continent === c.continent,
      ),
    );
    const letter = firstLetter(c.name);
    out.push(
      clue(
        "letter",
        `The country's name starts with the letter ${letter}.`,
        (k) => firstLetter(byCode[k].name) === letter,
      ),
    );
    if (level === "easy") return out;

    // Normal and up
    const money = c.currency.name;
    out.push(clue("money", `At the bank, she asked for money in ${money}.`, (k) => pays(byCode[k], money)));
    for (const lang of c.languages) {
      out.push(clue("language", `She was practicing her ${lang}.`, (k) => speaks(byCode[k], lang)));
    }
    for (const n of f.neighbors) {
      out.push(
        clue(
          "neighbor",
          `She said the country shares a border with ${byCode[n].name}.`,
          (k) => FACTS[k].neighbors.includes(n),
        ),
      );
    }
    out.push(
      f.landlocked
        ? clue("coast", "She left her swimsuit at home: the country has no coast.", (k) => FACTS[k].landlocked)
        : clue("coast", "She packed her swimsuit: the country has a coast.", (k) => !FACTS[k].landlocked),
    );
    if (level === "normal") return out;

    // Hard
    for (const s of superlativeWinners[code] || []) {
      out.push(
        clue("superlative", s.text, (k) =>
          (superlativeWinners[k] || []).some((x) => x.key === s.key && x.continent === s.continent),
        ),
      );
    }
    const n = f.neighbors.length;
    if (n > 0) {
      out.push(
        clue(
          "neighborCount",
          `The country has exactly ${n} ${n === 1 ? "neighbor" : "neighbors"} by land.`,
          (k) => FACTS[k].neighbors.length === n,
        ),
      );
    }
    return out;
  }

  function solve(clues) {
    return ALL.filter((k) => clues.every((c) => c.fits(k)));
  }

  const count = (cl) => ALL.filter((k) => cl.fits(k)).length;

  // Pick the clues for one step. Easy: one clear clue plus one that narrows.
  // Normal and hard: clues that work only together, when possible.
  function chooseClues(r, code, level) {
    const all = cluesFor(code, level);
    const unique = all.filter((cl) => count(cl) === 1);
    const narrow = all.filter((cl) => count(cl) > 1);
    const works = (set) => {
      const s = solve(set);
      return s.length === 1 && s[0] === code;
    };
    if (level === "easy") {
      const strong = pick(r, unique.filter((cl) => cl.type === "capital" || cl.type === "flag"));
      const extra = pick(r, narrow);
      return shuffle(r, [strong, extra]);
    }
    if (level === "hard") {
      const sup = all.filter((cl) => cl.type === "superlative");
      if (sup.length && r() < 0.6) return shuffle(r, [pick(r, sup), pick(r, narrow)]);
    }
    // Look for 2, then 3, narrowing clues that only work together. Take
    // each clue from a different type, so the clues stay varied (a country
    // has many neighbor clues, but only one money clue).
    const byType = {};
    for (const cl of narrow) (byType[cl.type] ||= []).push(cl);
    // The first letter teaches the least geography, so try without it first.
    const allTypes = Object.keys(byType);
    for (const types of [allTypes.filter((t) => t !== "letter"), allTypes]) {
      for (const size of [2, 3]) {
        if (types.length < size) continue;
        for (let tries = 0; tries < 40; tries++) {
          const set = shuffle(r, types).slice(0, size).map((t) => pick(r, byType[t]));
          if (works(set)) return set;
        }
      }
    }
    // Fall back: one clear clue (not the plain capital on hard) plus one.
    const strongPool = unique.filter((cl) => level !== "hard" || cl.type !== "capital");
    return shuffle(r, [pick(r, strongPool.length ? strongPool : unique), pick(r, narrow)]);
  }

  // A clear clue after a wrong guess, so a dead end always helps.
  function extraClue(code) {
    const c = byCode[code];
    return clue("capital", `A taxi driver heard her say: "Take me to ${c.capital}!"`, (k) => {
      const o = byCode[k];
      return o.capital === c.capital || (o.capitalAlso || []).includes(c.capital);
    });
  }

  // --- The route
  const HOP_KM = {
    easy: [300, 3000],
    normal: [500, 5000],
    hard: [800, 9000],
  };

  function nextStop(r, from, visited, level) {
    const [lo, hi] = HOP_KM[level];
    const free = ALL.filter((k) => !visited.has(k));
    let pool = free.filter((k) => {
      const d = distanceKm(from, k);
      return d >= lo && d <= hi;
    });
    // Easy stays on one continent when it can.
    if (level === "easy") {
      const same = pool.filter((k) => byCode[k].continent === byCode[from].continent);
      if (same.length) pool = same;
    }
    if (!pool.length) pool = free;
    return pick(r, pool);
  }

  // --- Suspects. Any two traits from different groups name exactly one
  // suspect (hat, pet, and hobby each pair the suspects differently).
  const SUSPECTS = [
    { id: "kerfuffle", name: "Countess Kerfuffle", hat: "a tall top hat", pet: "a parrot", hobby: "yodeling", snack: "pickled onions" },
    { id: "bubbles", name: "Baron Von Bubbles", hat: "a tall top hat", pet: "a goldfish", hobby: "chess", snack: "bubble tea" },
    { id: "dot", name: "Dizzy Dot", hat: "a woolly beanie", pet: "a parrot", hobby: "roller skating", snack: "popcorn" },
    { id: "sneeze", name: "Sly McSneeze", hat: "a woolly beanie", pet: "a tortoise", hobby: "chess", snack: "pepper crackers" },
    { id: "pudding", name: "Professor Pudding", hat: "a floppy sun hat", pet: "a tortoise", hobby: "yodeling", snack: "rice pudding" },
    { id: "lollygag", name: "Lady Lollygag", hat: "a floppy sun hat", pet: "a goldfish", hobby: "roller skating", snack: "lollipops" },
  ];
  const TRAIT_TEXT = {
    hat: (v) => `The witness noticed that the thief wore ${v}.`,
    pet: (v) => `The thief was carrying ${v} in a little cage.`,
    hobby: (v) => `The hotel clerk says the thief would not stop talking about ${v}.`,
    snack: (v) => `The thief left behind a bag of ${v}.`,
  };
  const TRAIT_GROUPS = ["hat", "pet", "hobby"];

  function suspectsMatching(traits) {
    return SUSPECTS.filter((s) => traits.every((t) => s[t.group] === t.value));
  }

  const LOOT = [
    "the recipe for the world's biggest pancake",
    "the Golden Rubber Duck",
    "the world's longest scarf",
    "the crown of the Royal Sandcastle Society",
    "the Polka-Dot Penguin statue",
    "the last slice of the Moon Cheese",
  ];

  function makeCase({ seed = Date.now(), level = "easy" } = {}) {
    if (!LEVELS.includes(level)) throw new Error("Unknown level " + level);
    const r = rng(seed);
    const thief = pick(r, SUSPECTS);
    const start = pick(r, ALL);
    const visited = new Set([start]);
    const steps = [];
    // Two trait groups name the thief; a snack is a fun extra.
    const groups = shuffle(r, TRAIT_GROUPS).slice(0, 2);
    const traitPlan = shuffle(r, [...groups, "snack"]);
    let from = start;
    for (let i = 0; i < HOPS[level]; i++) {
      const to = nextStop(r, from, visited, level);
      visited.add(to);
      const clues = chooseClues(r, to, level);
      const step = { from, to, clues };
      if (i < traitPlan.length) {
        const g = traitPlan[i];
        step.trait = { group: g, value: thief[g], text: TRAIT_TEXT[g](thief[g]) };
      }
      if (level === "easy") {
        // Wrong options from the same continent, never another country that fits.
        const near = shuffle(
          r,
          ALL.filter((k) => k !== to && byCode[k].continent === byCode[to].continent && !visited.has(k)),
        );
        const far = shuffle(r, ALL.filter((k) => k !== to && !near.includes(k)));
        const wrong = [...near, ...far].filter((k) => !clues.every((cl) => cl.fits(k))).slice(0, 3);
        step.options = shuffle(r, [to, ...wrong]);
      }
      steps.push(step);
      from = to;
    }
    return {
      seed,
      level,
      loot: pick(r, LOOT),
      thief: thief.id,
      start,
      steps,
      days: DAYS,
    };
  }

  return {
    CONTINENT_NAMES,
    LEVELS,
    SUSPECTS,
    TRAIT_GROUPS,
    makeCase,
    solve,
    extraClue,
    suspectsMatching,
    distanceKm,
    superlativeWinners,
  };
})();

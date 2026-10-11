// The Great Atlas Chase: the case engine. Pure functions with no page code,
// so scripts/test-chase.js can test them in Node. It reads COUNTRIES
// (data.js), FACTS (facts.js), and CULTURE (culture.js, optional) as globals.
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
  const DAYS = 7;

  const byCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  // History and culture facts; the engine also works without them.
  const CULT = typeof CULTURE === "undefined" ? {} : CULTURE;
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
    name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")[0].toUpperCase();
  // A child may know a country by another name ("Ivory Coast"), so a letter
  // clue fits a country if any of its names starts with that letter.
  const lettersOf = (c) => new Set([c.name, ...(c.aka || [])].map(firstLetter));

  // Coasts a child could fairly dispute: these touch only the Caspian Sea (a
  // lake), so no coast clue is made for them, and no coast clue rules them out.
  const COAST_UNCLEAR = new Set(["AZ", "KZ", "TM"]);
  // Neighbor counts that depend on borders a child does not know: French
  // Guiana (France), Ceuta and Melilla (Spain, Morocco), and the 150 m
  // Botswana–Zambia border.
  const COUNT_UNCLEAR = new Set(["FR", "ES", "MA", "BW", "ZM"]);

  // Money clues need a plural a child can read ("euros", "Swiss francs").
  // Currencies without one (for example "Loti") get no money clue.
  const MONEY_PLURAL = {
    "West African CFA franc": "West African francs",
    "Central African CFA franc": "Central African francs",
  };
  const PLURAL_WORDS = {
    dollar: "dollars", euro: "euros", franc: "francs", pound: "pounds", peso: "pesos",
    rupee: "rupees", shilling: "shillings", dinar: "dinars", rial: "rials", riyal: "riyals",
    dirham: "dirhams", ruble: "rubles", yen: "yen", yuan: "yuan", won: "won", rand: "rand",
    lira: "lira", baht: "baht", rupiah: "rupiah",
  };
  function moneyPlural(name) {
    if (MONEY_PLURAL[name]) return MONEY_PLURAL[name];
    const words = name.split(" ");
    const plural = PLURAL_WORDS[words.pop().toLowerCase()];
    return plural ? [...words, plural].join(" ") : null;
  }
  const speaks = (c, lang) => c.languages.includes(lang) || (c.otherLanguages || []).includes(lang);
  const pays = (c, money) => c.currency.name === money || (c.currency.also || []).includes(money);

  // --- Largest/smallest/most/fewest per continent. A winner counts only when
  // it leads the runner-up by at least 20% (see SOURCES.md).
  const SUPERLATIVES = [
    { key: "largest", field: "area", dir: 1, text: (ct) => `the largest country in ${ct}` },
    { key: "smallest", field: "area", dir: -1, text: (ct) => `the smallest country in ${ct}` },
    { key: "most", field: "population", dir: 1, text: (ct) => `the country with the most people in ${ct}` },
    { key: "fewest", field: "population", dir: -1, text: (ct) => `the country with the fewest people in ${ct}` },
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
  // countries that fit every clue in a step. The wording changes from case
  // to case: a witness, and one of several ways to say the same thing.
  function clue(type, text, fits, extra = {}) {
    return { type, text, fits, ...extra };
  }

  const WITNESSES = [
    "A taxi driver", "A flower seller", "A hotel porter", "A street musician", "A baker",
    "A pilot", "A librarian", "A tour guide", "A ticket clerk", "A café owner",
    "A bus driver", "A museum guard", "A kite seller", "A juggler", "A lost tourist",
    "A very chatty parrot", "A sleepy night guard", "A kid selling lemonade",
  ];
  const SAYS = ["says", "remembers that", "is sure that", "told the police that"];
  // A witness line: "A baker says the thief bought a ticket to Lima." An
  // action that starts with "said" becomes "A baker heard the thief say …".
  // `who` is the witness; by default a random one.
  function witnessLine(r, action, who = pick(r, WITNESSES)) {
    if (action.startsWith("said")) return `${who} heard the thief say${action.slice(4)}.`;
    return `${who} ${pick(r, SAYS)} the thief ${action}.`;
  }

  // Scramble a one-word city name for a coded note, or null when it cannot.
  function scramble(r, word) {
    if (!/^[A-Za-z]{4,8}$/.test(word)) return null;
    for (let i = 0; i < 10; i++) {
      const s = shuffle(r, word.toUpperCase().split("")).join("");
      if (s !== word.toUpperCase()) return s;
    }
    return null;
  }

  const capitalFits = (cap) => (k) => {
    const o = byCode[k];
    return o.capital === cap || (o.capitalAlso || []).includes(cap);
  };
  const flagFits = (code) => (k) => k === code || FLAG_TWINS[code] === k;

  function cluesFor(code, level, r = Math.random) {
    const c = byCode[code];
    const f = FACTS[code];
    const ct = CONTINENT_NAMES[c.continent];
    const out = [];
    // A different witness for each clue (until the list runs out).
    const deck = shuffle(r, WITNESSES);
    let used = 0;
    const line = (action) => witnessLine(r, action, deck[used++ % deck.length]);
    // Easy and up. A coded note on Easy has at most 6 letters.
    const coded =
      r() < 0.25 && (level !== "easy" || c.capital.length <= 6) ? scramble(r, c.capital) : null;
    out.push(
      clue(
        "capital",
        coded
          ? `The thief dropped a note in code: "${coded}". Unscramble the letters to find the city!`
          : line(
              pick(r, [
                `bought a plane ticket to ${c.capital}`,
                `asked for a hotel in ${c.capital}`,
                `bought a guidebook to ${c.capital}`,
                `asked how long the flight to ${c.capital} takes`,
              ]),
            ),
        capitalFits(c.capital),
      ),
    );
    out.push(
      clue(
        "flag",
        line(
          pick(r, [
            "had a suitcase sticker with this flag",
            "waved a little paper flag like this one",
            "drew this flag on a napkin",
            "bought a T-shirt with this flag on it",
          ]),
        ),
        flagFits(code),
        { flag: code },
      ),
    );
    out.push(
      clue(
        "continent",
        pick(r, [
          `The airline says the thief's plane lands in ${ct}.`,
          line(`bought a map of ${ct}`),
          line(`asked for the next flight to ${ct}`),
        ]),
        (k) => byCode[k].continent === c.continent,
      ),
    );
    // No letter clue when the country's names start with different letters.
    const letters = lettersOf(c);
    if (letters.size === 1) {
      const [letter] = letters;
      out.push(
        clue(
          "letter",
          pick(r, [
            line(`said the name of the next country starts with the letter ${letter}`),
            `The thief wrote the next country on a napkin, but only the first letter is dry: ${letter}.`,
          ]),
          (k) => lettersOf(byCode[k]).has(letter),
        ),
      );
    }
    // History and culture: a fact that fits this country only.
    for (const fc of CULT[code]?.clues || []) {
      out.push(
        clue("fact", line(fc.clue.replace(/^The thief /, "").replace(/\.$/, "")), (k) => k === code, {
          fact: fc.fact,
        }),
      );
    }
    if (level === "easy") return out;

    // Normal and up
    const money = c.currency.name;
    const plural = moneyPlural(money);
    if (plural)
      out.push(
        clue(
          "money",
          line(
            pick(r, [
              `changed money into ${plural}`,
              `had a wallet full of ${plural}`,
              `asked for the prices in ${plural}`,
            ]),
          ),
          (k) => pays(byCode[k], money),
        ),
      );
    for (const lang of c.languages) {
      out.push(
        clue(
          "language",
          line(
            pick(r, [
              `practiced some ${lang}, which people speak there`,
              `bought a phrase book in ${lang}, a language people speak there`,
            ]),
          ),
          (k) => speaks(byCode[k], lang),
        ),
      );
    }
    for (const n of f.neighbors) {
      out.push(
        clue(
          "neighbor",
          line(
            pick(r, [
              `said the next country shares a border with ${byCode[n].name}`,
              `said the next country is right next door to ${byCode[n].name}`,
            ]),
          ),
          (k) => FACTS[k].neighbors.includes(n),
        ),
      );
    }
    if (!COAST_UNCLEAR.has(code)) {
      out.push(
        f.landlocked
          ? clue(
              "coast",
              pick(r, [
                "The thief left the swimsuit at home: the next country has no coast.",
                line('said: "No beaches where I am going!" The country has no coast'),
              ]),
              (k) => COAST_UNCLEAR.has(k) || FACTS[k].landlocked,
            )
          : clue(
              "coast",
              pick(r, [
                "The thief packed a swimsuit: the next country has a coast.",
                line("bought a beach towel, because the next country has a coast"),
              ]),
              (k) => COAST_UNCLEAR.has(k) || !FACTS[k].landlocked,
            ),
      );
    }
    if (level === "normal") return out;

    // Hard
    for (const s of superlativeWinners[code] || []) {
      out.push(
        clue("superlative", line(`said the next country is ${s.text}`), (k) =>
          (superlativeWinners[k] || []).some((x) => x.key === s.key && x.continent === s.continent),
        ),
      );
    }
    const n = f.neighbors.length;
    if (n > 0 && !COUNT_UNCLEAR.has(code)) {
      out.push(
        clue(
          "neighborCount",
          line(`said the next country has exactly ${n} ${n === 1 ? "neighbor" : "neighbors"} by land`),
          (k) => COUNT_UNCLEAR.has(k) || FACTS[k].neighbors.length === n,
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
  // History and culture clues come in about a third of the steps (more on
  // hard), always with a narrowing clue, so a child who does not know the
  // fact can still use the other clue.
  const FACT_SHARE = { easy: 0.3, normal: 0.35, hard: 0.4 };
  function chooseClues(r, code, level) {
    const all = cluesFor(code, level, r);
    const unique = all.filter((cl) => count(cl) === 1);
    const narrow = all.filter((cl) => count(cl) > 1 && cl.type !== "fact");
    const facts = all.filter((cl) => cl.type === "fact");
    const works = (set) => {
      const s = solve(set);
      return s.length === 1 && s[0] === code;
    };
    const useFact = facts.length && r() < FACT_SHARE[level];
    if (level === "easy") {
      const strong = useFact
        ? pick(r, facts)
        : pick(r, unique.filter((cl) => cl.type === "capital" || cl.type === "flag"));
      const extra = pick(r, narrow);
      return shuffle(r, [strong, extra]);
    }
    if (useFact) return shuffle(r, [pick(r, facts), pick(r, narrow.filter((cl) => cl.type !== "letter")) || pick(r, narrow)]);
    if (level === "hard") {
      const sup = all.filter((cl) => cl.type === "superlative");
      if (sup.length && r() < 0.5) return shuffle(r, [pick(r, sup), pick(r, narrow)]);
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
    const strongPool = unique.filter((cl) => cl.type !== "fact" && (level !== "hard" || cl.type !== "capital"));
    return shuffle(r, [pick(r, strongPool.length ? strongPool : unique), pick(r, narrow)]);
  }

  // A clear clue after a wrong guess, so a dead end always helps. It uses a
  // type the step does not show yet (`shownTypes`); null when none is left.
  function extraClue(code, shownTypes = [], r = Math.random) {
    const c = byCode[code];
    const facts = CULT[code]?.clues || [];
    const extras = [
      clue("capital", `A taxi driver heard the thief say: "Take me to ${c.capital}!"`, capitalFits(c.capital)),
      clue("flag", "The thief dropped a postcard with this flag on it.", flagFits(code), { flag: code }),
      facts.length &&
        (() => {
          const fc = pick(r, facts);
          return clue("fact", witnessLine(r, fc.clue.replace(/^The thief /, "").replace(/\.$/, "")), (k) => k === code, {
            fact: fc.fact,
          });
        })(),
      clue(
        "continent",
        `The airline says the thief's plane lands in ${CONTINENT_NAMES[c.continent]}.`,
        (k) => byCode[k].continent === c.continent,
      ),
    ].filter(Boolean);
    return extras.find((cl) => !shownTypes.includes(cl.type)) || null;
  }

  // --- The route. Each case has a route style, so trails feel different.
  const ROUTE_STYLES = {
    easy: {
      hop: { km: [300, 3000], sameContinent: true },
      // Easy stays on one continent when it can, with shorter or longer hops.
      near: { km: [300, 1500], sameContinent: true },
    },
    normal: {
      hop: { km: [500, 5000] }, // the classic mix
      near: { km: [500, 2500] }, // a tour of one region
      far: { km: [3000, 9000] }, // across oceans
      zigzag: { km: [500, 2500], alt: [3000, 9000] }, // short, long, short…
    },
    hard: {
      hop: { km: [800, 9000] },
      far: { km: [4000, 12000] },
      zigzag: { km: [800, 2500], alt: [4000, 12000] },
    },
  };
  const HOP_RANGE = { easy: [3, 3], normal: [4, 4], hard: [5, 6] };

  function nextStop(r, from, visited, style, i) {
    const [lo, hi] = style.alt && i % 2 ? style.alt : style.km;
    const free = ALL.filter((k) => !visited.has(k));
    let pool = free.filter((k) => {
      const d = distanceKm(from, k);
      return d >= lo && d <= hi;
    });
    if (style.sameContinent) {
      const same = pool.filter((k) => byCode[k].continent === byCode[from].continent);
      if (same.length) pool = same;
    }
    if (!pool.length) pool = free;
    return pick(r, pool);
  }

  // --- Suspects. Each case has a gang of six. In a gang, any two traits from
  // different groups name exactly one suspect: LAYOUT gives each suspect's
  // value (0–2) in each of the three groups.
  // Suspects are [id, name, snack, emoji].
  const LAYOUT = [[0, 0, 0], [0, 1, 1], [1, 0, 2], [1, 2, 1], [2, 2, 0], [2, 1, 2]];
  const GANGS = [
    {
      id: "muddle",
      name: "the Muddle Mob",
      groups: [
        { key: "hat", values: ["a tall top hat", "a woolly beanie", "a floppy sun hat"],
          clue: (v) => `A witness noticed that the thief wore ${v}.`, lineup: (v) => `Wears ${v}.` },
        { key: "pet", values: ["a parrot", "a goldfish", "a tortoise"],
          clue: (v) => `The thief had ${v} along for the trip.`, lineup: (v) => `Has ${v}.` },
        { key: "hobby", values: ["yodeling", "chess", "roller skating"],
          clue: (v) => `The hotel clerk says the thief would not stop talking about ${v}.`, lineup: (v) => `Loves ${v}.` },
      ],
      suspects: [
        ["kerfuffle", "Countess Kerfuffle", "pickled onions", "🦚"],
        ["bubbles", "Baron Von Bubbles", "bubble-tea pearls", "🛁"],
        ["dot", "Dizzy Dot", "popcorn", "🌀"],
        ["sneeze", "Sly McSneeze", "pepper crackers", "🤧"],
        ["pudding", "Professor Pudding", "rice cakes", "🍮"],
        ["lollygag", "Lady Lollygag", "lollipops", "🍭"],
      ],
    },
    {
      id: "sticky",
      name: "the Sticky Fingers Club",
      groups: [
        { key: "shoes", values: ["rubber boots", "tap shoes", "fluffy slippers"],
          clue: (v) => `A shoe shiner says the thief wore ${v}.`, lineup: (v) => `Wears ${v}.` },
        { key: "ride", values: ["a unicycle", "a pogo stick", "a tiny scooter"],
          clue: (v) => `A police officer saw the thief ride away on ${v}.`, lineup: (v) => `Rides ${v}.` },
        { key: "sound", values: ["humming opera songs", "hiccuping", "whistling"],
          clue: (v) => `The waiter says the thief kept ${v} all through lunch.`, lineup: (v) => `Keeps ${v}.` },
      ],
      suspects: [
        ["mischief", "Madame Mischief", "jelly beans", "😈"],
        ["crumpet", "Captain Crumpet", "cheese puffs", "⚓"],
        ["pockets", "Penny Pockets", "sour gummies", "💰"],
        ["sniffles", "Sir Sniffles", "ginger cookies", "🌡️"],
        ["gadget", "Granny Gadget", "marshmallows", "🔧"],
        ["mumble", "Mister Mumble", "toffee", "💬"],
      ],
    },
    {
      id: "giggle",
      name: "the Gigglesnort Gang",
      groups: [
        { key: "glasses", values: ["round glasses", "star-shaped glasses", "heart-shaped glasses"],
          clue: (v) => `A ticket clerk noticed that the thief wore ${v}.`, lineup: (v) => `Wears ${v}.` },
        { key: "music", values: ["a kazoo", "a tuba", "a tiny triangle"],
          clue: (v) => `A street musician says the thief played ${v} at the station.`, lineup: (v) => `Plays ${v}.` },
        { key: "collects", values: ["spoons", "stamps", "seashells"],
          clue: (v) => `The thief asked a shopkeeper for old ${v}. The thief collects them!`, lineup: (v) => `Collects ${v}.` },
      ],
      suspects: [
        ["doodle", "Duchess Doodle", "cheese sticks", "✏️"],
        ["wally", "Wobbly Wally", "fizzy sherbet", "🎈"],
        ["blunder", "Barnaby Blunder", "banana chips", "💥"],
        ["fiddlesticks", "Fifi Fiddlesticks", "sugared almonds", "🎀"],
        ["lumpkin", "Lord Lumpkin", "mint humbugs", "🥔"],
        ["zigzag", "Ziggy Zigzag", "dried mango", "⚡"],
      ],
    },
    {
      id: "snicker",
      name: "the Snickerdoodle Society",
      groups: [
        { key: "scarf", values: ["a red scarf", "a green scarf", "a purple scarf"],
          clue: (v) => `A bus driver remembers that the thief wore ${v}.`, lineup: (v) => `Wears ${v}.` },
        { key: "carries", values: ["a striped umbrella", "a picnic basket", "a violin case"],
          clue: (v) => `The thief carried ${v} everywhere.`, lineup: (v) => `Carries ${v}.` },
        { key: "laugh", values: ["a snort", "a squeak", "a honk"],
          clue: (v) => `A juggler made the thief laugh. It sounded like ${v}!`, lineup: (v) => `Laughs with ${v}.` },
      ],
      suspects: [
        ["applesauce", "Admiral Applesauce", "pretzels", "🍎"],
        ["cuckoo", "Count Cuckoo", "rice crackers", "🐦"],
        ["marmalade", "Miss Marmalade", "fig rolls", "🍊"],
        ["bumblebee", "Bonnie Bumblebee", "honey cakes", "🐝"],
        ["tiptoe", "Tiptoe Tobias", "candied ginger", "👣"],
        ["lemonade", "Lady Lemonade", "oat biscuits", "🍋"],
      ],
    },
  ];
  // Each suspect: { id, name, snack, emoji (for the trading card), gang,
  // traits: { groupKey: value } }.
  const SUSPECTS = [];
  for (const g of GANGS) {
    g.members = g.suspects.map(([id, name, snack, emoji], i) => {
      const traits = {};
      g.groups.forEach((grp, j) => (traits[grp.key] = grp.values[LAYOUT[i][j]]));
      const s = { id, name, snack, emoji, gang: g.id, traits };
      SUSPECTS.push(s);
      return s;
    });
  }
  const gangById = Object.fromEntries(GANGS.map((g) => [g.id, g]));
  const SNACK_TEXT = (v) => `The thief left behind a bag of ${v}.`;

  // The suspects of a gang that match every trait ({ group, value }).
  function suspectsMatching(gangId, traits) {
    return gangById[gangId].members.filter((s) => traits.every((t) => s.traits[t.group] === t.value));
  }
  // "Wears a tall top hat. Has a parrot. Loves yodeling."
  const lineupText = (s) => gangById[s.gang].groups.map((g) => g.lineup(s.traits[g.key])).join(" ");

  const LOOT = [
    "the recipe for the world's biggest pancake",
    "the Golden Rubber Duck",
    "the world's longest scarf",
    "the crown of the Royal Sandcastle Society",
    "the Polka-Dot Penguin statue",
    "the last slice of the Moon Cheese",
    "the Singing Teapot",
    "the Giant Diamond Yo-Yo",
    "the Royal Rubber Chicken",
    "the Silver Spoon of the Soup Champions",
    "the Map of Lost Socks",
    "the Glow-in-the-Dark Dinosaur Egg",
    "the Golden Spatula",
    "the Very Important Paperclip",
    "the Bubble-Gum Queen's crown jewels",
    "the Royal Rainbow Umbrella",
    "the World Cup of Hopscotch",
    "the key to the Grand Bouncy Castle",
    "the Book of Ten Thousand Jokes",
    "the Pirate Parrot's golden feather",
    "the Marble Moose statue",
    "the Sleepy Sloth medal",
    "Captain Cupcake's treasure map",
    "the prize-winning giant pumpkin",
    "the Snow Globe of Everywhere",
    "the Tickling Feather of the Old Kings",
    "the Clock That Only Tells Snack Time",
    "the Emerald Kazoo",
    "the World's Fluffiest Pillow",
    "the Trophy of the Great Snail Race",
  ];
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  // How the case starts. `place` is "Lima, Peru".
  const STORIES = [
    (loot, place) => `Someone has stolen ${loot}! The thief was last seen in ${place}.`,
    (loot, place) => `Alarm bells! ${cap(loot)} vanished from a museum in ${place} last night.`,
    (loot, place) => `The guards in ${place} fell asleep for one minute, and ${loot} was gone!`,
    (loot, place) => `A thief swapped ${loot} for a rubber banana in ${place}. Nobody noticed until breakfast!`,
    (loot, place) => `${cap(loot)} is missing! A trail of cookie crumbs leads out of ${place}.`,
    (loot, place) => `A sneaky visitor to ${place} left with ${loot} under a very big coat.`,
  ];

  function makeCase({ seed = Date.now(), level = "easy" } = {}) {
    if (!LEVELS.includes(level)) throw new Error("Unknown level " + level);
    const r = rng(seed);
    const gang = pick(r, GANGS);
    const thief = pick(r, gang.members);
    const start = pick(r, ALL);
    const visited = new Set([start]);
    const steps = [];
    const styleKey = pick(r, Object.keys(ROUTE_STYLES[level]));
    const style = ROUTE_STYLES[level][styleKey];
    const [hMin, hMax] = HOP_RANGE[level];
    const hops = hMin + Math.floor(r() * (hMax - hMin + 1));
    // Two trait groups name the thief; a snack is a fun extra.
    const groups = shuffle(r, gang.groups).slice(0, 2);
    const traitPlan = shuffle(r, [...groups, "snack"]);
    // One flight (not the first) may be a free ride: no day lost.
    const lucky = r() < 0.5 ? 1 + Math.floor(r() * (hops - 1)) : -1;
    let from = start;
    for (let i = 0; i < hops; i++) {
      const to = nextStop(r, from, visited, style, i);
      visited.add(to);
      const clues = chooseClues(r, to, level);
      const step = { from, to, clues };
      if (i < traitPlan.length) {
        const g = traitPlan[i];
        step.trait =
          g === "snack"
            ? { group: "snack", value: thief.snack, text: SNACK_TEXT(thief.snack) }
            : { group: g.key, value: thief.traits[g.key], text: g.clue(thief.traits[g.key]) };
      }
      if (i === lucky) step.lucky = true;
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
    const loot = pick(r, LOOT);
    return {
      seed,
      level,
      loot,
      story: pick(r, STORIES)(loot, `${byCode[start].capital}, ${byCode[start].name}`),
      gang: gang.id,
      route: styleKey,
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
    GANGS,
    gangById,
    lineupText,
    makeCase,
    solve,
    extraClue,
    suspectsMatching,
    distanceKm,
    superlativeWinners,
  };
})();

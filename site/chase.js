(() => {
  // The Great Atlas Chase page. The case itself comes from chase-engine.js;
  // this file shows it and takes the detectives' answers.
  const E = ChaseEngine;
  const $ = (id) => document.getElementById(id);
  const byCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  const suspectById = Object.fromEntries(E.SUSPECTS.map((s) => [s.id, s]));
  // History and culture facts (culture.js); the page also works without them.
  const CULT = typeof CULTURE === "undefined" ? {} : CULTURE;
  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
  // A short scene when the detectives land on the right trail.
  const ARRIVALS = [
    "The thief's tea is still warm!",
    "A sticky snack wrapper is on the floor.",
    "We just missed the thief!",
    "The hotel clerk saw someone run out the back door.",
    "There are muddy footprints all over the airport.",
    "A taxi driver says the thief did not leave a tip.",
    "The thief's seat on the plane is still warm!",
  ];

  // Players are shared with the quiz (same storage key and shape).
  const PLAYERS_KEY = "geo-players-v1";
  const CASEBOOK_KEY = "chase-casebook-v1";
  const LEVEL_KEY = "chase-level-v1";
  // The same animals as AVATARS in app.js.
  const AVATARS = [
    "🦊", "🐼", "🐯", "🐸", "🐙", "🦉", "🐨", "🦁",
    "🐶", "🐱", "🐰", "🐻", "🐷", "🐵", "🦄", "🐢",
    "🐬", "🦖", "🐧", "🦒", "🐝", "🦋", "🐳", "🦜",
  ];
  const SPARE_DAYS = 3; // days for wrong guesses, on top of one per flight
  const CASE_NO_KEY = "chase-next-case-v1";
  const LEVEL_NOTES = {
    easy: "Easy: pick the next country from four cards. Clear clues, three flights.",
    normal: "Normal: tap the next country on the map. Clues work together, four flights.",
    hard: "Hard: type the next country. Tricky clues, five flights.",
  };

  // --- Rewards: rank badges, the sticker passport, and thief cards.
  // Ranks come from the number of solved cases a detective was on.
  const RANKS = [
    { at: 0, name: "Cadet", badge: "🔍" },
    { at: 1, name: "Junior Detective", badge: "⭐" },
    { at: 3, name: "Detective", badge: "🌟" },
    { at: 10, name: "Sergeant", badge: "🎖️" },
    { at: 25, name: "Inspector", badge: "🏅" },
    { at: 50, name: "Chief Inspector", badge: "🏆" },
  ];
  const rankFor = (solved) => RANKS.filter((r) => solved >= r.at).pop();
  const nextRank = (solved) => RANKS.find((r) => r.at > solved) || null;
  // The passport is shared with the quiz: { CODE: "YYYY-MM-DD" }.
  const passportKey = (id) => "geo-passport-v1:" + id;
  const CONTINENT_STICKERS = {
    africa: "🦁",
    asia: "🐼",
    europe: "🏰",
    northAmerica: "🦅",
    southAmerica: "🦜",
    oceania: "🐨",
  };
  const COUNT_STICKERS = [
    { at: 10, name: "Globetrotter", icon: "✈️" },
    { at: 25, name: "Explorer", icon: "🧭" },
    { at: 50, name: "Adventurer", icon: "🎒" },
    { at: 100, name: "World Traveler", icon: "🌍" },
    { at: 193, name: "Every country!", icon: "👑" },
  ];
  // Notes the thief leaves for the detectives. `n` is a detective's name.
  const TAUNTS = [
    (n) => `Too slow, Detective ${n}! Ha ha!`,
    (n) => `You will never find me, ${n}! I am much too clever.`,
    () => "Catch me if you can! (You can't.)",
    (n) => `Nice try, ${n}! I left this note just to say hello.`,
    (n, loot) => `${loot[0].toUpperCase() + loot.slice(1)} looks great in my suitcase, ${n}!`,
    (n) => `Are you still following me, ${n}? Go home and eat a sandwich!`,
    () => "I am already on my next plane. Toodle-oo!",
    () => "Roses are red, the sea is blue, I'm far away, and you have no clue!",
    (n) => `Psst, ${n}... look behind you! Just kidding.`,
    (n) => `Dear ${n}, the weather here is lovely. Wish you were NOT here!`,
  ];

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  const players = readJSON(PLAYERS_KEY, { list: [], playing: [], turn: 0 });
  players.list ||= [];
  players.playing = (players.playing || []).filter((id) => players.list.some((p) => p.id === id));
  const savePlayers = () => writeJSON(PLAYERS_KEY, players);
  const playerById = (id) => players.list.find((p) => p.id === id);
  // The solved cases a player was on. Old cases saved only the names.
  const onCase = (p, entry) => (entry.detectiveIds ? entry.detectiveIds.includes(p.id) : (entry.detectives || []).includes(p.name));
  const solvedBy = (p) => readJSON(CASEBOOK_KEY, []).filter((e) => e.solved && onCase(p, e));
  const rankOf = (p) => rankFor(solvedBy(p).length);
  // Stamp a country in each detective's passport. Returns true when it is a
  // new stamp for at least one of them.
  function stampPassports(ids, code) {
    let added = false;
    for (const id of ids) {
      const passport = readJSON(passportKey(id), {});
      if (passport[code]) continue;
      passport[code] = new Date().toISOString().slice(0, 10);
      writeJSON(passportKey(id), passport);
      added = true;
    }
    return added;
  }
  let level = readJSON(LEVEL_KEY, "easy");
  if (!E.LEVELS.includes(level)) level = "easy";

  // --- Text helpers
  const listNames = (names) =>
    names.length <= 1
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const cityOf = (code) => byCode[code].capital;
  const placeOf = (code) => `${byCode[code].capital}, ${byCode[code].name}`;
  const flagSrc = (code) => `flags/${code.toLowerCase()}.svg`;

  function normalize(s) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bsaint\b/g, "st")
      .replace(/[.,'’ʻ`\-]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const curr = [i];
      for (let j = 1; j <= b.length; j++) {
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = curr;
    }
    return prev[b.length];
  }
  // Everyday names a child may type, in addition to `name` and `aka` in data.js.
  const TYPED_NAMES = {
    US: ["US", "America", "United States of America"],
    GB: ["England", "Scotland", "Wales", "Northern Ireland"],
    NL: ["Holland"],
    BA: ["Bosnia"],
    CZ: ["Czech"],
    MK: ["Macedonia"],
    KN: ["Saint Kitts", "St Kitts"],
    AE: ["Emirates"],
    DO: ["Dominican"],
    KP: ["North Korea", "N Korea"],
    KR: ["South Korea", "S Korea"],
    VC: ["Saint Vincent", "St Vincent"],
    TT: ["Trinidad"],
    AG: ["Antigua"],
    ST: ["Sao Tome"],
    PG: ["Papua"],
  };
  const typedNames = COUNTRIES.flatMap((c) =>
    [c.name, ...(c.aka || []), ...(TYPED_NAMES[c.code] || [])].map((n) => [normalize(n), c.code]),
  );
  // The country a typed name means: an exact name, or a small typo of exactly
  // one name. The typo allowance comes from the name that matched, and text
  // shorter than 3 letters must match exactly ("q" is not "UK").
  function countryFromText(text) {
    const t = normalize(text);
    if (!t) return null;
    const exact = typedNames.find(([n]) => n === t);
    if (exact) return exact[1];
    if (t.length < 3) return null;
    let best = null;
    let bestDist = Infinity;
    let bestLen = 0;
    let tie = false;
    for (const [n, code] of typedNames) {
      if (n.length < 4) continue; // short names ("uk", "drc") must match exactly
      const d = levenshtein(t, n);
      if (d < bestDist) {
        best = code;
        bestDist = d;
        bestLen = n.length;
        tie = false;
      } else if (d === bestDist && code !== best) tie = true;
    }
    return best && !tie && bestDist <= Math.max(1, Math.round(bestLen / 5)) ? best : null;
  }

  // --- Screens
  const SCREENS = ["setupScreen", "filesScreen", "caseScreen", "cityScreen", "lineupScreen", "endScreen"];
  function show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    window.scrollTo({ top: 0 });
  }

  // --- Setup
  function renderSetup() {
    const list = $("detectiveList");
    list.innerHTML = "";
    for (const p of players.list) {
      const on = players.playing.includes(p.id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "detective" + (on ? " active" : "");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      const av = document.createElement("span");
      av.className = "avatar";
      av.textContent = p.avatar;
      const nm = document.createElement("span");
      nm.textContent = p.name;
      b.append(av, nm);
      b.addEventListener("click", () => {
        const i = players.playing.indexOf(p.id);
        if (i >= 0) players.playing.splice(i, 1);
        else players.playing.push(p.id);
        savePlayers();
        renderSetup();
      });
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "detective-edit" + (editing && editing.id === p.id ? " on" : "");
      edit.setAttribute("aria-label", `Change ${p.name}'s name or animal`);
      edit.textContent = "✎";
      edit.addEventListener("click", () => startEdit(p.id));
      const chip = document.createElement("span");
      chip.className = "detective-chip";
      chip.append(b, edit);
      list.appendChild(chip);
    }
    renderEdit();
    $("detectiveHint").textContent = players.list.length
      ? "Tap names to choose who plays. Detectives take turns."
      : "Add each detective by name.";
    for (const b of $("levelPick").querySelectorAll("button")) {
      const on = b.dataset.level === level;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
    $("levelNote").textContent = LEVEL_NOTES[level];
    $("openCaseBtn").disabled = !players.playing.length;
    const solved = readJSON(CASEBOOK_KEY, []).filter((c) => c.solved).length;
    $("caseCount").textContent = solved ? `${solved} ${solved === 1 ? "case" : "cases"} solved` : "";
  }

  // Change a detective's name or animal. `editing` is { id, avatar }.
  let editing = null;
  function startEdit(id) {
    const p = playerById(id);
    if (!p) return;
    editing = { id, avatar: p.avatar };
    $("editDetectiveName").value = p.name;
    renderSetup();
    $("editDetectiveName").focus({ preventScroll: true });
  }
  function renderEdit() {
    const form = $("editDetectiveForm");
    const p = editing && playerById(editing.id);
    form.hidden = !p;
    $("addDetectiveForm").hidden = !!p;
    if (!p) return;
    $("editDetectiveLabel").textContent = `Change ${p.name}`;
    const picker = $("editAvatarPicker");
    picker.innerHTML = "";
    for (const a of AVATARS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "avatar-option" + (a === editing.avatar ? " active" : "");
      b.textContent = a;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", a === editing.avatar ? "true" : "false");
      b.addEventListener("click", () => {
        editing.avatar = a;
        renderEdit();
      });
      picker.appendChild(b);
    }
  }
  $("editDetectiveForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = editing && playerById(editing.id);
    const name = $("editDetectiveName").value.trim();
    if (!p || !name) return;
    p.name = name;
    p.avatar = editing.avatar;
    editing = null;
    savePlayers();
    renderSetup();
  });
  $("editDetectiveCancel").addEventListener("click", () => {
    editing = null;
    renderSetup();
  });

  $("addDetectiveForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("newDetectiveName").value.trim();
    if (!name) return;
    $("newDetectiveName").value = "";
    const used = new Set(players.list.map((p) => p.avatar));
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    players.list.push({ id, name, avatar: AVATARS.find((a) => !used.has(a)) || AVATARS[0], level: "type" });
    players.playing.push(id);
    savePlayers();
    renderSetup();
  });
  for (const b of $("levelPick").querySelectorAll("button")) {
    b.addEventListener("click", () => {
      level = b.dataset.level;
      writeJSON(LEVEL_KEY, level);
      renderSetup();
    });
  }

  // --- The case
  let game = null;
  // game: { c (the case), step, day, days, turn, detectives, extra: [clues
  //         per step], notes: [trait texts], wrong: [codes guessed] }

  const detective = () => playerById(game.detectives[game.turn % game.detectives.length]);
  const passTurn = () => (game.turn += 1);
  const teamNames = () => game.detectives.map((id) => playerById(id).name);

  $("openCaseBtn").addEventListener("click", () => {
    if (!players.playing.length) return;
    const c = E.makeCase({ seed: Math.floor(Math.random() * 2 ** 31), level });
    game = {
      c,
      step: 0,
      day: 1,
      // Day 1 is the start; every flight and wrong accusation takes a day.
      days: c.steps.length + 1 + SPARE_DAYS,
      turn: 0,
      detectives: players.playing.slice(),
      extra: c.steps.map(() => []),
      notes: [],
      flown: [c.start],
      learned: [], // facts behind the history and culture clues
    };
    // Case numbers never repeat, also when a case is left unfinished.
    const caseNo = Math.max(readJSON(CASE_NO_KEY, 1), readJSON(CASEBOOK_KEY, []).length + 1);
    writeJSON(CASE_NO_KEY, caseNo + 1);
    $("caseNo").textContent = caseNo;
    game.caseNo = caseNo;
    $("caseHeadline").textContent = `Stolen: ${c.loot}!`;
    $("caseText").textContent =
      `${c.story} The thief is one of ${E.gangById[c.gang].name}. ` +
      `Follow the trail, find out who the thief is, and catch them in ${game.days} days.`;
    const team = game.detectives.map(playerById);
    $("caseTeam").textContent = `Assigned to ${listNames(team.map((p) => `${rankOf(p).name} ${p.name}`))}.`;
    show("caseScreen");
  });

  $("acceptBtn").addEventListener("click", () => {
    const added = stampPassports(game.detectives, game.c.start);
    showCity(added ? `🛂 New passport stamp: ${byCode[game.c.start].name}!` : undefined);
  });

  function currentStep() {
    return game.c.steps[game.step];
  }

  function showCity(message) {
    const s = currentStep();
    const here = s.from;
    $("dayText").textContent = `Day ${game.day} of ${game.days}`;
    $("stopText").textContent = `Flight ${game.step + 1} of ${game.c.steps.length}`;
    $("cityFlag").src = flagSrc(here);
    $("cityName").textContent = cityOf(here);
    $("cityCountry").textContent = byCode[here].name;

    // Clues, with a new clue after each dead end.
    const list = $("clueList");
    list.innerHTML = "";
    for (const cl of [...s.clues, ...game.extra[game.step]]) {
      const li = document.createElement("li");
      li.className = "clue";
      if (cl.flag) {
        const img = document.createElement("img");
        img.className = "clue-flag";
        img.src = flagSrc(cl.flag);
        img.alt = "";
        li.appendChild(img);
      }
      const t = document.createElement("span");
      t.textContent = cl.text;
      li.appendChild(t);
      list.appendChild(li);
    }
    // "Did you know?": a fact about the city we are in.
    const cityFacts = CULT[here]?.city || [];
    $("postcard").hidden = !cityFacts.length;
    if (cityFacts.length) $("postcardText").textContent = cityFacts[(game.c.seed + game.step) % cityFacts.length].text;
    // A trait of the thief, noted once.
    if (s.trait && !game.notes.includes(s.trait.text)) game.notes.push(s.trait.text);
    renderNotebook($("notebook"));

    const d = detective();
    $("turnAsk").textContent = `${d.avatar} ${d.name}, where do we fly next?`;
    // News from the last flight goes at the top of the new screen.
    $("arrivalNote").textContent = message || "";
    $("arrivalNote").hidden = !message;
    $("arrivalNote").className = "arrival" + (message && message.startsWith("Dead end") ? " dead-end" : "");
    $("tauntNote").textContent = game.taunt ? `📝 A note from the thief: "${game.taunt}"` : "";
    $("tauntNote").hidden = !game.taunt;
    $("chaseFeedback").textContent = "";
    $("chaseFeedback").className = "feedback";
    renderAnswer();
    drawTrailMap();
    show("cityScreen");
  }

  function renderNotebook(el) {
    el.innerHTML = "";
    if (!game.notes.length) return;
    const h = document.createElement("div");
    h.className = "desk-label";
    h.textContent = "Detective's notebook";
    el.appendChild(h);
    const ul = document.createElement("ul");
    for (const n of game.notes) {
      const li = document.createElement("li");
      li.textContent = n;
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }

  // Easy: four cards. Normal: tap the map. Hard: type the country.
  function renderAnswer() {
    const area = $("answerArea");
    area.innerHTML = "";
    const s = currentStep();
    if (game.c.level === "easy") {
      const grid = document.createElement("div");
      grid.className = "fly-options";
      for (const code of s.options.filter((k) => !game.wrongHere?.includes(k))) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "fly-option";
        const img = document.createElement("img");
        img.src = flagSrc(code);
        img.alt = "";
        const nm = document.createElement("span");
        nm.textContent = byCode[code].name;
        b.append(img, nm);
        b.addEventListener("click", () => guess(code));
        grid.appendChild(b);
      }
      area.appendChild(grid);
    } else if (game.c.level === "normal") {
      if (game.selected) {
        // Confirm the tapped country.
        const bar = document.createElement("div");
        bar.className = "fly-confirm";
        const q = document.createElement("span");
        q.className = "fly-question";
        q.textContent = `Fly to ${byCode[game.selected].name}?`;
        const go = document.createElement("button");
        go.type = "button";
        go.className = "action submit";
        go.textContent = "Fly there";
        go.addEventListener("click", () => guess(game.selected));
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "action dunno";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => {
          game.selected = null;
          renderAnswer();
          drawTrailMap();
        });
        bar.append(q, go, cancel);
        area.appendChild(bar);
      } else {
        const p = document.createElement("p");
        p.className = "desk-hint";
        p.textContent = game.choices
          ? "One of the gold countries is right. Tap one to see its name."
          : "Tap a country on the map to see its name. Drag or scroll to move the map; pinch, use the wheel, or press + and − to zoom.";
        area.appendChild(p);
      }
      if (!game.choices) {
        const hint = document.createElement("button");
        hint.type = "button";
        hint.className = "action dunno hint-btn";
        hint.textContent = "Hint: show 4 choices";
        hint.addEventListener("click", showChoices);
        area.appendChild(hint);
      }
    } else {
      const form = document.createElement("form");
      form.className = "type-guess";
      form.autocomplete = "off";
      const input = document.createElement("input");
      input.type = "text";
      input.id = "guessInput";
      input.placeholder = "Type a country…";
      input.autocapitalize = "words";
      input.spellcheck = false;
      const btn = document.createElement("button");
      btn.type = "submit";
      btn.className = "action submit";
      btn.textContent = "Fly there";
      form.append(input, btn);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const code = countryFromText(input.value);
        if (!code) {
          $("chaseFeedback").textContent = `We don't know a country called "${input.value.trim()}". Check the spelling.`;
          $("chaseFeedback").className = "feedback warn";
          return;
        }
        guess(code);
      });
      area.appendChild(form);
      setTimeout(() => input.focus({ preventScroll: true }), 0);
    }
  }

  function guess(code) {
    const s = currentStep();
    if (code === s.from) {
      $("chaseFeedback").textContent = `We are already in ${byCode[code].name}! Pick the next stop.`;
      $("chaseFeedback").className = "feedback warn";
      return;
    }
    // A place we already checked costs nothing.
    if ((game.wrongHere || []).includes(code)) {
      $("chaseFeedback").textContent = `We already checked ${byCode[code].name}: the thief was not there. Try another country.`;
      $("chaseFeedback").className = "feedback warn";
      return;
    }
    // Every flight takes a day (except a free ride), and the next detective
    // has the next turn.
    const who = detective();
    const free = code === s.to && s.lucky;
    if (!free) game.day += 1;
    passTurn();
    if (code === s.to) {
      game.flown.push(code);
      const stamped = stampPassports(game.detectives, code);
      // The plane flies the new line on the map, and sometimes the thief
      // leaves a note (not on the way to the lineup).
      game.flyAnim = { start: null };
      game.wrongHere = [];
      game.selected = null;
      game.choices = null;
      game.step += 1;
      if (game.day > game.days) return endCase(false);
      // The facts behind the history and culture clues of this step.
      const facts = [...s.clues, ...game.extra[game.step - 1]].filter((cl) => cl.fact).map((cl) => cl.fact);
      for (const f of facts) if (!game.learned.includes(f)) game.learned.push(f);
      const found =
        `Right, ${who.name}! ${pickOne(ARRIVALS)} We're on the trail in ${placeOf(code)}.` +
        (free ? " A friendly pilot gave us a free ride, so we lost no day!" : "") +
        (facts.length ? ` Did you know? ${facts.join(" ")}` : "") +
        (stamped ? ` 🛂 New passport stamp: ${byCode[code].name}!` : "");
      game.taunt =
        game.step < game.c.steps.length && Math.random() < 0.4
          ? pickOne(TAUNTS)(detective().name, game.c.loot)
          : null;
      if (game.step >= game.c.steps.length) return showLineup(found);
      return showCity(found);
    }
    // Dead end: a day is lost, and a new clue of a new type helps.
    (game.wrongHere ||= []).push(code);
    game.selected = null;
    // A wrong pick loses its gold shade, so the hint narrows down.
    if (game.choices) game.choices = game.choices.filter((k) => k !== code);
    if (game.day > game.days) return endCase(false);
    game.taunt = null;
    const extra = game.extra[game.step];
    const added = E.extraClue(s.to, [...s.clues, ...extra].map((cl) => cl.type));
    if (added) extra.push(added);
    showCity(
      `Dead end in ${placeOf(code)}: nobody there has seen the thief. ` +
        `Good try, ${who.name}! We fly back to ${cityOf(s.from)} and lose a day. ` +
        (added ? "Read the new clue." : "Read the clues again."),
    );
  }

  const daysLeft = () => game.days - game.day;
  const daysLeftText = () =>
    daysLeft() === 0 ? "This is the last day!" : `${daysLeft()} ${daysLeft() === 1 ? "day" : "days"} left.`;

  // --- The lineup
  function showLineup(message) {
    const d = detective();
    $("lineupAsk").textContent =
      (message ? message + " " : "") +
      `The thief is hiding in ${placeOf(game.flown[game.flown.length - 1])}. ${daysLeftText()} ${d.avatar} ${d.name}, who is it? Check the notebook.`;
    renderNotebook($("lineupNotes"));
    $("lineupFeedback").textContent = "";
    const list = $("suspectList");
    list.innerHTML = "";
    for (const sus of E.SUSPECTS.filter((x) => x.gang === game.c.gang)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suspect";
      const nm = document.createElement("span");
      nm.className = "suspect-name";
      nm.textContent = sus.name;
      const tr = document.createElement("span");
      tr.className = "suspect-traits";
      // The snack stays a fun note: each suspect has a different one, so it
      // would name the thief alone.
      tr.textContent = E.lineupText(sus);
      b.append(nm, tr);
      b.addEventListener("click", () => accuse(sus.id, b));
      list.appendChild(b);
    }
    show("lineupScreen");
  }

  function accuse(id, button) {
    const who = detective();
    passTurn();
    if (id === game.c.thief) return endCase(true, who);
    game.day += 1;
    button.disabled = true;
    button.classList.add("wrong");
    if (game.day > game.days) return endCase(false);
    const d = detective();
    $("lineupFeedback").textContent =
      `Not ${suspectById[id].name}, ${who.name}: that doesn't match the notebook. A day is lost: ${daysLeftText()} ${d.avatar} ${d.name}, try again!`;
    $("lineupFeedback").className = "feedback bad";
  }

  // --- Case closed
  function endCase(solved, catcher) {
    const thief = suspectById[game.c.thief];
    const team = game.detectives.map(playerById).filter(Boolean);
    // Ranks and caught thieves before this case, to show what is new.
    const before = new Map(
      team.map((p) => {
        const cases = solvedBy(p);
        return [p.id, { rank: rankFor(cases.length), caught: cases.some((e) => e.thief === game.c.thief) }];
      }),
    );
    const names = listNames(teamNames());
    const where = placeOf(game.c.steps[game.c.steps.length - 1].to);
    if (solved) {
      $("endStamp").textContent = "Case closed";
      $("endStamp").className = "case-stamp solved";
      $("endHeadline").textContent = `Caught! ${thief.name} is under arrest.`;
      $("endText").textContent =
        `${catcher.name} named the thief in ${where}, and ${game.c.loot} is safe. ` +
        `Solved by ${names} on day ${game.day} of ${game.days}.`;
    } else {
      $("endStamp").textContent = "Case open";
      $("endStamp").className = "case-stamp open";
      $("endHeadline").textContent = "The thief got away this time!";
      $("endText").textContent =
        `It was ${thief.name}, who escaped from ${where} with ${game.c.loot}. ` +
        `The map shows the route. A new case is waiting, ${names}!`;
    }
    // The history and culture facts from the trail.
    const learned = $("learnedList");
    learned.innerHTML = "";
    for (const f of game.learned) {
      const li = document.createElement("li");
      li.textContent = f;
      learned.appendChild(li);
    }
    $("learned").hidden = !game.learned.length;
    const book = readJSON(CASEBOOK_KEY, []);
    book.push({
      no: game.caseNo,
      date: new Date().toISOString().slice(0, 10),
      level: game.c.level,
      loot: game.c.loot,
      gang: game.c.gang,
      thief: game.c.thief,
      solved,
      detectives: teamNames(),
      detectiveIds: game.detectives.slice(),
      route: game.flown.slice(),
      days: game.day,
    });
    writeJSON(CASEBOOK_KEY, book);
    // Promotions and new thief cards.
    const news = [];
    if (solved) {
      if (team.some((p) => !before.get(p.id).caught)) news.push(`🃏 New thief card: ${thief.emoji} ${thief.name}!`);
      for (const p of team) {
        const r = rankOf(p);
        if (r !== before.get(p.id).rank) news.push(`${r.badge} Promoted! ${p.name} is now a ${r.name}.`);
      }
    }
    $("endPromo").textContent = news.join(" ");
    $("endPromo").hidden = !news.length;
    show("endScreen");
    drawRouteMap();
  }

  $("newCaseBtn").addEventListener("click", () => {
    game = null;
    renderSetup();
    show("setupScreen");
  });

  // --- Maps
  const MAP_W = 480;
  const MAP_H = 300;
  const countries = topojson.feature(WORLD_MAP, WORLD_MAP.objects.countries).features;
  for (const f of countries) {
    f.center = d3.geoCentroid(f);
    let r = 0;
    const walk = (c) => {
      if (typeof c[0] === "number") r = Math.max(r, d3.geoDistance(c, f.center));
      else c.forEach(walk);
    };
    walk(f.geometry.coordinates);
    f.radius = r;
  }
  const shapeById = new Map(countries.map((f) => [f.properties.iso2, f]));
  const capitalPoint = (code) => [byCode[code].lng, byCode[code].lat];
  const HOP_RADIUS = { easy: 30, normal: 48, hard: 82 }; // degrees around the city

  // Draw the map: countries, the flights so far, and the city markers.
  // `here` is the current city's country; `selected` is the country the
  // player tapped (Normal); `choices` are the countries a hint shades.
  function drawMap(svg, projection, { highlight = [], current = null, route = [], selected = null, choices = [], stamped = [], cull = true }) {
    const path = d3.geoPath(projection);
    const center = projection.invert([MAP_W / 2, MAP_H / 2]);
    const corners = [[0, 0], [MAP_W, 0], [0, MAP_H], [MAP_W, MAP_H]].map((p) => projection.invert(p));
    let viewR = Infinity;
    if (center && corners.every((c) => c && Number.isFinite(c[0])))
      viewR = Math.max(...corners.map((c) => d3.geoDistance(c, center)));
    const inView = (f) => !cull || !center || d3.geoDistance(f.center, center) - f.radius < viewR;
    const parts = [
      `<path class="map-water" d="${path({ type: "Sphere" })}"/>`,
      `<path class="map-grid" d="${path(d3.geoGraticule10())}"/>`,
    ];
    for (const f of countries) {
      if (!inView(f)) continue;
      const d = path(f);
      if (!d) continue;
      const id = f.properties.iso2;
      const cls =
        id === selected
          ? "map-target"
          : choices.includes(id)
            ? "map-choice"
            : id === current
              ? "map-here"
              : highlight.includes(id)
                ? "map-visited"
                : stamped.includes(id)
                  ? "map-stamped"
                  : "map-land";
      parts.push(`<path class="${cls}" data-id="${id}" d="${d}"/>`);
    }
    // Rings show where a small selected or shaded country is.
    for (const id of [...choices, selected].filter(Boolean)) {
      const f = shapeById.get(id);
      if (!f || path.area(f) >= 40) continue;
      const p = projection(capitalPoint(id));
      if (p) parts.push(`<circle class="${id === selected ? "map-ring" : "map-choice-ring"}" cx="${p[0]}" cy="${p[1]}" r="10"/>`);
    }
    // A stamped country too small to see gets a dot at its capital.
    for (const id of stamped) {
      const f = shapeById.get(id);
      if (!f || path.area(f) >= 12) continue;
      const p = projection(capitalPoint(id));
      if (p) parts.push(`<circle class="map-stamp-dot" cx="${p[0]}" cy="${p[1]}" r="2.5"/>`);
    }
    // Flight lines follow the great circle between capitals.
    for (let i = 1; i < route.length; i++) {
      const d = path({ type: "LineString", coordinates: [capitalPoint(route[i - 1]), capitalPoint(route[i])] });
      if (d) parts.push(`<path class="flight${i === route.length - 1 ? " last-flight" : ""}" d="${d}"/>`);
    }
    for (const code of route) {
      const p = projection(capitalPoint(code));
      if (p) parts.push(`<circle class="${code === current ? "map-capital" : "map-stop"}" cx="${p[0]}" cy="${p[1]}" r="${code === current ? 4.5 : 3}"/>`);
    }
    if (current) {
      const p = projection(capitalPoint(current));
      if (p) {
        const right = p[0] < MAP_W * 0.6;
        parts.push(`<text class="map-label" x="${p[0] + (right ? 9 : -9)}" y="${p[1] + 4}" text-anchor="${right ? "start" : "end"}"></text>`);
      }
    }
    // The selected country's name, at its capital.
    if (selected) {
      const p = projection(capitalPoint(selected));
      if (p) {
        const right = p[0] < MAP_W * 0.6;
        parts.push(`<text class="map-label selected-label" x="${p[0] + (right ? 12 : -12)}" y="${p[1] - 8}" text-anchor="${right ? "start" : "end"}"></text>`);
      }
    }
    svg.innerHTML = parts.join("");
    const label = svg.querySelector(".map-label:not(.selected-label)");
    if (label) label.textContent = cityOf(current);
    const selLabel = svg.querySelector(".selected-label");
    if (selLabel) selLabel.textContent = byCode[selected].name;
  }

  const svgEl = $("chaseMap");
  let trailProjection = null;
  // The zoom of the trail map: a scale factor `k` and a position, kept for
  // one stop (`key`), like `mapView` in app.js.
  let trailView = { key: null };
  const MAX_ZOOM = 20;
  const PAD = 14;
  const EXTENT = [[PAD, PAD], [MAP_W - PAD, MAP_H - PAD]];

  // The view around the city: enough of the world to find the next stop.
  function baseTrailProjection(here) {
    const circle = d3.geoCircle().center(capitalPoint(here)).radius(HOP_RADIUS[game.c.level])();
    return d3.geoEqualEarth().rotate([-byCode[here].lng, 0]).fitExtent(EXTENT, { type: "Feature", geometry: circle });
  }

  function drawTrailMap() {
    const here = currentStep().from;
    const key = `${game.caseNo}:${game.step}`;
    const projection = baseTrailProjection(here);
    if (trailView.key !== key) {
      const world = d3.geoEqualEarth().rotate([-byCode[here].lng, 0]).fitExtent(EXTENT, { type: "Sphere" }).scale();
      trailView = {
        key,
        k: 1,
        translate: projection.translate(),
        baseScale: projection.scale(),
        minK: Math.min(1, world / projection.scale()),
      };
    }
    projection.scale(trailView.baseScale * trailView.k).translate(trailView.translate);
    keepInFrame(projection);
    trailProjection = projection;
    // When zoomed, a one-finger drag moves the map instead of the page.
    svgEl.classList.toggle("zoomed", trailView.k !== 1);
    drawMap($("chaseMap"), projection, {
      highlight: game.flown.slice(0, -1),
      current: here,
      route: game.flown,
      selected: game.selected,
      choices: game.choices || [],
    });
    if (game.flyAnim) flyPlane();
    const normal = game.c.level === "normal";
    $("chaseMapCaption").textContent = normal
      ? `You are in ${cityOf(here)}. Tap a country to see its name.`
      : `You are in ${cityOf(here)}. The lines show the trail so far.`;
  }

  // A small plane flies along the newest flight line. A redraw (zoom, pan)
  // replaces the map, so each frame finds the line and the plane again.
  const PLANE = "M9,0 L3,-1.2 L-2,-7 L-4,-7 L-1,-1.2 L-6,-1.2 L-8,-3.5 L-9,-3.5 L-8,0 L-9,3.5 L-8,3.5 L-6,1.2 L-1,1.2 L-4,7 L-2,7 L3,1.2 Z";
  const FLIGHT_MS = 1600;
  let flightFrame = null;
  function flyPlane() {
    const anim = game.flyAnim;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      game.flyAnim = null;
      return;
    }
    if (flightFrame) return; // already flying
    const tick = (now) => {
      if (!game || game.flyAnim !== anim || $("cityScreen").hidden) {
        flightFrame = null;
        svgEl.querySelector(".plane")?.remove();
        return;
      }
      anim.start ??= now;
      const t = Math.min(1, (now - anim.start) / FLIGHT_MS);
      const line = svgEl.querySelector(".last-flight");
      let plane = svgEl.querySelector(".plane");
      if (line) {
        if (!plane) {
          plane = document.createElementNS("http://www.w3.org/2000/svg", "path");
          plane.setAttribute("class", "plane");
          plane.setAttribute("d", PLANE);
          svgEl.appendChild(plane);
        }
        const len = line.getTotalLength();
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const at = ease * len;
        const p = line.getPointAtLength(Math.min(at, len - 0.5));
        const q = line.getPointAtLength(Math.min(at + 0.5, len));
        const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        plane.setAttribute("transform", `translate(${p.x},${p.y}) rotate(${angle}) scale(1.4)`);
      }
      if (t < 1) flightFrame = requestAnimationFrame(tick);
      else {
        flightFrame = null;
        game.flyAnim = null;
        plane?.remove();
      }
    };
    flightFrame = requestAnimationFrame(tick);
  }

  // Center a map smaller than the frame, and stop a drag at the map edge.
  function keepInFrame(projection) {
    const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds({ type: "Sphere" });
    const shift = (lo, hi, size) =>
      hi - lo <= size ? (size - lo - hi) / 2 : lo > 0 ? -lo : hi < size ? size - hi : 0;
    const dx = shift(x0, x1, MAP_W);
    const dy = shift(y0, y1, MAP_H);
    if (dx || dy) {
      trailView.translate = [trailView.translate[0] + dx, trailView.translate[1] + dy];
      projection.translate(trailView.translate);
    }
  }

  let redrawQueued = false;
  function redrawTrail() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      if (game && !$("cityScreen").hidden) drawTrailMap();
    });
  }

  function zoomAt(x, y, factor) {
    if (!trailView.key) return;
    const k = Math.min(MAX_ZOOM, Math.max(trailView.minK, trailView.k * factor));
    const f = k / trailView.k;
    const [tx, ty] = trailView.translate;
    trailView.translate = [x - (x - tx) * f, y - (y - ty) * f];
    trailView.k = k;
    redrawTrail();
  }

  function panBy(dx, dy) {
    if (!trailView.key) return;
    trailView.translate = [trailView.translate[0] + dx, trailView.translate[1] + dy];
    redrawTrail();
  }

  // Zoom so that the given countries fill the view (for the hint).
  function zoomToCountries(codes) {
    const here = currentStep().from;
    const fit = baseTrailProjection(here).fitExtent(EXTENT, {
      type: "FeatureCollection",
      features: codes.map((c) => ({ type: "Feature", geometry: d3.geoCircle().center(capitalPoint(c)).radius(4)() })),
    });
    trailView.k = Math.min(MAX_ZOOM, Math.max(trailView.minK, fit.scale() / trailView.baseScale));
    trailView.translate = fit.translate();
    drawTrailMap();
  }

  function drawRouteMap() {
    const route = [game.c.start, ...game.c.steps.map((s) => s.to)];
    const pad = 16;
    const circles = route.map((code) => ({
      type: "Feature",
      geometry: d3.geoCircle().center(capitalPoint(code)).radius(5)(),
    }));
    const x = route.reduce((a, k) => a + Math.cos((byCode[k].lng * Math.PI) / 180), 0);
    const y = route.reduce((a, k) => a + Math.sin((byCode[k].lng * Math.PI) / 180), 0);
    const projection = d3
      .geoEqualEarth()
      .rotate([-(Math.atan2(y, x) * 180) / Math.PI, 0])
      .fitExtent([[pad, pad], [MAP_W - pad, MAP_H - pad]], { type: "FeatureCollection", features: circles });
    drawMap($("endMap"), projection, { highlight: route, current: route[route.length - 1], route });
  }

  // Normal: a tap on the map is the guess. Map units are measured inside
  // the border (see mapPoint in app.js).
  function mapPoint(svg, clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return [
      ((clientX - r.left - svg.clientLeft) * MAP_W) / svg.clientWidth,
      ((clientY - r.top - svg.clientTop) * MAP_H) / svg.clientHeight,
    ];
  }
  // Pointers: a drag moves the map, two fingers zoom, and a short tap that
  // does not move selects a country (Normal).
  const pointers = new Map();
  let tapStart = null;
  svgEl.addEventListener("pointerdown", (e) => {
    svgEl.setPointerCapture(e.pointerId);
    const p = mapPoint(svgEl, e.clientX, e.clientY);
    pointers.set(e.pointerId, p);
    tapStart = pointers.size === 1 ? { id: e.pointerId, p, at: Date.now(), projection: trailProjection } : null;
  });
  svgEl.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = mapPoint(svgEl, e.clientX, e.clientY);
    if (tapStart && tapStart.id === e.pointerId) {
      if (Math.hypot(now[0] - tapStart.p[0], now[1] - tapStart.p[1]) <= 6) return;
      tapStart = null;
    }
    if (pointers.size === 1) panBy(now[0] - prev[0], now[1] - prev[1]);
    else if (pointers.size === 2) {
      const [other] = [...pointers].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const before = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
      const after = Math.hypot(now[0] - other[0], now[1] - other[1]);
      if (before > 0) zoomAt((now[0] + other[0]) / 2, (now[1] + other[1]) / 2, after / before);
    }
    pointers.set(e.pointerId, now);
  });
  svgEl.addEventListener("pointerup", (e) => {
    if (tapStart && tapStart.id === e.pointerId && Date.now() - tapStart.at < 600)
      selectAt(tapStart.p, tapStart.projection);
    tapStart = null;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    svgEl.addEventListener(type, (e) => {
      pointers.delete(e.pointerId);
      if (type !== "pointerup") tapStart = null;
    });
  }
  // The part of a pan (dx, dy) that keepInFrame() allows, from the last
  // drawn map plus any pan that waits for the next frame.
  function allowedPan(dx, dy) {
    if (!trailView.key || !trailProjection) return [0, 0];
    const [[x0, y0], [x1, y1]] = d3.geoPath(trailProjection).bounds({ type: "Sphere" });
    const [px, py] = trailProjection.translate();
    const ox = trailView.translate[0] - px;
    const oy = trailView.translate[1] - py;
    const clamp = (d, lo, hi, size) =>
      hi - lo <= size ? 0 : Math.min(-lo, Math.max(size - hi, d));
    return [clamp(dx, x0 + ox, x1 + ox, MAP_W), clamp(dy, y0 + oy, y1 + oy, MAP_H)];
  }

  // Wheel input, as on the quiz map: a trackpad pinch (ctrl + wheel) and a
  // mouse wheel zoom, and a two-finger trackpad scroll moves the map. When
  // the map cannot move or zoom further that way, the page scrolls instead.
  let wheelGesture = { at: 0, mouse: false };
  function isMouseWheel(e) {
    const now = performance.now();
    // Decide once for each gesture: a trackpad scroll starts with small steps.
    if (now - wheelGesture.at > 300)
      wheelGesture.mouse =
        e.deltaMode !== 0 ||
        (e.deltaX === 0 &&
          Math.abs(e.deltaY) >= 40 &&
          (e.wheelDeltaY === undefined || e.wheelDeltaY % 120 === 0));
    wheelGesture.at = now;
    return wheelGesture.mouse;
  }
  svgEl.addEventListener(
    "wheel",
    (e) => {
      if (!trailView.key) return;
      const [x, y] = mapPoint(svgEl, e.clientX, e.clientY);
      const pinch = e.ctrlKey || e.metaKey;
      if (pinch || isMouseWheel(e)) {
        const step = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
        const factor = Math.exp(-step * (pinch ? 0.01 : 0.002));
        const stuck = factor < 1 ? trailView.k <= trailView.minK : trailView.k >= MAX_ZOOM;
        if (stuck && !pinch) return;
        e.preventDefault();
        zoomAt(x, y, factor);
        return;
      }
      const scale = MAP_W / svgEl.clientWidth;
      const [dx, dy] = allowedPan(-e.deltaX * scale, -e.deltaY * scale);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      e.preventDefault();
      panBy(dx, dy);
    },
    { passive: false },
  );
  svgEl.addEventListener("dblclick", (e) => {
    const [x, y] = mapPoint(svgEl, e.clientX, e.clientY);
    zoomAt(x, y, 2);
  });
  $("chaseZoomIn").addEventListener("click", () => zoomAt(MAP_W / 2, MAP_H / 2, 1.6));
  $("chaseZoomOut").addEventListener("click", () => zoomAt(MAP_W / 2, MAP_H / 2, 1 / 1.6));
  $("chaseZoomReset").addEventListener("click", () => {
    trailView = { key: null };
    drawTrailMap();
  });

  // Normal: a tap selects a country and shows its name. Only "Fly there"
  // makes the guess, so a mistap costs nothing.
  function selectAt(point, projection) {
    if (!game || game.c.level !== "normal" || $("cityScreen").hidden || !projection) return;
    const lonlat = projection.invert(point);
    if (!lonlat || !Number.isFinite(lonlat[0]) || !Number.isFinite(lonlat[1])) return;
    // A tap outside the globe does nothing.
    const back = projection(lonlat);
    if (!back || Math.hypot(back[0] - point[0], back[1] - point[1]) > 1) return;
    const warn = (text) => {
      $("chaseFeedback").textContent = text;
      $("chaseFeedback").className = "feedback warn";
    };
    const shape = countries.find((f) => d3.geoContains(f, lonlat));
    const id = shape?.properties.iso2;
    let code = shape && byCode[id] ? id : null;
    // Land that is not one of the 193 countries.
    if (shape && !code) {
      return warn(
        id === "AQ"
          ? "That's Antarctica: no country there. Tap a country."
          : "That place is not one of the countries in this game. Tap a country.",
      );
    }
    // In the sea, a tap next to any island of a really small country (under
    // 5,000 km²) selects it.
    if (!code) {
      let bestD = 16;
      for (const c of COUNTRIES) {
        if (FACTS[c.code].area >= 5000) continue;
        const f = shapeById.get(c.code);
        if (!f) continue;
        let d = Infinity;
        const walk = (xy) => {
          if (typeof xy[0] === "number") {
            const p = projection(xy);
            if (p) d = Math.min(d, Math.hypot(p[0] - point[0], p[1] - point[1]));
          } else xy.forEach(walk);
        };
        walk(f.geometry.coordinates);
        if (d < bestD) {
          code = c.code;
          bestD = d;
        }
      }
    }
    if (!code) return warn("That's the sea! Tap a country.");
    game.selected = code;
    $("chaseFeedback").textContent = "";
    $("chaseFeedback").className = "feedback";
    renderAnswer();
    drawTrailMap();
  }

  // The hint: shade the right country and 3 others nearby that cannot fit
  // all the clues, and zoom to them. It costs nothing.
  function showChoices() {
    const s = currentStep();
    const clues = [...s.clues, ...game.extra[game.step]];
    const taken = new Set([...game.flown, ...(game.wrongHere || [])]);
    const near = COUNTRIES.map((c) => c.code)
      .filter((k) => k !== s.to && !taken.has(k) && !clues.every((cl) => cl.fits(k)))
      .sort((a, b) => E.distanceKm(s.to, a) - E.distanceKm(s.to, b))
      .slice(0, 8);
    for (let i = near.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [near[i], near[j]] = [near[j], near[i]];
    }
    game.choices = [s.to, ...near.slice(0, 3)].sort();
    renderAnswer();
    zoomToCountries(game.choices);
  }

  // --- Detective files: rank badge, sticker passport, and thief cards
  let filesPlayer = null;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function showFiles() {
    if (!playerById(filesPlayer)) filesPlayer = players.playing[0] || players.list[0]?.id || null;
    renderFiles();
    show("filesScreen");
  }

  function renderFiles() {
    const tabs = $("fileTabs");
    tabs.innerHTML = "";
    for (const p of players.list) {
      const b = el("button", "file-tab" + (p.id === filesPlayer ? " on" : ""), `${p.avatar} ${p.name}`);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", p.id === filesPlayer ? "true" : "false");
      b.addEventListener("click", () => {
        filesPlayer = p.id;
        renderFiles();
      });
      tabs.appendChild(b);
    }
    const p = playerById(filesPlayer);
    $("filesEmpty").hidden = !!p;
    $("fileBody").hidden = !p;
    if (!p) return;

    // The rank badge
    const cases = solvedBy(p);
    const rank = rankFor(cases.length);
    const next = nextRank(cases.length);
    const card = $("rankCard");
    card.innerHTML = "";
    card.append(
      el("div", "rank-badge", rank.badge),
      el("div", "rank-name", `${rank.name} ${p.name}`),
      el(
        "div",
        "rank-progress",
        `${cases.length} ${cases.length === 1 ? "case" : "cases"} solved.` +
          (next ? ` ${next.at - cases.length} more to become ${next.name}.` : " The top rank!"),
      ),
    );

    // The sticker passport
    const passport = readJSON(passportKey(p.id), {});
    const stamped = Object.keys(passport).filter((k) => byCode[k]);
    $("passportCount").textContent = `${stamped.length} of ${COUNTRIES.length} countries stamped.`;
    const world = d3.geoEqualEarth().fitExtent(EXTENT, { type: "Sphere" });
    // The whole world shows, so draw every country (no culling).
    drawMap($("passportMap"), world, { stamped, cull: false });
    renderStampList(passport, stamped);
    const stickers = $("stickers");
    stickers.innerHTML = "";
    const sticker = (icon, name, detail, earned) => {
      const d = el("div", "sticker" + (earned ? " earned" : ""));
      d.append(el("div", "sticker-icon", icon), el("div", "sticker-name", name), el("div", "sticker-detail", detail));
      d.title = earned ? `${name}: earned!` : `${name}: not yet`;
      return d;
    };
    for (const [ct, icon] of Object.entries(CONTINENT_STICKERS)) {
      const all = COUNTRIES.filter((c) => c.continent === ct);
      const have = all.filter((c) => passport[c.code]).length;
      stickers.appendChild(sticker(icon, E.CONTINENT_NAMES[ct], `${have} of ${all.length}`, have === all.length));
    }
    for (const m of COUNT_STICKERS)
      stickers.appendChild(sticker(m.icon, m.name, `${m.at} countries`, stamped.length >= m.at));

    // Thief cards
    const caught = new Map();
    for (const e of cases) caught.set(e.thief, (caught.get(e.thief) || 0) + 1);
    $("cardCount").textContent = `${[...caught.keys()].filter((id) => suspectById[id]).length} of ${E.SUSPECTS.length} thieves caught.`;
    // One row of cards for each gang; a caught card is wider.
    const cards = $("thiefCards");
    cards.innerHTML = "";
    for (const g of E.GANGS) {
      const have = g.members.filter((x) => caught.has(x.id)).length;
      cards.appendChild(el("div", "gang-head", `${g.name[0].toUpperCase() + g.name.slice(1)}: ${have} of ${g.members.length}`));
      const row = el("div", "card-row");
      for (const sus of g.members) {
        const n = caught.get(sus.id) || 0;
        const c = el("div", "thief-card" + (n ? " caught" : ""));
        if (n) {
          c.append(
            el("div", "card-face", sus.emoji),
            el("div", "card-name", sus.name),
            el("div", "card-traits", E.lineupText(sus)),
            el("div", "card-snack", `Favorite snack: ${sus.snack}.`),
            el("div", "card-caught", `Caught ${n === 1 ? "once" : `${n} times`}`),
          );
        } else {
          c.append(el("div", "card-face", "❓"), el("div", "card-name", "Not caught yet"));
        }
        row.appendChild(c);
      }
      cards.appendChild(row);
    }
  }

  // The list of stamped countries, by continent, with flags and dates.
  function renderStampList(passport, stamped) {
    $("stampSummary").textContent = stamped.length
      ? `See the ${stamped.length} stamped ${stamped.length === 1 ? "country" : "countries"}`
      : "No stamps yet";
    $("stampDetails").hidden = !stamped.length;
    const list = $("stampList");
    list.innerHTML = "";
    for (const ct of Object.keys(CONTINENT_STICKERS)) {
      const here = stamped
        .map((k) => byCode[k])
        .filter((c) => c.continent === ct)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!here.length) continue;
      list.appendChild(el("div", "stamp-group", `${CONTINENT_STICKERS[ct]} ${E.CONTINENT_NAMES[ct]} (${here.length})`));
      const ul = el("ul", "stamp-list");
      for (const c of here) {
        const li = el("li", "stamp-item");
        const img = el("img", "stamp-flag");
        img.src = flagSrc(c.code);
        img.alt = "";
        const date = new Date(passport[c.code] + "T12:00:00");
        li.append(
          img,
          el("span", "stamp-name", c.name),
          el("span", "stamp-date", isNaN(date) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" })),
        );
        ul.appendChild(li);
      }
      list.appendChild(ul);
    }
  }

  // The quiz can stamp passports in another tab, or before the browser
  // brings this page back from its cache. Read the stored data again then.
  function refreshFiles() {
    Object.assign(players, readJSON(PLAYERS_KEY, players));
    if (!$("filesScreen").hidden) showFiles();
  }
  window.addEventListener("pageshow", (e) => e.persisted && refreshFiles());
  window.addEventListener("storage", (e) => {
    if (e.key && (e.key.startsWith("geo-") || e.key.startsWith("chase-"))) refreshFiles();
  });

  $("filesBtn").addEventListener("click", showFiles);
  $("filesBackBtn").addEventListener("click", () => {
    renderSetup();
    show("setupScreen");
    if (location.hash === "#files") history.replaceState(null, "", location.pathname);
  });

  // --- Start
  $("dateLine").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  renderSetup();
  // The quiz links here with #files.
  if (location.hash === "#files") showFiles();
  window.addEventListener("hashchange", () => {
    if (location.hash === "#files" && !game) showFiles();
  });
})();

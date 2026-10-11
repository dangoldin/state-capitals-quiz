(() => {
  // Data (COUNTRIES, US_STATES) comes from data.js.
  const CONTINENTS = [
    ["africa", "Africa"],
    ["asia", "Asia"],
    ["europe", "Europe"],
    ["northAmerica", "North America"],
    ["southAmerica", "South America"],
    ["oceania", "Oceania"],
  ];

  // A deck item is one question. `key` names its progress entry, so the same
  // country shares progress between its continent deck and the world deck,
  // while the US state Georgia and the country Georgia stay separate.
  // `group` lets multiple choice prefer wrong options from the same region.
  // `title` and `subtitle` are the item's line in the Mastered/Learning lists.
  const TOPICS = { capitals: "Capitals", flags: "Flags", where: "Where is it?" };
  const continentLabel = Object.fromEntries(CONTINENTS);

  const stateItem = ([name, capital, lat, lng]) => ({
    key: "state:" + name,
    topic: "capitals",
    question: "What is the capital of",
    prompt: name,
    answer: capital,
    accepted: [capital],
    typoTargets: [capital],
    group: "us",
    map: { kind: "us", id: name, lat, lng },
    title: name,
    subtitle: capital,
  });
  const stateWhereItem = ([name, capital, lat, lng]) => ({
    key: "where:us:" + name,
    topic: "where",
    question: "Where is",
    prompt: name,
    answer: name,
    accepted: [],
    group: "us",
    map: { kind: "us", id: name, lat, lng },
    title: name,
    subtitle: "",
  });
  const capitalItem = (c) => ({
    key: "capital:" + c.code,
    topic: "capitals",
    question: "What is the capital of",
    prompt: c.name,
    promptNote: c.nameNote,
    answer: c.capital,
    accepted: [c.capital, ...(c.capitalAlso || []), ...(c.capitalAka || [])],
    // Typos count only against real capitals; other spellings
    // (e.g. "DC", "Kotte") must match exactly.
    typoTargets: [c.capital, ...(c.capitalAlso || [])],
    answerAlso: c.capitalAlso,
    note: c.capitalNote,
    flag: c.code,
    map: { kind: "world", id: c.code, lat: c.lat, lng: c.lng },
    group: c.continent,
    title: c.name,
    subtitle: c.capital,
  });
  // Flags that look almost the same: either name is accepted, and the twin is
  // never offered as a wrong option.
  const FLAG_TWINS = { MC: "ID", ID: "MC", TD: "RO", RO: "TD" };
  // The country name is the answer, so it shows only after the answer.
  const flagItem = (c) => {
    const twin = COUNTRIES.find((t) => t.code === FLAG_TWINS[c.code]);
    const twinNote = twin
      ? `This is the flag of ${c.name}. ${twin.name}'s flag looks almost the same.`
      : "";
    return {
      key: "flag:" + c.code,
      topic: "flags",
      question: "Which country has this flag?",
      prompt: "",
      answer: c.name,
      accepted: [c.name, ...(c.aka || []), ...(twin ? [twin.name] : [])],
      typoTargets: [c.name, ...(c.aka || [])],
      note: [twinNote, c.nameNote].filter(Boolean).join(" ") || undefined,
      flag: c.code,
      map: { kind: "world", id: c.code, lat: c.lat, lng: c.lng },
      group: c.continent,
      title: c.name,
      subtitle: continentLabel[c.continent],
    };
  };
  const whereItem = (c) => ({
    key: "where:" + c.code,
    topic: "where",
    question: "Where is",
    prompt: c.name,
    promptNote: c.nameNote,
    answer: c.name,
    accepted: [],
    flag: c.code,
    map: { kind: "world", id: c.code, lat: c.lat, lng: c.lng },
    group: c.continent,
    title: c.name,
    subtitle: continentLabel[c.continent],
  });
  const ITEM_MAKERS = {
    countries: { capitals: capitalItem, flags: flagItem, where: whereItem },
    // The app has no data for US state flags.
    states: { capitals: stateItem, where: stateWhereItem },
  };

  const DECKS = {
    states: { label: "US States", source: "states", rows: US_STATES },
  };
  for (const [key, label] of CONTINENTS) {
    DECKS[key] = {
      label,
      source: "countries",
      rows: COUNTRIES.filter((c) => c.continent === key),
    };
  }
  DECKS.world = { label: "World — All Countries", source: "countries", rows: COUNTRIES };

  const topicAllowed = (deckId, topic) => !!ITEM_MAKERS[DECKS[deckId].source][topic];
  const itemCache = new Map();
  function itemsFor(deckId, topic) {
    const k = deckId + "/" + topic;
    if (!itemCache.has(k)) {
      const d = DECKS[deckId];
      itemCache.set(k, d.rows.map(ITEM_MAKERS[d.source][topic]));
    }
    return itemCache.get(k);
  }

  const MASTERED_AT = 4; // streak >= this = mastered
  const CHOICES = 4; // options shown in easy mode
  const DECK_KEY = "capitals-deck-v1";
  const TOPIC_KEY = "geo-topic-v1";
  const PLAYERS_KEY = "geo-players-v1";
  const OLD_PROGRESS_KEY = "capitals-progress-v2";
  const MIGRATED_KEY = "geo-migrated-v2"; // set once the v2 progress has moved
  const progressKey = (playerId) => "geo-progress-v3:" + playerId;
  const statsKey = (playerId) => "geo-stats-v1:" + playerId;
  const SETTINGS_KEY = "geo-settings-v1";
  // Points: 10 for a choice (Easy), 20 for a typed answer, and a bonus from
  // the third correct answer in a row. A wrong answer never removes points.
  const POINTS = { easy: 10, type: 20, runBonus: 5, runFrom: 3 };
  const AVATARS = [
    "🦊", "🐼", "🐯", "🐸", "🐙", "🦉", "🐨", "🦁",
    "🐶", "🐱", "🐰", "🐻", "🐷", "🐵", "🦄", "🐢",
    "🐬", "🦖", "🐧", "🦒", "🐝", "🦋", "🐳", "🦜",
  ];

  const $ = (id) => document.getElementById(id);
  const deckTitleEl = $("deckTitle");
  const deckSelectEl = $("deckSelect");
  const stateNameEl = $("stateName");
  const nameNoteEl = $("nameNote");
  const flagEl = $("flag");
  const questionEl = $("questionText");
  const topicSelectEl = $("topicSelect");
  const turnEl = $("turnBanner");
  const inputEl = $("answerInput");
  const choicesEl = $("choices");
  const feedbackEl = $("feedback");
  const formEl = $("answerForm");
  const buttonRow = $("buttonRow");
  const streakDotsEl = $("streakDots");

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

  let currentDeckId = "states";
  try {
    const saved = localStorage.getItem(DECK_KEY);
    if (saved && DECKS[saved]) currentDeckId = saved;
  } catch {}

  let currentTopic = "capitals";
  try {
    const saved = localStorage.getItem(TOPIC_KEY);
    if (saved && TOPICS[saved] && topicAllowed(currentDeckId, saved)) currentTopic = saved;
  } catch {}

  const deckItems = () => itemsFor(currentDeckId, currentTopic);
  const deckLabel = () =>
    currentTopic === "capitals"
      ? DECKS[currentDeckId].label
      : `${DECKS[currentDeckId].label} · ${TOPICS[currentTopic]}`;
  const dialogOpen = () =>
    $("modalBackdrop").classList.contains("open") ||
    $("playersBackdrop").classList.contains("open") ||
    $("confirmBackdrop").classList.contains("open");

  // players: { list: [{ id, name, avatar, level }], playing: [id], turn }
  // `playing` is the turn order of this game; level is "easy" or "type".
  const players = readJSON(PLAYERS_KEY, { list: [], playing: [], turn: 0 });
  players.playing = (players.playing || []).filter((id) =>
    players.list.some((p) => p.id === id),
  );
  if (!(players.turn < players.playing.length)) players.turn = 0;
  const savePlayers = () => writeJSON(PLAYERS_KEY, players);

  // Progress of each player, loaded on first use.
  const progressById = {};
  function progressOf(id) {
    if (!progressById[id]) progressById[id] = readJSON(progressKey(id), {});
    return progressById[id];
  }

  const playerById = (id) => players.list.find((p) => p.id === id);
  const turnPlayer = () => playerById(players.playing[players.turn]);

  // scoreMode: "off" (default: no points shown), "team" or "each".
  const DEFAULT_SETTINGS = { showMap: true, scoreMode: "off" };
  const settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };
  const saveSettings = () => writeJSON(SETTINGS_KEY, settings);

  let current = null;
  let lastShown = null;
  let phase = "asking"; // "asking" | "revealed"

  // --- Score ---
  // Points are always saved, even with scoring off, so turning it on later
  // shows the history. The session score (team or each player) resets at Start.
  let session = { team: 0, byPlayer: {}, run: {} };
  let lastAward = null;

  // The Monday of this week, as YYYY-MM-DD in local time.
  function weekStart(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function statsOf(id) {
    const stats = readJSON(statsKey(id), { total: 0, week: null, weekPoints: 0 });
    if (stats.week !== weekStart()) {
      stats.week = weekStart();
      stats.weekPoints = 0;
    }
    return stats;
  }

  function awardPoints(correct) {
    const p = turnPlayer();
    if (!p) return null;
    if (!correct) {
      session.run[p.id] = 0;
      return null;
    }
    const run = (session.run[p.id] || 0) + 1;
    session.run[p.id] = run;
    const bonus = run >= POINTS.runFrom ? POINTS.runBonus : 0;
    const points = (hardTask() ? POINTS.type : POINTS.easy) + bonus;
    session.team += points;
    session.byPlayer[p.id] = (session.byPlayer[p.id] || 0) + points;
    const stats = statsOf(p.id);
    stats.total += points;
    stats.weekPoints += points;
    writeJSON(statsKey(p.id), stats);
    return { points, bonus, run };
  }

  // "Where is it?" is the same tap for both levels, except that Type on the
  // world deck shows the whole world. The points follow the task.
  function hardTask() {
    if (current?.topic === "where")
      return current.map.kind === "world" && currentDeckId === "world" && !isEasy();
    return !isEasy();
  }

  function scoreChip(label, points, active) {
    const chip = document.createElement("div");
    chip.className = "score-chip" + (active ? " active" : "");
    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent = label;
    const num = document.createElement("span");
    num.className = "score-num";
    num.textContent = points;
    chip.append(name, num);
    return chip;
  }

  function renderScore() {
    const el = $("scoreboard");
    el.hidden = settings.scoreMode === "off" || !players.playing.length;
    el.innerHTML = "";
    if (el.hidden) return;
    if (settings.scoreMode === "team") {
      el.append(scoreChip("Team score", session.team, false));
    } else {
      for (const id of players.playing) {
        const p = playerById(id);
        el.append(scoreChip(`${p.avatar} ${p.name}`, session.byPlayer[id] || 0, p === turnPlayer()));
      }
    }
  }

  function setScoreMode(mode) {
    settings.scoreMode = mode;
    saveSettings();
    renderPlayers();
    renderScore();
  }

  function saveProgress() {
    const p = turnPlayer();
    if (p) writeJSON(progressKey(p.id), progressOf(p.id));
  }

  // Progress saved before players existed (v2) used "country:<name>" keys.
  // Move it to the first player, under the new "capital:<code>" keys.
  function migrateV2Progress() {
    const old = readJSON(OLD_PROGRESS_KEY, null);
    if (!old) return {};
    const byName = new Map();
    for (const c of COUNTRIES) {
      for (const n of [c.name, ...(c.aka || [])]) byName.set(n, c);
    }
    const out = {};
    for (const [key, entry] of Object.entries(old)) {
      const sep = key.indexOf(":");
      const kind = key.slice(0, sep);
      const name = key.slice(sep + 1);
      if (kind === "state") {
        out[key] = entry;
      } else if (kind === "country") {
        const c = byName.get(name);
        // Equatorial Guinea changed its capital in 2026, so a streak earned
        // with the old answer (Malabo) no longer counts.
        if (c && c.code !== "GQ") out["capital:" + c.code] = entry;
      }
    }
    return out;
  }

  function addPlayer(name, avatar) {
    const id =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    players.list.push({ id, name, avatar, level: "type" });
    players.playing.push(id);
    // The first player ever gets the v2 progress, only one time.
    if (!readJSON(MIGRATED_KEY, false)) {
      writeJSON(progressKey(id), migrateV2Progress());
      writeJSON(MIGRATED_KEY, true);
    }
    savePlayers();
    openPlayers();
  }

  function removePlayer(id) {
    players.list = players.list.filter((p) => p.id !== id);
    players.playing = players.playing.filter((pid) => pid !== id);
    players.turn = 0;
    delete progressById[id];
    try {
      localStorage.removeItem(progressKey(id));
      localStorage.removeItem(statsKey(id));
    } catch {}
    savePlayers();
    renderPlayers();
    renderPlayerButton();
  }

  function togglePlaying(id) {
    const i = players.playing.indexOf(id);
    if (i >= 0) players.playing.splice(i, 1);
    else players.playing.push(id);
    savePlayers();
    renderPlayers();
  }

  function setLevel(id, level) {
    playerById(id).level = level;
    savePlayers();
    renderPlayers();
  }

  // New game: delete every player and all saved progress on this device.
  async function newGame() {
    const ok = await askConfirm(
      "Start a new game? This deletes every player and all progress on this device.",
      "Delete all",
    );
    if (!ok) return;
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("geo-") || key.startsWith("capitals-"))
          localStorage.removeItem(key);
      }
    } catch {}
    // The old v2 progress is deleted too, so never migrate it again.
    writeJSON(MIGRATED_KEY, true);
    players.list = [];
    players.playing = [];
    players.turn = 0;
    for (const id of Object.keys(progressById)) delete progressById[id];
    Object.assign(settings, DEFAULT_SETTINGS);
    session = { team: 0, byPlayer: {}, run: {} };
    savePlayers();
    renderPlayerButton();
    lastShown = null;
    nextCard();
    openPlayers();
  }

  // Start (or restart) the game with the selected players, first in line first.
  function startGame() {
    if (!players.playing.length) return;
    players.turn = 0;
    session = { team: 0, byPlayer: {}, run: {} };
    savePlayers();
    $("playersBackdrop").classList.remove("open");
    setInert(false);
    renderPlayerButton();
    lastShown = null;
    nextCard();
  }

  function entryFor(item) {
    const p = turnPlayer();
    const progress = p ? progressOf(p.id) : {};
    if (!progress[item.key])
      progress[item.key] = { correct: 0, wrong: 0, streak: 0, seen: 0 };
    return progress[item.key];
  }

  function normalize(s) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/\bsaint\b/g, "st") // Saint <-> St
      .replace(/[.,'’ʻ`\-]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1, // insertion
          prev[j] + 1, // deletion
          prev[j - 1] + cost, // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[b.length];
  }

  const isAccepted = (item, answer) =>
    item.accepted.some((c) => normalize(c) === normalize(answer));

  // Returns "exact", "close", or "no".
  // Close = small typo (1 edit for short words, up to ~20% of length for longer ones),
  // but only if no other answer in the deck is an equally-good match.
  function classify(answer, item) {
    const a = normalize(answer);
    if (!a) return "no";
    const accepted = item.accepted.map(normalize);
    if (accepted.includes(a)) return "exact";

    let dist = Infinity;
    let tolerance = 0;
    for (const c of item.typoTargets.map(normalize)) {
      const d = levenshtein(a, c);
      if (d < dist) {
        dist = d;
        tolerance = Math.max(1, Math.round(c.length / 5));
      }
    }
    if (dist > tolerance) return "no";

    // Guard: if some other answer is at least as close, treat as wrong.
    for (const other of deckItems()) {
      if (other.key === item.key) continue;
      for (const c of other.accepted) {
        // A shared answer (e.g. the twin flags Monaco and Indonesia) is not
        // a different answer.
        if (isAccepted(item, c)) continue;
        if (levenshtein(a, normalize(c)) <= dist) return "no";
      }
    }
    return "close";
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // The correct answer plus wrong options. A wrong option is never an
  // accepted answer for this item, and the same region comes first.
  function choicesFor(item) {
    const others = shuffle(deckItems().filter((o) => o.key !== item.key));
    others.sort((a, b) => (b.group === item.group) - (a.group === item.group));
    const wrong = [];
    for (const o of others) {
      if (wrong.length === CHOICES - 1) break;
      if (isAccepted(item, o.answer)) continue;
      if (wrong.some((w) => normalize(w) === normalize(o.answer))) continue;
      wrong.push(o.answer);
    }
    return shuffle([item.answer, ...wrong]);
  }

  // Weighted pick — wrong answers and low-streak items show up more often.
  function pickNext() {
    const items = deckItems();
    const weights = items.map((item) => {
      const p = entryFor(item);
      let w = 1;
      w += p.wrong * 3;
      w *= Math.pow(0.5, p.streak);
      if (p.streak >= MASTERED_AT) w = Math.max(w, 0.05);
      if (p.seen === 0) w += 2;
      return w;
    });

    // Avoid repeating the same item twice in a row when possible.
    if (lastShown && items.length > 1) {
      const idx = items.findIndex((item) => item.key === lastShown);
      if (idx >= 0) weights[idx] *= 0.05;
    }

    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function categoryOf(item) {
    const p = entryFor(item);
    if (p.seen === 0) return "new";
    if (p.streak >= MASTERED_AT) return "mastered";
    return "learning";
  }

  function renderStats() {
    let mastered = 0,
      learning = 0,
      fresh = 0;
    for (const item of deckItems()) {
      const c = categoryOf(item);
      if (c === "mastered") mastered++;
      else if (c === "learning") learning++;
      else fresh++;
    }
    $("masteredCount").textContent = mastered;
    $("learningCount").textContent = learning;
    $("newCount").textContent = fresh;
    const counts = { mastered, learning, new: fresh };
    document.querySelectorAll(".stat[data-cat]").forEach((el) => {
      const cat = el.dataset.cat;
      el.setAttribute(
        "aria-disabled",
        counts[cat] === 0 ? "true" : "false",
      );
    });
  }

  const CATEGORY_LABELS = {
    mastered: "Mastered",
    learning: "Learning",
    new: "Not yet seen",
  };

  const flagHtml = (item, cls) =>
    item.flag
      ? `<img class="${cls}" src="flags/${item.flag.toLowerCase()}.svg" alt="" />`
      : "";

  function openCategory(cat) {
    const rows = deckItems()
      .filter((item) => categoryOf(item) === cat)
      .map((item) => ({ item, name: item.title, p: entryFor(item) }));

    if (cat === "learning") {
      // Worst first: most wrongs, then lowest streak
      rows.sort(
        (a, b) =>
          b.p.wrong - a.p.wrong ||
          a.p.streak - b.p.streak ||
          a.name.localeCompare(b.name),
      );
    } else if (cat === "mastered") {
      rows.sort(
        (a, b) =>
          b.p.streak - a.p.streak ||
          b.p.correct - a.p.correct ||
          a.name.localeCompare(b.name),
      );
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }

    const p = turnPlayer();
    $("modalTitle").textContent = `${p ? p.name + ": " : ""}${CATEGORY_LABELS[cat]} · ${rows.length}`;
    const body = $("modalBody");
    if (rows.length === 0) {
      body.innerHTML = `<div class="modal-empty">Nothing here yet.</div>`;
    } else {
      body.innerHTML = rows
        .map(({ item, p }) => {
          let meta = "";
          if (cat === "new") {
            meta = `<div>—</div>`;
          } else {
            const total = p.correct + p.wrong;
            const streakHtml = Array.from(
              { length: MASTERED_AT },
              (_, i) =>
                `<span class="dot ${i < Math.min(p.streak, MASTERED_AT) ? "on" : ""}"></span>`,
            ).join("");
            meta = `
      <div><span class="ok">${p.correct}</span> / <span class="bad">${p.wrong}</span> <span style="color:var(--muted)">of ${total}</span></div>
      <div class="row-streak">${streakHtml}</div>
    `;
          }
          return `
    <div class="row">
      ${flagHtml(item, "row-flag")}
      <div class="row-main">
        <div class="row-state">${item.title}</div>
        <div class="row-cap">${item.subtitle}</div>
      </div>
      <div class="row-meta">${meta}</div>
    </div>
  `;
        })
        .join("");
      body.scrollTop = 0;
    }
    $("modalBackdrop").classList.add("open");
    setInert(true);
    $("modalClose").focus({ preventScroll: true });
  }

  function closeModal() {
    if (!$("modalBackdrop").classList.contains("open")) return;
    $("modalBackdrop").classList.remove("open");
    setInert(false);
  }

  // While a dialog is open, the page behind it takes no clicks, keys or focus.
  function setInert(on) {
    document.querySelector(".app").inert = on;
  }

  // In-app confirmation. Some browsers and app previews block confirm(),
  // which then returns false without showing anything.
  let confirmResolve = null;
  function askConfirm(message, okLabel) {
    $("confirmText").textContent = message;
    $("confirmOk").textContent = okLabel;
    $("confirmBackdrop").classList.add("open");
    setInert(true);
    $("playersBackdrop").inert = true;
    $("confirmCancel").focus({ preventScroll: true });
    return new Promise((resolve) => (confirmResolve = resolve));
  }

  function answerConfirm(ok) {
    if (!confirmResolve) return;
    $("confirmBackdrop").classList.remove("open");
    $("playersBackdrop").inert = false;
    if (!dialogOpen()) setInert(false);
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(ok);
  }

  // The header button lists everyone in this game.
  function renderPlayerButton() {
    const playing = players.playing.map(playerById);
    $("playerAvatar").textContent = playing.length
      ? playing.map((p) => p.avatar).join("")
      : "👤";
    $("playerName").textContent =
      playing.length === 1
        ? playing[0].name
        : playing.length
          ? `${playing.length} players`
          : "Players";
  }

  function renderTurn() {
    const p = turnPlayer();
    // Show whose turn it is only when there is more than one player.
    turnEl.hidden = !p || players.playing.length < 2;
    if (p) turnEl.textContent = `${p.avatar} ${p.name}'s turn`;
  }

  let chosenAvatar = AVATARS[0];
  // The player whose name and animal the form changes; null adds a player.
  let editingId = null;

  function renderPlayers() {
    const list = $("playerList");
    list.innerHTML = "";
    for (const p of players.list) {
      const order = players.playing.indexOf(p.id);
      const row = document.createElement("div");
      row.className = "player-row";

      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "player-pick" + (order >= 0 ? " active" : "");
      pick.setAttribute("aria-pressed", order >= 0 ? "true" : "false");
      pick.innerHTML = `<span class="avatar"></span><span class="pmain"><span class="pname"></span><span class="pweek"></span></span><span class="porder"></span>`;
      pick.querySelector(".avatar").textContent = p.avatar;
      pick.querySelector(".pname").textContent = p.name;
      // With "each player" scoring, show this week's points.
      if (settings.scoreMode === "each")
        pick.querySelector(".pweek").textContent = `${statsOf(p.id).weekPoints} points this week`;
      pick.querySelector(".porder").textContent = order >= 0 ? order + 1 : "";
      pick.addEventListener("click", () => togglePlaying(p.id));

      const level = document.createElement("div");
      level.className = "level-toggle";
      level.setAttribute("role", "radiogroup");
      level.setAttribute("aria-label", p.name + "'s level");
      for (const [value, label] of [
        ["easy", "Easy"],
        ["type", "Type"],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.title =
          value === "easy" ? "Choose from 4 answers" : "Type the answer";
        b.className = (p.level || "type") === value ? "on" : "";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", b.className === "on" ? "true" : "false");
        b.addEventListener("click", () => setLevel(p.id, value));
        level.appendChild(b);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "player-remove";
      remove.setAttribute("aria-label", "Remove " + p.name);
      remove.textContent = "×";
      remove.addEventListener("click", async () => {
        const ok = await askConfirm(
          `Remove ${p.name}? This deletes all of ${p.name}'s progress.`,
          "Remove",
        );
        if (ok) removePlayer(p.id);
      });

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "player-edit" + (editingId === p.id ? " on" : "");
      edit.setAttribute("aria-label", "Change " + p.name + "'s name or animal");
      edit.textContent = "✎";
      edit.addEventListener("click", () => startEdit(p.id));

      row.append(pick, level, edit, remove);
      list.appendChild(row);
    }
    $("playersHint").textContent = players.list.length
      ? "Tap a name to add or drop that player from this game. Turns go in the order of the numbers. × deletes a player."
      : "Add each player. Then press Start.";
    $("newGameBtn").hidden = players.list.length === 0;
    for (const b of $("scoreMode").querySelectorAll("button")) {
      const on = b.dataset.mode === settings.scoreMode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }

    const editing = playerById(editingId);
    $("addPlayerLabel").textContent = editing ? `Change ${editing.name}` : "New player";
    $("addPlayerSubmit").textContent = editing ? "Save" : "Add player";
    $("editCancel").hidden = !editing;
    const picker = $("avatarPicker");
    picker.innerHTML = "";
    for (const a of AVATARS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "avatar-option" + (a === chosenAvatar ? " active" : "");
      b.textContent = a;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", a === chosenAvatar ? "true" : "false");
      b.addEventListener("click", () => {
        chosenAvatar = a;
        renderPlayers();
      });
      picker.appendChild(b);
    }

    // The game can start only when somebody plays.
    const ready = players.playing.length > 0;
    $("startBtn").disabled = !ready;
    $("startBtn").textContent =
      players.playing.length > 1
        ? `Start (${players.playing.length} players)`
        : "Start";
    $("playersClose").hidden = !ready;
  }

  // Suggest an animal that no player has yet.
  function freeAvatar() {
    const used = new Set(players.list.map((p) => p.avatar));
    return AVATARS.find((a) => !used.has(a)) || AVATARS[0];
  }

  function startEdit(id) {
    const p = playerById(id);
    if (!p) return;
    editingId = id;
    chosenAvatar = p.avatar;
    $("newPlayerName").value = p.name;
    renderPlayers();
    $("newPlayerName").focus({ preventScroll: true });
  }

  function stopEdit() {
    editingId = null;
    chosenAvatar = freeAvatar();
    $("newPlayerName").value = "";
    renderPlayers();
  }

  function openPlayers() {
    editingId = null;
    chosenAvatar = freeAvatar();
    renderPlayers();
    $("playersBackdrop").classList.add("open");
    setInert(true);
    $("newPlayerName").focus({ preventScroll: true });
  }

  function closePlayers() {
    if (!$("playersBackdrop").classList.contains("open")) return;
    if (!players.playing.length) return;
    $("playersBackdrop").classList.remove("open");
    setInert(false);
    // The player list may have changed, so make sure the turn is valid.
    if (!(players.turn < players.playing.length)) players.turn = 0;
    renderPlayerButton();
    renderTurn();
    if (phase === "asking") showQuestion();
    renderStats();
    renderStreakDots();
    renderScore();
    // The level may have changed, and "Where is it?" shows a different view.
    renderMap(phase === "revealed");
  }

  function renderStreakDots() {
    if (!current) {
      streakDotsEl.innerHTML = "";
      return;
    }
    const p = entryFor(current);
    const filled = Math.min(p.streak, MASTERED_AT);
    let html = "";
    for (let i = 0; i < MASTERED_AT; i++) {
      html += `<div class="dot ${i < filled ? "on" : ""}"></div>`;
    }
    streakDotsEl.innerHTML = html;
  }

  const isEasy = () => (turnPlayer()?.level || "type") === "easy";

  function showAskingButtons() {
    buttonRow.innerHTML = "";
    buttonRow.classList.toggle("single", isEasy());
    if (!isEasy()) {
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "action submit";
      submit.id = "submitBtn";
      submit.textContent = "Check";
      buttonRow.appendChild(submit);
    }
    const dunno = document.createElement("button");
    dunno.type = "button";
    dunno.className = "action dunno";
    dunno.id = "dunnoBtn";
    dunno.textContent = "I don't know";
    dunno.addEventListener("click", handleDunno);
    buttonRow.appendChild(dunno);
  }

  function showNextButton() {
    buttonRow.innerHTML = "";
    buttonRow.classList.remove("single");
    const next = document.createElement("button");
    next.type = "button";
    next.className = "action next";
    const after = players.playing.length > 1 ? nextPlayer() : null;
    next.textContent = after ? `${after.avatar} ${after.name}'s turn →` : "Next →";
    next.addEventListener("click", goNext);
    buttonRow.appendChild(next);
    next.focus({ preventScroll: true });
  }

  const nextPlayer = () =>
    playerById(players.playing[(players.turn + 1) % players.playing.length]);

  // Pass the turn to the next player, then show their card.
  function goNext() {
    if (players.playing.length) {
      players.turn = (players.turn + 1) % players.playing.length;
      savePlayers();
    }
    nextCard();
  }

  // Shows the input (Type) or the answer buttons (Easy) for the current card.
  function showQuestion() {
    if (current.topic === "where") {
      // The answer is a tap on the map.
      inputEl.hidden = true;
      choicesEl.hidden = true;
      choicesEl.innerHTML = "";
      buttonRow.innerHTML = "";
      buttonRow.classList.add("single");
      const dunno = document.createElement("button");
      dunno.type = "button";
      dunno.className = "action dunno";
      dunno.id = "dunnoBtn";
      dunno.textContent = "I don't know";
      dunno.addEventListener("click", handleDunno);
      buttonRow.appendChild(dunno);
      feedbackEl.textContent = "Tap it on the map below.";
      feedbackEl.className = "feedback hint-text";
      return;
    }
    const easy = isEasy();
    inputEl.hidden = easy;
    choicesEl.hidden = !easy;
    choicesEl.innerHTML = "";
    if (easy) {
      choicesFor(current).forEach((answer, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "choice";
        b.textContent = answer;
        b.dataset.key = String(i + 1);
        b.addEventListener("click", () => handleChoice(b, answer));
        choicesEl.appendChild(b);
      });
    }
    showAskingButtons();
    if (!easy && !dialogOpen())
      setTimeout(() => inputEl.focus({ preventScroll: true }), 0);
  }

  function nextCard() {
    current = pickNext();
    lastShown = current.key;
    phase = "asking";
    renderTurn();
    questionEl.textContent = current.question;
    stateNameEl.textContent = current.prompt;
    stateNameEl.hidden = !current.prompt;
    stateNameEl.classList.toggle("long", current.prompt.length > 16);
    nameNoteEl.textContent = current.promptNote || "";
    lastTap = null;
    if (current.flag) {
      flagEl.src = `flags/${current.flag.toLowerCase()}.svg`;
      flagEl.hidden = false;
      flagEl.classList.toggle("big", current.topic === "flags");
    } else {
      flagEl.removeAttribute("src");
      flagEl.hidden = true;
    }
    inputEl.value = "";
    inputEl.className = "";
    inputEl.disabled = false;
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
    showQuestion();
    renderStreakDots();
    renderStats();
    renderScore();
    renderMap(false);
  }

  // Show the result line, plus the item's note (e.g. "South Africa has three capitals").
  function reveal(html, cls) {
    feedbackEl.innerHTML = html;
    if (lastAward && settings.scoreMode !== "off") {
      const pts = document.createElement("span");
      pts.className = "points";
      pts.textContent = lastAward.bonus
        ? ` +${lastAward.points} (${lastAward.run} in a row!)`
        : ` +${lastAward.points}`;
      feedbackEl.appendChild(pts);
    }
    if (current.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = current.note;
      feedbackEl.appendChild(note);
    }
    feedbackEl.className = "feedback " + cls;
    phase = "revealed";
    renderMap(true);
    renderScore();
    saveProgress();
    renderStreakDots();
    renderStats();
    showNextButton();
  }

  function record(correct) {
    lastAward = awardPoints(correct);
    const p = entryFor(current);
    p.seen++;
    if (correct) {
      p.correct++;
      p.streak++;
    } else {
      p.wrong++;
      p.streak = 0;
    }
  }

  // If the player gave (or misspelled) another official capital, e.g. La Paz
  // for Bolivia, show that one instead of the main answer.
  function shownAnswer(given) {
    const t = normalize(given);
    let best = current.answer;
    let bestDist = levenshtein(t, normalize(current.answer));
    for (const c of current.answerAlso || []) {
      const d = levenshtein(t, normalize(c));
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  function handleCorrect(typed) {
    record(true);
    inputEl.className = "correct";
    inputEl.disabled = true;
    reveal(`Correct! <span class="answer">${shownAnswer(typed)}</span>`, "good");
  }

  function handleClose(typed) {
    // Counts as correct (you knew the answer), but flagged so you can learn the spelling.
    record(true);
    inputEl.className = "close";
    inputEl.disabled = true;
    reveal(
      `Close — spelled <span class="answer">${shownAnswer(typed)}</span>`,
      "warn",
    );
  }

  function handleWrong(userAnswer) {
    record(false);
    inputEl.className = "wrong";
    inputEl.disabled = true;
    markChoices(null);
    reveal(
      userAnswer
        ? `Not quite — it's <span class="answer">${current.answer}</span>`
        : `It's <span class="answer">${current.answer}</span>`,
      "bad",
    );
  }

  // Easy mode: color the picked button, and always show the right one.
  function markChoices(picked) {
    for (const b of choicesEl.querySelectorAll(".choice")) {
      b.disabled = true;
      if (b.textContent === current.answer) b.classList.add("right");
      else if (b === picked) b.classList.add("wrong");
    }
  }

  function handleChoice(button, answer) {
    if (phase !== "asking") return;
    const correct = isAccepted(current, answer);
    record(correct);
    markChoices(button);
    if (correct) {
      reveal(`Correct! <span class="answer">${current.answer}</span>`, "good");
    } else {
      reveal(`Not quite — it's <span class="answer">${current.answer}</span>`, "bad");
    }
  }

  function handleDunno() {
    if (current.topic === "where") {
      record(false);
      reveal(`Here is <span class="answer">${current.answer}</span>.`, "bad");
      return;
    }
    handleWrong("");
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (phase === "revealed") {
      goNext();
      return;
    }
    if (isEasy() || current.topic === "where") return;
    const val = inputEl.value;
    if (!val.trim()) return;
    const result = classify(val, current);
    if (result === "exact") handleCorrect(val);
    else if (result === "close") handleClose(val);
    else handleWrong(val);
  });

  // Flags is not offered for the US States deck.
  function renderTopicSelect() {
    for (const opt of topicSelectEl.options)
      opt.disabled = !topicAllowed(currentDeckId, opt.value);
    topicSelectEl.value = currentTopic;
    deckTitleEl.textContent = deckLabel();
  }

  deckSelectEl.addEventListener("change", () => {
    if (!DECKS[deckSelectEl.value]) return;
    currentDeckId = deckSelectEl.value;
    if (!topicAllowed(currentDeckId, currentTopic)) currentTopic = "capitals";
    try {
      localStorage.setItem(DECK_KEY, currentDeckId);
      localStorage.setItem(TOPIC_KEY, currentTopic);
    } catch {}
    renderTopicSelect();
    lastShown = null;
    nextCard();
  });

  topicSelectEl.addEventListener("change", () => {
    const topic = topicSelectEl.value;
    if (!TOPICS[topic] || !topicAllowed(currentDeckId, topic)) return;
    currentTopic = topic;
    try {
      localStorage.setItem(TOPIC_KEY, currentTopic);
    } catch {}
    renderTopicSelect();
    lastShown = null;
    nextCard();
  });

  $("resetBtn").addEventListener("click", async () => {
    const p = turnPlayer();
    if (!p) return;
    const ok = await askConfirm(
      `Reset ${p.name}'s progress for ${deckLabel()}?`,
      "Reset",
    );
    if (!ok) return;
    const progress = progressOf(p.id);
    for (const item of deckItems()) delete progress[item.key];
    saveProgress();
    lastShown = null;
    nextCard();
  });

  document.querySelectorAll(".stat[data-cat]").forEach((el) => {
    const open = () => {
      if (el.getAttribute("aria-disabled") === "true") return;
      openCategory(el.dataset.cat);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });

  $("modalClose").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === $("modalBackdrop")) closeModal();
  });

  $("playerBtn").addEventListener("click", openPlayers);
  $("playersClose").addEventListener("click", closePlayers);
  $("startBtn").addEventListener("click", startGame);
  $("newGameBtn").addEventListener("click", newGame);
  for (const b of $("scoreMode").querySelectorAll("button"))
    b.addEventListener("click", () => setScoreMode(b.dataset.mode));
  $("confirmOk").addEventListener("click", () => answerConfirm(true));
  $("confirmCancel").addEventListener("click", () => answerConfirm(false));
  $("playersBackdrop").addEventListener("click", (e) => {
    if (e.target === $("playersBackdrop")) closePlayers();
  });
  $("addPlayerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("newPlayerName").value.trim();
    if (!name) return;
    const editing = playerById(editingId);
    if (editing) {
      editing.name = name;
      editing.avatar = chosenAvatar;
      savePlayers();
      stopEdit();
      renderPlayerButton();
      renderTurn();
      renderScore();
      return;
    }
    $("newPlayerName").value = "";
    addPlayer(name, chosenAvatar);
    $("newPlayerName").focus();
  });
  $("editCancel").addEventListener("click", stopEdit);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Close only the top dialog.
      if (confirmResolve) answerConfirm(false);
      else if ($("modalBackdrop").classList.contains("open")) closeModal();
      else closePlayers();
      return;
    }
    // Easy mode: keys 1-4 pick an answer.
    if (phase === "asking" && !choicesEl.hidden && !dialogOpen() && /^[1-9]$/.test(e.key)) {
      choicesEl.querySelector(`.choice[data-key="${e.key}"]`)?.click();
    }
  });

  // --- Map -------------------------------------------------------------
  // The map scripts and data load only when the map is on. They are .js
  // files (not fetched JSON), so the map also works from file://.
  const MAP_SCRIPTS = [
    "vendor/d3-array.min.js",
    "vendor/d3-geo.min.js",
    "vendor/topojson-client.min.js",
    "map/world.js",
    "map/us-states.js",
  ];
  const MAP_W = 480;
  const MAP_H = 300;
  const mapFigureEl = $("mapFigure");
  const mapSvgEl = $("mapSvg");
  const mapCaptionEl = $("mapCaption");
  let mapData = null;
  let mapLoading = null;

  // Each script loads once. After a failure, only the failed script is
  // fetched again on the next try.
  const scriptLoads = new Map();
  function loadScript(src) {
    if (!scriptLoads.has(src)) {
      const load = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = resolve;
        el.onerror = () => {
          el.remove();
          scriptLoads.delete(src);
          reject(new Error("Could not load " + src));
        };
        document.head.appendChild(el);
      });
      scriptLoads.set(src, load);
    }
    return scriptLoads.get(src);
  }

  function loadMap() {
    if (!mapLoading) {
      // In order: d3-geo needs d3-array.
      mapLoading = MAP_SCRIPTS.reduce(
        (p, src) => p.then(() => loadScript(src)),
        Promise.resolve(),
      ).then(() => {
        const w = window.WORLD_MAP;
        const u = window.US_MAP;
        const countries = topojson.feature(w, w.objects.countries).features;
        const states = topojson.feature(u, u.objects.states).features;
        // Center and radius of each country, used to skip countries that
        // are far outside the view.
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
        mapData = {
          countries,
          countryById: new Map(countries.map((f) => [f.properties.iso2, f])),
          states,
          stateById: new Map(states.map((f) => [f.properties.name, f])),
          nation: topojson.feature(u, u.objects.nation),
        };
      })
      .catch((err) => {
        mapLoading = null; // try again on the next card
        throw err;
      });
    }
    return mapLoading;
  }

  // The parts of a country to zoom to: the part at or near the capital and
  // any other big part. Far, small parts (e.g. French Guiana for France)
  // still show in the highlight color, but they do not set the zoom.
  function focusParts(shape, capital) {
    const g = shape.geometry;
    if (g.type !== "MultiPolygon") return shape;
    const parts = g.coordinates.map((coords) => {
      const poly = { type: "Polygon", coordinates: coords };
      return {
        coords,
        area: d3.geoArea(poly),
        near: d3.geoDistance(d3.geoCentroid(poly), capital) * 6371 < 1500,
      };
    });
    const largest = Math.max(...parts.map((p) => p.area));
    const keep = parts.filter((p) => p.near || p.area >= largest * 0.2);
    return {
      type: "Feature",
      geometry: { type: "MultiPolygon", coordinates: keep.map((p) => p.coords) },
    };
  }

  // "Where is it?" must not give the answer away, so the view never centers
  // on the country. Easy, and every continent deck, show the continent; Type
  // on the world deck shows the whole world.
  function regionProjection(item, extent) {
    if (currentDeckId === "world" && !isEasy()) {
      return d3.geoEqualEarth().rotate([-10, 0]).fitExtent(extent, { type: "Sphere" });
    }
    const capitals = COUNTRIES.filter((c) => c.continent === item.group);
    // Mean longitude on the circle, so Oceania does not split at 180°.
    const x = capitals.reduce((a, c) => a + Math.cos((c.lng * Math.PI) / 180), 0);
    const y = capitals.reduce((a, c) => a + Math.sin((c.lng * Math.PI) / 180), 0);
    const lng = (Math.atan2(y, x) * 180) / Math.PI;
    const circles = capitals.map((c) => ({
      type: "Feature",
      geometry: d3.geoCircle().center([c.lng, c.lat]).radius(4)(),
    }));
    return d3
      .geoEqualEarth()
      .rotate([-lng, 0])
      .fitExtent(extent, { type: "FeatureCollection", features: circles });
  }

  function drawMap(item, revealed) {
    const m = item.map;
    const capital = [m.lng, m.lat];
    const pad = 14;
    const extent = [
      [pad, pad],
      [MAP_W - pad, MAP_H - pad],
    ];
    const guessing = item.topic === "where" && !revealed;
    let projection, shapes, target;
    if (m.kind === "us") {
      shapes = mapData.states;
      target = mapData.stateById.get(m.id);
      projection = d3.geoAlbersUsa().fitExtent(extent, mapData.nation);
    } else if (item.topic === "where") {
      shapes = mapData.countries;
      target = mapData.countryById.get(m.id);
      projection = regionProjection(item, extent);
    } else {
      shapes = mapData.countries;
      target = mapData.countryById.get(m.id);
      // About 650 km around the capital always shows, so a small country
      // appears with its neighbors.
      const context = { type: "Feature", geometry: d3.geoCircle().center(capital).radius(6)() };
      projection = d3
        .geoEqualEarth()
        .rotate([-m.lng, 0])
        .fitExtent(extent, {
          type: "FeatureCollection",
          features: target ? [focusParts(target, capital), context] : [context],
        });
    }
    // Zoom: each card starts at the fitted view. Showing the answer keeps
    // the player's zoom, because the card stays the same.
    if (mapView.key !== item.key) {
      const world = m.kind === "world"
        ? d3.geoEqualEarth().rotate([-m.lng, 0]).fitExtent(extent, { type: "Sphere" }).scale()
        : projection.scale() * 0.8;
      mapView = {
        key: item.key,
        k: 1,
        translate: projection.translate(),
        baseScale: projection.scale(),
        minK: Math.min(1, world / projection.scale()),
      };
    }
    projection.scale(mapView.baseScale * mapView.k).translate(mapView.translate);
    const outline = m.kind === "world" ? { type: "Sphere" } : mapData.nation;
    keepInFrame(projection, outline);
    lastOutline = outline;
    lastMapDraw = { item, revealed };
    lastProjection = projection;
    mapSvgEl.classList.toggle("zoomed", mapView.k !== 1);

    const path = d3.geoPath(projection);
    const parts = [];
    let ringed = false;
    // The view as a circle on the globe: its center and the farthest corner.
    let viewCenter = null;
    let viewRadius = Infinity;
    if (m.kind === "world") {
      viewCenter = projection.invert([MAP_W / 2, MAP_H / 2]);
      const corners = [[0, 0], [MAP_W, 0], [0, MAP_H], [MAP_W, MAP_H]].map((p) =>
        projection.invert(p),
      );
      // If the whole globe fits in the view, draw everything.
      const [[x0, y0], [x1, y1]] = sphereBounds(projection);
      const globeInside = x0 >= 0 && y0 >= 0 && x1 <= MAP_W && y1 <= MAP_H;
      if (!globeInside && viewCenter && corners.every((c) => c && Number.isFinite(c[0])))
        viewRadius = Math.max(...corners.map((c) => d3.geoDistance(c, viewCenter)));
    }
    const inView = (f) =>
      !viewCenter || d3.geoDistance(f.center, viewCenter) - f.radius < viewRadius;
    if (m.kind === "world") {
      parts.push(`<path class="map-water" d="${path({ type: "Sphere" })}"/>`);
      parts.push(`<path class="map-grid" d="${path(d3.geoGraticule10())}"/>`);
    }
    for (const f of shapes) {
      if ((f === target && !guessing) || !inView(f)) continue;
      const d = path(f);
      const id = f.properties.iso2 || f.properties.name;
      if (d) parts.push(`<path class="map-land" data-id="${id}" d="${d}"/>`);
    }
    if (target && !guessing) {
      parts.push(`<path class="map-target" d="${path(target)}"/>`);
      // Too small to see: ring each island group (e.g. all of Kiribati).
      if (path.area(target) < 40) {
        const g = target.geometry;
        const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
        const rings = [];
        for (const coords of polys) {
          const p = projection(d3.geoCentroid({ type: "Polygon", coordinates: coords }));
          if (!p || p[0] < 0 || p[1] < 0 || p[0] > MAP_W || p[1] > MAP_H) continue;
          if (rings.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 16)) continue;
          rings.push(p);
        }
        for (const [x, y] of rings)
          parts.push(`<circle class="map-ring" cx="${x}" cy="${y}" r="10"/>`);
        ringed = rings.length > 0;
      }
    }
    // "Where is it?": mark where the player tapped.
    if (revealed && lastTap && item.topic === "where") {
      const t = projection(lastTap.lonlat);
      if (t)
        parts.push(
          `<circle class="map-tap ${lastTap.correct ? "good" : "bad"}" cx="${t[0]}" cy="${t[1]}" r="6"/>`,
        );
    }
    if (revealed) {
      const p = projection(capital);
      if (p) {
        const [x, y] = p;
        const right = x < MAP_W * 0.6;
        parts.push(`<circle class="map-capital" cx="${x}" cy="${y}" r="4.5"/>`);
        parts.push(
          `<text class="map-label" x="${x + (right ? 9 : -9)}" y="${y + 4}" text-anchor="${right ? "start" : "end"}"></text>`,
        );
      }
    }
    mapSvgEl.innerHTML = parts.join("");
    const label = mapSvgEl.querySelector(".map-label");
    // The dot marks the capital; in Flags and Where is it? the label names the country.
    if (label) label.textContent = item.topic === "capitals" ? item.answer : item.title;
    const where = item.title;
    const marked = `${where} is ${ringed ? "circled" : "shaded"}.`;
    if (guessing) {
      mapSvgEl.setAttribute("aria-label", "Map. Tap a place to answer.");
      mapCaptionEl.textContent = "Tap where you think it is.";
    } else if (item.topic === "capitals") {
      mapSvgEl.setAttribute(
        "aria-label",
        revealed ? `Map of ${where}, with ${item.answer} marked` : `Map of ${where}`,
      );
      mapCaptionEl.textContent = revealed ? `${marked} The dot marks ${item.answer}.` : marked;
    } else {
      mapSvgEl.setAttribute("aria-label", `Map of ${where}`);
      mapCaptionEl.textContent =
        item.topic === "where" && lastTap
          ? `${marked} The small circle is where you tapped.`
          : marked;
    }
  }

  // --- "Where is it?" taps ---
  let lastProjection = null;
  let lastOutline = null; // the shape that keepInFrame() keeps in view
  let lastTap = null; // { lonlat, correct } for the current card
  const TAP_SLACK = 16; // map units; a near miss counts for a tiny country

  function shapeAt(lonlat, kind) {
    const shapes = kind === "us" ? mapData.states : mapData.countries;
    return shapes.find((f) => d3.geoContains(f, lonlat)) || null;
  }

  // The name of a state or UN member, or null (sea, D.C., a territory, or an
  // area that is not a UN member).
  function nameOf(shape, kind) {
    if (!shape) return null;
    if (kind === "us") return US_STATES.find(([s]) => s === shape.properties.name)?.[0] || null;
    return COUNTRIES.find((c) => c.code === shape.properties.iso2)?.name || null;
  }

  // Distance on screen from (x, y) to the nearest point of a shape.
  function screenDistance(shape, [x, y], projection) {
    let min = Infinity;
    const walk = (c) => {
      if (typeof c[0] === "number") {
        const p = projection(c);
        if (p) min = Math.min(min, Math.hypot(p[0] - x, p[1] - y));
      } else c.forEach(walk);
    };
    walk(shape.geometry.coordinates);
    return min;
  }

  // `projection` is the map as it was when the finger went down.
  function handleMapTap(point, projection) {
    if (current?.topic !== "where" || phase !== "asking" || !projection || !mapData) return;
    const lonlat = projection.invert(point);
    if (!lonlat || !Number.isFinite(lonlat[0]) || !Number.isFinite(lonlat[1])) return;
    // Ignore a tap outside the globe.
    const back = projection(lonlat);
    if (!back || Math.hypot(back[0] - point[0], back[1] - point[1]) > 1) return;
    const m = current.map;
    const target = m.kind === "us" ? mapData.stateById.get(m.id) : mapData.countryById.get(m.id);
    const tapped = shapeAt(lonlat, m.kind);
    // A near miss counts only for a tiny place, and only in the sea or in an
    // area that is not a UN member (or, on the US map, not a state).
    const tiny = d3.geoPath(projection).area(target) < 300;
    const correct =
      tapped === target ||
      (tiny && !nameOf(tapped, m.kind) && screenDistance(target, point, projection) <= TAP_SLACK);
    lastTap = { lonlat, correct };
    record(correct);
    if (correct) {
      reveal(`Correct! <span class="answer">${current.answer}</span>`, "good");
    } else {
      const name = nameOf(tapped, m.kind);
      reveal(
        name
          ? `That's ${name}. Here is <span class="answer">${current.answer}</span>.`
          : `Not quite. Here is <span class="answer">${current.answer}</span>.`,
        "bad",
      );
    }
  }

  const sphereBounds = (projection) => d3.geoPath(projection).bounds({ type: "Sphere" });

  // --- Map zoom and pan ---
  const MAX_ZOOM = 20;
  let mapView = { key: null };
  let lastMapDraw = null;
  let redrawQueued = false;

  function redrawMap() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      if (lastMapDraw && lastMapDraw.item === current)
        drawMap(lastMapDraw.item, lastMapDraw.revealed);
    });
  }

  // Keep the map in the frame: center it when it is smaller than the frame,
  // and never let a drag show empty space beyond its edge.
  function keepInFrame(projection, outline) {
    const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(outline);
    const shift = (lo, hi, size) =>
      hi - lo <= size ? (size - lo - hi) / 2 : lo > 0 ? -lo : hi < size ? size - hi : 0;
    const dx = shift(x0, x1, MAP_W);
    const dy = shift(y0, y1, MAP_H);
    if (dx || dy) {
      const [tx, ty] = mapView.translate;
      mapView.translate = [tx + dx, ty + dy];
      projection.translate(mapView.translate);
    }
  }

  // Zoom by `factor`, keeping the map point under (x, y) in place.
  function zoomAt(x, y, factor) {
    if (!mapView.key) return;
    const k = Math.min(MAX_ZOOM, Math.max(mapView.minK, mapView.k * factor));
    const f = k / mapView.k;
    const [tx, ty] = mapView.translate;
    mapView.translate = [x - (x - tx) * f, y - (y - ty) * f];
    mapView.k = k;
    redrawMap();
  }

  function panBy(dx, dy) {
    if (!mapView.key) return;
    const [tx, ty] = mapView.translate;
    mapView.translate = [tx + dx, ty + dy];
    redrawMap();
  }

  function resetZoom() {
    mapView = { key: null };
    if (lastMapDraw) drawMap(lastMapDraw.item, lastMapDraw.revealed);
  }

  // Screen position to map (viewBox) units. The map is drawn inside the
  // border, so measure the box without it.
  function mapPoint(clientX, clientY) {
    const r = mapSvgEl.getBoundingClientRect();
    const left = r.left + mapSvgEl.clientLeft;
    const top = r.top + mapSvgEl.clientTop;
    return [
      ((clientX - left) * MAP_W) / mapSvgEl.clientWidth,
      ((clientY - top) * MAP_H) / mapSvgEl.clientHeight,
    ];
  }

  const pointers = new Map();
  let tapStart = null; // a press that has not moved far: a tap, not a drag
  let pendingTap = null; // a tap waits briefly, so a double-click can zoom
  const TAP_WAIT = 250;
  mapSvgEl.addEventListener("pointerdown", (e) => {
    mapSvgEl.setPointerCapture(e.pointerId);
    const p = mapPoint(e.clientX, e.clientY);
    pointers.set(e.pointerId, p);
    // A second press soon after a tap is a double-click: cancel the tap,
    // and this press is not a tap either.
    const secondClick = !!pendingTap;
    if (pendingTap) {
      clearTimeout(pendingTap);
      pendingTap = null;
    }
    tapStart =
      pointers.size === 1 && !secondClick
        ? { id: e.pointerId, p, at: Date.now(), projection: lastProjection }
        : null;
  });
  mapSvgEl.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = mapPoint(e.clientX, e.clientY);
    if (tapStart && tapStart.id === e.pointerId) {
      // Still a possible tap: do not move the map yet.
      if (Math.hypot(now[0] - tapStart.p[0], now[1] - tapStart.p[1]) <= 6) return;
      tapStart = null;
    }
    if (pointers.size === 1) {
      panBy(now[0] - prev[0], now[1] - prev[1]);
    } else if (pointers.size === 2) {
      // Pinch: zoom by the change in finger distance, around the midpoint.
      const [other] = [...pointers].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const before = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
      const after = Math.hypot(now[0] - other[0], now[1] - other[1]);
      if (before > 0)
        zoomAt((now[0] + other[0]) / 2, (now[1] + other[1]) / 2, after / before);
    }
    pointers.set(e.pointerId, now);
  });
  mapSvgEl.addEventListener("pointerup", (e) => {
    if (tapStart && tapStart.id === e.pointerId && Date.now() - tapStart.at < 600) {
      const { p, projection } = tapStart;
      pendingTap = setTimeout(() => {
        pendingTap = null;
        handleMapTap(p, projection);
      }, TAP_WAIT);
    }
    tapStart = null;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    mapSvgEl.addEventListener(type, (e) => {
      pointers.delete(e.pointerId);
      if (type !== "pointerup") tapStart = null;
    });
  }
  // The part of a pan (dx, dy) that keepInFrame() allows, from the last
  // drawn map plus any pan that waits for the next frame.
  function allowedPan(dx, dy) {
    if (!mapView.key || !lastProjection || !lastOutline) return [0, 0];
    const [[x0, y0], [x1, y1]] = d3.geoPath(lastProjection).bounds(lastOutline);
    const [px, py] = lastProjection.translate();
    const ox = mapView.translate[0] - px;
    const oy = mapView.translate[1] - py;
    const clamp = (d, lo, hi, size) =>
      hi - lo <= size ? 0 : Math.min(-lo, Math.max(size - hi, d));
    return [clamp(dx, x0 + ox, x1 + ox, MAP_W), clamp(dy, y0 + oy, y1 + oy, MAP_H)];
  }

  // Wheel input over the map. A trackpad pinch (ctrl + wheel) and a mouse
  // wheel zoom. A two-finger trackpad scroll moves the map. When the map
  // cannot move or zoom further that way, the page scrolls instead.
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
  mapSvgEl.addEventListener(
    "wheel",
    (e) => {
      if (!mapView.key) return;
      const [x, y] = mapPoint(e.clientX, e.clientY);
      const pinch = e.ctrlKey || e.metaKey;
      if (pinch || isMouseWheel(e)) {
        const step = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
        const factor = Math.exp(-step * (pinch ? 0.01 : 0.002));
        const stuck = factor < 1 ? mapView.k <= mapView.minK : mapView.k >= MAX_ZOOM;
        if (stuck && !pinch) return;
        e.preventDefault();
        zoomAt(x, y, factor);
        return;
      }
      const scale = MAP_W / mapSvgEl.clientWidth;
      const [dx, dy] = allowedPan(-e.deltaX * scale, -e.deltaY * scale);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      e.preventDefault();
      panBy(dx, dy);
    },
    { passive: false },
  );
  mapSvgEl.addEventListener("dblclick", (e) => {
    if (pendingTap) {
      clearTimeout(pendingTap);
      pendingTap = null;
    }
    const [x, y] = mapPoint(e.clientX, e.clientY);
    zoomAt(x, y, 2);
  });
  $("mapZoomIn").addEventListener("click", () => zoomAt(MAP_W / 2, MAP_H / 2, 1.6));
  $("mapZoomOut").addEventListener("click", () => zoomAt(MAP_W / 2, MAP_H / 2, 1 / 1.6));
  $("mapReset").addEventListener("click", resetZoom);

  function renderMap(revealed) {
    // "Where is it?" is played on the map, so it always shows.
    const forced = current?.topic === "where";
    $("mapToggle").checked = settings.showMap || forced;
    $("mapToggle").disabled = forced;
    mapFigureEl.hidden = !(settings.showMap || forced);
    if (mapFigureEl.hidden || !current?.map) return;
    const item = current;
    // Flags: the shaded country would give the answer away.
    if (item.topic === "flags" && !revealed) {
      mapView = { key: null };
      lastMapDraw = null;
      lastProjection = null;
      mapSvgEl.innerHTML = "";
      mapSvgEl.setAttribute("aria-label", "Map");
      mapCaptionEl.textContent = "The map shows the country after the answer.";
      return;
    }
    const showError = (message) => {
      mapSvgEl.innerHTML = "";
      mapSvgEl.setAttribute("aria-label", "Map");
      mapCaptionEl.textContent = message;
    };
    loadMap().then(
      () => {
        // Skip if the card changed while the map was loading.
        if (item !== current) return;
        try {
          drawMap(item, revealed);
        } catch (err) {
          console.error(err);
          showError("The map could not be drawn.");
        }
      },
      () => showError("The map could not load."),
    );
  }

  $("mapToggle").addEventListener("change", (e) => {
    settings.showMap = e.target.checked;
    saveSettings();
    renderMap(phase === "revealed");
  });

  // Init
  $("dateLine").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  deckSelectEl.value = currentDeckId;
  renderTopicSelect();
  renderPlayerButton();
  nextCard();
  // Each session starts by choosing who plays.
  openPlayers();
})();

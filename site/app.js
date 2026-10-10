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
  const stateItem = ([name, capital]) => ({
    key: "state:" + name,
    prompt: name,
    answer: capital,
    accepted: [capital],
    typoTargets: [capital],
    group: "us",
  });
  const capitalItem = (c) => ({
    key: "capital:" + c.code,
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
    group: c.continent,
  });

  const DECKS = {
    states: { label: "US States", items: US_STATES.map(stateItem) },
  };
  for (const [key, label] of CONTINENTS) {
    DECKS[key] = {
      label,
      items: COUNTRIES.filter((c) => c.continent === key).map(capitalItem),
    };
  }
  DECKS.world = {
    label: "World — All Countries",
    items: COUNTRIES.map(capitalItem),
  };

  const MASTERED_AT = 4; // streak >= this = mastered
  const CHOICES = 4; // options shown in easy mode
  const DECK_KEY = "capitals-deck-v1";
  const PLAYERS_KEY = "geo-players-v1";
  const OLD_PROGRESS_KEY = "capitals-progress-v2";
  const MIGRATED_KEY = "geo-migrated-v2"; // set once the v2 progress has moved
  const progressKey = (playerId) => "geo-progress-v3:" + playerId;
  const AVATARS = ["🦊", "🐼", "🐯", "🐸", "🐙", "🦉", "🐨", "🦁"];

  const $ = (id) => document.getElementById(id);
  const deckTitleEl = $("deckTitle");
  const deckSelectEl = $("deckSelect");
  const stateNameEl = $("stateName");
  const nameNoteEl = $("nameNote");
  const flagEl = $("flag");
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

  const deck = () => DECKS[currentDeckId];
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

  let current = null;
  let lastShown = null;
  let phase = "asking"; // "asking" | "revealed"

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
      .replace(/[̀-ͯ]/g, "") // strip accents
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
    for (const other of deck().items) {
      if (other.key === item.key) continue;
      for (const c of other.accepted) {
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
    const others = shuffle(deck().items.filter((o) => o.key !== item.key));
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
    const items = deck().items;
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
    for (const item of deck().items) {
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
    const rows = deck()
      .items.filter((item) => categoryOf(item) === cat)
      .map((item) => ({ item, name: item.prompt, p: entryFor(item) }));

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
        <div class="row-state">${item.prompt}</div>
        <div class="row-cap">${item.answer}</div>
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
      pick.innerHTML = `<span class="avatar"></span><span class="pname"></span><span class="porder"></span>`;
      pick.querySelector(".avatar").textContent = p.avatar;
      pick.querySelector(".pname").textContent = p.name;
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

      row.append(pick, level, remove);
      list.appendChild(row);
    }
    $("playersHint").textContent = players.list.length
      ? "Tap a name to add or drop that player from this game. Turns go in the order of the numbers. × deletes a player."
      : "Add each player. Then press Start.";
    $("newGameBtn").hidden = players.list.length === 0;

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

  function openPlayers() {
    // Suggest an animal that no player has yet.
    const used = new Set(players.list.map((p) => p.avatar));
    chosenAvatar = AVATARS.find((a) => !used.has(a)) || AVATARS[0];
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
    stateNameEl.textContent = current.prompt;
    stateNameEl.classList.toggle("long", current.prompt.length > 16);
    nameNoteEl.textContent = current.promptNote || "";
    if (current.flag) {
      flagEl.src = `flags/${current.flag.toLowerCase()}.svg`;
      flagEl.hidden = false;
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
  }

  // Show the result line, plus the item's note (e.g. "South Africa has three capitals").
  function reveal(html, cls) {
    feedbackEl.innerHTML = html;
    if (current.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = current.note;
      feedbackEl.appendChild(note);
    }
    feedbackEl.className = "feedback " + cls;
    phase = "revealed";
    saveProgress();
    renderStreakDots();
    renderStats();
    showNextButton();
  }

  function record(correct) {
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
    handleWrong("");
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (phase === "revealed") {
      goNext();
      return;
    }
    if (isEasy()) return;
    const val = inputEl.value;
    if (!val.trim()) return;
    const result = classify(val, current);
    if (result === "exact") handleCorrect(val);
    else if (result === "close") handleClose(val);
    else handleWrong(val);
  });

  deckSelectEl.addEventListener("change", () => {
    if (!DECKS[deckSelectEl.value]) return;
    currentDeckId = deckSelectEl.value;
    try {
      localStorage.setItem(DECK_KEY, currentDeckId);
    } catch {}
    deckTitleEl.textContent = deck().label;
    lastShown = null;
    nextCard();
  });

  $("resetBtn").addEventListener("click", async () => {
    const p = turnPlayer();
    if (!p) return;
    const ok = await askConfirm(
      `Reset ${p.name}'s progress for ${deck().label}?`,
      "Reset",
    );
    if (!ok) return;
    const progress = progressOf(p.id);
    for (const item of deck().items) delete progress[item.key];
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
  $("confirmOk").addEventListener("click", () => answerConfirm(true));
  $("confirmCancel").addEventListener("click", () => answerConfirm(false));
  $("playersBackdrop").addEventListener("click", (e) => {
    if (e.target === $("playersBackdrop")) closePlayers();
  });
  $("addPlayerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("newPlayerName").value.trim();
    if (!name) return;
    $("newPlayerName").value = "";
    addPlayer(name, chosenAvatar);
    $("newPlayerName").focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Close only the top dialog.
      if (confirmResolve) answerConfirm(false);
      else if ($("modalBackdrop").classList.contains("open")) closeModal();
      else closePlayers();
      return;
    }
    // Easy mode: keys 1-4 pick an answer.
    if (phase === "asking" && isEasy() && !dialogOpen() && /^[1-9]$/.test(e.key)) {
      choicesEl.querySelector(`.choice[data-key="${e.key}"]`)?.click();
    }
  });

  // Init
  $("dateLine").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  deckSelectEl.value = currentDeckId;
  deckTitleEl.textContent = deck().label;
  renderPlayerButton();
  nextCard();
  // Each session starts by choosing who plays.
  openPlayers();
})();

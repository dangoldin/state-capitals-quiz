(() => {
  // The Great Atlas Chase page. The case itself comes from chase-engine.js;
  // this file shows it and takes the detectives' answers.
  const E = ChaseEngine;
  const $ = (id) => document.getElementById(id);
  const byCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  const suspectById = Object.fromEntries(E.SUSPECTS.map((s) => [s.id, s]));

  // Players are shared with the quiz (same storage key and shape).
  const PLAYERS_KEY = "geo-players-v1";
  const CASEBOOK_KEY = "chase-casebook-v1";
  const LEVEL_KEY = "chase-level-v1";
  const AVATARS = ["🦊", "🐼", "🐯", "🐸", "🐙", "🦉", "🐨", "🦁"];
  const SPARE_DAYS = 3; // days for wrong guesses, on top of one per flight
  const CASE_NO_KEY = "chase-next-case-v1";
  const LEVEL_NOTES = {
    easy: "Easy: pick the next country from four cards. Clear clues, three flights.",
    normal: "Normal: tap the next country on the map. Clues work together, four flights.",
    hard: "Hard: type the next country. Tricky clues, five flights.",
  };

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
  const SCREENS = ["setupScreen", "caseScreen", "cityScreen", "lineupScreen", "endScreen"];
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
      list.appendChild(b);
    }
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
    };
    // Case numbers never repeat, also when a case is left unfinished.
    const caseNo = Math.max(readJSON(CASE_NO_KEY, 1), readJSON(CASEBOOK_KEY, []).length + 1);
    writeJSON(CASE_NO_KEY, caseNo + 1);
    $("caseNo").textContent = caseNo;
    game.caseNo = caseNo;
    $("caseHeadline").textContent = `Stolen: ${c.loot}!`;
    $("caseText").textContent =
      `Someone has stolen ${c.loot}. The thief was last seen in ${placeOf(c.start)}. ` +
      `Follow the trail, find out who the thief is, and catch them in ${game.days} days.`;
    const names = teamNames();
    $("caseTeam").textContent = `Assigned to ${names.length > 1 ? "Detectives" : "Detective"} ${listNames(names)}.`;
    show("caseScreen");
  });

  $("acceptBtn").addEventListener("click", () => {
    showCity();
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
    // A trait of the thief, noted once.
    if (s.trait && !game.notes.includes(s.trait.text)) game.notes.push(s.trait.text);
    renderNotebook($("notebook"));

    const d = detective();
    $("turnAsk").textContent = `${d.avatar} ${d.name}, where do we fly next?`;
    // News from the last flight goes at the top of the new screen.
    $("arrivalNote").textContent = message || "";
    $("arrivalNote").hidden = !message;
    $("arrivalNote").className = "arrival" + (message && message.startsWith("Dead end") ? " dead-end" : "");
    $("chaseFeedback").textContent = "";
    $("chaseFeedback").className = "feedback";
    renderAnswer();
    drawTrailMap({ guessing: game.c.level === "normal" });
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
      const p = document.createElement("p");
      p.className = "desk-hint";
      p.textContent = "Tap the country on the map.";
      area.appendChild(p);
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
    // Every flight takes a day, and the next detective has the next turn.
    const who = detective();
    game.day += 1;
    passTurn();
    if (code === s.to) {
      game.flown.push(code);
      game.wrongHere = [];
      game.step += 1;
      if (game.day > game.days) return endCase(false);
      const found = `Right, ${who.name}! Someone saw the thief at the airport in ${placeOf(code)}. We're on the trail!`;
      if (game.step >= game.c.steps.length) return showLineup(found);
      return showCity(found);
    }
    // Dead end: a day is lost, and a new clue of a new type helps.
    (game.wrongHere ||= []).push(code);
    if (game.day > game.days) return endCase(false);
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
    for (const sus of E.SUSPECTS) {
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
      tr.textContent = `Wears ${sus.hat}. Has ${sus.pet}. Loves ${sus.hobby}.`;
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
    const book = readJSON(CASEBOOK_KEY, []);
    book.push({
      no: game.caseNo,
      date: new Date().toISOString().slice(0, 10),
      level: game.c.level,
      loot: game.c.loot,
      thief: game.c.thief,
      solved,
      detectives: teamNames(),
      days: game.day,
    });
    writeJSON(CASEBOOK_KEY, book);
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
  function drawMap(svg, projection, { highlight = [], current = null, route = [] }) {
    const path = d3.geoPath(projection);
    const center = projection.invert([MAP_W / 2, MAP_H / 2]);
    const corners = [[0, 0], [MAP_W, 0], [0, MAP_H], [MAP_W, MAP_H]].map((p) => projection.invert(p));
    let viewR = Infinity;
    if (center && corners.every((c) => c && Number.isFinite(c[0])))
      viewR = Math.max(...corners.map((c) => d3.geoDistance(c, center)));
    const inView = (f) => !center || d3.geoDistance(f.center, center) - f.radius < viewR;
    const parts = [
      `<path class="map-water" d="${path({ type: "Sphere" })}"/>`,
      `<path class="map-grid" d="${path(d3.geoGraticule10())}"/>`,
    ];
    for (const f of countries) {
      if (!inView(f)) continue;
      const d = path(f);
      if (!d) continue;
      const id = f.properties.iso2;
      const cls = id === current ? "map-target" : highlight.includes(id) ? "map-visited" : "map-land";
      parts.push(`<path class="${cls}" data-id="${id}" d="${d}"/>`);
    }
    // Flight lines follow the great circle between capitals.
    for (let i = 1; i < route.length; i++) {
      const d = path({ type: "LineString", coordinates: [capitalPoint(route[i - 1]), capitalPoint(route[i])] });
      if (d) parts.push(`<path class="flight" d="${d}"/>`);
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
    svg.innerHTML = parts.join("");
    const label = svg.querySelector(".map-label");
    if (label) label.textContent = cityOf(current);
  }

  let trailProjection = null;
  function drawTrailMap({ guessing }) {
    const here = currentStep().from;
    const pad = 14;
    // Normal shows enough of the world around the city to tap the next stop.
    const circle = d3.geoCircle().center(capitalPoint(here)).radius(HOP_RADIUS[game.c.level])();
    trailProjection = d3
      .geoEqualEarth()
      .rotate([-byCode[here].lng, 0])
      .fitExtent([[pad, pad], [MAP_W - pad, MAP_H - pad]], { type: "Feature", geometry: circle });
    drawMap($("chaseMap"), trailProjection, {
      highlight: game.flown.slice(0, -1),
      current: here,
      route: game.flown,
    });
    $("chaseMapCaption").textContent = guessing
      ? `You are in ${cityOf(here)}. Tap the country where the thief went.`
      : `You are in ${cityOf(here)}. The lines show the trail so far.`;
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
  let press = null;
  $("chaseMap").addEventListener("pointerdown", (e) => {
    press = { x: e.clientX, y: e.clientY, at: Date.now() };
  });
  $("chaseMap").addEventListener("pointerup", (e) => {
    if (!press || !game || game.c.level !== "normal" || $("cityScreen").hidden) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    press = null;
    if (moved > 8) return;
    const point = mapPoint($("chaseMap"), e.clientX, e.clientY);
    const lonlat = trailProjection.invert(point);
    if (!lonlat || !Number.isFinite(lonlat[0]) || !Number.isFinite(lonlat[1])) return;
    // A tap outside the globe does nothing.
    const back = trailProjection(lonlat);
    if (!back || Math.hypot(back[0] - point[0], back[1] - point[1]) > 1) return;
    const warn = (text) => {
      $("chaseFeedback").textContent = text;
      $("chaseFeedback").className = "feedback warn";
    };
    const shape = countries.find((f) => d3.geoContains(f, lonlat));
    const id = shape?.properties.iso2;
    if (shape && byCode[id]) return guess(id);
    // Land that is not one of the 193 countries costs nothing.
    if (shape) {
      return warn(
        id === "AQ"
          ? "That's Antarctica: no country there. Tap a country."
          : "That place is not one of the countries in this game. Tap a country.",
      );
    }
    // In the sea, a tap next to any island of a really small country (under
    // 5,000 km²) counts for it.
    let code = null;
    let bestD = 16;
    for (const c of COUNTRIES) {
      if (FACTS[c.code].area >= 5000) continue;
      const f = shapeById.get(c.code);
      if (!f) continue;
      let d = Infinity;
      const walk = (xy) => {
        if (typeof xy[0] === "number") {
          const p = trailProjection(xy);
          if (p) d = Math.min(d, Math.hypot(p[0] - point[0], p[1] - point[1]));
        } else xy.forEach(walk);
      };
      walk(f.geometry.coordinates);
      if (d < bestD) {
        code = c.code;
        bestD = d;
      }
    }
    if (!code) return warn("That's the sea! Tap a country.");
    guess(code);
  });

  // --- Start
  $("dateLine").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  renderSetup();
})();

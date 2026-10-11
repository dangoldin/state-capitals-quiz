# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

The project is a geography flashcard quiz for children. A deck (US States, a continent, or the world) is played in a topic: **Capitals**, **Flags** (not for US States), or **Where is it?** (tap the place on the map). Later phases add currencies, languages, and more games (see `.omc/plans/geo-games-plan.md` when it exists locally).

The app is static, with no build step and no CI. Only the files in `site/` are published:

- `site/index.html`: the markup and the screens.
- `site/styles.css`: the styles.
- `site/data.js`: `COUNTRIES` and `US_STATES`. This file is the source of truth for all facts. The comment at the top lists the fields.
- `site/app.js`: one IIFE with all the logic.
- `site/flags/<code>.svg`: one flag for each country, from Wikimedia Commons.
- `site/map/world.js`, `site/map/us-states.js`: generated map data (TopoJSON wrapped as `window.WORLD_MAP` and `window.US_MAP`). Do not edit by hand.
- `site/vendor/`: copies of `d3-array`, `d3-geo`, and `topojson-client`.
- `site/facts.js`: `FACTS` for the chase game: area, population, land neighbors, landlocked.
- `site/culture.js`: `CULTURE` for the chase game: history and culture facts, each with a source (see below).
- `site/chase.html`, `chase.js`, `chase.css`, `chase-engine.js`: **The Great Atlas Chase**, a second page (see below).

Outside `site/`:

- `SOURCES.md`: where each fact comes from, the political choices, and the facts to check again.
- `scripts/check-data.js`: the data checks (also for `facts.js` and `culture.js`).
- `scripts/test-chase.js`: the chase engine test (5,000 cases per level).
- `scripts/build-map.sh`: builds `site/map/` and `site/vendor/` from Natural Earth and npm packages. Run it only when the map source or a library version changes.
- `cloudflare.config.ts` and `wrangler.config.ts`: the deploy setup (see below).

## Commands

- `npm install`: install `cf` and `wrangler` (exact versions, for development and deploy only).
- `npm run dev`: run the app with `cf dev` at http://localhost:8787, in the local Workers runtime.
- `python3 -m http.server -d site`: run the app with no install, at http://localhost:8000. You can also open `site/index.html` directly.
- `npm test`: `npm run check` plus the chase engine test.
- `npm run check`: check the data, the flags, and the maps (every capital must lie on its own country or state). Run it after each change to `site/data.js`, `site/flags/`, or `site/map/`. It exits with code 1 on a problem. It needs `npm install` first.
- `npm run deploy`: run `npm test`, then `cf deploy`. Sign in first with `npx cf auth login` (from a phone: `npx cf auth login --no-browser`, then open the link and enter the code).

## Deploy

The app deploys to Cloudflare Workers static assets with the `cf` CLI (beta), not with direct Wrangler commands.

- `cf pages deploy` is not supported in `cf`. Use `cf deploy`.
- For a static site, `cf` uses Wrangler inside. `wrangler.config.ts` sets `assetsDirectory: "./site"`, so the repo files outside `site/` are never uploaded.
- `cloudflare.config.ts` sets the Worker name (`world-register`) and the compatibility date.
- `cf` is in beta, so commands and config can change. Pin exact versions in `package.json`.
- `.cloudflare/` is generated build output and is in `.gitignore`.

Load the scripts with classic `<script>` tags, not ES modules. A browser blocks modules when the page opens from `file://`. `data.js` declares top-level `const`s that `app.js` reads as globals.

## Data rules

- Find a source for each changed fact, and record it in `SOURCES.md`. Facts change. For example, Equatorial Guinea changed its capital and Nauru changed its name to Naoero in 2026.
- `capitalAlso` holds other official capitals, which the quiz accepts. A city where the government only works (The Hague, Cotonou) goes in `capitalNote`, not in `capitalAlso`.
- A multiple-choice question must never show a correct answer as a wrong option. For languages, `otherLanguages` lists every language that must never be a wrong option. For currencies, `currency.also` does the same.
- `scripts/check-data.js` copies `normalize()` from `site/app.js`. Change both together.

## Architecture

- **Decks, topics, and items.** `DECKS` holds the rows of each deck (countries or US states). `itemsFor(deckId, topic)` makes the deck items with `ITEM_MAKERS` and caches them. An item is `{ key, topic, question, prompt, answer, accepted, typoTargets, note, flag, map, group, title, subtitle }`. `title` and `subtitle` are its line in the Mastered/Learning lists.
  - Progress keys: `capital:<code>`, `state:<name>`, `flag:<code>`, `where:<code>`, `where:us:<name>`. So each topic has separate progress, a country shares one entry between its continent deck and the `world` deck, and the US state Georgia and the country Georgia stay separate.
  - Easy mode takes its wrong options from other items in the deck, from the same `group` (continent) first, and never from `accepted`.
  - Flags: the name shows only after the answer, and the map stays empty until then. `FLAG_TWINS` (Monaco/Indonesia, Chad/Romania) accepts either name, so the twin is never a wrong option.
  - Where is it?: the map is the answer. It always shows, even when "Show map" is off. While the player guesses, `regionProjection()` shows the continent (Easy, or any continent deck) or the whole world (Type on the world deck), never centered on the answer. `handleMapTap()` checks `d3.geoContains` with the projection from the moment the finger went down. For a tiny place (under 300 map units²), a tap within 16 units also counts, but only in the sea or in an area that is not a UN member or a state, never inside another country. A tap is a press that moves less than 6 units and lasts less than 600 ms, so a drag never answers. A tap waits 250 ms (`TAP_WAIT`), so the second click of a double-click cancels it and zooms instead. `mapPoint()` measures the map inside its border.
- **Selectors.** The `<select id="deckSelect">` and `<select id="topicSelect">` options are hardcoded in `index.html`. When you add a deck or a topic, update `DECKS` / `TOPICS` / `ITEM_MAKERS` in `app.js` and the `<option>` list together.
- **Players and turns.** Each session starts on the "Who is playing?" dialog. There, players are added, selected for this game, and given a level: `easy` (4 answer buttons) or `type`. ✎ changes a player's name and animal in the same form (`editingId`); the chase page has its own edit form for the same players. `AVATARS` (24 animals) is the same list in `app.js` and `chase.js`. `players.playing` is the turn order. `goNext()` passes the turn after each card. Progress, stats, and `pickNext()` always use the player whose turn it is (`turnPlayer()`).
- **Storage.** All storage is `localStorage`, on one device.
  - `geo-players-v1`: `{ list: [{ id, name, avatar, level }], playing: [id], turn }`.
  - `geo-progress-v3:<playerId>`: progress for each player.
  - `geo-stats-v1:<playerId>`: points, `{ total, week, weekPoints }`. `week` is the Monday of the week.
  - `geo-settings-v1`: `{ showMap, scoreMode }`.
  - `capitals-deck-v1` and `geo-topic-v1`: the last deck and topic.
  - `capitals-progress-v2` is the old single-player data. The first player ever gets it through `migrateV2Progress()`. Then `geo-migrated-v2` stops a second migration. When you change the stored data shape, add a new versioned key and a migration.
- **Dialogs.** An open dialog sets `inert` on `.app`. Escape closes only the top dialog. Never use `alert()` or `confirm()`: some browsers and app previews block them silently. Use `askConfirm(message, okLabel)`, which returns a Promise.
- **New game** (`newGame()`) deletes every `geo-*` and `capitals-*` key, then sets `geo-migrated-v2`, so old v2 progress never comes back. It also resets the settings.
- **Score.** "Keep score" in "Who is playing?" is `off` (the default, to keep the game less competitive), `team`, or `each`. `awardPoints()` runs on every answer, also when scoring is off, and saves the points. 10 points for Easy, 20 for Type (`hardTask()`; in "Where is it?" only the whole-world view counts as Type), +5 from the third correct answer in a row; a wrong answer removes nothing. The session scores (`session`) reset at Start.
- **Answer matching.** `classify()` returns `"exact"`, `"close"`, or `"no"`.
  - `normalize()` removes accents and punctuation, and changes "Saint" to "St".
  - `accepted` must match exactly. Typos are allowed only against `typoTargets` (the capital and `capitalAlso`), so a short spelling like "DC" never accepts "d".
  - An answer is "close" if it is within an edit distance of about 20% of the length of the closest typo target. The tolerance is never less than 1.
  - A typo is "no" if an answer of another item in the deck is equally close or closer.
  - A "close" answer counts as correct.
- **Map.** The section under the question box draws the location of the current item. The "Show map" switch is saved in `geo-settings-v1`. The map scripts load (in order, because `d3-geo` needs `d3-array`) only when the map is on.
  - World items use Equal Earth, turned to the capital's longitude so the country never crosses the map edge. The zoom fits the main parts of the country (`focusParts()`: parts within 1500 km of the capital, or at least 20% of the largest part), plus a 6° circle around the capital for context.
  - A country too small to see gets a ring around each island group.
  - US states use Albers USA and always show the whole country.
  - After the answer, a dot and a label mark the capital.
  - `drawMap()` skips countries outside the view, using a center and radius computed once for each country.
  - Zoom and pan change the projection (`mapView`: scale factor `k` and `translate`) and draw again on the next frame. They do not scale the SVG, so detail and skipped countries stay correct. `keepInFrame()` centers a map smaller than the frame and stops a drag at the map edge.
  - Input: the + / − / reset buttons, a drag, a two-finger pinch (pointer events), a double-click, and the wheel. Ctrl/⌘ + wheel (a trackpad pinch) and a mouse wheel zoom; a two-finger trackpad scroll moves the map. `isMouseWheel()` decides once per gesture: line steps, or a large vertical step that is a multiple of 120 (`wheelDeltaY`), is a mouse. When the map cannot move or zoom further that way (`allowedPan()`, the zoom limits), the event goes to the page, so the page never gets stuck. `touch-action: pan-y` keeps a vertical swipe for page scrolling until the map is zoomed.
  - Each new card resets the view. Showing the answer keeps it.
- **Scheduling.** `pickNext()` does a weighted random pick. Wrong answers and new items increase the weight, and each streak step halves it. An item is "mastered" when its streak is `MASTERED_AT` (4) or more.

## The Great Atlas Chase (`site/chase.html`)

A detective game: the players follow a thief across the world. It is its own name and story; do not use "Carmen Sandiego" names or characters (trademarks).

- **Engine** (`chase-engine.js`, global `ChaseEngine`): pure functions, no page code. `makeCase({ seed, level })` gives `{ start, steps: [{ from, to, clues, trait?, options?, lucky? }], story, gang, route, thief, loot, days }`. The same seed gives the same case. `solve(clues)` returns every country that fits all clues; each step must solve to exactly its `to` (`npm test` checks 5,000 cases per level).
  - Clue types: Easy uses capital, flag, continent, first letter (one clear clue plus one that narrows). Normal adds money, language, neighbor, coast; Hard adds largest/smallest/most/fewest and number of neighbors. Normal and Hard prefer 2–3 narrowing clues from different types that only work together, and use the first letter last.
  - History and culture (`fact` clues, from `CULTURE`): in about a third of the steps (`FACT_SHARE`), a fact clue that fits only the answer, always with a narrowing clue, so a child who does not know the fact can still solve the step. The engine works without `culture.js`.
  - Wording: every clue has a witness (a different one in each step, `WITNESSES`) and one of several phrasings. An action that starts with "said" becomes "heard the thief say". A capital clue is sometimes a coded note with the letters scrambled (at most 6 letters on Easy). Clues say "the thief", never "she" or "he": a pronoun could point to a suspect.
  - Variety: a route style for each case (`ROUTE_STYLES`: one region, across oceans, zig-zag, or mixed; Easy stays on one continent), 3–6 flights (`HOP_RANGE`), 4 gangs of 6 suspects, 30 kinds of loot, 6 opening stories, and sometimes one free flight (`lucky`: no day lost).
  - Largest/smallest/most/fewest come from `FACTS` at run time, only with a 20% lead over the runner-up; "largest in Asia" is excluded (Russia is in the Europe deck).
  - `FLAG_TWINS` must match the one in `app.js`.
  - Fairness rules (enforced by `npm test`): no coast clue for the Caspian countries (`COAST_UNCLEAR`), and no neighbor-count clue where it depends on borders a child does not know (`COUNT_UNCLEAR`: French Guiana, Ceuta and Melilla, Botswana–Zambia). These countries also never get ruled out by such a clue. A letter clue fits any of a country's names, and no letter clue is made when a country's names start with different letters. A money clue needs a readable plural (`moneyPlural`). `extraClue(code, shownTypes)` gives a clue of a type the step does not show yet.
  - Suspects: each case has one gang (`GANGS`) with three trait groups (for example hat, pet, hobby). `LAYOUT` gives each of the six suspects a value in each group, so any two traits from different groups name exactly one suspect, and one trait alone always fits two. Each case reveals two traits (plus a snack). The lineup shows only the gang.
- **Page** (`chase.js`): the detectives are the quiz players (`geo-players-v1`), and they take turns by name. Selecting detectives here also changes who plays in the quiz (the same `playing` list), on purpose.
  - The trail map zooms and pans like the quiz map (`trailView`, `keepInFrame()`, +/−/reset, pinch, drag, Ctrl/⌘ + wheel).
  - Normal: a tap only selects a country (navy, with its name) and shows "Fly to X?"; "Fly there" makes the guess, so a mistap costs nothing. "Hint: show 4 choices" shades the answer and 3 nearby countries that cannot fit all the clues (gold), zooms to them, and costs nothing; a wrong pick loses its gold shade.
  - Easy picks one of 4 cards. Normal taps the map: a tap on land that is not one of the 193 countries (Antarctica, Taiwan, Greenland) is refused at no cost, and a tap in the sea counts for a country under 5,000 km² (`FACTS.area`) when it is within 16 map units of one of its islands. Hard types the name: `countryFromText()` adds everyday names (`TYPED_NAMES`), allows a typo only against names of 4+ letters, with the allowance from the name that matched, and refuses text shorter than 3 letters unless it matches exactly.
  - Days: day 1 is the start, and every flight and wrong accusation takes a day (a `lucky` step's right flight is free); `days` = flights + 1 + 3 spare.
  - "Did you know?" shows a `CULTURE` fact about the city the detectives are in. After a right flight, the facts behind that step's fact clues show, and the end screen lists all of them ("What we learned on the trail"). The deadline is checked before every next screen, including the lineup. A wrong guess is a dead end that adds a new clue; the same wrong place again costs nothing. Nothing removes points.
  - Rewards (all per player, also for the quiz players):
    - **Sticker passport** (`geo-passport-v1:<playerId>`: `{ CODE: date }`): the chase stamps the start and every right stop for each detective; the quiz stamps a country on the player's first right answer about it (any world topic) and says so. Stickers: one for each completed continent, and for 10/25/50/100/193 countries. The passport map draws the whole world with no culling (`cull: false`), a dot marks a stamped country too small to see, and a list under the map shows each stamped country with its flag and date. The files screen reads the storage again on `pageshow` (back from the browser cache) and on `storage` (a quiz in another tab).
    - **Rank badges** (`RANKS`): from the solved cases a player was on (Cadet, then 1, 3, 10, 25, 50 cases). The case file names the ranks, and the end screen shows a promotion.
    - **Thief cards**: one for each of the 24 suspects (`emoji` in the engine), unlocked when a player's team catches that thief.
    - These come from the casebook, which saves `detectiveIds` and `route` (old entries match by name). The **Detective Files** screen (`#filesScreen`, also at `chase.html#files`, linked from the quiz's "Who is playing?") shows all three. New game in the quiz also deletes the `chase-*` keys.
  - Taunts: after a right flight (not the last), the thief sometimes leaves a note that names the next detective (`TAUNTS`).
  - A small plane flies along the newest flight line (`flyPlane()`, 1.6 s, skipped with "reduce motion"); each frame finds the line again, so zoom and pan during the flight work.
  - The lineup shows hat, pet, and hobby (not the snack, which alone would name the thief) and the days left. Cases are saved in `chase-casebook-v1`; `chase-next-case-v1` keeps case numbers from repeating.

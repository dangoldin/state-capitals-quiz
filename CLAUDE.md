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

Outside `site/`:

- `SOURCES.md`: where each fact comes from, the political choices, and the facts to check again.
- `scripts/check-data.js`: the data checks.
- `scripts/build-map.sh`: builds `site/map/` and `site/vendor/` from Natural Earth and npm packages. Run it only when the map source or a library version changes.
- `cloudflare.config.ts` and `wrangler.config.ts`: the deploy setup (see below).

## Commands

- `npm install`: install `cf` and `wrangler` (exact versions, for development and deploy only).
- `npm run dev`: run the app with `cf dev` at http://localhost:8787, in the local Workers runtime.
- `python3 -m http.server -d site`: run the app with no install, at http://localhost:8000. You can also open `site/index.html` directly.
- `npm run check`: check the data, the flags, and the maps (every capital must lie on its own country or state). Run it after each change to `site/data.js`, `site/flags/`, or `site/map/`. It exits with code 1 on a problem. It needs `npm install` first.
- `npm run deploy`: run the data check, then `cf deploy`. Sign in first with `npx cf auth login`.

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
- **Players and turns.** Each session starts on the "Who is playing?" dialog. There, players are added, selected for this game, and given a level: `easy` (4 answer buttons) or `type`. `players.playing` is the turn order. `goNext()` passes the turn after each card. Progress, stats, and `pickNext()` always use the player whose turn it is (`turnPlayer()`).
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
  - Input: the + / − / reset buttons, a drag, a two-finger pinch (pointer events), a double-click, and Ctrl/⌘ + wheel (a trackpad pinch). A plain wheel scrolls the page. `touch-action: pan-y` keeps a vertical swipe for page scrolling until the map is zoomed.
  - Each new card resets the view. Showing the answer keeps it.
- **Scheduling.** `pickNext()` does a weighted random pick. Wrong answers and new items increase the weight, and each streak step halves it. An item is "mastered" when its streak is `MASTERED_AT` (4) or more.

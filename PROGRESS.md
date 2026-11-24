# Progress log

Goal: a playable TypeScript / three.js web version of **NightStone** (2001, New Horizon Studios / Virgin Interactive —
isometric action RPG, Barbarian / Sorceress / Amazon, Lost Forrest campaign + multiplayer maps + editor).
Each working session appends an entry below (newest first). Format knowledge lives in [docs/FORMATS.md](docs/FORMATS.md).

## Status at a glance

| Area | State |
|------|-------|
| Installer extraction (`tools/extract_nst.py`) | ✅ all 734 files, sizes verified |
| Asset conversion (`tools/convert_assets.py`) | ✅ B16 banks → PNG atlases, BMP → PNG, WAV/`.dt` → Ogg, strings → JSON, maps copied |
| Tile / item / UI images (B16) | ✅ decoded |
| Audio, text (`Idioma.bdt`) | ✅ decoded |
| Character / enemy / scenery sprites (`.P16`) | ✅ decoded (51,448 frames); animation blocks beyond the walk cycle not mapped |
| Map layout (`.map`) | 🟡 terrain grid + object layer decoded; other layers, spawn/triggers (`.adv`) open |
| Renderer + game loop (three.js) | 🟡 real Lost Forrest, Barbarian, monsters, melee combat (milestone 2) — **never run in a browser** |
| NHS data / animation layouts | ✅ 72 actors, 141 items; 17 monsters fully or ambiguously mapped, 20 partial |
| Items, inventory, equipment | 🟡 working in code (drops, pickup, equip, potions); UI never browser-tested |
| Skills/magic, dialogue, quests (`.adv`), sound effects, shops, multiplayer, editor | ⬜ not started |
| Combat + monster AI | 🟡 first pass (placeholder numbers) |

## Turn 5 — 2026-11-24 · GitHub Pages deploy and a direction fix

- `.github/workflows/pages.yml` builds (install, tests, typecheck, Vite) and deploys to GitHub Pages on every push to
  `main`; live at https://beefbeefs.github.io/remake3/ . It runs in the browser.
- **Fix from your first playtest:** east and west were swapped (and so NE/NW, SE/SW). The 8 direction blocks of every
  actor pack run counter-clockwise from east: **E, NE, N, NW, W, SW, S, SE** (the Turn 3 order was a mirror image). One
  mapping in `src/iso.ts` (`DIR_NAMES`/`screenDir`, now covered for all 8 directions in `tests/anims.test.ts`) and
  `anims.json`; it applies to the hero and all monsters. Docs updated.

## Turn 4 — 2026-11-24 · items, loot and inventory

### Step 4 ✅ Items, drops, pickup
- Item icons are `System/IListData.b16` frames with **frame id = item id** (checked on a contact sheet: 1 scimitar, 20
  two-handed axe, 40 short bow, 60 staff…). English names come from `Idioma.bdt` `ITEMS\ID-<n>`.
- `Tipo` in the item INIs is a bit mask (1/2/4/8 melee weapons, 16 shield, 32 bow, 64 staff, 128 ring, 256 amulet,
  512 scroll, 1024 potion with `Data` 1 life / 2 stamina / 4 magic, 2048 key, 4096 gold bag, 8192/16384/32768 body
  armour per class, 65536/131072 books, 262144 the horn). `src/game/items.ts` turns the 141 items into typed defs.
- Monsters drop loot on death: 45 % one item rolled from their INI drop table (`IDItem` weighted by `PItem`) + 25 % a gold
  bag. Items lie on the ground as icons; walking within 0.9 cells picks them up (gold goes straight to the purse).

### Step 5 ✅ Inventory and equipment
- 20-slot pack, equipment slots (weapon, shield, body armour, ring, amulet), class restrictions (a Barbarian can't wear
  Amazon armour), potions of life heal and are consumed. The wielded weapon's `Potencia` sets the hero's damage; body armour
  level + shield protection reduce incoming damage. Start kit: scimitar equipped + two life potions.
- DOM inventory panel (`src/ui/inventory.ts`, key **I**) with icons cropped from the atlas, tooltips, message log and gold
  in the HUD.
- Tests: 25 passing (new `tests/items.test.ts` + loot/pickup/potion/equip cases in `tests/game.test.ts`).
- Placeholders: drop chances, gold amounts, hero HP 60; strength/dexterity requirements (`R_*`) are ignored because the
  character stat system isn't decoded; stamina/magic potions do nothing yet. The inventory panel is untested in a browser.

## Turn 3 — 2026-11-24 · game data, animations, enemies (steps logged as they finish)

### Step 1 ✅ NHS archives decoded → actor and item tables
- `.Nhs` layout: 256 × 64-byte names | u32 offset[256] | u32 size[256] | data (absolute offsets; contents are bitwise
  NOT of plain text). `tools/nhs.py` reads them; `tools/convert_nhs.py` writes `public/assets/data/actors.json`
  (**72 actors**, INI sections General/HDP/IA/Animaciones/Items/Sonidos…) and `items.json` (**141 items**), and
  unpacks the 34 `.map` files embedded in `NightStone.NHS` to `public/assets/maps/nhs/` (gzip, same format as the
  other maps — probably the multiplayer/mission maps).
- Gold for the next steps: actor INIs give life, damage range, armour, XP, speed, hearing radius, drop tables
  and — importantly — the **animation table** `Andar/Respirar/Atacar/Cubrir/Recibir/Morir/Recibir2/Alarma = (speed, frames
  per direction)`, which is the key to segmenting the P16 packs (step 2). Item INIs give type, graphic, damage
  range, durability, requirements and bonuses. Names are Spanish (e.g. `Raza`, `Vida`, `Fuerza`); in-game English names
  come from `Idioma.bdt`.

### Step 2 ✅ Animation layouts for actors
- Found that each P16 pack stores animations back to back, 8 directions each, dir-major, and that the actor INI lists the
  per-animation `(speed, frames)`; matching the INI against pack frame counts gives the layout. Goblin (`1E`, 400
  frames) matches exactly and its idle / hit / death / taunt rows were checked on contact sheets.
  `tools/build_anims.py` → `data/anims.json` (36 monsters + the Barbarian).
- Direction order corrected to **W, NW, N, NE, E, SE, S, SW** (superseded in Turn 5: E and W were swapped; my Turn 2 guess was rotated, and the Barbarian walk
  cycle is 10 frames per direction, not 12).
- Player characters turned out to be **layered equipment sets** (000 bare, 002 sword, 010 shield, 100/200 armour…), all
  with the same frame numbering. The hero now draws pack 002 (sword).
- Per-actor `foot` anchors (hotspot origins differ between packs). Monster atlases converted with a 256-colour palette
  (43 MB → 16 MB).
- Partial: 20 monsters (Orc captain, skeletons, trolls, demons …) don't match any subset of their INI animations, so they
  only get walk / idle / attack. Hero hit/death/block animations are not mapped.

### Step 3 ✅ Monsters, AI and melee combat (headless-tested, not browser-run)
- `src/game/{anims,creature,game}.ts`: creature state machine (idle / walk / attack / hit / dead) driven by the
  INI timings; monsters spawn around the camp (goblins, goblin rats, hell goblins, an orc), hear the hero within
  `Oido + 3` cells, chase, strike on 55 % of the swing with `Fuerza` damage and the INI cooldown; the hero fights by
  clicking a monster (walks up and keeps swinging) or Space; XP and kills are tracked; HUD with health bar; game-over
  banner (R restarts).
- **Tests now cover the simulation**: `tests/game.test.ts` runs the real `Game` against a tiny stub of three.js
  (`tests/support/`) — hero walks to a click target, kills a clicked goblin, is hurt by chasing monsters, and a dead hero
  stops reacting. 16 tests pass (`npm test`, needs Node ≥ 22.7 for `--experimental-transform-types`).
- Placeholder numbers: hero HP 60 and damage 3–7 (the real player stats come from the character tables, not decoded),
  monster speed 1.7 cells/s, spawn positions (real ones are in the `.adv` file).

## Turn 2 — 2026-11-24 · sprites and the real map

**Done**
- **P16 sprite format fully decoded** (from the exe loader at 0x40aa50): tables for ids 1..1023 (w, h, offset, hotspot x/y),
  row-token RLE with `F81F` skip/terminator. Decodes all 134 packs / 51,448 frames with no malformed row.
  `tools/p16.py` (decoder) + `tools/convert_p16.py` → `public/assets/p16/**` (Outside scenery packs, Barbarian /
  Sorceress / Amazon base sets, enemies 1E, 2E, Rat, Spider, Stone; 7.6 MB). Atlas JSON carries the hotspots.
- **Lost Forrest map decoded**: 256×256 terrain grid (12-byte cells) and a 256×256 object layer
  (`pack<<10 | id`, pack → PackCell/Pack1/Pack2/Pack3). Rendered headlessly: grass/dirt/river/bridges and the camp with
  fires, barrels, tents and banners look right — see `docs/preview-milestone1.png` (a Python re-implementation of
  the renderer's placement maths, standing in for a browser screenshot).
- Game code: `parseMap` (`src/formats/map.ts`), chunked `World` (16×16-cell chunks, one mesh per atlas, load radius 3),
  `ActorSprite` (Barbarian walk cycle, 8 directions chosen from the travel angle), collision from water + tall scenery.
  Placeholder hero and the procedural patch are gone.
- Tests: 9 JS tests (incl. map layout) + `tests/test_p16.py` (decoder over every pack).
- `docs/FORMATS.md` rewritten for P16 and maps; NHS "bitwise NOT" encoding noted.

**Not verified**
- Still no `npm install` here, so `three`/`vite` were never installed: the three.js layer is type-checked against a
  stub only and **has never run in a browser**. Please run `npm install && npm run dev`. If something looks off,
  the likely suspects are chunk depth sorting and the hotspot offsets of tall wall slices.
- Direction order (NW, N, NE, E, SE, S, SW, W) was judged by eye.
- Terrain heights (`.Ofs`), the six extra terrain records, the later map layers, the spawn point and the `.adv`
  triggers are not decoded; the hero starts at a hard-coded camp cell.

**Next**
1. `AData/WData/NightStone.NHS` record parse → actor and item stats; the other animation blocks (idle, run, attack, death).
2. Monsters from the map's actor list (needs the `.adv` format), simple AI, melee combat, HUD.
3. Items / inventory with the 152 icons already converted.

## Turn 1 — 2026-11-24 · identify the game, extract it, first renderer

**Done**
- Identified the game from the 193 MB `Install-NST.exe`: a custom "Collection Chamber" installer (not NSIS/Inno).
  Reversed its overlay format and wrote `tools/extract_nst.py`; extracted **734 files / 374 MB** (sprites, tiles, 6 maps,
  161 sounds, 8 music tracks, 4 intro videos, manual PDF, editor + adventure tools).
- Decoded **B16** image banks (tiles, scenery, item icons, UI) — verified by tests and visually (trees, palms, grass,
  dirt, red carpet floors, weapons/armour icons). Decoded audio (`.dt` music is WAV), the language table, and found the
  gzip wrapper of maps/adventures.
- `tools/convert_assets.py` → `public/assets` (**20 MB**, committed so a static build needs no original files).
- Project skeleton: Vite + TypeScript + three.js; `src/formats` (B16, map header), `src/iso.ts`, atlas loader, a
  milestone-0 scene (56×56 isometric patch from the real Outside tiles/trees, click/hold or WASD to walk, collisions
  with trees, original outdoor music + wind loop), and `viewer.html` (asset browser).
- Tests: `npm test` (6 passing; format tests need the extracted game in `./game` or `NST_GAME_DIR`).

**Not verified in this session**
- `npm install` is blocked in the build sandbox (no registry access), so `three`/`vite` were never installed:
  the three.js layer (`src/main.ts`, `atlas.ts`, `world.ts`) has been **type-checked only for non-three code and
  bundle-checked with esbuild, never run in a browser**. Run `npm install && npm run dev` first and tell me what you see.

**Findings / decisions**
- Original data is **not** committed raw (`/game` is git-ignored); only converted assets are. The repo is intended to go
  private; the converted assets are still copyrighted game art.
- `.Ofs` files are per-vertex terrain heights (12 × int16 per tile id), not sprite anchors.
- The 4092-byte tail on every B16 and the 4092-word header of every P16 hint at one shared "bank" code path.

**Next turn (planned order)**
1. Decode `.P16` (disassemble `Nightstone.exe` sprite loader / fit the encoding) → Barbarian/Sorceress/Amazon + enemies,
   so the placeholder hero can be replaced.
2. Decode the `.map` cell layers → render the real Lost Forrest instead of the procedural patch.
3. Item/actor tables (`AData.Nhs`, `WData.Nhs`, `NightStone.NHS`, `Game.cfg`) for stats; OCR the manual for rules.

**Open questions for you**
- Hosting: want a GitHub Pages deploy action (included, disabled until Pages is enabled) or deploy to elderwild.net?
- Scope target: single-player Lost Forrest first (my plan), multiplayer/editor later?

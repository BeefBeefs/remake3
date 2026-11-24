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
| Character / enemy / scenery sprites (`.P16`) | ✅ decoded (51,448 frames); every actor's animation layout mapped (hit, block, death, taunt, rise, extras) |
| Map layout (`.map`) | ✅ terrain, objects, **actor/hero-start markers**, zones & script tables located; decor layer + script commands only partly understood |
| Adventure container (`.adv`) | ✅ texts, hero attributes, embedded map; hero inventories not decoded |
| Renderer + game loop (three.js) | 🟡 all 41 maps load (solo, 35 campaign, 5 multiplayer) with Outside, Cave and Dungeon art; heroes, monsters (melee and ranged), combat, spells with effects; run headlessly in Chrome (`tools/browser/`) |
| NHS data / animation layouts | ✅ 72 actors, 141 items; all layouts mapped |
| Items, inventory, equipment | 🟡 working in code (drops, pickup, equip, potions); UI never browser-tested |
| Tile surfaces | 🟡 inferred from tile colour (footsteps) |
| NPCs, shops, character window | 🟡 working in code; no NPC in the playable map (Inn map not in install) |
| Spells + effects, saving between missions, title/world map/HUD/windows on the original art | ✅ (numbers are guesses) |
| Select map (any of the 41 maps), wall slices, arrows / bolts | ✅ (maps are played on their own, outside the career) |
| Dialogue, quests/scripts (`.adv`), multiplayer play, editor | ⬜ not started |
| Combat + monster AI | 🟡 first pass (placeholder numbers) |

### Turn 11 — main menu and GUI with the original art

Found the interface art already converted in the atlases (and the installer screenshots `NightStone_1/2.tga`, which show the real HUD), decoded which frame is which (see `docs/FORMATS.md` section 6) and rebuilt the screens on it:
- **Title menu** (`src/ui/titlemenu.ts`): logo background, the six original menu words at the `Menu.ini` coordinates, New game → Start game → **Select Hero** dialog → **Difficulty** dialog (Apprentice / Expert / Hero scale monster life and damage 0.7 / 1 / 1.4 and 0.7 / 1 / 1.3, guesses), **Controls** window with working music and fx volume, gamma and background-sound settings (stored in localStorage), Credits. Multiplayer, Load game and Select map are dimmed. Menu music plays on the first click.
- **HUD** (`src/ui/hud.ts`): minimap ring with a radar (hero, monsters red, NPCs yellow, goal blue) and four buttons (objectives, inventory, options, character), portrait with life / stamina / mana bars and the "+N" level-up badge, quick bar (keys 1-4) over a message box, all in the original layout and drawn with the original bitmap font (`src/ui/skin.ts`).
- **Options menu** (Esc, `src/ui/gamemenu.ts`): Return and Exit work, Load and Save are dimmed; the game pauses while it is open.
- `gui.html` is a preview page that shows each screen without WebGL (the cloud browser has none), so I could check them against the originals by eye. Start-up errors are now printed on screen.
- Not done: the inventory, character and shop windows still use plain DOM boxes (art is available: Inventory 0, HDP 0), the stance icons, hover/pressed states beyond brightness, per-hero ability setup screen.

### Turn 10 — equipment bonuses, death penalty, right-click use

**Equipment bonuses ✅.** `items.json` has a `Bonificadores` block I had not read: attribute bonuses (`B_Fuerza/Destreza/Resistencia/Magia/Poder`), `B_Armadura`, and damage multipliers per monster family. Wearing items now changes the effective abilities (life, stamina, mana, spell damage), armour, and weapon/parchment damage against a family (`Raza` in the actor INI is a bit mask: 1 goblin, 2 orc, 4 undead, 8 beast, 16 troll, 32 demon, 64 human). Requirements still use invested points so a bonus item cannot unlock itself. The parchments carry their own family bonuses (storm +40% vs humans, incineration 0 vs demons), so the spell numbers are now partly data-driven.
**Death penalty ✅.** Dying loses the whole inventory (backpack and worn gear) and one point from each ability; **R** reloads with the same hero (level, xp, points, gold) through `sessionStorage`. Guesses: gold kept, worn gear counts as carried, mission restarts.
**Right-click use ✅.** Right button in the inventory drinks/reads; left button wears equipment and only reminds you about potions and scrolls. Keys 1-4 use the first four backpack slots.
- Tests: 85 passing. Not run in a browser; the on-screen quick bar of the original is not recreated.

### Turn 9 — stamina and stances, item requirements, block/hold and parchments (from the manual)

**Step 1 ✅ Stamina, mana, run and stealth.** Stamina = 2 × Resistance, mana = 2 × Power (ratios guessed); bars under the HP bar. Ctrl = run (×2, running footsteps 162/166/170, drains stamina, impossible at 0),
Shift = stealth (×0.5, silent, unaware monsters hear you from half as far, first blow on one doubles). Potions use the item `Data` bit mask (1 life, 2 stamina, 4 magic; Vitality = all three and can hurt).
**Step 2 ✅ Item requirements.** `R_Fuerza / R_Destreza (Skill) / R_Resistencia / R_Magia (Power) / R_Nivel` now block equipping with a message, and show a red border + tooltip; a test checks each class can use its starting weapon.
Spending level-up points to reach a weapon's Strength now has a purpose (Barbarian's Sword #3 needs 36, he has 32).
**Step 3 ✅ Block and hold position.** Right button: the Barbarian covers up (Cubrir pose, 4 stamina per blocked frontal blow, c_cubrir sounds); the Amazon and Sorceress plant their feet and shoot where clicked.
**Step 4 ✅ Parchments.** All 18 scrolls have effects from the manual's descriptions (`src/game/spells.ts`): area damage, ice slow, life/vitality, permanent attribute gains, Berserk, immunity. They are used up and cost mana. Every magnitude is a placeholder.
- Tests: 74 passing. Unverified: nothing run in a browser; manual says right-click uses items (the UI still uses left-click); no spell visual effects, only sounds.

### Turn 8 — tile surfaces, NPCs, shops and the character window

**Step 1 ✅ Tile types.** `System/*.CDt` turned out to be the editor's brush catalogue (see FORMATS), so tile surfaces are *inferred* from tile colour
(`tools/build_tiles.py` → `data/tiles.json`, all three tilesets). `Game` takes a `surface(cx, cy)` hook; footsteps use the grass/wood/stone sound pairs.
**Step 2 ✅ NPC sprites.** The 21 `<id>X.P16` packs are single-view strips in INI order Andar, Respirar, Atacar (15 match their frame counts exactly, e.g. the
innkeeper 27 = 14 + 15 + 70). Converted (≈316 KB) and added to `anims.json` (`npc: true`, `dirs: 1`). Map markers for NPC ids now spawn NPCs, not monsters.
**Step 3 ✅ Talking and shops.** Clicking an NPC walks the hero up, the NPC plays its Atacar strip, `onTalk` fires; the innkeeper opens a **buy/sell window** built from the
manual's rules (heavy/light lists, basket, unaffordable basket buys nothing). Finding: **the manual puts shops only at the Inn of the White Goddess, a campaign map that
is not in this install** (only Lost Forrest, five multiplayer maps and `Adv/Test.adv` are) — so the Lost Forrest has no NPCs; `?npc=27` places the innkeeper beside the start for testing.
**Step 4 ✅ Character window (key C).** From the manual: level-ups give +4 points to spend; Life follows Resistance. Replaces my earlier flat +6 HP. New `docs/RULES.md` lists the manual's rules and what is done.
- Tests: 56 passing. Unverified: nothing run in a browser; tile classification is a colour heuristic; merchant choice, stock and half-price sell-back are guesses; other NPCs only show their name (no dialogue text exists in the data).

### Turn 7, continued — footsteps, levels and the tomb ending

- **Footsteps**: while the hero walks, `j_andar_hierba` 160/161 alternate every 0.58 s (two steps per walk cycle, a guess). Stone (168/169) and wood
  (164/165) variants exist but tiles are not yet classified by surface; running variants (162…171) are unused.
- **Levels**: kills add XP; `xpForLevel(n) = 25·(n−1)·n` is a **placeholder curve** (the real table is not decoded). Each level gives +6 max HP, a full heal, the class
  level-up sound (103 / 123 / 143) and a log line; the inventory header shows `L<level>`. Attributes do not grow yet.
- **Tomb ending**: reaching the goal shows a “QUEST COMPLETE” card (hero, level, kills, xp, gold) with *Keep exploring* / *New game*.
  The final text is still the placeholder (`adventure.json` holds the editor's default text).
- Tests: 44 passing (alternating footsteps, silence when idle, multi-level XP from one kill, goal announced once).
- Unverified: nothing run in a browser; step timing and XP curve are guesses.

### Turn 7 — hero hit and death animations

- **Layout solved for all three heroes.** The 564/516/536-frame packs are not multiples of 8 because Morir is stored for only
  **4 directions, last in the pack**; the remaining blocks fit exactly (see `docs/FORMATS.md`). Contact sheets confirm: the four
  tail sequences collapse and end lying down; Recibir/Recibir2 are crouch-flinches, Cubrir is a guard pose.
- `tools/build_anims.py` now emits the full hero tables (`verified: true`, `dirs: 4` on Morir); `frameId` maps death direction `d` to block `d >> 1`.
- In game: heroes flinch when hit (Recibir), collapse on death and stay down; the banner offers R to restart (reloads the page).
- Tried the same rule on the 20 unmapped monsters: 14 sizes fit, but their "death" frames came out as standing poses, so it is **not** applied to them.
- Tests: 41 passing (all frames of every hero animation exist in the atlases; death frame indexing; flinch/death state).
- Unverified: nothing run in a browser; which pair of directions each death block serves; Extra/Atacar2/Vigilar are mapped but unused.

### Turn 6, continued — the other playable classes

- **Hero chooser**: a plain-DOM menu before the game starts (STR/SKL/RES/MAG from the `.adv` heroes); `?class=amazon|sorceress|barbarian` skips it.
  Each class starts at its own map marker (101 `(235,123)`, 102 `(234,118)`) and loads its own sprite pack.
- **Sprites**: `001-Amazon.P16` (516 frames) and `001-Sorceress.P16` (536 frames) converted and added to `anims.json` with the same
  partial layout as the Barbarian (Andar / Respirar / Atacar from the first three direction blocks; feet from the bare 000 pack).
  Amazon attack is 14 frames, Sorceress 14. Hit and death frames are still unmapped for every hero (contact sheets were inconclusive).
- **`Game` is class-aware** (`classId`, exported `CLASSES`): inventory character id (so class gear restrictions work), starting
  weapon (scimitar 1 / short bow 40 / staff 56), hurt and death sound ids (100 / 120 / 140 +1,+2).
- **Amazon bow**: while a bow (type bit 32) is wielded, attacks hit the nearest monster in line within 7 cells (no arrow sprite yet) and play the
  `c_arco` sound (ids 50–52 — a guess). The Sorceress staff is melee for now; **no magic or skills yet**.
- Tests: 38 passing (bow shoots at range, Sorceress can't wear the scimitar, all hero packs exist).
- **About link**: README now links the Pages site. Setting the repo's *About → Website* field via the API was **refused** (the proxy blocks
  repository settings writes) — set it in the GitHub UI: repo → ⚙ next to About → Website → `https://beefbeefs.github.io/remake3/` (or tick “Use your GitHub Pages website”).
- **Unverified**: nothing run in a browser; class stats→HP (2×RES), starting weapons 40/56 and the bow sound ids are guesses.

### Turn 6, continued — routes and sound
- **Zone records = wander routes.** Each of the 32 records is keyed by a monster's marker cell and lists points near it;
  unaware monsters now stroll between them (slow, pausing 1.5–5 s) until you come within hearing range. The 16 trailing
  dwords per record (multiples of 35…) are still unexplained.
- **Sound effects** (`src/audio/sfx.ts`, `tools/build_sfx_index.py` → `data/sfx.json`, 136 sounds): the file numbers follow
  the actor INI `SndBase` (+0 attack, +1 alarm, +2 die, +3 hurt), so monsters shout when they notice you, grunt when hit and
  scream on death; flesh vs. no-flesh hit sounds come from the INI `Carne` flag; hero hurt/death, pickup and potion sounds
  too. Whooshes for a missed swing and the footsteps are not hooked up. The game only emits ids (`Game.onSound`), tests
  check them; **never listened to in a browser**.
- Tests: 33 pass.

## Turn 6 — 2026-11-24 · the `.adv` format and real monster placement

- **`.adv` decoded** (`tools/adv.py`, `src/formats/adv.ts`, `tests/adv.test.ts`): a gzip *container* with the intro and
  final text, the three heroes' default attributes (Barbarian STR 32 / SKL 24 / RES 30 / MAG 11 …), background images and
  the mission `.map` embedded verbatim (checked byte-identical to `Maps/Lost Forrest.map`). `adventure.json` is written
  to `public/assets/data` for the game. It holds **no** monster placement.
- **Monster placement found by disassembling the editor** (objdump on `NightStone Editor.exe`): the loader's read order
  confirms the whole map layout (header, terrain, 72 B, objects, 8-byte decor layer, 255 × 196 B zones, 64 × 248 B
  scripts) and its actor pass shows that **pack-0 objects are spawn markers**: id N = actor IA-N, ids 100/101/102 = the
  three heroes' start points. Lost Forrest has 43 markers (9 zombies, 5 orc captains, 5 amazons, mages, knights, …).
- Game now uses it: monsters appear where the map puts them (the old scatter around a guessed camp is gone, kept only as a
  fallback), the Barbarian starts at the map's own start marker (235,121) instead of my (152,78) guess, the mission text is
  shown on start, and the adventure's hero attributes are shown in the inventory panel. The markers are no longer drawn as
  scenery or treated as obstacles (before, their editor icons were rendered as diamond sprites).
- Tests: 28 pass with the game dir (25 + 3 skipped without). Typecheck: only the stub-three noise locally; CI is the check.

**Not verified:** nothing here was looked at in a browser. In particular, whether the 40 monsters spawn sensibly (e.g.
zombies sitting in the right places) and whether start (235,121) is the camp the original opens in.

**Still open:** the zone/script records are located but their semantics are not (what the cell lists and the 16 trailing
dwords mean, what scripts 1–14 do besides loot rolls, markers 112/120), the decor layer (413–424 sprites, flag field),
hero starting inventories (0x10f3–0x728d of the `.adv`), HP formula (I use 2 × resistance = 60, a guess).

### Turn 6, continued — scripts, chests and the tomb
- **Scripts decoded** (record layout, 14 commands from the editor's interpreter, how a cell references one: decor layer
  `2048 + 32·(script+1)`; see FORMATS.md). Lost Forrest has 10 loot-table scripts (type mask + chest level, matching the
  item INIs' `CofreLv`) and one goal script, "Tumba de Domnir".
- **Containers in the game:** the 37 script cells are chests, barrels, crates and the tomb gate. Click one (or hit it with
  Space) and the hero walks over and opens/smashes it; chests swap closed → open sprite (closed = previous frame id, since
  the map stores the open one), barrels/crates vanish, and loot is rolled from the cell's script (items you can use only;
  unscripted barrels sometimes give a gold bag). The tomb gate is the **goal**: walking within 3 cells shows its name and the
  closing message.
- Tests: 35 pass. `World.setObject` lets scenery change at run time.

**Guesses / not verified:** closed-chest = id−1 and which barrel id makes which smash sound; the goal ends nothing (just a
message), and I don't know what the original does at the tomb; commands 2–8, 10–13 are read from code but nothing in this
map exercises them, so none is implemented; nothing has been seen in a browser.

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


## Turn 12 — inventory, character and shop windows on the original art

- **Inventory (I)**: Inventory.b16 frame 0/1 — equipment slots with the empty-slot silhouettes, five paged "heavy
  object" slots (weapons, shields, body armour), the 2×10 light-object grid, gold, Close. Red backing for gear the
  hero cannot use; left-click wears, right-click uses (as in Turn 10). Tooltips list damage/protection, bonuses, price.
- **Character (C)**: HDP.b16 — name, the four abilities with "+" buttons while points remain, (+/−) equipment
  bonuses beside them, level/life/experience/mana/next level/stamina fields.
- **Quick keys 1–4** now use the first four *light* objects (potions, scrolls…) so a sword in the pack cannot steal a
  key; the HUD quick bar shows the same four.
- **Shop**: no dedicated art found, so it is assembled from the stone panel (Overlay 66), Heavy/Light buttons
  (Inventory 10–13), Accept/Cancel (Overlay 57/58) and the bitmap font.
- Preview pages: `gui.html?screen=inventory|character|shop`. 86 tests green, CI green.
- **Fortuity / Knowledge potions** (ids 111/112) now do something (guesses, flagged in RULES.md): +1 attribute point; two random items drop at the hero's feet. 87 tests.
- Still guesses: all numbers noted earlier. Next up: spell visual effects, stance icons, remaining monsters.


## Turn 13 — monsters complete, spell effects, saving between missions

- **All 20 remaining monsters mapped.** Their packs follow the hero rule — every INI animation in INI order, 8
  directions each, but **Morir for only 4 directions** — which matches uniquely (the old ORDER list lacked
  `Aparecer`/`Aburrido`, and I had put Morir last for monsters, which is why the earlier try showed standing poses).
  Contact sheets: zombie, troll, amazon, groak fall over; skeletons collapse into bones and *rise* from a bone pile;
  the infernal demon forms out of fire and burns out. No actor is `partial` any more (tests + `docs/FORMATS.md`).
  In the game: skeletons / infernal demons lie dormant until the hero is within hearing range, then play Aparecer;
  monsters roar (Alarma) before chasing; idle ones occasionally play Aburrido; demons use Atacar2 half the time.
- **Spell effects** (`effects.ts`, `effectsview.ts`): additive sprites from `GDI/3D` — flame frames, rings, flares,
  glows, the 14-frame ice spirit (not smoke). Every parchment has its own look; the earth parchment shakes the screen;
  level-ups and potions glow. Effects are pure data in `Game.fx`, so they are tested.
- **Saving between missions** (`career.ts`, `worldmap.ts`, `saveslots.ts`): the manual says saving is only possible
  between missions, so that is what exists: after a mission, Save game / Return to the map; the world map (MapGFX 1)
  with the Lost Forest banner and a Save button; Load game on the title menu; 8 slots in localStorage with validation
  of whatever is read back. The hero carries backpack and worn gear into the next mission (dying still loses them).
- **I can now run the game headlessly**: `tools/browser/` (esbuild bundle + SwiftShader Chrome + puppeteer-core, three.js
  from a GitHub checkout). Used to look at the effects and to play the whole menu → map → mission → save → load flow.
  `?debug` exposes `window.__nst.game`.
- **Seen while doing that, not fixed:** the forest "wall slices" (Pack2 611-616) draw as tall dark panels that can
  hide the hero (looked at with the headless browser; not investigated further).
- 100 tests; CI green.

## Turn 14 — wall slices, ranged enemies, every map

- **Wall slices fixed.** The Lost Forrest border (and every cliff, palisade, cave and dungeon wall) is a run of 32 px
  strips whose hotspots land them ~6 cells inside the playable area — the dark panels that hid the hero. Drawn on their
  own cell and mirrored to match the run's direction, the strips close into seamless walls (looked at on the forest
  border, a cave and a dungeon in headless Chrome). The empty frame #599 that interrupts the forest wall now blocks and
  is drawn as a plain slice. Details and the detection rule: `docs/FORMATS.md`.
- **Archers, mages and bows shoot.** `projectiles.ts` / `projectileview.ts`: arrows and magic bolts fly, hit the first
  creature or obstacle, and a raised shield stops them. Arquero, Mago and Zelos (INI `Tipo_IA` 3) keep their distance and
  shoot; the Amazon's arrows are real projectiles now. `?mob=23,25` drops monsters near the start to try them.
- **All 41 maps play.** Cave and Dungeon scenery converted; `maplist.ts` lists the solo mission, the 35 campaign
  missions of `NightStone.NHS` and the 5 multiplayer arenas; **Select map** on the title menu (New game → Select map)
  opens a stone-panel picker (Solo / Campaign / Multiplayer) and plays the choice on its own outside the career;
  `?map=nhs/12` does the same. Each tileset gets its own ground, scenery and music. Every map was loaded headlessly
  without errors (which caught a lost water material). Not done: the other tilesets' chests, multiplayer rules, map
  scripts, and real names for the campaign missions.
- 107 tests.

## Turn 15 — real numbers, map scripts, dialogue, map editor

- **Numbers from `Nightstone.exe`** (read with objdump; `src/game/rules.ts`, `docs/RULES.md` "From the executable"): the
  experience curve (195·n²+200, level 50 max), start attributes and attribute caps per class, maximum life / stamina / mana
  formulas, the hero's damage formula (class term + weapon roll with family bonus; 0–2 becomes 1–3), damage taken
  (`max(1, d − armour − 1)`), stamina and mana per frame, block cost, and the mana of each staff shot. The Sorceress now shoots
  bolts from her staff for mana. 8 tests that encoded old guesses were rewritten; 4 new ones. Still guessed: how monsters take
  damage, the state → stamina mapping, special-item damage.
- **Map scripts run.** The interpreter was decoded (`docs/FORMATS.md` "Scripts"): teleports (`Bdt Entrar` / `Bdt Salir`), exit
  conditions (no enemies of a race left, key item held), end level, raise monster, remove gate, play sound, add time. Chests of the
  Cave and Dungeon packs work too (they carry loot scripts). Scripts that sit on cells are walk-on triggers — the activation type
  is not in the record (the 32 bytes that should hold it are zero everywhere), so that is a decision, not a finding. A script
  name made of a control byte used to put phantom goals on the minimap; fixed. All 35 campaign maps run every script in a test.
- **NPC dialogue.** Speeches from the language file (`ACTORS\ID-n*`, answers `$0 $1 …`) open in a stone-panel window; the
  Innkeeper's first two answers open the shop; the Princess alternates her two speeches.
- **Map editor** (`editor.html`, linked from the game): paint ground (1–5 brush), scenery from the three packs, monsters / NPCs,
  hero starts, erase, pick, undo, grid, zoom, load any of the 41 maps / a file / a blank Outside, Cave or Dungeon map, save a
  `.map`, and Play it in the game. `mapwriter.ts` writes maps back; unedited maps are byte-identical (all 35 tested). Not
  editable: scripts and patrol routes (shown read-only).
- 127 tests.

## Turn 16 — mission names and briefings

- The language file had them all along: `MAPAS\ID-n` (place name + briefing) and `CA8\FinalMap-n` (mission accomplished) for the
  35 campaign missions; mission n is `nhs/n` (checked: #16 has the Innkeeper and his guests, #22 Zelos, #35 the Princess). Select
  map lists "16. The Inn of the White Goddess" etc.; a campaign map opens with its briefing in the speech window (**Q** or the HUD
  quest button shows it again) and ends with its own final text.
- So the **Inn exists** in this install and its shop works there. 129 tests.
- **Editor scripts.** The editor's Script tool lists a map's scripts, creates / deletes them, edits the name and each command (with
  labelled arguments) and puts them on cells; `mapwriter.ts` writes the script table and the cell references back (unchanged scripts
  keep their bytes). Patrol routes are still read-only. 131 tests.

## Turn 17 — durability, controls, patrol routes

- **Durability.** Items now wear out (`Durabilidad` from the item data, 999 = unbreakable): weapon per hit, armour and shield per
  blow taken, shield per block; at 0 they break ("Your X broke"). Restoration repairs everything; dying does too. Saved with the
  hero; the tooltip shows `duration x/y`.
- **Controls window works.** Detail (render sharpness), Screen size (canvas fraction), Blood mode (red puff on hits, GDI/3D 75) and
  the four key boxes (click one, press a key or mouse button; a used input swaps with the box that had it). Saved in
  `localStorage`, same window in the title menu and in game (Esc → Controls). Checked in a browser: with attack on the right button
  and block on the left, right-click walks and left-hold blocks.
- **Editor patrol routes.** Patrol route tool: pick a monster, click cells in order (max 32), Clear route; selected route is drawn in
  yellow with numbers. `mapwriter.ts` writes zone records (unchanged routes stay byte-identical; all 35 maps still round-trip).
  142 tests.
- **Not done, and why:** multiplayer rules (needs networking), ally spells (no allies in single player), special-item effects and
  the `S` damage term (items with `Especial: 1` — 6, 13, 28, 30, 81–83, 111, 112 — have no readable effect), monster
  damage-received formula, state → stamina mapping, where the mission clock starts.
- Follow-up: the HUD hint line follows the key assignments (checked in a browser: Esc → Controls → Run = X → hint reads "X run").
  Looked for the monster damage-received routine in `Nightstone.exe` again (actor template layout found: +0x18 `Rnd_Bloqueo`,
  +0x2c `SangreFX`, +0x44 `Vida`, +0x50 `Armadura`, +0x54 `Aturdirse`) but not the code that uses `Aturdirse` / `Rnd_Bloqueo`;
  the game does not use those two fields yet.

## Turn 18 — the executable's monster rules (replacing guesses)

Found by following the monster constructor (template pointer at `+0x2170` / `+0x2374`, template array at `0x572de4`, 0x194 bytes
per actor) to its receive-hit method (vtable slot 12, `0x436fd0`) and the wear routine `0x42af90`:

- **Monster receive-hit.** Blow B + W ×3 from behind (same facing), ×2 nearly behind, ×1 otherwise (ranged never); armour comes off,
  minimum 1. A frontal melee blow is covered with probability `Rnd_Bloqueo` percent (clang, no damage). The monster staggers only if
  the blow ≥ `Aturdirse` (ranged: more). The old "sneak attack ×2" guess is gone — the ambush is the behind rule.
- **Difficulty** is monster armour ×½ / ×1 / ×2 and attack delay ×1.5 / ×1 / ×⅔. Life and damage do not scale (the old 0.7–1.4
  multipliers were wrong).
- **Item wear** has real numbers: weapon 9 % per blow (1–2 points ÷ item level) + 5 % / 7 % flat per melee swing; armour 20 % / 27 %
  / 30 % per class; Barbarian shield 80 % per block. Durability is a byte (999 reads as 255, not "unbreakable"); only items 14, 48
  and 61 never wear.
- **Mission clock bug.** Script command 4 *sets* the timer (seconds × 35 ticks), it does not add to a running one; the clock never
  started before. Missions 3 (435 s) and 35 (500 s) now run it; shown top right, red in the last minute, mission fails at zero.
- `Especial` (special items): no code outside the loader reads the item's `+0x2c` field, so it probably has no gameplay effect.
- 145 tests.


## Turn 19 — the executable's parchment rules (replacing guesses)

Read the use-item routine for type-512 items in `Nightstone.exe` (all 18 cases). The guessed damage/mana numbers are gone:

- **Strength comes from your mana.** P = 2 × mana points held; above 60 only half of the excess counts. There is no per-scroll mana
  price: each scroll keeps a share of what you hold (⅓ after light / ice / fire / earth, ¼ after incineration, ½ after life and the
  attribute scrolls, nothing after storm and restoration; immunity refills it).
- **Damage:** light P/4, storm P/2, fire P/4, incineration P/3, earth P/4 to every monster inside the 640×480 screen rectangle
  around the hero, ignoring armour and block and without family bonuses. Fire *heals* the infernal ids 3, 10, 19, 20; ice slows for
  P/4 s (37 ticks per point) and hurts those same ids.
- **Life** adds 2 life and 1 stamina per mana point. **Restoration** repairs only the worn weapon, shield and armour.
- Not decoded: the exact range test in the area routine (0x41e150) and the extra visual effects of the freeze and storm callbacks.
- 147 tests.

- **Master armour (Turn 19 follow-up).** The "+1 / +2 armour in some poses" was really by *actor id*: the receive routine adds 1 armour
  for actors 48 (troll warrior master), 51 (Lord of Ailm), 52 and 58 (orc masters) and 2 for 61 (orc general), after the difficulty
  scaling. Implemented (`MASTER_ARMOR`). Actor 63 (Naya, the Princess) takes no damage from heroes; she is an NPC here, so nothing to
  change. `SangreFX` is not read by that routine. 148 tests.

## Turn 20 — more of the executable (experience, potions, death)

- **Experience table was one level off.** The start-up loop fills `table[L] = 195·L² + 200` (L = 1, 2, …) and the level-up test compares
  the experience with `table[current level]`, so level 2 needs **395** (not 980) and level n needs `195·(n−1)² + 200`; max level 50.
  Level-up refills life, stamina and mana (confirmed in the same routine). Multiplayer kills of another hero give 500 × level
  difference (min 400); two scripted events give a fixed 159 and 525 XP, not yet attached to any mission.
- **Potions.** The `Potencia` range is a *percentage of the maximum* (`0x42b890`), clamped to 0..max: a small life potion is 30–45 %
  of your life, Vitality −35..75 % of life, stamina and mana (it can kill). Chance (111) refills one of life / stamina / mana at random;
  Knowledge (112) adds one Power point up to the class cap (not an unspent point). The inventory tooltip shows the percentage.
- **Death.** Worn legendary weapons (14, 48, 61) and item 129 survive and come back with the next attempt; abilities lose a point
  with a floor of 0 (the setter's clamp). The exe drops worn gear on the ground rather than destroying it, and does not touch the
  backpack in that routine; the remake still loses the backpack (manual) because the map restarts anyway.
- 149 tests.

## Turn 20 (cont.) — monster idle routine

- **Roaming.** Found the AI template fields (`Tm_Busqueda` +0x64, `Oido` +0x68, `Radio_Busqueda` +0x6c, `Espera` +0x30, `Velocidad` +0x60)
  and the idle routine (`0x434090`): a monster with nothing to do picks a random cell within `Radio_Busqueda` of home, walks to it and
  waits 1–8 s. Monsters without a patrol route now do that (they used to stand still). `Tm_Busqueda` (give-up time, 10 s default,
  60 s for archers/mages) and `Espera` (pause chance) are understood but not modelled — the target-tracking state machine around
  them (states 0x65–0x6e, path requests) is large and was not decoded in full.
- 150 tests.

## Turn 20 (cont.) — stamina by state

- **State → stamina mapping decoded.** The hero's speed routine (`0x42cc30`) sets state 0x78 for speed 0, 0x79 above the walking speed
  (run), 0x7b at exactly the walking speed (1.0) and 0x7a below it (stealth); the per-frame routine gives each its own stamina change
  and everything else (attack, cover, hit) none. So standing regains most, walking a bit less, **stealth walking drains**
  (−3 / −5 / −3), running drains more. The old table labelled the stealth drain "guard" and the walking gain "sneak" and applied
  the drain to blocking; Amazon walking is +3, not +4.
- **Block is free.** The Barbarian's block branch (hero receive routine) spends no stamina and does not check it; the 2-point cost
  per blocked blow and the "no stamina, no block" rule were guesses and are gone.
- 151 tests.

## Turn 21 — real movement speed and animation clock

- **Walking speed decoded.** The path set-up (`0x4237b8`) and per-tick move (`0x42345b`) work in screen pixels: each tick the object
  advances `speed` pixels along the longer screen axis. Heroes walk at 1 px/tick (run 2, stealth 0.5); a monster's speed is
  Velocidad × Velocidad (`0x422f57` multiplies the order's Velocidad by the actor's own, which is the INI Velocidad). Patrol and
  roam orders pass the same value as chase, so the invented "patrol = 0.45 of chase" is gone. The old 3.2 / 1.7 cells per second
  were three times too fast: a hero now crosses 1.09 cells/s along a map axis.
- **Animation clock = 1/35 s.** The animation clock gains 1.0 per engine tick and a frame lasts `speed` ticks (the walk cycle
  7×10 = 70 ticks = 2 s now matches 2 steps of ~35 px, so feet no longer glide). The 1/60 guess was too fast. Footsteps every 1.0 s.
- Tests re-timed (151 pass).
- **Projectiles decoded.** The Amazon's shot routine (`0x42f290`), the Arquero/Mago/Zelos one (`0x437750`), the Sorceress's (`0x43cf79`)
  and the shot object's update (`0x4250a0`): a shot moves 10 (hero arrow), 8 (Sorceress bolt) or 9 (monster) screen pixels a tick
  along the longer screen axis, flies 60 ticks at most (then lingers a few ticks), and hits the first actor within 16 pixels that is
  not its shooter (the shooter's own hit routine is called); walls stop it too. The old 16 / 9 cells per second, 7-cell reach
  and 0.6-0.7-cell hit radius were guesses. Still guessed: when shooters decide to fire, the aim cone, bow reach for the hero.

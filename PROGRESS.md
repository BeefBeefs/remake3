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
| Character / enemy sprites (`.P16`) | 🟡 header tables found, pixel encoding open |
| Map cell layout (`.map`) | 🟡 gzip + header found, cell grid open |
| Renderer (iso, three.js) | 🟡 terrain slice with placeholder hero (milestone 0) |
| Combat, AI, items, inventory, UI, multiplayer, editor | ⬜ not started |

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

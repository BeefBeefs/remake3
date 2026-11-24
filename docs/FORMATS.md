# NightStone file formats

Reverse-engineered from the custom "Collection Chamber" installer (`Install-NST.exe`, 201,731,505 bytes) and the
files it installs. Status legend: **✅ confirmed** (parses the whole shipped set, checked by code/tests),
**🟡 partial** (structure found, semantics open), **❓ unknown**.

Game facts from the installed files: 640×480, 16 bpp, DirectDraw + Direct3D 8/9 (the installer ships dgVoodoo wrappers
`DDraw.dll`, `D3D8.dll`, `D3D9.dll`, `D3DImm.dll` to run on modern Windows). Language is English (`Idioma.bdt`).

## 1. Installer (`Install-NST.exe`) ✅  — `tools/extract_nst.py`

PE32 executable, version string `NightStone Install Program 2.0.0.45`. The installer data is the PE *overlay*, which
starts at file offset `0x49000` (= end of the last PE section).

```
overlay:  "wwgT)H5" 0x14 0x01 0x00                        (10-byte magic/header)
          record × 8:  u32 csize | u32 usize | u8 method | data[csize-1]
                        method 1 = zlib, 2 = bzip2; csize includes the method byte
```

The 8 records end exactly at EOF:

| # | method | bytes (unpacked) | content |
|---|--------|------------------|---------|
| 0 | zlib | 1,990 | dialog templates |
| 1 | bzip2 | 186,860 | installer UI resources (bitmaps?) – not needed |
| 2 | zlib | 147,456 | `Uninstall-NST.exe` stub (PE) |
| 3 | zlib | 4,645 | installer texts (welcome/licence/readme screens) |
| 4–5 | zlib | 110 / 168 | registry key names |
| 6 | bzip2 | 74,615 | **file table** |
| 7 | zlib+raw | 201,231,700 | uninstaller strings (a 360-byte zlib prefix) followed by the **file payload** |

**File table (record 6)**, one entry per file, in payload order (shortcut/registry entries are interleaved and are
skipped by following the running payload offset):

```
u8  flags (0x55..0x7f, meaning unknown) + 5 zero bytes
u32 offset      -- into record 7, starting at its first byte (the method byte of the payload prefix)
u32 csize       -- block size incl. method byte; next block starts at offset+csize
u32 0
u32 usize
u32 check       -- NOT plain CRC32 (mismatches zlib.crc32 for every file); algorithm unknown, sizes are verified instead
14 bytes        -- unknown (attributes?)
u32 index
3 × FILETIME    -- created / modified / accessed
name\0  (Windows path, backslashes)
8 zero bytes
```

Each payload block is `u8 method` + zlib/bzip2 stream; empty files have `csize == 1`. Result: **734 files, 374,422,792
bytes**; every unpacked size matches the table and the last block ends at the last byte of the installer.

## 2. Images

### B16 image bank ✅ — `src/formats/b16.ts`

```
u32 count
count × { u32 id, u16 width, u16 height, u16 pixels[width*height] }   RGB565 little-endian, 0xF81F = transparent
4092 trailing bytes (every bank; purpose unknown, looks like pixel data of a final truncated entry)
```

Ids are sparse (e.g. Outside `PackCell`: 1–24, 25–30, 400–424, 500). Used for: ground tiles and scenery
(`Scenary/*/VTiles.b16`, `PackCell.b16`), item icons (`System/IListData.b16`, ids 1–152), actor list icons
(`AListData.b16`), UI screens (`GDI/Graphics/*.b16`). `Thumbnails.b16` is editor-only. 21 banks are converted by
`tools/convert_assets.py` into `public/assets/atlas/**` (PNG atlas + `{id: [x,y,w,h]}` JSON).

Ground tiles are 64×31 isometric diamonds; scenery sprites (trees up to 138×200, palms 237×167, bushes) have their
foot at the bottom-centre of the bitmap (assumed – looks right in the demo).

### `.Ofs` terrain heights 🟡
`Scenary/*/*.Ofs` = 1023 rows × 12 × int16. `-16` = flat; a few ground tiles carry `-5`, `-22`, `-7` … → per-vertex
height offsets for sloped terrain tiles (prop rows are all zero). Not used yet.

### P16 sprite packs ✅ — `tools/p16.py`, `tools/convert_p16.py`
Layout taken from the sprite loader in `Nightstone.exe` (0x40aa50); decodes **all 134 packs / 51,448 frames** with
zero malformed rows. Entries are numbered 1..1023 (there is no entry 0 in the tables):

```
0x0000  u16 width [1023]
0x07fe  u16 height[1023]
0x0ffc  u32 offset[1023]        into the data words, in u16 units
0x1ff8  i16 hotspot_x[1023]     offset of the bitmap's LEFT edge   (raw, see below)
0x27f6  i16 hotspot_y[1023]     offset of the bitmap's TOP edge
0x2ff4  u32 N                   number of data words;  file size == 0x2ff8 + 2*N
0x2ff8  u16 data[N]
```

Each frame is `height` rows. A row is a sequence of tokens until `width` pixels are covered, then the terminator
`F81F F81F`:

```
F81F n        skip n transparent pixels            (0xF81F is the colour key)
n  px×n       n RGB565 pixels   (n < 0xF81F, n >= 1)
```

**Hotspots.** `(hx, hy)` is the offset of the bitmap's top-left corner from the engine's reference point. For actors
the feet are at x≈−128, y≈−17 (Barbarian median −127.75/−17; Sorceress −128.5/−7; Amazon −131/−15). Anchoring a
sprite at a cell centre (or an actor's feet) gives `topLeft = anchor + (hx + 128, hy + 16)` in screen px, which lines
up the Lost Forrest camp (barrels, fires, tents, flags) and the walk cycle correctly (`docs/preview-milestone1.png`).
Cliff/forest *wall slices* (Pack2 ids 611–616, 32 px wide) carry offsets of −200…−270 px and render high above their
cell with this rule — probably intended as a tall backdrop, not verified.

**Animation layout.** Actor packs hold animations back to back, each as 8 direction blocks, *dir-major*
(`start + dir*frames + step`). The per-animation `(speed, frames-per-direction)` pairs are in the actor INI
(`[Animaciones]`: Andar = walk, Respirar = idle, Atacar = attack, Cubrir = block, Recibir/Recibir2 = hit, Morir = die,
Alarma = taunt, Extra/Atacar2/Vigilar/Aburrido/Aparecer = misc). A pack only contains a subset, in this order:
`Andar, Respirar, Atacar, Cubrir, Recibir, Morir, Recibir2, Extra, Atacar2, Alarma, Vigilar`.
`tools/build_anims.py` finds the subset whose frame total matches the pack: goblin `1E` = 8·(8+8+8+3+10+13) = 400 ✓
(Cubrir and Recibir2 absent). 3 monsters match uniquely, 13 are ambiguous (Recibir vs Recibir2 – same size – and a
few others, resolved by a preference rule), 20 do not match any subset and only get Andar/Respirar/Atacar
(`partial`). Direction blocks (confirmed in-game): **E, NE, N, NW, W, SW, S, SE** (counter-clockwise from east; an earlier by-eye reading had E and W swapped).
Frame time is `speed × tick`; the tick length is a guess (1/60 s looks right).

**Player characters are layered pre-rendered sets.** `Actors/<a><b><c>-<Class>.P16` are complete figures with identical
frame numbering (564 frames; plate armour 548): `000` bare hands, `001` dagger, `002` sword, `005` two-handed sword,
`010` shield, `020` heavier shield, `100`/`101` leather armour, `200`/`201` plate… The remake draws one pack per class
(Barbarian 002, Amazon 001, Sorceress 001). **Layout (verified by eye for all three classes):** the usual 8-direction
blocks in INI order for the animations the class has — Barbarian Andar, Respirar, Atacar, Cubrir, Recibir, Recibir2,
Extra, Atacar2, Vigilar; Amazon Andar, Respirar, Atacar, Recibir, Recibir2, Extra, Vigilar; Sorceress adds Cubrir —
and then **Morir stored for only 4 directions, at the very end** (11/11/10 frames each; every sequence ends with the
hero lying down). That is why the pack sizes (564, 516, 536) are not multiples of 8:
`8·Σ(blocks) + 4·Morir = pack size` has exactly one solution per class. Death direction `d` (0..7) uses block `d >> 1`
(which pair of screen directions each block really serves is not checked). Monsters whose size also fits this rule
did *not* show death poses, so the rule is applied to the heroes only; 20 monsters remain unmapped beyond
Andar/Respirar/Atacar.

**Feet anchor.** Hotspot origins differ per pack (hero bottoms ≈ −12, goblins ≈ −52, troll ≈ +24), so each actor's
`foot` point = median bottom-centre of its idle frames (`anims.json`). Scenery uses the fixed (128, 16) rule above.

### Tile surfaces (inferred) and `System/*.CDt`
No per-tile property table (surface, collision) was found. `System/{Outside,Cave,Dungeon}.CDt` are **not** compressed and
are the *map editor's brush catalogue*: 264-byte tree records (`name,iconId`, a u32 at +8, trailing i32; categories such as
Suelos = floors, Arboles, Cofres, Estandartes, Piedras, Rios y pozo, Players, Scripts, Sonidos…) followed by ~2.2 KB
records per multi-cell brush (`TIENDA1-3` = shops, `N_casa1-6` = houses, `Tomb01-18`, `Emp_*` fences, `Barril …`,
`Cofre … D1/D2` = chest closed/open…). Footprint grids are stored as dwords of 0/1. Not decoded further.
`tools/build_tiles.py` therefore **infers** the surface of every VTiles frame from its mean colour (Outside: grass / dirt /
stone / wood / water / void; Cave and Dungeon: all stone) with overrides Outside 141–146 = planks (wood), 511 = water,
0 = void → `data/tiles.json`. Lost Forrest: 64,028 grass, 667 dirt, 804 water, 12 plank cells.
Footstep sounds: `GDI/Audio` 160/161 grass, 164/165 wood, 168/169 stone (dirt uses the grass pair — a guess).

### INI data (`AData.Nhs` → `data/actors.json`, `WData.Nhs` → `data/items.json`)
Actor INI (`IA-<n>.INI`): `[General] Tipo_IA (1 monster, 2 NPC, 3 boss/ranged), Raza, Vel_Ataque (min,max cooldown ticks),
Rnd_Bloqueo, Centrado, Altura`; `[HDP] Vida, Fuerza (damage min,max), Armadura, Aturdirse, Pts_Experiencia (min,max),
Velocidad`; `[IA] Oido, Radio_Busqueda` (tiles); `[Animaciones]`; `[Items] IDItem/PItem` (drop table: item id,
weight); `[Sonidos]`. Item INI (`ID-<n>.INI`): `Tipo` (1 sword, 32 bow, 512 scroll …), `Grafico`, `Potencia` (damage),
`Durabilidad`, `CofreLv`, `Precio`, `[Requerimientos]` (Character 100 Barbarian / 101 Amazon / 102 Sorceress, R_*),
`[Bonificadores]` (B_*).

### `GDI/3D/**/*.bmp`, `Scenary/*/3D/*.BMP` ✅
Ordinary 24-bit BMPs, 16–256 px: Direct3D textures (spell effects, menu/logo art, score icons).

### `.g16`, `.vid` 🟡
`GDI/Graphics/*.vid`, `Close.g16` start with `00 00 01 BA` = MPEG-PS pack header → intro/outro videos (Virgin,
NightStone, NHS logos, intro). The 76 `Pack/*.g16` files are different/unknown.

## 3. Audio ✅
- `GDI/Audio/**/*.wav` (161 files incl. 13 ambient loops and 12 `Locs/Intro*` voice lines): standard RIFF WAVE.
  File names are Spanish developer names (`Cuerno` = horn, `Espada` = sword, `Carne` = flesh…).
- `System/{Cave,Combat,Dungeon,Map,Menu,OutSide,Psda}.dt`: **RIFF WAVE music** (44.1 kHz stereo 16-bit) despite the
  extension; `TK_EX.dt` is also WAVE. All are converted to Ogg Vorbis (`public/assets/audio/**`).

### Scripts (map table at 0x190384) 🟡
Record (248 bytes): u32 enabled flag (1) at +0, name at +4 (≤52 bytes, may start with NULs), 8 × u32 **command ids**
at +0x38, 32 unknown bytes at +0x58 (probably conditions), 8 × 4 × u32 **arguments** at +0x78. A cell runs a script
through the **decor layer**: u16[2] of the cell's decor record = `2048 + 32·(script+1)` (plain 2048 = none). In Lost Forrest
37 cells carry one and all of them are containers: pack-3 chests (402/404/527/529/531, closed sprite = id−1), barrels
(405–407), crates (408), plus the tomb gate (pack 1, 625–640).

Interpreter commands (jump table at 0x436e84; semantics read from the disassembly, only 1 and 9 occur in Lost Forrest):
| id | meaning |
|----|---------|
| 1 | roll a random item with `Tipo & a0` from chest level ≤ a1 (item INI `CofreLv`), drop it at the cell — **verified in data**: scripts 0–9 are loot tables (a0 = 100 melee/bow/staff mix, 1, 32, 64, 1024 potions, 0xE000 armour, 128 rings, 256 amulets; script 8 = one armour per class; script 9 = 8/64/32 weapons) |
| 2 | move/teleport to cell (a0,a1) |
| 3 / 4 | activate / remove actor a0 |
| 5 | spawn actor a0+1 at (a2,a3) (`Spawn:%d (A:%d) at (%d,%d)`) |
| 6 | change the object at a cell |
| 7 / 8 | remove the object at cell (a0,a1) / at the trigger cell |
| 9 | drop fixed item a0 at the cell (script 11 "Tumba de Domnir": a0 = 0, i.e. nothing; it marks the goal) |
| 10 | quest-manager call with a0 (unclear) |
| 11 | requires item/key a0 in a player's inventory, else message 5 ("locked") |
| 12 / 13 | message 1 / actor-manager call with a0 (unclear) |
| 14 | no-op |

### Sound ids
Files `GDI/Audio/NNN_*.wav` → `audio/gdi/audio/NNN_*.ogg`, indexed by `data/sfx.json`. Actor INI `Sonidos.SndBase` = B:
B+0 attack, B+1 alarm (notices you), B+2 die, B+3 hurt (e.g. 200–203 goblin); `Carne` 1/0 = flesh vs. no-flesh hit sound
(59–61 `c_carne` / 62–64 `c_nocarne`). Hero: 100 die, 101–102 hurt, 103 level up (Amazon 120–123, Sorceress 140–143);
57/58 sword, 65–70 `c_sesgo` (used for a swing that hits nothing – a guess), 8 pick up, 7 item drop, 9 drink, 53–56 block.

## 4. Text ✅
`System/Idioma.bdt`: Latin-1 blocks `<< KEY >>\r\ntext&\r\n`. Keys: `ACTORS\ID-<n>` (name), `ACTORS\ID-<n>*` (dialogue,
replies as `$0 …`, `$1 …`). 576 entries → `public/assets/text/idioma.json`. Example: ID-1 Goblin, ID-27 Innkeeper (Inn of the
White Goddess), ID-100 Terak, ID-101 Rhelia.

## 5. Maps 🟡 — `src/formats/map.ts`
`Maps/*.map`, `Adv/*.adv` are **gzip**. Decompressed "Lost Forrest" = 1,655,172 bytes:

```
0x00000  u32 100
0x00004  "Outside\0…"   tileset name -> Scenary/<name>/
0x00044  u32 2
0x00048… zeros up to 0x4000 (16 KiB header region; the rest unknown)
0x04000  terrain: 256×256 cells × 12 bytes, row-major (index = cy*256+cx). First u32 = VTiles id (0 = void, 19 such
         cells); the other 8 bytes are zero.   ids: 109–124 dark grass, 141–146 bridge planks, 147–191 dirt,
         330–407 grass variants, 511 = water (NOT a VTiles frame; Overlay bank has a 22×30 sprite with that id),
         549/550/606–611 misc.
0xC4000  72 bytes (6 more 12-byte records, ids like 402/365…; meaning unknown)
0xC4048  objects: 256×256 u32, row-major. value = (pack << 10) | frameId, pack 0..3 = PackCell, Pack1, Pack2, Pack3
         .P16 of the tileset.  Pack 0 is special: its ids are **spawn markers**, not scenery (see below).
0x104048 decor: 256×256 records of 8 bytes (4 × u16, row-major). u16[0]/u16[1] hold extra sprite ids (413–424, 500,
         3072 …) and u16[2] is 2048 (+32·k) on ~3,400 cells – flag/height-like; none of it rendered or understood yet.
0x184048 zones: 255 records × 196 bytes. u32 key = packed cell (y<<8 | x) of a PackCell object, then up to 32 packed
         cells (u32 each, 0-terminated), then 16 u32 of unknown data (values like 140, 175, 350, 875…).
         Read as a **wander route** of the monster at the key cell (points within ~13 cells of it; used by the game).
         32 are used in Lost Forrest; all 32 keys are cells holding a pack-0 object (verified).
0x190384 scripts: 64 records × 248 bytes (see "Scripts" below). Lost Forrest uses 11 of them.
```

**Actor spawns (verified by disassembling the editor's map pass, "Found %d Actors").** The loader walks every cell of
the object layer; a cell with pack 0 and id N spawns actor **IA-N** (`AData.Nhs`; kind 3 monster, or 7 if its INI says
NPC). Ids **100 / 101 / 102** are the **Barbarian / Amazon / Sorceress start points** (Lost Forrest: (235,121),
(235,123), (234,118), as (cx,cy)). The PackCell frames that exist for these ids are the editor's marker icons
(64×31 diamonds with the actor's picture), not game graphics. Lost Forrest has 43 markers: 9 zombies (16), 5 orc
captains (8), 5 amazons (21), 4 infernal goblins (3), 4 skeleton guardians (12), 3 mages (25), 2 common skeletons (9),
2 knights (24), 1 each of goblin (1), opahc (15), troll warrior (18), diabolic amazon (22), plus three start points and two
markers with no actor (112, 120 – possibly exit/goal). The loader's other layer reads are 8-byte decor (value 500 =
delete) and the pass at 0x4022bb that returns `(pack, id)` per cell.
Reading the objects shows the playable area is a rectangle (≈ rows 60–140, cols 81–242) ringed by cliff/forest wall
slices; a 3-wide river runs east–west along rows 165–167 with plank bridges (141–146). Terrain checked visually
(grass/dirt transitions are seamless); the stray 6 records and the layers after the objects are open.
The campaign map is `Lost Forrest.map` (+ `.dsc`: "Find the tomb of Donmir the great that is guarded by Erramus the high
mage…"); five multiplayer maps (`{4P-D1}`, `{8P-C2}` …) are in `Maps/Multiplayer`. `Adv/Test.adv` begins with the
plain-text intro, so adventures embed mission text.

Order of the reads in the editor's loader (checked in the disassembly): 0x4000 header, 0xC0000 terrain, 0x48 bytes,
0x40000 objects, 0x80000 decor, 0xC33C (= 255 × 196) zones, 0x3E00 (= 64 × 248) scripts – exactly the file size.

## 5c. Adventures (`.adv`) ✅ — `tools/adv.py`, `src/formats/adv.ts`
A gzip stream (`Adv/Test.adv`: 106,086 → 132,799 bytes) written by the Adventure Creator. It is a **container**, not a
script – monsters, triggers and loot are inside the embedded `.map`.

```
0x00000  intro text (NUL padded, up to 0x5dc)
0x005dc  mission name, 255-byte field ("Lost Forest")
0x006e7  hero 1 name  | 0x007e6 hero 2 name | 0x008e5 hero 3 name   (Barbarian, Amazon, Sorceress; 255-byte fields)
0x009e4  3 × 4 u32: strength, skill, resistance, magic  – Barbarian 32 24 30 11, Amazon 22 28 22 14, Sorceress 19 23 21 30
0x00a14  final text (NUL padded)
0x00ff0  background image names ("25.BMP") followed by raw 24-bit images; also repeating small per-hero records
         (0x10f3–0x728d) that look like inventory / portrait data – not decoded
0x0727e  mission file name "Lost Forrest.map" (255-byte field), 
0x07385  the mission .map as its own gzip member (1,655,172 bytes decompressed; byte-identical to Maps/Lost Forrest.map)
0x200e3  mission description (.dsc text, NUL-terminated)
```
Only the one sample exists, so a multi-mission adventure (repeated mission records?) is unverified. Hero starting
inventories are probably in the undecoded 0x10f3–0x728d region.

## 5b. `.Nhs` archives 🟡
`AData.Nhs`, `WData.Nhs`, `NightStone.NHS`: a name directory (64-byte stride, INI-like file names) followed by
offset/size tables; payloads are stored as **bitwise NOT** of plain text (`~byte`). Record boundaries are not parsed
yet; they hold the 72 actor and 141 item definitions.

## 6. Other
- `System/Game.cfg`, `NightStone.cfg`, `Server.cfg` (port 27068), `Menu.ini` (menu button coordinates, 640×480): plain text.
- `System/*.dat` (`Fnt.dat`, `BigFont.dat`, `SmallFnt.dat` = 256 bytes: glyph width tables; `BackMask.dat` 608 bytes),
  `Mask.raw` (786,432 = 512×512×3?), `*.Nhs`, `*.CDt` (collision?), `*.p16` in `System` are gzip. All ❓.
- `MAN/Manual.pdf` (6.7 MB) is scanned images – no text layer (needs OCR for the controls/skills reference).
- Engine strings (`Nightstone.exe`): `CActorSpider`, `Actors\Gfx\{Amazon,Barbarian,Sorceress,Rat,Spider,Stone}`,
  `@NHS@%d.map`, `Loading Actor IA:: 72 actors`, `Loading Items: 141 items` (Debug.txt).

## 6. GUI art (`GDI/Graphics/*.b16`, `System/Menu.ini`, `System/Fnt*.dat`) ✅

All GUI banks are ordinary B16 (RGB565, magenta key) and are converted to atlases `atlas/gdi/graphics/<bank>.{png,json}`.
Frame ids that the remake uses (`src/ui/*.ts`):

| Bank | Frames |
|------|--------|
| `NQuest` | 17 title background (logo on black, 640×480), 4 same with the words baked in, 1-3 words, 11/12 stone frames |
| `Menu` | 2 New game, 3 Multiplayer, 4 Load game, 5 Controls, 6 Credits, 7 Exit (302×46); 12 Start game, 13 Select map, 14 Return (252×32); 60/61 Accept/Cancel (67×20); 62 Difficulty dialog (308×199, buttons 222×27 at local 43,55 / 43,95 / 43,135; 63-65 are their pressed images); 59 Ability panel; 333-338 hero portraits |
| `MapGFX` | 32 Select Hero dialog (308×192, portraits at local x 62/132/202, y 75; Accept/Cancel at y 156), 10 Options menu (132×189: Load 40, Save 70, Return 100, Exit 131; x 22), 333-338 portraits (alive / dead grey) |
| `Overlay` | 50 Controls window (308×452), 51 Return (121×20), 66 stone panel, 200-207 font sheets, 30/250 hand cursors |
| `Score` | **HUD**: 0 minimap ring (151×119; hole x 21-104, y 14-93), 10-17 globe (86×86), 2-9 the four ring buttons (22×22, pairs normal/hover, at x 32/56/80/104, y 95), 30 portrait frame (95×54; portrait at 19,1; bar wells at x 67/77/87, 6 px wide), 29 ornament, 18/19/43 life / stamina / mana bars (9×36), 31-36 portraits, 1 message frame (202×91; text hole 34,18 - 183,73), 83 Allies dialog |
| `Inventory` | 0 inventory window (255×420), 1 backpack side panel, 41 quick bar (190×53; slots 36×36 at x 24+40·i, y 13), 3/5/7 slot backgrounds, 20-32 body / hand silhouettes, 10-13 Heavy / Light objects tabs |
| `HDP` | 0 character window (255×420), 1-3 "+" buttons |

`Menu.ini` gives the 640×480 button coordinates (`CNewGame={0,251}`, `CStartGame={194,302}`, `[Preferences]` slider and box
positions…). `NightStone_1.tga` / `NightStone_2.tga` in the install root are screenshots of the real HUD at 1024×768.

**Bitmap font:** `Overlay` frame 200 (and 201, 204-207 in other colours) is a 256×256 sheet of 16×16 cells in Windows-1252
order (code `c` at column `c & 15`, row `c >> 4`, white on black); `System/Fnt.dat`, `FntBold.dat`, `FntMenu.dat`,
`BigFont.dat`, `SmallFnt.dat` are 256 bytes of per-character advances in pixels (`data/fonts.json`). The big menu words and
buttons carry a black backdrop and look right when added to the picture (`mix-blend-mode: screen`).

Spell effect textures live in `GDI/3D/*.bmp` (64-72 torches, 100-104 rings, 118/119 flares, 120-133 smoke), not used yet.

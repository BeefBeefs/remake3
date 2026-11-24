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
`010` shield, `020` heavier shield, `100`/`101` leather armour, `200`/`201` plate… The remake draws one pack (002).
Only the first three blocks of the Barbarian's table (Andar 10, Respirar 8, Atacar 9) are mapped; the 564 frames do
not divide into 8 directions (70.5 per direction), so some later animation uses fewer directions.

**Feet anchor.** Hotspot origins differ per pack (hero bottoms ≈ −12, goblins ≈ −52, troll ≈ +24), so each actor's
`foot` point = median bottom-centre of its idle frames (`anims.json`). Scenery uses the fixed (128, 16) rule above.

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
         .P16 of the tileset (95 % of ids resolve; the rest are probably markers: 0, 99, 999…).  2,280 objects.
...      further sparse u32 layers (e.g. flags with value 2048 in alternating columns) – not decoded.
```
Reading the objects shows the playable area is a rectangle (≈ rows 60–140, cols 81–242) ringed by cliff/forest wall
slices; a 3-wide river runs east–west along rows 165–167 with plank bridges (141–146). Terrain checked visually
(grass/dirt transitions are seamless); the stray 6 records and the layers after the objects are open.
The campaign map is `Lost Forrest.map` (+ `.dsc`: "Find the tomb of Donmir the great that is guarded by Erramus the high
mage…"); five multiplayer maps (`{4P-D1}`, `{8P-C2}` …) are in `Maps/Multiplayer`. `Adv/Test.adv` begins with the
plain-text intro, so adventures embed mission text.

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

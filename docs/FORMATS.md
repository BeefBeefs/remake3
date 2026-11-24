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

### P16 sprite packs 🟡 (actors, scenery packs, magic effects)
Layout found for `Actors/Rat.P16` (208 frames, 65,948 bytes):

```
u16 width[1024]      (bytes 0x0000..0x07ff)  e.g. 23,23,24,24,24,24,22,24,23,22,23,24 …
u16 height[1024]     (bytes 0x0800..0x0fff)  e.g. 7,7,7,8,7,8,7,8,7,7,7,8 …
u32 offset[1022]     (bytes 0x1000..0x1ff7)  123,243,366,489,622,750,875,1001 …  (≈ cumulative, 120–180 apart)
pixel words from byte 0x1ff8 (u16 index 4092):  0xFFxx runs, 0x0000, 0x0841, 0xF81F (colour key) …
```
Open: the pixel words are *not* a plain `w*h` RGB565 raster — Σ(w·h) ≠ body size and offsets advance ≈76 % of `w·h`,
so frames look RLE/trimmed. Next step is disassembling `Nightstone.exe` (sprite loader), or fitting the encoding
against the in-game look. Same family: `Actors/<id>-<class>.P16` (Barbarian/Sorceress/Amazon animation sets, 1.2–2.4 MB
each), `Actors/<n>E|X.P16` (enemies/NPCs), `Scenary/*/Pack*.P16` (tile variants), `GDI/Graphics/Magic*.P16`.

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
0x0000  u32 100                (map size? same in all maps)
0x0004  "Outside\0…"           tileset name (64-byte field) -> Scenary/<name>/
0x0044  u32 2
0x0048… zeros up to 0x4000 (16 KiB header region; purpose unknown)
0x4000  cell data: 1,638,788 bytes. Strong 12-byte periodicity; u32 values include 339, 385, 1000… which are ids that
        exist in Outside VTiles. 136,565 12-byte records + 8 bytes; no 2-D stride found yet (likely several layers).
```
The campaign map is `Lost Forrest.map` (+ `.dsc`: "Find the tomb of Donmir the great that is guarded by Erramus the high
mage…"); five multiplayer maps (`{4P-D1}`, `{8P-C2}` …) are in `Maps/Multiplayer`. `Adv/Test.adv` begins with the
plain-text intro, so adventures embed mission text.

## 6. Other
- `System/Game.cfg`, `NightStone.cfg`, `Server.cfg` (port 27068), `Menu.ini` (menu button coordinates, 640×480): plain text.
- `System/*.dat` (`Fnt.dat`, `BigFont.dat`, `SmallFnt.dat` = 256 bytes: glyph width tables; `BackMask.dat` 608 bytes),
  `Mask.raw` (786,432 = 512×512×3?), `*.Nhs`, `*.CDt` (collision?), `*.p16` in `System` are gzip. All ❓.
- `MAN/Manual.pdf` (6.7 MB) is scanned images – no text layer (needs OCR for the controls/skills reference).
- Engine strings (`Nightstone.exe`): `CActorSpider`, `Actors\Gfx\{Amazon,Barbarian,Sorceress,Rat,Spider,Stone}`,
  `@NHS@%d.map`, `Loading Actor IA:: 72 actors`, `Loading Items: 141 items` (Debug.txt).

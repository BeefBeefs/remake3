# NightStone remake

A TypeScript / three.js, browser-playable remake of **NightStone** (2001, New Horizon Studios, published by Virgin
Interactive) — an isometric action RPG with a Barbarian, a Sorceress and an Amazon. See [PROGRESS.md](PROGRESS.md) for the
current state and [docs/FORMATS.md](docs/FORMATS.md) for the reverse-engineered file formats.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (asset viewer: /viewer.html)
npm run build        # type-check + production build into dist/
npm test             # unit tests (format tests need the extracted game, see below)
```

Converted assets are already in `public/assets`, so the game runs without the original files.

## Regenerating the assets from the original installer

You need your own copy of `Install-NST.exe` (the abandonware release, 201,731,505 bytes).

```bash
python3 tools/extract_nst.py path/to/Install-NST.exe game          # 734 files -> ./game  (pure Python, no 7-Zip needed)
python3 tools/convert_assets.py game public/assets                  # needs Pillow, numpy, ffmpeg
NST_GAME_DIR=game npm test
```

## Layout

```
tools/        installer extractor + asset converter (Python)
src/formats/  parsers for the decoded formats (B16 images, map container)
src/game/     world / gameplay
src/assets/   atlas loader
src/iso.ts    isometric projection
docs/         format notes
public/assets converted assets (atlases, textures, Ogg audio, maps, strings)
```

The original game files are copyrighted by their owners; this project is a private reverse-engineering effort.

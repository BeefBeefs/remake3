# NightStone remake

A TypeScript / three.js, browser-playable remake of **NightStone** (2001, New Horizon Studios, published by Virgin
Interactive) — an isometric action RPG with a Barbarian, a Sorceress and an Amazon. See [PROGRESS.md](PROGRESS.md) for the
current state and [docs/FORMATS.md](docs/FORMATS.md) for the reverse-engineered file formats.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (asset viewer: /viewer.html)
npm run build        # production build into dist/   (npm run typecheck for tsc)
npm test             # unit tests (format tests need the extracted game, see below)
```

Converted assets are already in `public/assets`, so the game runs without the original files.

## Regenerating the assets from the original installer

You need your own copy of `Install-NST.exe` (the abandonware release, 201,731,505 bytes).

```bash
python3 tools/extract_nst.py path/to/Install-NST.exe game          # 734 files -> ./game  (pure Python, no 7-Zip needed)
python3 tools/convert_assets.py game public/assets                  # needs Pillow, numpy, ffmpeg
python3 tools/convert_nhs.py game public/assets                     # actor/item tables
python3 tools/build_anims.py game public/assets                     # animation layouts
python3 tools/convert_p16.py game public/assets                     # sprite atlases
NST_GAME_DIR=game npm test
```

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main`: install, unit tests, typecheck (warning only for now), Vite
build, deploy `dist/` with the official Pages actions. In the repo settings set **Pages → Source: GitHub Actions**. The
build uses relative paths (`base: './'`), so it works at `https://<user>.github.io/remake3/`. Note that a Pages site is
public even if the repository is private on some plans, and the converted game art is copyrighted — keep that in mind.

## Layout

```
tools/        installer extractor + asset converter (Python)
src/formats/  parsers for the decoded formats (B16 images, map container)
src/game/     world, creatures, combat, items
src/ui/       inventory panel
src/assets/   atlas loader
src/iso.ts    isometric projection
docs/         format notes
public/assets converted assets (atlases, textures, Ogg audio, maps, strings)
```

The original game files are copyrighted by their owners; this project is a private reverse-engineering effort.

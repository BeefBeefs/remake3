#!/bin/sh
# Local browser harness: bundles the game with esbuild (three.js from a GitHub checkout), serves it, screenshots with headless Chrome (SwiftShader WebGL).
cd /home/claude/remake3
/opt/npm-tools/node_modules/.bin/esbuild src/main.ts --bundle --format=esm --target=es2022 --outfile=/home/claude/scratch/run/main.js \
  --alias:three=/tmp/three/t/build/three.module.js --define:import.meta.env.BASE_URL='"./"' --log-level=warning || exit 1
/opt/npm-tools/node_modules/.bin/esbuild src/guipreview.ts --bundle --format=esm --target=es2022 --outfile=/home/claude/scratch/run/gui.js \
  --alias:three=/tmp/three/t/build/three.module.js --define:import.meta.env.BASE_URL='"./"' --log-level=warning || exit 1

# Running the game in a headless browser (no npm needed)

Used to look at the real game when `npm install` is blocked. Needs Chrome (`google-chrome`), esbuild and puppeteer-core
(`/opt/npm-tools/node_modules`) and a checkout of three.js's `build/` folder:

    git clone --depth 1 --filter=blob:none --sparse https://github.com/mrdoob/three.js.git /tmp/three/t
    (cd /tmp/three/t && git sparse-checkout set build)

    mkdir -p /home/claude/scratch/run && cd /home/claude/scratch/run
    cp <repo>/tools/browser/* .
    ln -sfn <repo>/public/assets assets
    sed 's#/src/main.ts#./main.js#' <repo>/index.html > index.html
    ./build.sh                                   # bundles src/main.ts and src/guipreview.ts with esbuild
    python3 -m http.server 8765 &                # serve this folder
    node drive.mjs "http://127.0.0.1:8765/index.html?class=barbarian&debug" out.png "<js to run in the page>" 2000
    node fx.mjs 90 fire.png sorceress 350        # read parchment 90 next to four monsters, screenshot 350 ms later

`?debug` exposes `window.__nst = { game }` so scripts can drive the game. WebGL comes from SwiftShader (software), so it
is slow but it renders. The three.js checkout is newer than the version in package.json (0.170); for screenshots that
does not matter.

`edflow.mjs` drives the map editor (`editor.html`): new Cave map, paints a start, ground and two monsters, presses Play and checks the game
loaded the map (`node edflow.mjs`, screenshots in /tmp).

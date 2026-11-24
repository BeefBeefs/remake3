import { defineConfig } from 'vite';

// base './' so the build works from any sub-path (GitHub Pages project sites, elderwild.net/<dir>, ...).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022', // viewer.ts uses top-level await
    rollupOptions: {
      input: { main: 'index.html', viewer: 'viewer.html', gui: 'gui.html', editor: 'editor.html' },
    },
  },
});

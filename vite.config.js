import { defineConfig } from 'vite';

// Served from https://paul-wk.github.io/kenawrua-river-mapping/ (a project page, not a user/org
// root page) — every asset URL needs this subpath prefix or the deployed build 404s on its own
// JS/CSS. Only applies to the production build; the local dev server still runs at the root.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/kenawrua-river-mapping/' : '/',
  server: { port: 5173, open: true },
  build: { outDir: 'dist', sourcemap: true }
});

import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Dev / preview only: forward /api to a local MOTHER so the GUI can use relative URLs
// exactly like behind the production nginx proxy (see nginx.conf).
//   MOTHER_URL=http://127.0.0.1:8000 npm run dev
// The production bundle has no plugins and default build options besides the two HTML entry points.
// JSX uses the automatic runtime (same as vitest.config.js), so a file without
// `import React` still works in the browser.
const motherUrl = process.env.MOTHER_URL || 'http://127.0.0.1:8000';
const proxy = { '/api': { target: motherUrl, changeOrigin: true } };

// Two pages: the full app and the standalone cognitive self-test (cognitive.html, no backend needed).
const page = file => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: { rollupOptions: { input: { main: page('./index.html'), cognitive: page('./cognitive.html') } } },
  server: { proxy },
  preview: { proxy },
});

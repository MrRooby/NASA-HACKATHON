import { defineConfig } from 'vite';

// Dev / preview only: forward /api to a local MOTHER so the GUI can use relative URLs
// exactly like behind the production nginx proxy (see nginx.conf).
//   MOTHER_URL=http://127.0.0.1:8000 npm run dev
// The production bundle is unaffected (no plugins, default build options).
const motherUrl = process.env.MOTHER_URL || 'http://127.0.0.1:8000';
const proxy = { '/api': { target: motherUrl, changeOrigin: true } };

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

/**
 * Version shown in the GUI ("AWERNASA v0.2.0"): APP_VERSION env, else the latest git tag
 * (`git describe --tags --abbrev=0`), else the GitHub tag being built, else package.json.
 */
export function appVersion() {
  const clean = v => String(v || '').trim().replace(/^v/, '');
  if (process.env.APP_VERSION) return clean(process.env.APP_VERSION);
  try {
    const tag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    if (tag.trim()) return clean(tag);
  } catch { /* no git or no tags (e.g. Docker build context) */ }
  if (/^v\d/.test(process.env.GITHUB_REF_NAME || '')) return clean(process.env.GITHUB_REF_NAME);
  return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
}

// Public path of the bundle: '/' for Docker/nginx and dev, '/<repo>/' for GitHub Pages
// (set by .github/workflows/pages.yml as VITE_BASE=/NASA-HACKATHON/).
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  esbuild: { jsx: 'automatic' },
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  build: { rollupOptions: { input: { main: page('./index.html'), cognitive: page('./cognitive.html') } } },
  server: { proxy },
  preview: { proxy },
});

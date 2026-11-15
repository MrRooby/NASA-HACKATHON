import { defineConfig } from 'vitest/config';
import { appVersion } from './vite.config.js';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
});

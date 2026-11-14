import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom has no ResizeObserver; the dashboard connector overlay uses one.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// No backend in tests: by default every fetch fails like an unreachable MOTHER, so the
// app runs on its built-in demo data. Tests that need MOTHER stub fetch themselves
// (see src/test/mother.js).
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed (no backend in tests)'))));
});

// Vitest runs without globals, so RTL's automatic cleanup is not registered.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

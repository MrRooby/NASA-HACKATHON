import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App.jsx';
import Providers from '../Providers.jsx';
import { fixtures } from './mother.js';

/** Render any element inside the app providers (language + settings / theme). */
export function renderWithProviders(ui, { lang } = {}) {
  return render(<Providers initialLang={lang}>{ui}</Providers>);
}

/**
 * Render the whole app (it starts on the crew screen, or on the route in the URL).
 * fetch is stubbed by src/test/setup.js (offline) unless the test calls stubMother() first.
 */
export function renderApp({ lang, url = '/' } = {}) {
  window.history.replaceState(null, '', url);
  return renderWithProviders(<App />, { lang });
}

/** Top-bar navigation button ('crew' | 'base'). */
export const navButton = id => document.querySelector(`.tb-nav [data-nav="${id}"]`);

/** Screen currently shown, read from <main data-screen>. */
export const currentScreen = () => screen.getByRole('main').getAttribute('data-screen');

/**
 * A fake useMother() state for screen tests: online with the recorded HAB-C1 report by
 * default. Pass overrides, e.g. makeMother({ mode: 'offline', online: false, report: null }).
 */
export function makeMother(overrides = {}) {
  const report = overrides.report === undefined ? fixtures.habC1 : overrides.report;
  const selectedCode = overrides.selectedCode ?? report?.subject?.code ?? 'HAB-C1';
  return {
    mode: 'online',
    online: true,
    error: null,
    status: fixtures.status,
    subjects: fixtures.subjects,
    subject: fixtures.subjects.find(item => item.code === selectedCode) || null,
    selectedCode,
    selectSubject: vi.fn(),
    period: null,
    setPeriod: vi.fn(),
    report,
    reportError: null,
    loadingReport: false,
    overview: fixtures.overview,
    lastUpdated: new Date('2026-11-14T12:00:00Z'),
    reconnect: vi.fn(),
    ...overrides,
  };
}

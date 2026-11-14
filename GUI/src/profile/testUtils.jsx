import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { I18nProvider } from '../i18n/index.js';
import { getProfile } from '../data/crewProfiles.js';
import { fixtures, jsonResponse, stubMother } from '../test/mother.js';
import habitatSol142 from '../test/fixtures/habitat_sol142.json';

// Helpers for the Profile and Crew screen tests: a `mother` object shaped like the
// useMother() state (filled from the recorded fixtures) and a fetch stub that also
// answers GET /api/habitat, which the screens ask for through useHabitat.

const reports = {
  'HAB-C1': fixtures.habC1,
  'HAB-C2': fixtures.habC2,
  'HAB-C3': fixtures.habC3,
  'HAB-C4': fixtures.habC4,
};

/** useMother() state while MOTHER answers, with `code` as the selected (viewed) person. */
export function onlineMother(code = 'HAB-C1', overrides = {}) {
  return {
    mode: 'online',
    online: true,
    error: null,
    status: fixtures.status,
    subjects: fixtures.subjects,
    subject: fixtures.subjects.find(subject => subject.code === code) || null,
    selectedCode: code,
    selectSubject: vi.fn(),
    period: null,
    setPeriod: vi.fn(),
    report: reports[code] ?? null,
    reportError: null,
    loadingReport: false,
    overview: fixtures.overview,
    lastUpdated: new Date('2026-11-14T12:00:00Z'),
    reconnect: vi.fn(),
    ...overrides,
  };
}

/** useMother() state when MOTHER is unreachable. */
export function offlineMother(overrides = {}) {
  return onlineMother(null, {
    mode: 'offline',
    online: false,
    error: { message: 'fetch failed', hint: null, status: null, kind: 'network' },
    status: null,
    subjects: [],
    subject: null,
    report: null,
    overview: null,
    lastUpdated: null,
    ...overrides,
  });
}

/** fetch stub: MOTHER fixtures plus GET /api/habitat -> `habitat` (the sol 142 fixture by default). */
export function stubBackend(habitat = habitatSol142) {
  return stubMother(url => (new URL(url, 'http://gui.test').pathname === '/api/habitat' ? jsonResponse(habitat) : undefined));
}

/**
 * Render a screen with the props every screen gets.
 * renderScreen(ProfileScreen, { session: 'HAB-C1', viewedCode: 'HAB-C2', mother, lang: 'pl' })
 * -> RTL utils + { navigate, setViewedCode, mother } (spies).
 */
export function renderScreen(Screen, { session = 'HAB-C1', viewedCode = session, mother, lang = 'en' } = {}) {
  const navigate = vi.fn();
  const setViewedCode = vi.fn();
  const motherState = mother ?? onlineMother(viewedCode);
  const utils = render(
    <I18nProvider initialLang={lang}>
      <Screen
        mother={motherState}
        session={session}
        viewedCode={viewedCode}
        setViewedCode={setViewedCode}
        navigate={navigate}
        profile={getProfile(viewedCode)}
      />
    </I18nProvider>,
  );
  return { ...utils, navigate, setViewedCode, mother: motherState };
}

// Test helpers for the home / wearables screens (not imported by the app).
import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import subjects from '../test/fixtures/subjects.json';
import overview from '../test/fixtures/organs_overview.json';
import { getProfile } from '../data/crewProfiles.js';
import { I18nProvider } from '../i18n/index.js';

export const clone = value => JSON.parse(JSON.stringify(value));

/** A stand-in for the object returned by useMother(): online with `report` unless overridden. */
export function makeMother({ report = null, mode = 'online', code = report?.subject?.code ?? 'HAB-C4', ...overrides } = {}) {
  const online = mode === 'online';
  return {
    mode,
    online,
    error: online ? null : { message: 'Cannot reach MOTHER (fetch failed)', hint: null, status: null, kind: 'network' },
    status: null,
    subjects: online ? subjects : [],
    subject: online ? subjects.find(subject => subject.code === code) || null : null,
    selectedCode: code,
    selectSubject: vi.fn(),
    period: null,
    setPeriod: vi.fn(),
    report,
    reportError: null,
    loadingReport: false,
    overview: online ? overview : null,
    lastUpdated: null,
    reconnect: vi.fn(),
    ...overrides,
  };
}

/** Props every screen gets from the App, for `viewedCode` (default: the logged-in person). */
export function screenProps({ mother, session = 'HAB-C4', viewedCode = session, ...rest } = {}) {
  return {
    mother,
    session,
    viewedCode,
    setViewedCode: vi.fn(),
    navigate: vi.fn(),
    profile: getProfile(viewedCode),
    ...rest,
  };
}

/** Render a screen inside the i18n provider; returns RTL's result plus the props used. */
export function renderScreen(Screen, props, { lang = 'en' } = {}) {
  const ui = next => <I18nProvider initialLang={lang}><Screen {...next} /></I18nProvider>;
  const utils = render(ui(props));
  return { ...utils, props, rerenderWith: next => utils.rerender(ui(next)) };
}

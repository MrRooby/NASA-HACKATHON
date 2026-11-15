import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import habC1 from '../test/fixtures/organs_HAB-C1.json';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import habitat142 from '../test/fixtures/habitat_sol142.json';
import { clone, makeMother, renderScreen, screenProps } from '../home/testUtils.jsx';
import { peekPendingFocus, setPendingFocus } from '../home/focus.js';
import HomeScreen from './HomeScreen.jsx';

vi.mock('../AstronautViewer.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockAstronautViewer }));

const habitatHook = vi.hoisted(() => ({ state: null, calls: [] }));
vi.mock('../habitat/useHabitat.js', () => {
  const useHabitat = options => {
    habitatHook.calls.push(options);
    return options.enabled === false ? { data: null, loading: false, error: null, offline: false } : habitatHook.state;
  };
  return { useHabitat, default: useHabitat };
});

beforeEach(() => {
  habitatHook.state = { data: habitat142, loading: false, error: null, offline: false };
  habitatHook.calls.length = 0;
  setPendingFocus(null);
});

const tile = id => document.querySelector(`.home-tile[data-open="${id}"]`);
const vital = id => document.querySelector(`.home-vital[data-vital="${id}"]`);
const band = id => document.querySelector(`.home-band[data-device="${id}"]`);
const notice = () => document.querySelector('.tele-notice');
const dialog = () => screen.queryByRole('dialog');
const notifIds = () => [...document.querySelectorAll('.home-notif')].map(row => row.dataset.id);

function renderHome({ mother = makeMother({ report: habC4Sol142, period: { sol: 142 } }), ...rest } = {}, options) {
  return renderScreen(HomeScreen, screenProps({ mother, ...rest }), options);
}

beforeEach(() => window.localStorage.clear());

describe('HomeScreen: layout from the team sketch (HAB-C4, sol 142)', () => {
  it('left: name, figure and the readings column; right: notifications, bands and tiles', () => {
    renderHome();
    expect(document.querySelector('.home-name-first')).toHaveTextContent('Grażyna');
    expect(document.querySelector('.home-name-last')).toHaveTextContent('Brzęczyszczykiewicz');
    expect([...document.querySelectorAll('.home-vital')].map(row => row.dataset.vital))
      .toEqual(['hr', 'spo2', 'map', 'glucose', 'sleep', 'dose']);
    expect([...document.querySelectorAll('.home-band')].map(row => row.dataset.device))
      .toEqual(['left_arm', 'right_arm', 'left_leg', 'right_leg', 'head_eeg']);
    expect([...document.querySelectorAll('.home-tile')].map(btn => btn.dataset.open))
      .toEqual(['scan', 'history', 'organs', 'tests', 'checkin', 'report']);
    expect(notice()).toBeNull();
  });

  it('readings are averaged over the bands; no limb-circulation row', () => {
    renderHome();
    expect(vital('hr')).toHaveTextContent('62bpm');
    expect(vital('spo2')).toHaveTextContent('97.2%');
    expect(vital('map')).toHaveTextContent('86mmHg');
    expect(vital('circulation')).toBeNull();
    expect(vital('dose')).toHaveTextContent('67.8mSv');
  });

  it('bands: name, state and battery', () => {
    renderHome();
    expect(band('left_leg')).toHaveTextContent('L leg');
    expect(band('left_leg')).toHaveTextContent('connected');
    expect(band('left_leg')).toHaveTextContent('94%');
    expect(band('head_eeg')).toHaveTextContent('EEG head');
  });

  it('shows the front view of the astronaut tinted by segment status', () => {
    renderHome();
    const viewer = screen.getByTestId('astronaut-viewer');
    expect(viewer).toHaveAttribute('data-front-view', 'true');
    const tint = JSON.parse(viewer.dataset.segmentStatus);
    expect(tint.left_thigh).toBe('alert');
    expect(tint.abdomen).toBe('caution');
  });

  it('the figure and the SCAN tile open the wearables screen; other tiles go to their screens', () => {
    const { props } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Open the full body scan' }));
    expect(props.navigate).toHaveBeenLastCalledWith('wearables');
    fireEvent.click(tile('scan'));
    expect(props.navigate).toHaveBeenLastCalledWith('wearables');
    fireEvent.click(tile('tests'));
    expect(props.navigate).toHaveBeenLastCalledWith('tests');
    fireEvent.click(tile('checkin'));
    expect(props.navigate).toHaveBeenLastCalledWith('profile', { viewedCode: 'HAB-C4' });
  });

  it('check-in and report are off when viewing another person', () => {
    renderHome({ session: 'HAB-C1', viewedCode: 'HAB-C4' });
    expect(tile('checkin')).toBeDisabled();
    expect(tile('report')).toBeDisabled();
    expect(tile('scan')).toBeEnabled();
  });

  it('ORGANS opens a dialog with the cards, alert first, closed by the big X', () => {
    renderHome();
    fireEvent.click(tile('organs'));
    const cards = [...dialog().querySelectorAll('.organ-card')];
    expect(cards).toHaveLength(6);
    expect(cards[0]).toHaveAttribute('data-organ', 'limbs');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(dialog()).toBeNull();
  });

  it('HISTORY says it needs the link when offline', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: null }) });
    fireEvent.click(tile('history'));
    expect(within(dialog()).getByText('History needs the link to MOTHER.')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog()).toBeNull();
  });
});

describe('HomeScreen: notifications checklist', () => {
  it('lists organ and habitat notifications for the same sol, alerts first, paged', () => {
    renderHome();
    expect(habitatHook.calls.at(-1)).toMatchObject({ sol: 142, enabled: true });
    expect(screen.getByTestId('notif-open')).toHaveTextContent('6');
    expect(notifIds()).toEqual(['organ:limbs', 'habitat:module_M1', 'habitat:farm', 'organ:kidneys']);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(notifIds()).toEqual(['habitat:cupola_1+cupola_2+cupola_3+cupola_4', 'event:evt-000483']);
    expect(screen.getByText('Scrubber fault')).toBeInTheDocument();
  });

  it('the box ticks a notification off: it moves to the end and the count drops; it stays ticked', () => {
    const { unmount } = renderHome();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as done: Limbs (circulation)' }));
    expect(screen.getByTestId('notif-open')).toHaveTextContent('5');
    expect(notifIds()[0]).toBe('habitat:module_M1');
    unmount();
    renderHome();
    expect(screen.getByTestId('notif-open')).toHaveTextContent('5');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('checkbox', { name: 'Mark as done: Limbs (circulation)' })).toHaveAttribute('aria-checked', 'true');
  });

  it('the text opens the source of the notification', () => {
    const { props } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Open: Limbs (circulation)' }));
    expect(props.navigate).toHaveBeenLastCalledWith('wearables', { screen: 'wearables', organ: 'limbs', limb: 'left_leg' });
    expect(peekPendingFocus()).toEqual({ screen: 'wearables', organ: 'limbs', limb: 'left_leg' });
    fireEvent.click(screen.getByRole('button', { name: 'Open: Habitation module M1 (C1, C2)' }));
    expect(props.navigate.mock.calls.at(-1)[0]).toBe('base');
    expect(props.navigate.mock.calls.at(-1)[1]).toMatchObject({ zone: 'module_M1', sol: 142 });
  });

  it('uses the sol of the report when mother is on the latest sol', () => {
    renderHome({ mother: makeMother({ report: habC1 }), session: 'HAB-C1' });
    expect(habitatHook.calls.at(-1)).toMatchObject({ sol: 600, enabled: true });
  });

  it('shows the empty state when nothing needs attention', () => {
    const report = clone(habC1);
    for (const card of report.organs) if (card.status === 'caution') card.status = 'ok';
    habitatHook.state = { data: { ...habitat142, zones: [], events: [] }, loading: false, error: null, offline: false };
    renderHome({ mother: makeMother({ report }), session: 'HAB-C1' });
    expect(screen.getByText('NO ACTIVE NOTIFICATIONS')).toBeInTheDocument();
    expect(screen.getByTestId('notif-open')).toHaveTextContent('0');
  });

  it('says so when only the habitat part is demo data', () => {
    habitatHook.state = { data: { ...habitat142, demo: true }, loading: false, error: { message: 'x' }, offline: true };
    renderHome();
    expect(screen.getByTestId('notif-note')).toHaveTextContent('Habitat: demo data');
  });
});

describe('HomeScreen: no live report', () => {
  it('offline: shows the demo report with the DEMO badge and the link-lost notice', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: null }) });
    expect(notice()).toHaveTextContent('LINK LOST — SHOWING DEMO DATA');
    // The demo record of HAB-C4 is the sol-142 one: the alert is part of the demo.
    expect(notifIds()[0]).toBe('organ:limbs');
    // No request for the habitat without a link: the built-in demo habitat (sol 142) is used.
    expect(habitatHook.calls.every(call => call.enabled === false)).toBe(true);
    expect(notifIds()).toContain('habitat:module_M1');
    expect(screen.queryByTestId('notif-note')).toBeNull(); // everything is demo: the badge says it
  });

  it('connecting: demo data with its own notice', () => {
    renderHome({ mother: makeMother({ mode: 'connecting', report: null }), session: 'HAB-C2' });
    expect(notice()).toHaveTextContent('ESTABLISHING LINK — SHOWING DEMO DATA');
    expect(document.querySelector('.home-name-last')).toHaveTextContent('Grzegrzułkiewicz');
    expect(notifIds()).not.toContain('organ:limbs');
  });

  it('online without a report yet: awaits telemetry and does not crash', () => {
    renderHome({ mother: makeMother({ report: null, loadingReport: true }) });
    expect(notice()).toHaveTextContent('AWAITING TELEMETRY…');
    expect(document.querySelectorAll('.home-vital[data-status="no_data"]')).toHaveLength(6);
    expect(screen.getByTestId('astronaut-viewer')).not.toHaveAttribute('data-segment-status');
    expect(habitatHook.calls.at(-1)).toMatchObject({ enabled: false });
    expect(screen.getByText('NO ACTIVE NOTIFICATIONS')).toBeInTheDocument();
  });

  it('never shows the report of another person', () => {
    renderHome({ mother: makeMother({ report: habC1, code: 'HAB-C4' }), session: 'HAB-C4' });
    expect(notice()).toHaveTextContent('AWAITING TELEMETRY…');
    expect(document.querySelectorAll('.home-vital[data-status="no_data"]')).toHaveLength(6);
  });

  it('shows a report error from MOTHER', () => {
    renderHome({ mother: makeMother({ report: null, reportError: { message: 'unknown person: HAB-C4', hint: 'see /api/subjects', status: 404, kind: 'http' } }) });
    expect(screen.getByRole('alert')).toHaveTextContent('TELEMETRY FAULT: unknown person: HAB-C4 · see /api/subjects');
  });

  it('offline with a person outside the demo crew: says there is no record', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: null }), session: 'SYN-01' });
    expect(notice()).toHaveTextContent('NO HEALTH RECORD FOR SYN-01');
    expect(document.querySelectorAll('.home-vital')).toHaveLength(6);
  });

  it('keeps the last real report when the link drops', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: habC4Sol142 }) });
    expect(notice()).toHaveTextContent('LINK LOST — SHOWING LAST RECEIVED DATA');
    expect(screen.getByTestId('notif-note')).toHaveTextContent('Habitat: demo data');
  });
});

describe('HomeScreen: Polish', () => {
  it('translates its own texts and leaves backend texts in English', () => {
    renderHome({}, { lang: 'pl' });
    expect(vital('hr')).toHaveTextContent('Tętno');
    expect(screen.getByRole('heading', { name: 'Powiadomienia' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Opaski' })).toBeInTheDocument();
    expect(tile('history')).toHaveTextContent('Historia');
    expect(screen.getByText(/^Left leg: blood flow/)).toBeInTheDocument();
  });
});

describe('HomeScreen: no duplicated sol', () => {
  it('shows only the name above the figure: no sol, status tag or data badge', () => {
    renderHome();
    const header = document.querySelector('.home-name');
    expect(header).not.toHaveTextContent(/SOL|CAUT|ALRT|SYNTHETIC|DEMO/);
  });
});

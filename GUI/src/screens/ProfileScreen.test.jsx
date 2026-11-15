import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ProfileScreen, { personalNotifications } from './ProfileScreen.jsx';
import { PSYCH_TEST_CATALOG, SURGEON_REPORT_KEY } from '../data/crewStore.js';
import { demoReport } from '../data/demoReports.js';
import { clearPendingFocus, peekPendingFocus } from '../home/focus.js';
import { offlineMother, onlineMother, renderScreen, stubBackend } from '../profile/testUtils.jsx';

const tile = id => document.querySelector(`.pf-tile[data-open="${id}"]`);
const dialog = name => screen.getByRole('dialog', { name });

/** Open a tile; returns the popup (or the check-in sub-view) as a `within` query. */
function open(id, name) {
  fireEvent.click(tile(id));
  if (id === 'checkin') return within(screen.getByRole('heading', { level: 2, name: 'Daily check-in' }).closest('section'));
  return within(dialog(name));
}
const close = () => fireEvent.click(screen.getByRole('button', { name: 'Close' }));

/** Collect something from every page of a paged popup (Pager ‹ ›). */
function everyPage(scope, collect) {
  const out = [...collect()];
  for (;;) {
    const next = scope.queryByRole('button', { name: 'Next page' });
    if (!next || next.disabled) return out;
    fireEvent.click(next);
    out.push(...collect());
  }
}

/** Render and wait for the async parts (habitat occupancy, crewStore lists) to settle. */
async function renderProfile(options) {
  const utils = renderScreen(ProfileScreen, options);
  await waitFor(() => expect(screen.getByTestId('profile-location')).not.toHaveTextContent(/^Unknown$|^Nieznane$/));
  return utils;
}

beforeEach(() => {
  stubBackend();
});

describe('ProfileScreen: header and personal data', () => {
  it('shows who the person is in the header', async () => {
    await renderProfile({ session: 'HAB-C2' });
    expect(screen.getByRole('heading', { level: 1, name: 'Bogusława Grzegrzułkiewicz' })).toBeInTheDocument();
    expect(screen.getByText('Systems engineer')).toBeInTheDocument();
    expect(screen.getByTestId('profile-body')).toHaveTextContent(/^Age 39 · \d+ cm · \d+ kg$/);
    expect(screen.getByRole('img', { name: 'Photo of Bogusława Grzegrzułkiewicz' })).toHaveAttribute('src');
    expect(screen.queryByText(/ŚRUBA|FICTIONAL|SYNTHETIC|TODO/)).not.toBeInTheDocument(); // no badges or callsigns
  });

  it('falls back to the pixel avatar without a photo', async () => {
    renderScreen(ProfileScreen, { session: 'HAB-C5' });
    expect(screen.getByRole('img', { name: /^Avatar of / })).toHaveAttribute('data-code', 'C5');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('opens the personal data popup', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const data = open('data', 'Personal data');
    expect(data.getByText('Age').nextElementSibling).toHaveTextContent('39');
    expect(data.getByText('Nationality').nextElementSibling).toHaveTextContent('PL · Poland');
    expect(data.getByText('Education').nextElementSibling).toHaveTextContent(/AGH University of Krakow/);
    expect(data.getByText('Home module').nextElementSibling).toHaveTextContent('Habitation module M1');
    expect(data.getByText('Crew code').nextElementSibling).toHaveTextContent('HAB-C2');
    close();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the overall status of the MOTHER report', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveAttribute('data-status', 'caution');
    expect(within(status).getByText('[ CAUT ]')).toBeInTheDocument();
    expect(within(status).getByText('Stone risk: urine volume 1.73 L/d (< 2.5).')).toBeInTheDocument();
    expect(within(status).getByText('SOL 600')).toBeInTheDocument();
  });

  it('shows the current location from the habitat occupancy', async () => {
    await renderProfile({ session: 'HAB-C3' });
    expect(screen.getByTestId('profile-location')).toHaveTextContent('Habitation module M2');
  });

  it('falls back to the crew overview when the loaded report is someone else\'s', async () => {
    await renderProfile({ session: 'HAB-C3', mother: onlineMother('HAB-C1') });
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveAttribute('data-status', 'caution');
    expect(within(status).getByText('High sodium 146 mmol/L (dehydration pattern).')).toBeInTheDocument();
    expect(within(status).queryByText(/^SOL/)).not.toBeInTheDocument();
  });

  it('shows the built-in demo record without a link to MOTHER', async () => {
    await renderProfile({ session: 'HAB-C4', mother: offlineMother() });
    const demo = demoReport('HAB-C4');
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveAttribute('data-status', demo.overall_status);
    expect(within(status).getByText(demo.top_message)).toBeInTheDocument();
    expect(within(status).queryByText('DEMO')).not.toBeInTheDocument();
    expect(within(status).getByText(`SOL ${demo.as_of.sol}`)).toBeInTheDocument();
  });

  it('shows [ ---- ] while the report and the overview have not arrived', async () => {
    await renderProfile({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { report: null, overview: null }) });
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveAttribute('data-status', 'no_data');
    expect(within(status).getByText('[ ---- ]')).toBeInTheDocument();
    expect(within(status).getByText('Loading…')).toBeInTheDocument();
  });

  it('says there is no record when the report request failed', async () => {
    const mother = onlineMother('HAB-C1', { report: null, overview: null, reportError: { message: 'unknown person', status: 404 } });
    await renderProfile({ session: 'HAB-C1', mother });
    expect(within(screen.getByTestId('profile-status')).getByText('No health record available.')).toBeInTheDocument();
  });

  it('opens the wearable data', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    fireEvent.click(screen.getByRole('button', { name: 'Wearables' }));
    expect(navigate).toHaveBeenCalledWith('wearables');
  });

  it('has the six tiles on the own profile', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const ids = [...document.querySelectorAll('.pf-tile')].map(node => node.getAttribute('data-open'));
    expect(ids).toEqual(['checkin', 'report', 'notes', 'tests', 'notifs', 'data']);
  });
});

describe('ProfileScreen: not connected parts', () => {
  it('notes: says not connected and keeps the controls disabled', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const notes = open('notes', 'Notes');
    expect(notes.getByLabelText('New entry')).toBeDisabled();
    expect(notes.getByRole('button', { name: 'Save entry' })).toBeDisabled();
    expect(notes.getByText('No entries')).toBeInTheDocument();
    expect(notes.getByText(/not connected yet/)).toBeInTheDocument();
    expect(notes.queryByText(/TODO/)).not.toBeInTheDocument();
  });

  it('psych tests: only the PVT can be started', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const tests = open('tests', 'Psych tests');
    const start = everyPage(tests, () => tests.getAllByRole('button', { name: /^Start/ }).map(button => [button.getAttribute('aria-label'), button.disabled]));
    expect(start).toHaveLength(PSYCH_TEST_CATALOG.length);
    for (const [label, disabled] of start) {
      expect(disabled).toBe(!label.includes('PVT'));
    }
  });

  it('[ START ] of the PVT opens the tests screen', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    const tests = open('tests', 'Psych tests');
    fireEvent.click(tests.getByRole('button', { name: 'Start: Psychomotor vigilance test (PVT, reaction time)' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('tests');
  });

  it('the cognitive battery (PVT, Go/No-Go, DSST) opens the tests screen', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    open('tests', 'Psych tests');
    const battery = screen.getByTestId('cognitive-battery');
    expect(battery).toHaveTextContent(/PVT · Go\/No-Go · DSST/);
    fireEvent.click(within(battery).getByRole('button', { name: 'Cognitive tests' }));
    expect(navigate).toHaveBeenCalledWith('tests');
  });

  it('lists every catalogue test with purpose, cadence and empty results', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const tests = open('tests', 'Psych tests');
    const rows = everyPage(tests, () => [...document.querySelectorAll('.pf-test')].map(row => ({
      id: row.getAttribute('data-test-id'),
      text: row.textContent,
      last: row.querySelector('[data-cell="last"]').textContent,
      next: row.querySelector('[data-cell="next"]').textContent,
    })));
    expect(rows.map(row => row.id)).toEqual(PSYCH_TEST_CATALOG.map(test => test.id));
    rows.forEach((row, index) => {
      const test = PSYCH_TEST_CATALOG[index];
      expect(row.text).toContain(test.name.en);
      expect(row.text).toContain(test.purpose.en);
      expect(row.text).toContain(test.cadence.label.en);
      expect(row.last).toBe('—');
      expect(row.next).toBe('—');
    });
  });

  it('stores nothing while rendering', async () => {
    await renderProfile({ session: 'HAB-C2' });
    open('notes', 'Notes');
    expect(window.localStorage.length).toBe(0);
  });
});

describe('ProfileScreen: notifications', () => {
  const notificationIds = scope => everyPage(scope, () => scope.queryAllByRole('listitem').map(item => item.getAttribute('data-id')));

  it('lists the notifications of the viewed person and of their module', async () => {
    await renderProfile({ session: 'HAB-C2' });
    expect(screen.getByTestId('profile-notification-count')).toHaveTextContent('3');
    expect(notificationIds(open('notifs', 'Notifications'))).toEqual(['habitat:module_M1', 'organ:kidneys', 'event:evt-000483']);
  });

  it('leaves out other zones of the base', async () => {
    await renderProfile({ session: 'HAB-C3' }); // lives in module M2: no scrubber fault there
    const ids = notificationIds(open('notifs', 'Notifications'));
    expect(ids.some(id => id.includes('module_M1') || id.startsWith('event:'))).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(['organ:blood', 'organ:kidneys', 'organ:gut']));
  });

  it('opens the target of a notification', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    fireEvent.click(open('notifs', 'Notifications').getByRole('button', { name: /^Open: Kidneys/ }));
    expect(navigate).toHaveBeenCalledWith('wearables', { screen: 'wearables', organ: 'kidneys' });
    expect(peekPendingFocus()).toEqual({ screen: 'wearables', organ: 'kidneys' });
    clearPendingFocus();
  });

  it('personalNotifications keeps health items and the given zones only', () => {
    const items = [
      { id: 'organ:heart', source: 'organ', target: { screen: 'wearables', organ: 'heart' } },
      { id: 'device:left_leg', source: 'device', target: { screen: 'wearables', device: 'left_leg' } },
      { id: 'habitat:farm', source: 'habitat', target: { screen: 'base', zone: 'farm' } },
      { id: 'habitat:cupolas', source: 'habitat', target: { screen: 'base', zone: 'cupola_1', zones: ['cupola_1', 'cupola_2'] } },
      { id: 'event:1', source: 'event', target: { screen: 'base', zone: null, event: 'evt-1' } },
    ];
    expect(personalNotifications(items, ['module_M1', undefined]).map(item => item.id)).toEqual(['organ:heart', 'device:left_leg']);
    expect(personalNotifications(items, ['cupola_2']).map(item => item.id)).toEqual(['organ:heart', 'device:left_leg', 'habitat:cupolas']);
    expect(personalNotifications(null)).toEqual([]);
  });
});

describe('ProfileScreen: own profile (check-in and flight-surgeon report)', () => {
  it('opens the check-in as a sub-view and goes back', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const checkin = open('checkin');
    expect(checkin.getByLabelText('Systolic pressure')).toHaveValue(128);
    expect(checkin.getByText('SOL 600')).toBeInTheDocument();
    expect(screen.queryByText(/read only/i)).not.toBeInTheDocument();
    fireEvent.click(checkin.getByRole('button', { name: 'Back' }));
    expect(tile('checkin')).toBeInTheDocument();
  });

  it('rates the check-in values with config/thresholds.json and confirms the commit', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const checkin = open('checkin');
    const field = checkin.getByLabelText('Systolic pressure').closest('.intake-field');
    expect(field).toHaveAttribute('data-status', 'caution');
    fireEvent.change(checkin.getByLabelText('Systolic pressure'), { target: { value: '150' } });
    expect(field).toHaveAttribute('data-status', 'alert');
    fireEvent.click(checkin.getByRole('button', { name: 'Commit entry' }));
    expect(checkin.getByRole('status')).toHaveTextContent(/Committed \d\d:\d\d UTC\. To check: \d+\./);
    fireEvent.click(checkin.getByRole('button', { name: 'Back' }));
    expect(tile('checkin')).toHaveTextContent(/Done \d\d:\d\d UTC/);
  });

  it('keeps the typed values when the check-in is closed and opened again', async () => {
    await renderProfile({ session: 'HAB-C2' });
    let checkin = open('checkin');
    fireEvent.click(checkin.getByRole('button', { name: 'Increase Systolic pressure' }));
    expect(checkin.getByLabelText('Systolic pressure')).toHaveValue(129);
    fireEvent.click(checkin.getByRole('button', { name: 'Back' }));
    checkin = open('checkin');
    expect(checkin.getByLabelText('Systolic pressure')).toHaveValue(129);
  });

  it('queues the flight-surgeon report in localStorage and shows the queued state', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const checkin = open('checkin');
    fireEvent.change(checkin.getByLabelText('Systolic pressure'), { target: { value: '150' } });
    fireEvent.click(checkin.getByRole('button', { name: 'Back' }));

    const report = open('report', 'Flight surgeon report');
    expect(screen.getByTestId('report-last')).toHaveTextContent('—');
    expect(window.localStorage.getItem(SURGEON_REPORT_KEY)).toBeNull();
    fireEvent.click(report.getByRole('button', { name: 'Share with flight surgeon' }));

    expect(await report.findByRole('button', { name: 'Report queued' })).toBeInTheDocument();
    expect(report.getByRole('status')).toHaveTextContent(/Queued on this terminal/);
    await waitFor(() => expect(screen.getByTestId('report-last')).toHaveTextContent(/\d{4}-\d\d-\d\d \d\d:\d\d UTC/));

    const stored = JSON.parse(window.localStorage.getItem('orbit-health-report'));
    expect(stored.crewCode).toBe('HAB-C2');
    expect(stored.crew).toMatchObject({ code: 'HAB-C2', name: 'Bogusława Grzegrzułkiewicz', fictional: true });
    expect(stored.mission).toBe('MARS-LT-ELYSIUM');
    expect(stored.sol).toBe(600);
    expect(stored.indicators).toHaveLength(8);
    expect(stored.indicators.find(item => item.id === 'sbp')).toMatchObject({ value: 150, status: 'alert' });
    expect(stored.disclaimer).toMatch(/demonstration/i);
    expect(stored.mother).toMatchObject({ subject: 'HAB-C2', overall_status: 'caution', as_of: { sol: 600 } });
    expect(stored.mother.organs).toHaveLength(10);
    expect(stored.mother.organs.find(card => card.organ === 'kidneys').status).toBe('caution');
  });

  it('queues the report without the MOTHER summary (and without demo data) when offline', async () => {
    await renderProfile({ session: 'HAB-C1', mother: offlineMother() });
    const report = open('report', 'Flight surgeon report');
    expect(report.getByText('No link')).toBeInTheDocument();
    fireEvent.click(report.getByRole('button', { name: 'Share with flight surgeon' }));
    await report.findByRole('button', { name: 'Report queued' });
    const stored = JSON.parse(window.localStorage.getItem(SURGEON_REPORT_KEY));
    expect(stored.crewCode).toBe('HAB-C1');
    expect(stored.mother).toBeUndefined();
    expect(stored.sol).toBeNull(); // the sol of the demo record is not real
    expect(stored.indicators).toHaveLength(8);
  });

  it('adds the symptom of the committed check-in to the report', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const checkin = open('checkin');
    fireEvent.click(checkin.getByRole('button', { name: /3 · Mind/ }));
    fireEvent.click(checkin.getByRole('button', { name: 'Headache' }));
    fireEvent.click(checkin.getByRole('button', { name: 'Commit entry' }));
    fireEvent.click(checkin.getByRole('button', { name: 'Back' }));
    fireEvent.click(open('report', 'Flight surgeon report').getByRole('button', { name: 'Share with flight surgeon' }));
    await screen.findByRole('button', { name: 'Report queued' });
    expect(JSON.parse(window.localStorage.getItem(SURGEON_REPORT_KEY)).symptoms).toBe('HEADACHE');
  });

  it('shows a report queued earlier by the same person', async () => {
    window.localStorage.setItem(SURGEON_REPORT_KEY, JSON.stringify({ crewCode: 'HAB-C2', createdAt: '2039-05-26T21:00:00.000Z', indicators: [] }));
    await renderProfile({ session: 'HAB-C2' });
    open('report', 'Flight surgeon report');
    await waitFor(() => expect(screen.getByTestId('report-last')).toHaveTextContent('2039-05-26 21:00 UTC'));
    expect(screen.getByRole('button', { name: 'Share with flight surgeon' })).toBeInTheDocument();
  });

  it('says so when the report cannot be stored', async () => {
    await renderProfile({ session: 'HAB-C2' });
    open('report', 'Flight surgeon report');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota exceeded'); };
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Share with flight surgeon' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/The report was not queued\..*quota exceeded/);
      expect(screen.queryByRole('button', { name: 'Report queued' })).not.toBeInTheDocument();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('ProfileScreen: another person (read only)', () => {
  it('shows the read-only strip and hides the forms', async () => {
    await renderProfile({ session: 'HAB-C1', viewedCode: 'HAB-C4' });
    expect(screen.getByText('Viewing Grażyna Brzęczyszczykiewicz — read only')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Grażyna Brzęczyszczykiewicz' })).toBeInTheDocument();
    expect(tile('checkin')).toBeNull();
    expect(tile('report')).toBeNull();
    expect(screen.queryByLabelText('Systolic pressure')).not.toBeInTheDocument();
    // no input for someone else's diary
    expect(open('notes', 'Notes').getByText(/Diary entries are private/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New entry')).not.toBeInTheDocument();
    close();
    // nobody starts a test for someone else
    const tests = open('tests', 'Psych tests');
    const buttons = everyPage(tests, () => tests.getAllByRole('button', { name: /^Start|^Cognitive/ }));
    expect(buttons.filter(button => /^Start/.test(button.getAttribute('aria-label') || ''))).toHaveLength(PSYCH_TEST_CATALOG.length);
    for (const button of buttons) expect(button).toBeDisabled();
    close();
    expect(tile('notifs')).toBeInTheDocument();
  });

  it('goes back to the own profile', async () => {
    const { navigate, setViewedCode } = await renderProfile({ session: 'HAB-C1', viewedCode: 'HAB-C4' });
    fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C1');
    expect(navigate).toHaveBeenCalledWith('profile');
  });

  it('handles a person without a crew file', async () => {
    const { setViewedCode } = renderScreen(ProfileScreen, { session: 'HAB-C1', viewedCode: 'SYN-01', mother: onlineMother('SYN-01') });
    expect(screen.getByText('No crew file for SYN-01.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C1');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });
});

describe('ProfileScreen: Polish', () => {
  it('translates the screen and the profile texts', async () => {
    await renderProfile({ session: 'HAB-C1', viewedCode: 'HAB-C2', lang: 'pl' });
    expect(screen.getByText('Inżynier systemów')).toBeInTheDocument();
    expect(screen.getByText('Przeglądasz: Bogusława Grzegrzułkiewicz — tylko do odczytu')).toBeInTheDocument();
    expect(tile('notes')).toHaveTextContent('Notatki');
    expect(tile('notifs')).toHaveTextContent('Powiadomienia');
    expect(open('data', 'Dane osobowe').getByText('PL · Polska')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    const tests = open('tests', 'Testy psych.');
    expect(tests.getAllByText(/Co tydzień/).length).toBeGreaterThan(0);
    fireEvent.click(tests.getByRole('button', { name: 'Następna strona' }));
    expect(tests.getByText(PSYCH_TEST_CATALOG[3].name.pl)).toBeInTheDocument();
  });
});


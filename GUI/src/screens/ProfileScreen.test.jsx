import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ProfileScreen, { personalNotifications } from './ProfileScreen.jsx';
import { PSYCH_TEST_CATALOG, SURGEON_REPORT_KEY } from '../data/crewStore.js';
import { demoReport } from '../data/demoReports.js';
import { clearPendingFocus, peekPendingFocus } from '../home/focus.js';
import { offlineMother, onlineMother, renderScreen, stubBackend } from '../profile/testUtils.jsx';

const panel = name => screen.getByRole('heading', { level: 2, name }).closest('section');
const queryPanel = name => screen.queryByRole('heading', { level: 2, name })?.closest('section') ?? null;

/** Render and wait for the async parts (habitat occupancy, crewStore lists) to settle. */
async function renderProfile(options) {
  const utils = renderScreen(ProfileScreen, options);
  await waitFor(() => expect(screen.getByTestId('profile-location')).not.toHaveTextContent(/^Unknown$|^Nieznane$/));
  return utils;
}

beforeEach(() => {
  stubBackend();
});

describe('ProfileScreen: crew file', () => {
  it('shows the profile fields of HAB-C2', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const file = panel('Crew file');
    expect(within(file).getByRole('heading', { level: 1, name: 'Bogusława Grzegrzułkiewicz' })).toBeInTheDocument();
    expect(within(file).queryByText(/ŚRUBA/)).not.toBeInTheDocument(); // badges and callsigns removed
    expect(within(file).getByText('Systems engineer')).toBeInTheDocument();
    expect(within(file).getByText('Age').nextElementSibling).toHaveTextContent('39');
    expect(within(file).getByText('Nationality').nextElementSibling).toHaveTextContent('PL · Poland');
    expect(within(file).getByText('Education').nextElementSibling).toHaveTextContent(/AGH University of Krakow/);
    expect(within(file).getByText('Home module').nextElementSibling).toHaveTextContent('Habitation module M1');
    expect(within(file).getByText('HAB-C2')).toBeInTheDocument();
    expect(within(file).queryByText('FICTIONAL')).not.toBeInTheDocument(); // badges and callsigns removed
    expect(within(file).getByRole('img', { name: 'Avatar of Bogusława Grzegrzułkiewicz' })).toHaveAttribute('data-code', 'C2');
  });

  it('shows the overall status of the MOTHER report, labelled synthetic', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveAttribute('data-status', 'caution');
    expect(within(status).getByText('[ CAUT ]')).toBeInTheDocument();
    expect(within(status).getByText('Stone risk: urine volume 1.73 L/d (< 2.5).')).toBeInTheDocument();
    expect(within(status).getByText('SOL 600')).toBeInTheDocument();
    expect(within(status).queryByText('SYNTHETIC')).not.toBeInTheDocument(); // badges and callsigns removed
    expect(panel('Crew file')).toHaveAttribute('data-tone', 'caution');
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

  it('shows the built-in demo record, labelled DEMO, without a link to MOTHER', async () => {
    await renderProfile({ session: 'HAB-C4', mother: offlineMother() });
    const demo = demoReport('HAB-C4');
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveAttribute('data-status', demo.overall_status);
    expect(within(status).getByText(demo.top_message)).toBeInTheDocument();
    expect(within(status).queryByText('DEMO')).not.toBeInTheDocument(); // badges and callsigns removed
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
    fireEvent.click(within(panel('Crew file')).getByRole('button', { name: 'Wearable data' }));
    expect(navigate).toHaveBeenCalledWith('wearables');
  });
});

describe('ProfileScreen: skeleton panels', () => {
  it('marks the notes panel as not connected and keeps its controls disabled', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const notes = panel('Notes / diary');
    expect(within(notes).queryByTestId('notes-todo')).toBeNull();
    expect(within(notes).getByLabelText('New entry')).toBeDisabled();
    expect(within(notes).getByRole('button', { name: 'Save entry' })).toBeDisabled();
    expect(within(notes).getByText('No entries')).toBeInTheDocument();
    expect(within(notes).getByText(/will be stored in the base database/)).toBeInTheDocument();
  });

  it('marks the questionnaires as not connected: only the PVT can be started', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const tests = panel('Psychological tests');
    expect(within(tests).queryByTestId('tests-todo')).toBeNull();
    const start = within(tests).getAllByRole('button', { name: /^Start/ });
    expect(start).toHaveLength(PSYCH_TEST_CATALOG.length);
    start.forEach((button, index) => {
      if (PSYCH_TEST_CATALOG[index].id === 'pvt') expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
    });
  });

  it('[ START ] of the PVT opens the tests screen', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    const tests = panel('Psychological tests');
    fireEvent.click(within(tests).getByRole('button', { name: 'Start: Psychomotor vigilance test (PVT, reaction time)' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('tests');
  });

  it('the cognitive battery line (PVT, Go/No-Go, DSST) opens the tests screen', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    const battery = screen.getByTestId('cognitive-battery');
    expect(battery).toHaveTextContent(/PVT · Go\/No-Go · DSST/);
    fireEvent.click(within(battery).getByRole('button', { name: 'Open cognitive tests' }));
    expect(navigate).toHaveBeenCalledWith('tests');
  });

  it('lists every catalogue test with purpose, cadence and empty results', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const rows = within(panel('Psychological tests')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.map(row => within(row).getByRole('rowheader').textContent)).toEqual(PSYCH_TEST_CATALOG.map(test => test.name.en));
    rows.forEach((row, index) => {
      const test = PSYCH_TEST_CATALOG[index];
      expect(within(row).getByText(test.purpose.en)).toBeInTheDocument();
      expect(row.querySelector('.profile-test-cadence')).toHaveTextContent(test.cadence.label.en);
      expect(row.querySelector('[data-cell="last"]')).toHaveTextContent('—');
      expect(row.querySelector('[data-cell="next"]')).toHaveTextContent('—');
    });
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('Psychomotor vigilance test (PVT, reaction time)');
  });

  it('stores nothing while rendering the skeleton', async () => {
    await renderProfile({ session: 'HAB-C2' });
    expect(window.localStorage.length).toBe(0);
  });
});

describe('ProfileScreen: notifications', () => {
  it('lists the notifications of the viewed person and of their module', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const list = within(panel('Notifications'));
    const ids = list.getAllByRole('listitem').map(item => item.getAttribute('data-id'));
    expect(ids).toEqual(['habitat:module_M1', 'organ:kidneys', 'event:evt-000483']);
    expect(screen.getByTestId('profile-notification-count')).toHaveTextContent('3');
  });

  it('leaves out other zones of the base', async () => {
    await renderProfile({ session: 'HAB-C3' }); // lives in module M2: no scrubber fault there
    const ids = within(panel('Notifications')).getAllByRole('listitem').map(item => item.getAttribute('data-id'));
    expect(ids.some(id => id.includes('module_M1') || id.startsWith('event:'))).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(['organ:blood', 'organ:kidneys', 'organ:gut']));
  });

  it('opens the target of a notification', async () => {
    const { navigate } = await renderProfile({ session: 'HAB-C2' });
    fireEvent.click(within(panel('Notifications')).getByRole('button', { name: /^Open: Kidneys/ }));
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
  it('has the daily check-in and the report panel', async () => {
    await renderProfile({ session: 'HAB-C2' });
    expect(within(panel('Daily check-in')).getByLabelText('Systolic pressure')).toHaveValue(128);
    expect(within(panel('Daily check-in')).queryByText('SIMULATED')).not.toBeInTheDocument(); // badges and callsigns removed
    expect(panel('Flight surgeon report')).toBeInTheDocument();
    expect(screen.queryByText(/read only/i)).not.toBeInTheDocument();
  });

  it('rates the check-in values with config/thresholds.json and confirms the commit', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const checkin = within(panel('Daily check-in'));
    const field = checkin.getByLabelText('Systolic pressure').closest('.intake-field');
    expect(field).toHaveAttribute('data-status', 'caution');
    fireEvent.change(checkin.getByLabelText('Systolic pressure'), { target: { value: '150' } });
    expect(field).toHaveAttribute('data-status', 'alert');
    fireEvent.click(checkin.getByRole('button', { name: 'Commit log entry' }));
    expect(checkin.getByRole('status')).toHaveTextContent(/Entry committed at \d\d:\d\d UTC\. Readings that need attention: \d+\./);
  });

  it('queues the flight-surgeon report in localStorage and shows the queued state', async () => {
    await renderProfile({ session: 'HAB-C2' });
    const report = within(panel('Flight surgeon report'));
    expect(screen.getByTestId('report-last')).toHaveTextContent('—');
    expect(window.localStorage.getItem(SURGEON_REPORT_KEY)).toBeNull();

    fireEvent.change(screen.getByLabelText('Systolic pressure'), { target: { value: '150' } });
    fireEvent.click(report.getByRole('button', { name: 'Share with flight surgeon' }));

    expect(await report.findByRole('button', { name: 'Report queued' })).toBeInTheDocument();
    expect(report.getByRole('status')).toHaveTextContent(/Report queued on this terminal/);
    await waitFor(() => expect(screen.getByTestId('report-last')).toHaveTextContent(/\d{4}-\d\d-\d\d \d\d:\d\d UTC/));

    const stored = JSON.parse(window.localStorage.getItem('orbit-health-report'));
    expect(stored.crewCode).toBe('HAB-C2');
    expect(stored.crew).toMatchObject({ code: 'HAB-C2', name: 'Bogusława Grzegrzułkiewicz', fictional: true });
    expect(stored.mission).toBe('MARS-LT-ELYSIUM');
    expect(stored.sol).toBe(600);
    expect(stored.indicators).toHaveLength(8);
    expect(stored.indicators.find(item => item.id === 'sbp')).toMatchObject({ value: 150, status: 'alert' });
    expect(stored.disclaimer).toMatch(/demonstration/i);
    // live organ status of MOTHER, as in the first GUI
    expect(stored.mother).toMatchObject({ subject: 'HAB-C2', overall_status: 'caution', as_of: { sol: 600 } });
    expect(stored.mother.organs).toHaveLength(10);
    expect(stored.mother.organs.find(card => card.organ === 'kidneys').status).toBe('caution');
  });

  it('queues the report without the MOTHER summary (and without demo data) when offline', async () => {
    await renderProfile({ session: 'HAB-C1', mother: offlineMother() });
    const report = within(panel('Flight surgeon report'));
    expect(report.getByText('Not attached (no link)')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Symptom log'), { target: { value: 'HEADACHE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit log entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share with flight surgeon' }));
    await screen.findByRole('button', { name: 'Report queued' });
    expect(JSON.parse(window.localStorage.getItem(SURGEON_REPORT_KEY)).symptoms).toBe('HEADACHE');
  });

  it('shows a report queued earlier by the same person', async () => {
    window.localStorage.setItem(SURGEON_REPORT_KEY, JSON.stringify({ crewCode: 'HAB-C2', createdAt: '2039-05-26T21:00:00.000Z', indicators: [] }));
    await renderProfile({ session: 'HAB-C2' });
    await waitFor(() => expect(screen.getByTestId('report-last')).toHaveTextContent('2039-05-26 21:00 UTC'));
    expect(screen.getByRole('button', { name: 'Share with flight surgeon' })).toBeInTheDocument();
  });

  it('says so when the report cannot be stored', async () => {
    await renderProfile({ session: 'HAB-C2' });
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
  it('shows the read-only banner and hides the forms', async () => {
    await renderProfile({ session: 'HAB-C1', viewedCode: 'HAB-C4' });
    expect(screen.getByText('Viewing Grażyna Brzęczyszczykiewicz — read only')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Grażyna Brzęczyszczykiewicz' })).toBeInTheDocument();
    expect(queryPanel('Daily check-in')).toBeNull();
    expect(queryPanel('Flight surgeon report')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share with flight surgeon' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Systolic pressure')).not.toBeInTheDocument();
    // skeleton panels stay, without an input for someone else's diary
    expect(within(panel('Notes / diary')).getByText(/Diary entries are private/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New entry')).not.toBeInTheDocument();
    expect(within(panel('Psychological tests')).getAllByRole('row')).toHaveLength(6);
    // nobody starts a test for someone else
    for (const button of within(panel('Psychological tests')).getAllByRole('button')) expect(button).toBeDisabled();
    expect(panel('Notifications')).toBeInTheDocument();
  });

  it('goes back to the own profile', async () => {
    const { navigate, setViewedCode } = await renderProfile({ session: 'HAB-C1', viewedCode: 'HAB-C4' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to my profile' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C1');
    expect(navigate).toHaveBeenCalledWith('profile');
  });

  it('handles a person without a crew file', async () => {
    const { setViewedCode } = renderScreen(ProfileScreen, { session: 'HAB-C1', viewedCode: 'SYN-01', mother: onlineMother('SYN-01') });
    expect(screen.getByText('No crew file for SYN-01.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to my profile' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C1');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });
});

describe('ProfileScreen: Polish', () => {
  it('translates the screen and the profile texts', async () => {
    await renderProfile({ session: 'HAB-C1', viewedCode: 'HAB-C2', lang: 'pl' });
    expect(panel('Akta załogi')).toBeInTheDocument();
    expect(panel('Notatki / pamiętnik')).toBeInTheDocument();
    expect(panel('Testy psychologiczne')).toBeInTheDocument();
    expect(panel('Powiadomienia')).toBeInTheDocument();
    expect(screen.getByText('Inżynier systemów')).toBeInTheDocument();
    expect(screen.getByText('PL · Polska')).toBeInTheDocument();
    expect(screen.getByText('Przeglądasz: Bogusława Grzegrzułkiewicz — tylko do odczytu')).toBeInTheDocument();
    expect(screen.getByText(PSYCH_TEST_CATALOG[2].name.pl)).toBeInTheDocument();
    expect(screen.getAllByText('Co tydzień').length).toBeGreaterThan(0);
  });
});

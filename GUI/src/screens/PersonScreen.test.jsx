import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/index.js';
import { fixtures, jsonResponse, stubMother } from '../test/mother.js';
import habitatSol142 from '../test/fixtures/habitat_sol142.json';
import { listMeasurements } from '../shared/measurements.js';
import { REPORT_STORAGE_KEY } from '../checkin/thresholdLogic.js';
import PersonScreen, { organForSegment, worstOrgan } from './PersonScreen.jsx';

vi.mock('../body/BodyModel.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockBodyModel }));

const subject = code => fixtures.subjects.find(item => item.code === code) || null;

function onlineMother(code, report) {
  return {
    mode: 'online', online: true, error: null, status: fixtures.status, subjects: fixtures.subjects, subject: subject(code),
    selectedCode: code, selectSubject: vi.fn(), period: null, setPeriod: vi.fn(), report, reportError: null,
    loadingReport: false, overview: fixtures.overview, lastUpdated: new Date(), reconnect: vi.fn(),
  };
}

const offlineMother = () => ({
  ...onlineMother(null, null), mode: 'offline', online: false, subjects: [], subject: null, overview: null,
  error: { message: 'fetch failed', kind: 'network' },
});

/** MOTHER fixtures + GET /api/habitat; never answers a write. */
function stubBackend() {
  return stubMother(url => {
    const { pathname } = new URL(url, 'http://gui.test');
    if (pathname === '/api/habitat') return jsonResponse(habitatSol142);
    return undefined;
  });
}

function renderPerson({ route = {}, mother = onlineMother('HAB-C4', fixtures.habC4Sol142), lang = 'en' } = {}) {
  const navigate = vi.fn();
  const fullRoute = { screen: 'person', code: 'HAB-C4', organ: null, room: null, test: null, ...route };
  const utils = render(<I18nProvider initialLang={lang}><PersonScreen mother={mother} route={fullRoute} navigate={navigate} /></I18nProvider>);
  return { ...utils, navigate, route: fullRoute };
}

const panel = () => document.querySelector('.organ-panel');

describe('PersonScreen helpers', () => {
  it('picks the worst organ, contract order on ties', () => {
    expect(worstOrgan({ brain: 'ok', kidneys: 'caution', limbs: 'alert' })).toBe('limbs');
    expect(worstOrgan({ brain: 'ok', eyes: 'no_data', heart: 'caution', kidneys: 'caution' })).toBe('heart');
    expect(worstOrgan({})).toBe('brain');
  });

  it('maps a body segment to the worst of its organs, first organ on ties', () => {
    expect(organForSegment('head', { brain: 'ok', eyes: 'no_data' })).toBe('brain');
    expect(organForSegment('head', { brain: 'ok', eyes: 'caution' })).toBe('eyes');
    expect(organForSegment('chest', {})).toBe('heart');
    expect(organForSegment('left_thigh', { musculoskeletal: 'no_data', limbs: 'alert' })).toBe('limbs');
    expect(organForSegment('neck', {})).toBeNull();
  });
});

describe('PersonScreen', () => {
  it('shows the person header and opens the worst organ by default (HAB-C4 sol 142: limbs alert)', async () => {
    stubBackend();
    renderPerson();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Grażyna Brzęczyszczykiewicz');
    expect(screen.getByText('«ZNACHOR»')).toBeInTheDocument();
    expect(screen.getByTestId('person-sol')).toHaveTextContent('SOL 142');
    expect(panel()).toHaveAttribute('data-organ', 'limbs');
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Limbs' })).toBeInTheDocument();
    // DO NOW strip with MOTHER's action
    expect(within(panel()).getByRole('alert')).toHaveTextContent(/DO NOW.*Inspect the limb/);
    // Range-bar rows of the checks
    expect(screen.getByTestId('metric-m:perfusion_left_leg')).toHaveAttribute('data-status', 'alert');
    // Body model: not rotating, interactive, limb segments selected and coloured
    const model = screen.getByTestId('body-model');
    expect(model).toHaveAttribute('data-auto-rotate', 'false');
    expect(model).toHaveAttribute('data-interactive', 'true');
    expect(model.getAttribute('data-selected')).toContain('left_foot');
    expect(JSON.parse(model.getAttribute('data-segment-status')).left_foot).toBe('alert');
    expect(screen.getByText('SYNTHETIC')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.person-where')).toBeInTheDocument());
  });

  it('opens an organ from the organ strip through the route', () => {
    stubBackend();
    const { navigate, route } = renderPerson();
    const strip = screen.getByRole('navigation', { name: 'Organs' });
    const kidneys = within(strip).getByRole('button', { name: /Kidneys & urine/ });
    expect(kidneys).toHaveAttribute('data-status', 'caution');
    fireEvent.click(within(strip).getByRole('button', { name: /^Heart/ }));
    expect(navigate).toHaveBeenCalledWith({ ...route, organ: 'heart' });
  });

  it('maps a click on the head segment to the brain', () => {
    stubBackend();
    const { navigate } = renderPerson();
    fireEvent.click(screen.getByRole('button', { name: 'model segment head' }));
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ screen: 'person', code: 'HAB-C4', organ: 'brain' }));
  });

  it('shows the organs of the same body part as tabs', () => {
    stubBackend();
    const { navigate } = renderPerson({ route: { organ: 'eyes' } });
    const tabs = within(panel()).getByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Brain & mind', 'Eyes']);
    expect(within(tabs).getByRole('tab', { name: /Eyes/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(tabs).getByRole('tab', { name: /Brain/ }));
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ organ: 'brain' }));
  });

  it('saves a measurement from an action card and shows SAVED and its rating', () => {
    stubBackend();
    renderPerson({ route: { organ: 'heart' } });
    fireEvent.click(within(panel()).getByRole('button', { name: /Blood pressure/ }));
    const card = screen.getByRole('region', { name: 'Blood pressure' });
    const systolic = within(card).getByRole('spinbutton', { name: 'Systolic' });
    fireEvent.change(systolic, { target: { value: '150' } });
    expect(within(card).getAllByText('ALERT').length).toBeGreaterThan(0);
    fireEvent.click(within(card).getByRole('button', { name: 'More Diastolic' }));
    fireEvent.click(within(card).getByRole('button', { name: /SAVE/ }));
    expect(within(card).getByTestId('saved')).toHaveTextContent('SAVED');
    const [entry] = listMeasurements({ code: 'HAB-C4', kind: 'bp' });
    expect(entry.values).toEqual({ systolic: 150, diastolic: 77 });
    expect(entry.sol).toBe(142);
    // Out of range: no save
    fireEvent.change(systolic, { target: { value: '400' } });
    expect(within(card).getByRole('alert')).toHaveTextContent('Allowed 60–240 mmHg');
    expect(within(card).getByRole('button', { name: /SAVE/ })).toBeDisabled();
  });

  it('logs water by tapping cups', () => {
    stubBackend();
    renderPerson({ route: { organ: 'kidneys' } });
    fireEvent.click(within(panel()).getByRole('button', { name: /^Water/ }));
    const cups = screen.getByRole('group', { name: 'Water' });
    fireEvent.click(within(cups).getAllByRole('button')[0]);
    fireEvent.click(within(cups).getAllByRole('button')[0]);
    expect(listMeasurements({ code: 'HAB-C4', kind: 'water' }).map(entry => entry.values.ml)).toEqual([250, 250]);
    expect(within(cups).getAllByRole('button').filter(cup => cup.dataset.filled === 'true')).toHaveLength(2);
  });

  it('swaps the panel to the explanation on WHY? and back', () => {
    stubBackend();
    renderPerson({ route: { organ: 'kidneys' } });
    expect(screen.queryByTestId('why-view')).not.toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'WHY?' }));
    const why = screen.getByTestId('why-view');
    expect(why).toHaveTextContent('Bone calcium + too little water');
    expect(why).toHaveTextContent('AUA 2014 kidney stone guideline');
    expect(screen.queryByTestId('metric-m:stone_risk')).not.toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'BACK' }));
    expect(screen.getByTestId('metric-m:stone_risk')).toBeInTheDocument();
  });

  it('enlarges a sparkline into a chart in the same area', async () => {
    stubBackend();
    renderPerson({ route: { organ: 'kidneys' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open trend: Hydration' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Open trend: Hydration' }));
    expect(document.querySelector('.trend-chart')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /READINGS/ }));
    expect(document.querySelector('.trend-chart')).not.toBeInTheDocument();
  });

  it('starts the cognitive tests from the brain panel', () => {
    stubBackend();
    const { navigate } = renderPerson({ route: { organ: 'brain' } });
    expect(screen.getByTestId('cog-mini-pvt')).toHaveTextContent('BASELINE 0/3');
    fireEvent.click(within(panel()).getByRole('button', { name: /Quick PVT/ }));
    expect(navigate).toHaveBeenLastCalledWith({ screen: 'test', code: 'HAB-C4', test: 'quick' });
    fireEvent.click(within(panel()).getByRole('button', { name: /Full battery/ }));
    expect(navigate).toHaveBeenLastCalledWith({ screen: 'test', code: 'HAB-C4', test: 'full' });
  });

  it('falls back to the DEMO report offline and never stamps entries with the demo sol', () => {
    renderPerson({ mother: offlineMother(), route: { organ: 'lungs' } });
    expect(within(document.querySelector('.person-head')).getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByTestId('person-sol')).toHaveTextContent('SOL 142');
    fireEvent.click(within(panel()).getByRole('button', { name: /Oxygen/ }));
    fireEvent.click(screen.getByRole('button', { name: /SAVE/ }));
    expect(listMeasurements({ code: 'HAB-C4', kind: 'spo2' })[0].sol).toBeNull();
  });

  it('shows an awaiting-telemetry state while the report is missing', () => {
    stubBackend();
    renderPerson({ mother: onlineMother('HAB-C4', null) });
    expect(screen.getByTestId('awaiting')).toHaveTextContent('AWAITING TELEMETRY');
    expect(screen.getByTestId('person-sol')).toHaveTextContent('SOL —');
  });

  it('queues a flight-surgeon report from the header', () => {
    stubBackend();
    renderPerson();
    fireEvent.click(screen.getByRole('button', { name: /REPORT/ }));
    expect(screen.getByText('Flight surgeon report')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('report-send'));
    expect(screen.getByTestId('report-queued')).toHaveTextContent('QUEUED');
    const stored = JSON.parse(window.localStorage.getItem(REPORT_STORAGE_KEY));
    expect(stored.crew.code).toBe('HAB-C4');
    expect(stored.mother.overall_status).toBe('alert');
  });

  it('is translated to Polish', () => {
    stubBackend();
    renderPerson({ lang: 'pl', route: { organ: 'kidneys' } });
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Nerki i mocz' })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: /Kolor moczu/ })).toBeInTheDocument();
  });
});

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

const limbCard = limb => document.querySelector(`.limb-card[data-limb="${limb}"]`);
const notice = () => document.querySelector('.tele-notice');
const field = (card, name) => card.querySelector(`[data-field="${name}"]`);

function renderHome({ mother = makeMother({ report: habC4Sol142, period: { sol: 142 } }), ...rest } = {}, options) {
  return renderScreen(HomeScreen, screenProps({ mother, ...rest }), options);
}

describe('HomeScreen: wearable data (HAB-C4, sol 142)', () => {
  it('shows the four limb cards with the values of the report', () => {
    renderHome();
    expect(document.querySelectorAll('.limb-card')).toHaveLength(4);

    const leftLeg = limbCard('left_leg');
    expect(within(leftLeg).getByRole('heading', { name: 'Left leg' })).toBeInTheDocument();
    expect(leftLeg).toHaveAttribute('data-status', 'alert');
    expect(within(leftLeg).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(field(leftLeg, 'circulation')).toHaveTextContent('25 %');
    expect(within(leftLeg).getByRole('meter', { name: 'Circulation: Left leg' })).toHaveAttribute('aria-valuenow', '25');
    expect(field(leftLeg, 'hr')).toHaveTextContent('62 bpm');
    expect(field(leftLeg, 'spo2')).toHaveTextContent('97 %');
    expect(field(leftLeg, 'pi')).toHaveTextContent('0.25');
    expect(field(leftLeg, 'skin')).toHaveTextContent('33 °C');
    expect(field(leftLeg, 'band')).toHaveTextContent('connected');
    expect(field(leftLeg, 'band')).toHaveTextContent('94 %');
    expect(within(leftLeg).getByRole('meter', { name: 'Battery: Left leg' })).toHaveAttribute('aria-valuenow', '94');
    expect(field(leftLeg, 'message')).toHaveTextContent(/^Left leg: blood flow \(perfusion\) 25% of the other limbs/);

    for (const limb of ['left_arm', 'right_arm', 'right_leg']) {
      const card = limbCard(limb);
      expect(card).toHaveAttribute('data-status', 'ok');
      expect(within(card).getByText('[ OK ]')).toBeInTheDocument();
      expect(field(card, 'circulation')).toHaveTextContent('100 %');
      expect(field(card, 'pi')).toHaveTextContent('1');
      expect(field(card, 'message')).toBeNull();
    }
  });

  it('places each card on the screen side where the limb is drawn (the astronaut faces the viewer)', () => {
    renderHome();
    expect(limbCard('right_arm')).toHaveAttribute('data-corner', 'tl');
    expect(limbCard('left_arm')).toHaveAttribute('data-corner', 'tr');
    expect(limbCard('right_leg')).toHaveAttribute('data-corner', 'bl');
    expect(limbCard('left_leg')).toHaveAttribute('data-corner', 'br');
  });

  it('labels the panel with the crew member, the sol and the SYNTHETIC badge', () => {
    renderHome();
    const panel = screen.getByRole('heading', { name: 'Wearable data' }).closest('section');
    expect(panel).toHaveAttribute('data-tone', 'alert');
    expect(within(panel).getByText('Grażyna Brzęczyszczykiewicz')).toBeInTheDocument();
    expect(within(panel).getByText('«ZNACHOR»')).toBeInTheDocument();
    expect(screen.getByTestId('home-sol')).toHaveTextContent('SOL 142');
    expect(within(panel).getByText('SYNTHETIC')).toBeInTheDocument();
    expect(within(panel).queryByText('DEMO')).not.toBeInTheDocument();
    expect(document.querySelector('.tele-notice')).toBeNull();
  });

  it('shows the front view of the astronaut tinted by segment status, with connector lines', () => {
    const { container } = renderHome();
    const viewer = screen.getByTestId('astronaut-viewer');
    expect(viewer).toHaveAttribute('data-front-view', 'true');
    const tint = JSON.parse(viewer.dataset.segmentStatus);
    expect(tint.left_thigh).toBe('alert');
    expect(tint.right_thigh).toBe('ok');
    expect(tint.abdomen).toBe('caution');
    expect(container.querySelectorAll('.home-connector')).toHaveLength(4);
    expect(container.querySelector('.home-connector[data-corner="br"]')).toHaveClass('home-connector-alert');
  });

  it('shows the overall status and the top message under the figure', () => {
    renderHome();
    const strip = document.querySelector('.home-strip');
    expect(strip).toHaveAttribute('data-status', 'alert');
    expect(within(strip).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(within(strip).getByText(habC4Sol142.top_message)).toBeInTheDocument();
  });

  it('clicking the figure or [ FULL BODY SCAN ] opens the wearables screen', () => {
    const { props } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Open the full body scan' }));
    expect(props.navigate).toHaveBeenLastCalledWith('wearables');
    fireEvent.click(screen.getByRole('button', { name: 'Full body scan' }));
    expect(props.navigate).toHaveBeenCalledTimes(2);
    expect(props.navigate).toHaveBeenLastCalledWith('wearables');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open the full body scan' }), { key: 'Enter' });
    expect(props.navigate).toHaveBeenCalledTimes(3);
  });
});

describe('HomeScreen: notifications', () => {
  it('lists organ and habitat notifications for the same sol, alerts first', () => {
    renderHome();
    expect(habitatHook.calls.at(-1)).toMatchObject({ sol: 142, enabled: true });
    const panel = screen.getByRole('heading', { name: 'Notifications' }).closest('section');
    expect(panel).toHaveAttribute('data-tone', 'alert');
    expect(screen.getByTestId('notif-counts')).toHaveTextContent('3 ALRT · 3 CAUT');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map(row => row.dataset.id)).toEqual([
      'organ:limbs',
      'habitat:module_M1',
      'habitat:farm',
      'organ:kidneys',
      'habitat:cupola_1+cupola_2+cupola_3+cupola_4',
      'event:evt-000483',
    ]);
    expect(within(rows[0]).getByText(/^Left leg: blood flow/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^CO2 partial pressure: peak 7\.74 mmHg/)).toBeInTheDocument();
    expect(within(rows[5]).getByText('Scrubber fault')).toBeInTheDocument();
  });

  it('[ OPEN ] navigates to the screen of the notification', () => {
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
    expect(screen.getByTestId('home-sol')).toHaveTextContent('SOL 600');
  });

  it('shows the empty state when nothing needs attention', () => {
    const report = clone(habC1);
    for (const card of report.organs) if (card.status === 'caution') card.status = 'ok';
    habitatHook.state = { data: { ...habitat142, zones: [], events: [] }, loading: false, error: null, offline: false };
    renderHome({ mother: makeMother({ report }), session: 'HAB-C1' });
    expect(screen.getByText('NO ACTIVE NOTIFICATIONS')).toBeInTheDocument();
    expect(screen.getByTestId('notif-counts')).toHaveTextContent('ALL CLEAR');
    expect(screen.getByRole('heading', { name: 'Notifications' }).closest('section')).toHaveAttribute('data-tone', 'default');
  });

  it('says so when only the habitat part is demo data', () => {
    habitatHook.state = { data: { ...habitat142, demo: true }, loading: false, error: { message: 'x' }, offline: true };
    renderHome();
    expect(screen.getByTestId('notif-counts')).toHaveTextContent('Habitat: demo data');
  });
});

describe('HomeScreen: no live report', () => {
  it('offline: shows the demo report with the DEMO badge and the link-lost notice', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: null }) });
    expect(notice()).toHaveTextContent('LINK LOST — SHOWING DEMO DATA');
    const panel = screen.getByRole('heading', { name: 'Wearable data' }).closest('section');
    expect(within(panel).getByText('DEMO')).toBeInTheDocument();
    expect(within(panel).queryByText('SYNTHETIC')).not.toBeInTheDocument();
    // The demo record of HAB-C4 is the sol-142 one: the alert is part of the demo.
    expect(limbCard('left_leg')).toHaveAttribute('data-status', 'alert');
    expect(screen.getByTestId('home-sol')).toHaveTextContent('SOL 142');
    // No request for the habitat without a link: the built-in demo habitat (sol 142) is used.
    expect(habitatHook.calls.every(call => call.enabled === false)).toBe(true);
    const rows = within(screen.getByRole('heading', { name: 'Notifications' }).closest('section')).getAllByRole('listitem');
    expect(rows.map(row => row.dataset.id)).toEqual(expect.arrayContaining(['organ:limbs', 'habitat:module_M1', 'event:evt-000483']));
    expect(screen.getByTestId('notif-counts')).not.toHaveTextContent('Habitat: demo data'); // everything is demo: the badge says it
  });

  it('connecting: demo data with its own notice', () => {
    renderHome({ mother: makeMother({ mode: 'connecting', report: null }), session: 'HAB-C2' });
    expect(notice()).toHaveTextContent('ESTABLISHING LINK — SHOWING DEMO DATA');
    expect(screen.getByText('Bogusława Grzegrzułkiewicz')).toBeInTheDocument();
    expect(limbCard('left_leg')).toHaveAttribute('data-status', 'ok');
  });

  it('online without a report yet: awaits telemetry and does not crash', () => {
    renderHome({ mother: makeMother({ report: null, loadingReport: true }) });
    expect(notice()).toHaveTextContent('AWAITING TELEMETRY…');
    expect(document.querySelectorAll('.limb-card[data-status="no_data"]')).toHaveLength(4);
    expect(screen.getByTestId('astronaut-viewer')).not.toHaveAttribute('data-segment-status');
    expect(screen.getByTestId('home-sol')).toHaveTextContent('SOL ---');
    expect(habitatHook.calls.at(-1)).toMatchObject({ enabled: false });
    expect(screen.getByText('NO ACTIVE NOTIFICATIONS')).toBeInTheDocument();
  });

  it('never shows the report of another person', () => {
    renderHome({ mother: makeMother({ report: habC1, code: 'HAB-C4' }), session: 'HAB-C4' });
    expect(notice()).toHaveTextContent('AWAITING TELEMETRY…');
    expect(document.querySelectorAll('.limb-card[data-status="no_data"]')).toHaveLength(4);
  });

  it('shows a report error from MOTHER', () => {
    renderHome({ mother: makeMother({ report: null, reportError: { message: 'unknown person: HAB-C4', hint: 'see /api/subjects', status: 404, kind: 'http' } }) });
    expect(screen.getByRole('alert')).toHaveTextContent('TELEMETRY FAULT: unknown person: HAB-C4 · see /api/subjects');
  });

  it('offline with a person outside the demo crew: says there is no record', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: null }), session: 'SYN-01' });
    expect(notice()).toHaveTextContent('NO HEALTH RECORD FOR SYN-01');
    expect(document.querySelectorAll('.limb-card')).toHaveLength(4);
  });

  it('keeps the last real report when the link drops', () => {
    renderHome({ mother: makeMother({ mode: 'offline', report: habC4Sol142 }) });
    expect(notice()).toHaveTextContent('LINK LOST — SHOWING LAST RECEIVED DATA');
    expect(screen.getByText('SYNTHETIC')).toBeInTheDocument();
    expect(screen.getByTestId('notif-counts')).toHaveTextContent('Habitat: demo data');
  });
});

describe('HomeScreen: Polish', () => {
  it('translates its own texts and leaves backend texts in English', () => {
    renderHome({}, { lang: 'pl' });
    expect(screen.getByRole('heading', { name: 'Dane z opasek' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Powiadomienia' })).toBeInTheDocument();
    expect(within(limbCard('left_leg')).getByRole('heading', { name: 'Lewa noga' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pełny skan ciała' })).toBeInTheDocument();
    expect(screen.getAllByText(/^Left leg: blood flow/).length).toBeGreaterThan(0);
  });
});

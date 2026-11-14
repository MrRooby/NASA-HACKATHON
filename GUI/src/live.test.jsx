import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from './test/renderApp.jsx';
import { fixtures, jsonResponse, requestedPaths, stubMother } from './test/mother.js';

vi.mock('react-dom/client', async () => (await import('./test/renderApp.jsx')).mockReactDomClient());
vi.mock('./AstronautViewer.jsx', async () => ({ default: (await import('./test/mocks.jsx')).MockAstronautViewer }));

const organCard = (container, organ) => container.querySelector(`.organ-card[data-organ="${organ}"]`);
const viewerSegments = () => JSON.parse(screen.getByTestId('astronaut-viewer').getAttribute('data-segment-status'));

async function renderOnline(override) {
  const fetchMock = stubMother(override);
  const utils = await renderApp();
  await screen.findByText('LIVE · MOTHER');
  await waitFor(() => expect(utils.container.querySelectorAll('.organ-card')).toHaveLength(10));
  return { ...utils, fetchMock };
}

describe('live dashboard (recorded MOTHER responses)', () => {
  it('opens the first habitat crew member and renders the 10 real organ cards', async () => {
    const { container, fetchMock } = await renderOnline();
    expect(requestedPaths(fetchMock)).toEqual(expect.arrayContaining(['/api/status', '/api/subjects', '/api/organs/HAB-C1', '/api/organs']));
    expect(screen.getByRole('combobox', { name: 'Crew member' })).toHaveValue('HAB-C1');

    const cards = [...container.querySelectorAll('.organ-card')];
    expect(cards.map(c => c.querySelector('h3').textContent)).toEqual(fixtures.habC1.organs.map(o => o.label));
    expect(organCard(container, 'kidneys')).toHaveClass('organ-caution');
    expect(organCard(container, 'eyes')).toHaveClass('organ-no_data');
    expect(within(organCard(container, 'eyes')).getByText('NO DATA')).toBeInTheDocument();

    // Headline, up to 3 metrics with units, action only when status is not ok.
    const kidneys = organCard(container, 'kidneys');
    expect(kidneys).toHaveTextContent('Stone risk: urine volume 1.81 L/d (< 2.5).');
    expect(kidneys.querySelectorAll('.organ-metric')).toHaveLength(3);
    expect(kidneys.querySelector('.metric-caution')).toHaveTextContent('Kidney stone risk (24-h urine)1risk factors');
    expect(within(kidneys).getByText(/what to do/i).parentElement).toHaveTextContent(fixtures.habC1.organs[5].action);
    expect(organCard(container, 'heart').querySelector('.organ-action')).toBeNull();
    expect(organCard(container, 'heart')).toHaveTextContent('87.82mmHg');

    // Why? toggle shows the formula / source.
    fireEvent.click(within(kidneys).getByRole('button', { name: 'Why?' }));
    expect(kidneys).toHaveTextContent(fixtures.habC1.organs[5].why);
    expect(within(kidneys).getByRole('button', { name: 'Hide why' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the overall status bar with the SYNTHETIC label and sol', async () => {
    const { container } = await renderOnline();
    const bar = container.querySelector('.live-statusbar');
    expect(bar).toHaveClass('live-statusbar-caution');
    expect(bar).toHaveTextContent(fixtures.habC1.top_message);
    expect(within(bar).getByText('SYNTHETIC')).toBeInTheDocument();
    expect(bar).toHaveTextContent('SOL 600');
    expect(screen.getByRole('spinbutton', { name: 'Sol' })).toHaveValue(600);
    expect(screen.getByRole('button', { name: 'Habitat crew C1' })).toBeInTheDocument(); // topbar tab
    expect(screen.queryByText(/good morning, john doe/i)).not.toBeInTheDocument();
  });

  it('hides the wearable list when every band is ok', async () => {
    const { container } = await renderOnline();
    expect(container.querySelector('.live-devices')).toBeNull(); // all 5 bands ok in the recording
  });

  it('lists only wearables with a problem', async () => {
    const withFault = structuredClone(fixtures.habC1);
    withFault.devices[1] = { limb: 'right_arm', state: 'disconnected', battery_pct: 3, status: 'alert', message: 'right arm band: disconnected' };
    const { container } = await renderOnline(url => (url.includes('/api/organs/HAB-C1') ? jsonResponse(withFault) : undefined));
    const devices = container.querySelectorAll('.live-device');
    expect(devices).toHaveLength(1);
    expect(devices[0]).toHaveTextContent('right arm band: disconnected');
    expect(devices[0]).toHaveTextContent('battery 3%');
    // A device problem is not an organ: the body tint stays as the limbs card says.
    expect(viewerSegments().right_hand).toBe('ok');
  });

  it('tints the 3D model from the organ cards and shows the environment badge', async () => {
    const { container } = await renderOnline();
    const segments = viewerSegments();
    expect(segments).toMatchObject({ head: 'ok', chest: 'ok', abdomen: 'caution', left_thigh: 'ok' });
    expect(container.querySelector('.env-badge')).toHaveTextContent('All 2 checks normal.');

    // Clicking a mesh opens the related organ headlines.
    fireEvent.click(screen.getByRole('button', { name: 'model segment abdomen' }));
    const panel = container.querySelector('.region-panel');
    expect(panel).toHaveTextContent('Abdomen');
    expect(panel).toHaveTextContent('Kidneys');
    expect(panel).toHaveTextContent('Stone risk: urine volume 1.81 L/d (< 2.5).');
    expect(organCard(container, 'kidneys')).toHaveClass('organ-card-highlight');
    expect(organCard(container, 'gut')).toHaveClass('organ-card-highlight');
    expect(organCard(container, 'heart')).not.toHaveClass('organ-card-highlight');
  });

  it('switching person requests that person\'s organ report', async () => {
    const { container, fetchMock } = await renderOnline();
    fireEvent.change(screen.getByRole('combobox', { name: 'Crew member' }), { target: { value: 'HAB-C4' } });
    await waitFor(() => expect(requestedPaths(fetchMock)).toContain('/api/organs/HAB-C4'));
    await waitFor(() => expect(organCard(container, 'gut')).toHaveClass('organ-caution'));
    expect(container.querySelector('.live-statusbar')).toHaveTextContent(fixtures.habC4.top_message);
    expect(screen.getByRole('combobox', { name: 'Crew member' })).toHaveValue('HAB-C4');
  });

  it('picks a person from the whole-crew grid', async () => {
    const { container, fetchMock } = await renderOnline();
    await waitFor(() => expect(container.querySelectorAll('.crew-row')).toHaveLength(18));
    const row = container.querySelector('.crew-row[data-code="HAB-C3"]');
    expect(row.querySelectorAll('.crew-dot')).toHaveLength(10);
    fireEvent.click(within(row).getByRole('button', { name: 'HAB-C3' }));
    await waitFor(() => expect(requestedPaths(fetchMock)).toContain('/api/organs/HAB-C3'));
    await waitFor(() => expect(container.querySelector('.crew-row[data-code="HAB-C3"]')).toHaveClass('crew-row-selected'));
  });

  it('jumps to sol 142 for HAB-C4 and colours only the left leg alert', async () => {
    const { container, fetchMock } = await renderOnline();
    fireEvent.change(screen.getByRole('combobox', { name: 'Crew member' }), { target: { value: 'HAB-C4' } });
    await waitFor(() => expect(container.querySelector('.live-statusbar')).toHaveTextContent(fixtures.habC4.top_message));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '142' } });
    await waitFor(() => expect(requestedPaths(fetchMock)).toContain('/api/organs/HAB-C4?sol=142'));
    await waitFor(() => expect(container.querySelector('.live-statusbar')).toHaveClass('live-statusbar-alert'));
    expect(container.querySelector('.live-statusbar')).toHaveTextContent('Left leg: blood flow (perfusion) 25% of the other limbs');
    expect(organCard(container, 'limbs')).toHaveClass('organ-alert');

    const segments = viewerSegments();
    expect([segments.left_thigh, segments.left_lower_leg, segments.left_foot]).toEqual(['alert', 'alert', 'alert']);
    for (const name of ['right_thigh', 'right_lower_leg', 'right_foot', 'left_upper_arm', 'left_hand', 'right_forearm']) {
      expect(segments[name]).toBe('ok');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Left leg' }));
    expect(container.querySelector('.region-panel')).toHaveTextContent('Limbs (circulation)');
  });

  it('includes the live organ summary in the flight surgeon report', async () => {
    await renderOnline();
    fireEvent.click(screen.getByRole('button', { name: /share with flight surgeon/i }));
    const report = JSON.parse(window.localStorage.getItem('orbit-health-report'));
    expect(report.mother).toMatchObject({ subject: 'HAB-C1', data_kind: 'synthetic', as_of: { sol: 600 }, overall_status: 'caution' });
    expect(report.mother.organs).toHaveLength(10);
    expect(report.indicators).toHaveLength(8); // self check-in data is still there
  });
});

describe('offline fallback', () => {
  it('keeps the demo dashboard with an OFFLINE badge when fetch rejects', async () => {
    const { container } = await renderApp(); // setup.js: every fetch rejects
    expect(await screen.findAllByText('OFFLINE · demo data')).not.toHaveLength(0);
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.sensor-card')).toHaveLength(4);
    expect(container.querySelector('.organ-card')).toBeNull();
    expect(screen.getByTestId('astronaut-viewer')).not.toHaveAttribute('data-segment-status');
  });

  it('goes offline with the hint when MOTHER reports its database unreachable', async () => {
    stubMother(url => (url.endsWith('/api/status')
      ? jsonResponse({ database: { reachable: false, version: null, error: 'database unreachable', hint: 'check DATABASE_URL' }, dashboard: {} })
      : undefined));
    await renderApp();
    const badges = await screen.findAllByText('OFFLINE · demo data');
    expect(badges[0].closest('.conn-badge')).toHaveAttribute('title', 'database unreachable · check DATABASE_URL');
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
  });

  it('falls back to demo data when the organ report answers 503', async () => {
    stubMother(url => (url.includes('/api/organs/') ? jsonResponse({ error: 'database unreachable', hint: 'retry later' }, { status: 503 }) : undefined));
    await renderApp();
    await screen.findAllByText('OFFLINE · demo data');
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
  });

  it('stays online and shows an error for an unknown person (404)', async () => {
    stubMother(url => (url.includes('/api/subjects')
      ? jsonResponse([{ code: 'GHOST', label: 'GHOST', kind: 'crew_health', data_kind: 'synthetic', synthetic: true }])
      : undefined));
    const { container } = await renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown person');
    expect(screen.getByRole('alert')).toHaveTextContent('unknown person: GHOST');
    expect(screen.getByText('LIVE · MOTHER')).toBeInTheDocument();
    expect(container.querySelector('.organ-card')).toBeNull();
  });
});

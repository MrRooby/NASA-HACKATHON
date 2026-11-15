import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestsScreen from './TestsScreen.jsx';
import { fillSurvey } from '../cognitive/helpers.js';
import { I18nProvider } from '../i18n/index.js';
import { getProfile } from '../data/crewProfiles.js';
import { onlineMother } from '../profile/testUtils.jsx';
import { jsonResponse, requestedPaths, stubMother } from '../test/mother.js';

const tile = (test_id, label, status, headline, n) => ({
  test_id, label, status, headline, baseline: { n, needed: 3, ready: n >= 3 }, latest: null, trend: [], next: { session_no: n + 1, stimulus_set: 'A' },
});
const cognitive = code => ({
  schema_version: 'cog-1.0',
  subject: { code, data_kind: 'synthetic' },
  disclaimer: 'Performance indicator compared with your own baseline - not a diagnosis.',
  tests: [
    tile('pvt', 'Reaction time (PVT)', 'ok', `Stable for ${code}.`, 4),
    tile('gonogo', 'Impulse control (Go/No-Go)', 'caution', 'Commission errors 18 %.', 4),
    tile('dsst', 'Processing speed (DSST)', 'no_data', 'Building your baseline (1/3)', 1),
  ],
  composite_z: null,
});

/** GET /api/cognitive/{code} from the stub; nothing is ever posted (a POST would fail the test). */
function stubCognitive() {
  return stubMother(url => {
    const match = new URL(url, 'http://gui.test').pathname.match(/^\/api\/cognitive\/([^/]+)$/);
    return match ? jsonResponse(cognitive(decodeURIComponent(match[1]))) : undefined;
  });
}

function renderTests({ session = 'HAB-C1', viewedCode = session, lang = 'en' } = {}) {
  const props = {
    mother: onlineMother(viewedCode),
    session,
    viewedCode,
    setViewedCode: vi.fn(),
    navigate: vi.fn(),
    profile: getProfile(viewedCode),
    setChromeHidden: vi.fn(),
  };
  const utils = render(<I18nProvider initialLang={lang}><TestsScreen {...props} /></I18nProvider>);
  return { ...utils, ...props };
}

describe('TestsScreen', () => {
  it('shows a terminal loading line, then the tiles of the viewed crew member without a person selector', async () => {
    const fetchMock = stubCognitive();
    renderTests({ session: 'HAB-C1' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading cognitive tests…');
    const pvt = await screen.findByTestId('tile-pvt');
    await waitFor(() => expect(pvt).toHaveTextContent('Stable for HAB-C1.'));
    expect(pvt).toHaveTextContent('[ OK ]');
    expect(screen.getByTestId('tile-gonogo')).toHaveTextContent('[ CAUT ]');
    expect(screen.getByTestId('tile-dsst')).toHaveTextContent('BUILDING BASELINE');
    expect(screen.getByRole('heading', { level: 1, name: 'Cognitive tests' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByTestId('cog-person')).toHaveTextContent(`${getProfile('HAB-C1').name} · HAB-C1`);
    expect(screen.queryByTestId('read-only-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick test/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /full battery/i })).toBeEnabled();
    expect(requestedPaths(fetchMock)).toContain('/api/cognitive/HAB-C1');
    expect(window.localStorage.getItem('cognitive.subject')).toBeNull();
  });

  it('is read only for another crew member: banner, tiles, no way to start a test', async () => {
    const fetchMock = stubCognitive();
    const { navigate, setViewedCode } = renderTests({ session: 'HAB-C1', viewedCode: 'HAB-C4' });
    const banner = screen.getByTestId('read-only-banner');
    expect(banner).toHaveTextContent('VIEWING GRAŻYNA BRZĘCZYSZCZYKIEWICZ — READ ONLY');
    const pvt = await screen.findByTestId('tile-pvt');
    await waitFor(() => expect(pvt).toHaveTextContent('Stable for HAB-C4.'));
    expect(screen.queryByRole('button', { name: /quick test/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /full battery/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(requestedPaths(fetchMock)).not.toContain('/api/cognitive/HAB-C1');

    fireEvent.click(screen.getByRole('button', { name: 'Back to my tests' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C1');
    expect(navigate).toHaveBeenCalledWith('tests');
  });

  it('hides the app chrome when a session starts running and restores it on leaving', async () => {
    const fetchMock = stubCognitive();
    const { setChromeHidden, unmount } = renderTests({ session: 'HAB-C1' });
    fireEvent.click(await screen.findByRole('button', { name: /quick test/i }));
    expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument();
    fillSurvey();
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    // screen check: 120 animation frames
    expect(await screen.findByRole('heading', { name: /screen check/i }, { timeout: 8000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(setChromeHidden).not.toHaveBeenCalledWith(true); // survey, screen check and instructions keep the chrome
    fireEvent.click(screen.getByRole('button', { name: /start practice/i }));
    expect(screen.getByTestId('cog-field')).toBeInTheDocument();
    expect(setChromeHidden).toHaveBeenLastCalledWith(true);

    unmount();
    expect(setChromeHidden).toHaveBeenLastCalledWith(false);
    // nothing was sent anywhere: only reads
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  }, 15000);

  it('is translated', async () => {
    stubCognitive();
    renderTests({ session: 'HAB-C1', viewedCode: 'HAB-C2', lang: 'pl' });
    expect(screen.getByTestId('read-only-banner')).toHaveTextContent('PODGLĄD: BOGUSŁAW GRZEGRZUŁKIEWICZ — TYLKO DO ODCZYTU');
    expect(await screen.findByRole('heading', { level: 1, name: 'Testy kognitywne' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('tile-dsst')).toHaveTextContent('BUDOWANIE POZIOMU BAZOWEGO'));
  });
});

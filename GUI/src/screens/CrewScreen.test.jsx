import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrewScreen, { ROSTER_ROWS } from './CrewScreen.jsx';
import { demoOverview } from '../data/demoReports.js';
import { fixtures, jsonResponse, stubMother } from '../test/mother.js';
import habitatSol142 from '../test/fixtures/habitat_sol142.json';
import { offlineMother, onlineMother, renderScreen, stubBackend } from '../profile/testUtils.jsx';
import { ROSTER } from '../crew/roster.js';

const grid = () => screen.getByRole('list', { name: /^(Crew|Załoga)$/ });
const tiles = () => [...grid().querySelectorAll('.crew-row')];
const tile = code => tiles().find(item => item.getAttribute('data-code') === code);
const overviewOf = code => fixtures.overview.find(entry => entry.subject.code === code);
const ORGAN_SHORT = {
  brain: 'Brain', eyes: 'Eyes', heart: 'Heart', lungs: 'Lungs', blood: 'Blood', kidneys: 'Kidneys', gut: 'Gut',
  musculoskeletal: 'Bones', limbs: 'Limbs', exposure: 'Exposure',
};

/** Render and wait for the first statuses to arrive. */
async function renderCrew(options) {
  const utils = renderScreen(CrewScreen, options);
  await waitFor(() => expect(tile('HAB-C1')).not.toHaveAttribute('data-status', 'no_data'));
  return utils;
}

vi.mock('../AstronautViewer.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockAstronautViewer }));

beforeEach(() => {
  stubBackend();
});

describe('CrewScreen: roster list', () => {
  it('shows the first ROSTER_ROWS members as big rows', async () => {
    await renderCrew({ session: 'HAB-C1' });
    expect(tiles().map(item => item.getAttribute('data-code'))).toEqual(ROSTER.slice(0, ROSTER_ROWS).map(profile => profile.code));
    expect(tile('HAB-C3')).toHaveAccessibleName('Open Roman Czarny');
    expect(tile('HAB-C3').querySelector('.crew-row-name-text')).toHaveTextContent('Roman Czarny');
    expect(tile('HAB-C3').querySelector('.crew-row-role')).toHaveTextContent('Geologist · HAB-C3');
  });

  it('steps through all ten with the up / down blocks', async () => {
    await renderCrew({ session: 'HAB-C1' });
    const up = screen.getByRole('button', { name: 'Show the previous crew member' });
    const down = screen.getByRole('button', { name: 'Show the next crew member' });
    expect(up).toBeDisabled();
    expect(down).toBeEnabled();
    fireEvent.click(down);
    expect(tiles()[0]).toHaveAttribute('data-code', 'HAB-C2');
    for (let i = 0; i < 10; i += 1) fireEvent.click(down);
    expect(tiles().map(item => item.getAttribute('data-code'))).toEqual(ROSTER.slice(-ROSTER_ROWS).map(profile => profile.code));
    expect(down).toBeDisabled();
    expect(up).toBeEnabled();
  });

  it('shows the photo, or the pixel avatar for a member without one', async () => {
    await renderCrew({ session: 'HAB-C1' });
    expect(within(tile('HAB-C3')).getByRole('img', { name: 'Avatar of Roman Czarny', hidden: true }).tagName).toBe('IMG');
    expect(tile('HAB-C5').querySelector('.crew-portrait .avatar')).not.toBeNull(); // no photo: pixel avatar
  });

  it('keeps each row short: name, role, one status, one line; no callsigns, no badges', async () => {
    await renderCrew({ session: 'HAB-C1' });
    for (const item of tiles()) {
      expect(item.querySelectorAll('.stag')).toHaveLength(1);
      expect(item.querySelectorAll('.crew-pt-line')).toHaveLength(1);
    }
    expect(screen.queryByText(/BAZALT/)).not.toBeInTheDocument();
    expect(screen.queryByText('SYNTHETIC')).not.toBeInTheDocument();
    expect(screen.getByText('Status as of the latest sol')).toBeInTheDocument();
  });

  it('marks the logged-in member as YOU', async () => {
    await renderCrew({ session: 'HAB-C3' });
    const marks = screen.getAllByTestId('crew-you');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('You');
    expect(tile('HAB-C3')).toContainElement(marks[0]);
    expect(tile('HAB-C3')).toHaveClass('crew-row-you');
    expect(tile('HAB-C1')).not.toHaveClass('crew-row-you');
  });
});

describe('CrewScreen: health from the crew overview', () => {
  it.each(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4'])('shows the overall status of %s and its top problem or place', async code => {
    await renderCrew({ session: 'HAB-C1' });
    const entry = overviewOf(code);
    expect(tile(code)).toHaveAttribute('data-status', entry.overall_status);
    expect(tile(code).querySelector('.stag')).toHaveAttribute('data-status', entry.overall_status);
    const line = tile(code).querySelector('.crew-pt-line');
    const problems = Object.entries(entry.organs).filter(([, status]) => status === 'alert' || status === 'caution');
    if (['caution', 'alert'].includes(entry.overall_status) && problems.length) {
      const worst = problems.find(([, status]) => status === 'alert') ?? problems[0];
      expect(line).toHaveTextContent(ORGAN_SHORT[worst[0]]);
      expect(line.textContent.split(/[·+]/).length).toBeLessThanOrEqual(3); // at most two organs and "+N"
    } else {
      expect(line).toHaveAttribute('data-testid', 'crew-location');
    }
  });

  it('counts alerts and cautions in the head', async () => {
    await renderCrew({ session: 'HAB-C1' });
    const alerts = tiles().filter(item => item.getAttribute('data-status') === 'alert').length;
    if (alerts) expect(screen.getByTestId('crew-count-alert')).toHaveTextContent(String(alerts));
    else expect(screen.queryByTestId('crew-count-alert')).toBeNull();
  });

  it('shows where an OK member is', async () => {
    const overview = fixtures.overview.map(entry => (entry.subject.code === 'HAB-C1' ? { ...entry, overall_status: 'ok', organs: {} } : entry));
    stubMother(url => (/\/api\/organs\/HAB-/.test(url) ? jsonResponse({ error: 'unknown' }, { status: 404 }) : new URL(url, 'http://gui.test').pathname === '/api/habitat' ? jsonResponse(habitatSol142) : undefined));
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview }) });
    await waitFor(() => expect(within(tile('HAB-C1')).getByTestId('crew-location')).toHaveTextContent('Habitation module M1'));
  });

  it('shows the built-in demo records without a link to MOTHER', async () => {
    await renderCrew({ session: 'HAB-C1', mother: offlineMother() });
    for (const entry of demoOverview()) {
      expect(tile(entry.subject.code)).toHaveAttribute('data-status', entry.overall_status);
    }
    expect(tile('HAB-C4')).toHaveAttribute('data-status', 'alert'); // the demo keeps one alert
    expect(screen.getByText('No link to MOTHER · demo data')).toBeInTheDocument();
    expect(screen.queryAllByText('DEMO')).toHaveLength(0);
  });

  it('reads the report of each person when the crew overview has not arrived', async () => {
    renderScreen(CrewScreen, { session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview: null }) });
    await waitFor(() => expect(tile('HAB-C3')).toHaveAttribute('data-status', fixtures.habC3.overall_status));
    expect(screen.queryByTestId('crew-loading')).not.toBeInTheDocument();
  });

  it('shows the loading veil while neither the overview nor the reports have arrived', async () => {
    stubMother(url => (/\/api\/organs\/HAB-/.test(url) ? new Promise(() => {}) : new URL(url, 'http://gui.test').pathname === '/api/habitat' ? jsonResponse(habitatSol142) : undefined));
    renderScreen(CrewScreen, { session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview: null }) });
    for (const item of tiles()) {
      expect(item).toHaveAttribute('data-status', 'no_data');
      expect(within(item).getByText('Loading…')).toBeInTheDocument();
    }
    expect(screen.getByTestId('crew-loading')).toHaveTextContent('Loading…');
  });

  it('shows "No record" for a member with neither an overview entry nor a report', async () => {
    stubMother(url => (url.includes('/api/organs/HAB-C2') ? jsonResponse({ error: 'unknown' }, { status: 404 }) : new URL(url, 'http://gui.test').pathname === '/api/habitat' ? jsonResponse(habitatSol142) : undefined));
    const overview = fixtures.overview.filter(entry => entry.subject.code !== 'HAB-C2');
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview }) });
    await waitFor(() => expect(within(tile('HAB-C2')).getByText('No record')).toBeInTheDocument());
    expect(tile('HAB-C2')).toHaveAttribute('data-status', 'no_data');
  });
});

describe('CrewScreen: person view', () => {
  it('opens the person view when the tile is tapped, and goes back', async () => {
    const { navigate, setViewedCode } = await renderCrew({ session: 'HAB-C1' });
    fireEvent.click(tile('HAB-C4'));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C4');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2, name: /Grażyna Brzęczyszczykiewicz/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Vitals' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the crew roster' }));
    expect(setViewedCode).toHaveBeenLastCalledWith(null);
    expect(tiles()).toHaveLength(ROSTER_ROWS);
  });

  it('writes out the person like Home: name, body size, figure, readings, facts, bands', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(tile('HAB-C3'));
    expect(screen.getByRole('heading', { level: 2, name: /Roman Czarny/ })).toBeInTheDocument();
    expect(screen.getByTestId('person-body-size')).toHaveTextContent(/cm · \d+ kg/);
    expect(screen.getByTestId('astronaut-viewer')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Vitals' })).getAllByRole('listitem')).toHaveLength(6);
    const facts = screen.getByRole('region', { name: 'Person' });
    expect(facts).toHaveTextContent('Geologist');
    expect(facts).toHaveTextContent('Habitation module M2');
    expect(screen.getByRole('region', { name: 'Bands' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Full profile/ })).toBeNull(); // read-only, no actions
  });

  it('marks YOU in the person view of the logged-in member', async () => {
    await renderCrew({ session: 'HAB-C3', mother: onlineMother('HAB-C3') });
    fireEvent.click(tile('HAB-C3'));
    expect(screen.getByTestId('crew-you')).toHaveTextContent('You');
  });

  it('shows the ten organs as a list; a reading opens its chart in a popup', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(tile('HAB-C3'));
    expect(document.querySelectorAll('.crew-organ-row')).toHaveLength(10);
    expect(document.querySelector('.crew-chart')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pulse: show details' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Resting heart rate/);
    expect(dialog.querySelector('.crew-chart')).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the checks of an organ in a popup', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(tile('HAB-C3'));
    fireEvent.click(screen.getByRole('button', { name: /^Blood: / }));
    const card = fixtures.habC3.organs.find(item => item.organ === 'blood');
    const dialog = screen.getByRole('dialog');
    const checks = within(within(dialog).getByRole('list', { name: 'Checks: Blood' })).getAllByRole('listitem');
    expect(checks.length).toBe(Math.min(card.checks.length, 5));
  });

  it('asks to connect a sensor for an organ without data', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(tile('HAB-C3'));
    fireEvent.click(screen.getByRole('button', { name: /^Bones and muscles: No data/ }));
    const box = screen.getByTestId('organ-no-data');
    expect(box).toHaveTextContent('Connect a sensor or run a test');
    expect(box).toHaveTextContent('grip strength');
    expect(box).toHaveTextContent('only an estimate by MOTHER');
  });
});

describe('CrewScreen: Polish', () => {
  it('translates labels', async () => {
    await renderCrew({ session: 'HAB-C4', lang: 'pl' });
    expect(screen.getByRole('heading', { level: 2, name: 'Załoga' })).toBeInTheDocument();
    expect(screen.getByTestId('crew-you')).toHaveTextContent('Ty');
    expect(tile('HAB-C1')).toHaveAccessibleName('Otwórz: Aleksander Polkowski');
    fireEvent.click(tile('HAB-C1'));
    expect(screen.getByRole('button', { name: 'Wróć do listy załogi' })).toHaveTextContent(/Wstecz|Wróć/);
    expect(document.querySelector('[data-organ="blood"] .crew-organ-word')).toHaveTextContent('Krew');
    expect(screen.getByRole('region', { name: 'Osoba' })).toHaveTextContent('Dowódca');
  });
});

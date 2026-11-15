import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import CrewScreen from './CrewScreen.jsx';
import { demoOverview } from '../data/demoReports.js';
import { fixtures, jsonResponse, stubMother } from '../test/mother.js';
import habitatSol142 from '../test/fixtures/habitat_sol142.json';
import { offlineMother, onlineMother, renderScreen, stubBackend } from '../profile/testUtils.jsx';

const rows = () => within(screen.getByRole('list', { name: /^(Crew roster|Lista załogi)$/ })).getAllByRole('listitem').filter(item => item.matches('.crew-member'));
const row = code => rows().find(item => item.getAttribute('data-code') === code);
const overviewOf = code => fixtures.overview.find(entry => entry.subject.code === code);

/** Render and wait for the habitat occupancy (useHabitat) to arrive. */
async function renderCrew(options) {
  const utils = renderScreen(CrewScreen, options);
  await waitFor(() => expect(screen.getAllByTestId('crew-location')[0]).not.toHaveTextContent(/^Unknown$|^Nieznane$/));
  return utils;
}

beforeEach(() => {
  stubBackend();
});

describe('CrewScreen: roster', () => {
  it('lists the four crew members in order', async () => {
    await renderCrew({ session: 'HAB-C1' });
    expect(rows().map(item => item.getAttribute('data-code'))).toEqual(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4']);
    expect(rows().map(item => within(item).getByRole('heading', { level: 3 }).textContent.replace(/\s*You$/, ''))).toEqual([
      'Aleksander Polkowski', 'Bogusława Grzegrzułkiewicz', 'Roman Czarny', 'Grażyna Brzęczyszczykiewicz',
    ]);
  });

  it('shows callsign, role, home module and avatar of each member', async () => {
    await renderCrew({ session: 'HAB-C1' });
    const c3 = within(row('HAB-C3'));
    expect(c3.queryByText(/BAZALT/)).not.toBeInTheDocument(); // badges and callsigns removed
    expect(row('HAB-C3').querySelector('.crew-member-role')).toHaveTextContent('Geologist · HAB-C3');
    expect(row('HAB-C3').querySelector('.crew-member-where')).toHaveTextContent(/Home Habitation module M2/);
    // Roman has a crew photo (src/data/crewPhotos.js); a member without one keeps the pixel avatar.
    expect(c3.getByRole('img', { name: 'Avatar of Roman Czarny' }).tagName).toBe('IMG');
    expect(within(row('HAB-C2')).getByRole('img', { name: 'Avatar of Bogusława Grzegrzułkiewicz' })).toHaveAttribute('data-code', 'C2');
  });

  it('marks the logged-in member as YOU', async () => {
    await renderCrew({ session: 'HAB-C3' });
    const marks = screen.getAllByTestId('crew-you');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('You');
    expect(row('HAB-C3')).toContainElement(marks[0]);
    expect(row('HAB-C3')).toHaveClass('crew-member-you');
    expect(row('HAB-C1')).not.toHaveClass('crew-member-you');
  });

  it('labels the crew as fictional and the statuses as synthetic', async () => {
    await renderCrew({ session: 'HAB-C1' });
    expect(screen.queryByText('Fictional crew')).toBeNull();
    expect(screen.queryByText('SYNTHETIC')).not.toBeInTheDocument(); // badges and callsigns removed
    expect(screen.getByText('Status as of the latest sol')).toBeInTheDocument();
  });
});

describe('CrewScreen: health from the crew overview', () => {
  it.each(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4'])('shows the overall status and top message of %s', async code => {
    await renderCrew({ session: 'HAB-C1' });
    const entry = overviewOf(code);
    expect(row(code)).toHaveAttribute('data-status', entry.overall_status);
    expect(row(code).querySelector('.crew-member-status .stag')).toHaveAttribute('data-status', entry.overall_status);
    expect(within(row(code)).getByText(entry.top_message)).toBeInTheDocument();
  });

  it('shows the ten organ statuses as text', async () => {
    await renderCrew({ session: 'HAB-C1' });
    const organs = within(row('HAB-C3')).getByRole('list', { name: 'Organ status of Roman Czarny' });
    const items = within(organs).getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(Object.fromEntries(items.map(item => [item.getAttribute('data-organ'), item.getAttribute('data-status')])))
      .toEqual(overviewOf('HAB-C3').organs);
    expect(items.map(item => item.querySelector('.crew-organ-word').textContent)).toEqual([
      'Brain', 'Eyes', 'Heart', 'Lungs', 'Blood', 'Kidneys', 'Gut', 'Bones', 'Limbs', 'Exposure',
    ]);
    expect(within(organs).getByLabelText('Blood: Caution')).toBeInTheDocument();
    expect(within(organs).getByLabelText('Eyes: No data')).toBeInTheDocument();
  });

  it('shows where everyone is', async () => {
    await renderCrew({ session: 'HAB-C1' });
    expect(within(row('HAB-C1')).getByTestId('crew-location')).toHaveTextContent('Habitation module M1');
    expect(within(row('HAB-C4')).getByTestId('crew-location')).toHaveTextContent('Habitation module M2');
  });

  it('shows the built-in demo records, labelled DEMO, without a link to MOTHER', async () => {
    await renderCrew({ session: 'HAB-C1', mother: offlineMother() });
    expect(rows()).toHaveLength(4);
    for (const entry of demoOverview()) {
      const item = row(entry.subject.code);
      expect(item).toHaveAttribute('data-status', entry.overall_status);
      expect(within(item).getByText(entry.top_message)).toBeInTheDocument();
    }
    expect(row('HAB-C4')).toHaveAttribute('data-status', 'alert'); // the demo keeps one alert
    expect(screen.getByText('No link to MOTHER · demo data')).toBeInTheDocument();
    expect(screen.queryAllByText('DEMO')).toHaveLength(0);
    expect(screen.queryByText('Status as of the latest sol')).not.toBeInTheDocument();
  });

  it('reads the report of each person when the crew overview has not arrived', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview: null }) });
    await waitFor(() => expect(row('HAB-C3')).toHaveAttribute('data-status', fixtures.habC3.overall_status));
    expect(screen.queryByTestId('crew-loading')).not.toBeInTheDocument();
    expect(within(row('HAB-C3')).getByText(fixtures.habC3.top_message)).toBeInTheDocument();
  });

  it('shows [ ---- ] while neither the overview nor the reports have arrived', async () => {
    stubMother(url => (/\/api\/organs\/HAB-/.test(url) ? new Promise(() => {}) : new URL(url, 'http://gui.test').pathname === '/api/habitat' ? jsonResponse(habitatSol142) : undefined));
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview: null }) });
    for (const item of rows()) {
      expect(item).toHaveAttribute('data-status', 'no_data');
      expect(within(item).getByText('Loading…')).toBeInTheDocument();
    }
    expect(screen.getByTestId('crew-loading')).toHaveTextContent('Loading…'); // grey veil over the roster
  });

  it('shows [ ---- ] for a member with neither an overview entry nor a report', async () => {
    stubMother(url => (url.includes('/api/organs/HAB-C2') ? jsonResponse({ error: 'unknown' }, { status: 404 }) : new URL(url, 'http://gui.test').pathname === '/api/habitat' ? jsonResponse(habitatSol142) : undefined));
    const overview = fixtures.overview.filter(entry => entry.subject.code !== 'HAB-C2');
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview }) });
    await waitFor(() => expect(within(row('HAB-C2')).getByText('No health record.')).toBeInTheDocument());
    expect(row('HAB-C2')).toHaveAttribute('data-status', 'no_data');
  });
});

describe('CrewScreen: actions', () => {
  it('opens the profile of a crew member', async () => {
    const { navigate, setViewedCode } = await renderCrew({ session: 'HAB-C1' });
    fireEvent.click(within(row('HAB-C3')).getByRole('button', { name: 'Profile: Roman Czarny' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C3');
    expect(navigate).toHaveBeenCalledWith('profile');
    expect(setViewedCode.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
  });

  it('opens the wearable data of a crew member', async () => {
    const { navigate, setViewedCode } = await renderCrew({ session: 'HAB-C1' });
    fireEvent.click(within(row('HAB-C4')).getByRole('button', { name: 'Wearable data: Grażyna Brzęczyszczykiewicz' }));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C4');
    expect(navigate).toHaveBeenCalledWith('wearables');
  });

  it('has both buttons on every row', async () => {
    await renderCrew({ session: 'HAB-C1' });
    for (const item of rows()) {
      expect(within(item).getByRole('button', { name: /^Profile:/ })).toBeEnabled();
      expect(within(item).getByRole('button', { name: /^Wearable data:/ })).toBeEnabled();
    }
  });
});

describe('CrewScreen: more than four crew members', () => {
  it('shows four of the ten rows and pages with the up / down blocks', async () => {
    await renderCrew({ session: 'HAB-C1' });
    const [up, down] = document.querySelectorAll('.crew-roster-step');
    expect(up).toHaveAttribute('aria-label', 'Show the previous crew member');
    expect(up).toBeDisabled(); // nothing above the first row: greyed out, still there
    expect(down).toBeEnabled();
    fireEvent.click(down);
    fireEvent.click(down);
    expect(rows().map(item => item.getAttribute('data-code'))).toEqual(['HAB-C3', 'HAB-C4', 'HAB-C5', 'HAB-C6']);
    for (let i = 0; i < 4; i += 1) fireEvent.click(down);
    expect(rows().map(item => item.getAttribute('data-code'))).toEqual(['HAB-C7', 'HAB-C8', 'HAB-C9', 'HAB-C10']);
    expect(down).toBeDisabled(); // nothing below the last row
    expect(up).toBeEnabled();
    expect(within(row('HAB-C10')).getByRole('heading', { level: 3 })).toHaveTextContent('Czesława Życińska');
  });
});

describe('CrewScreen: person view', () => {
  it('opens the person view when the row is clicked, and goes back', async () => {
    const { navigate, setViewedCode } = await renderCrew({ session: 'HAB-C1' });
    fireEvent.click(row('HAB-C4'));
    expect(setViewedCode).toHaveBeenCalledWith('HAB-C4');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2, name: /Grażyna Brzęczyszczykiewicz/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Live charts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the crew roster' }));
    expect(setViewedCode).toHaveBeenLastCalledWith(null);
    expect(rows()).toHaveLength(4);
  });

  it('opens the person view from the name button and keeps the full profile one click away', async () => {
    const { navigate } = await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(screen.getByRole('button', { name: 'Open Roman Czarny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Full profile' }));
    expect(navigate).toHaveBeenCalledWith('profile');
  });

  it('shows the checks of an organ after a click on it', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(row('HAB-C3'));
    fireEvent.click(screen.getByRole('button', { name: /^Blood: / }));
    const card = fixtures.habC3.organs.find(item => item.organ === 'blood');
    const checks = within(screen.getByRole('list', { name: 'Checks: Blood' })).getAllByRole('listitem');
    expect(checks.length).toBe(Math.min(card.checks.length, 6));
  });
});

describe('CrewScreen: Polish', () => {
  it('translates roles and labels', async () => {
    await renderCrew({ session: 'HAB-C4', lang: 'pl' });
    expect(screen.getByRole('heading', { level: 2, name: 'Lista załogi' })).toBeInTheDocument();
    expect(row('HAB-C4').querySelector('.crew-member-role')).toHaveTextContent('Lekarz misji');
    expect(screen.getByTestId('crew-you')).toHaveTextContent('Ty');
    expect(screen.queryByText('Fikcyjna załoga')).not.toBeInTheDocument(); // badges and callsigns removed
    expect(within(row('HAB-C1')).getByLabelText('Nerki: Uwaga')).toBeInTheDocument();
    expect(row('HAB-C1').querySelector('[data-organ="blood"] .crew-organ-word')).toHaveTextContent('Krew');
  });
});

describe('CrewScreen: organ without data', () => {
  it('asks to connect a sensor and names what is needed', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C3') });
    fireEvent.click(row('HAB-C3'));
    fireEvent.click(screen.getByRole('button', { name: /^Bones and muscles: No data/ }));
    const box = screen.getByTestId('organ-no-data');
    expect(box).toHaveTextContent('Connect a sensor or run a test');
    expect(box).toHaveTextContent('grip strength');
    expect(box).toHaveTextContent('only an estimate by MOTHER');
  });
});

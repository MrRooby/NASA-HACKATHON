import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import CrewScreen from './CrewScreen.jsx';
import { demoOverview } from '../data/demoReports.js';
import { fixtures } from '../test/mother.js';
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
      'Aleksander Polkowski', 'Bogusław Grzegrzułkiewicz', 'Roman Czarny', 'Grażyna Brzęczyszczykiewicz',
    ]);
  });

  it('shows callsign, role, home module and avatar of each member', async () => {
    await renderCrew({ session: 'HAB-C1' });
    const c3 = within(row('HAB-C3'));
    expect(c3.getByText(/BAZALT/)).toBeInTheDocument();
    expect(row('HAB-C3').querySelector('.crew-member-role')).toHaveTextContent('“BAZALT” · Geologist · HAB-C3');
    expect(row('HAB-C3').querySelector('.crew-member-where')).toHaveTextContent(/Home Habitation module M2/);
    expect(c3.getByRole('img', { name: 'Avatar of Roman Czarny' })).toHaveAttribute('data-code', 'C3');
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
    expect(screen.getByText('Fictional crew')).toHaveAttribute('data-kind', 'fictional');
    expect(screen.getByText('SYNTHETIC')).toBeInTheDocument();
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
    expect(items.map(item => item.textContent)).toEqual([
      'BRNOK', 'EYE--', 'HRTOK', 'LNGOK', 'BLDCA', 'KIDCA', 'GUTCA', 'MSK--', 'LMBOK', 'EXPOK',
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
    expect(screen.getAllByText('DEMO').length).toBeGreaterThan(0);
    expect(screen.queryByText('Status as of the latest sol')).not.toBeInTheDocument();
  });

  it('shows [ ---- ] for everyone while the overview has not arrived yet', async () => {
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview: null }) });
    for (const item of rows()) {
      expect(item).toHaveAttribute('data-status', 'no_data');
      expect(within(item).getByText('[ ---- ]')).toBeInTheDocument();
      expect(within(item).getByText('Loading…')).toBeInTheDocument();
      expect(within(item).getAllByRole('listitem').every(organ => organ.getAttribute('data-status') === 'no_data')).toBe(true);
    }
    expect(screen.queryByText('SYNTHETIC')).not.toBeInTheDocument();
    expect(screen.queryByText('DEMO')).not.toBeInTheDocument();
  });

  it('shows [ ---- ] for a member the overview does not list', async () => {
    const overview = fixtures.overview.filter(entry => entry.subject.code !== 'HAB-C2');
    await renderCrew({ session: 'HAB-C1', mother: onlineMother('HAB-C1', { overview }) });
    expect(row('HAB-C2')).toHaveAttribute('data-status', 'no_data');
    expect(within(row('HAB-C2')).getByText('No health record.')).toBeInTheDocument();
    expect(row('HAB-C1')).toHaveAttribute('data-status', 'caution');
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

describe('CrewScreen: Polish', () => {
  it('translates roles and labels', async () => {
    await renderCrew({ session: 'HAB-C4', lang: 'pl' });
    expect(screen.getByRole('heading', { level: 2, name: 'Lista załogi' })).toBeInTheDocument();
    expect(row('HAB-C4').querySelector('.crew-member-role')).toHaveTextContent('Lekarz misji');
    expect(screen.getByTestId('crew-you')).toHaveTextContent('Ty');
    expect(screen.getByText('Fikcyjna załoga')).toBeInTheDocument();
    expect(within(row('HAB-C1')).getByLabelText('Nerki: Uwaga')).toBeInTheDocument();
  });
});

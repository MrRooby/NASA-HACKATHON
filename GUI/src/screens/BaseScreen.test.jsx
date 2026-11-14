import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BaseScreen from './BaseScreen.jsx';
import { makeMother, renderWithProviders } from '../test/renderApp.jsx';
import { habitatRequests, stubHabitat } from '../habitat/testHelpers.js';

afterEach(() => {
  vi.useRealTimers();
});

const mapRoom = id => document.querySelector(`.hmap-room[data-room="${id}"]`);
const roomPanel = () => document.querySelector('.base-room');
const row = (root, channel) => root.querySelector(`.base-row[data-channel="${channel}"]`);

function renderBase({ mother = makeMother({ period: { sol: 142 } }), lang, navigate = vi.fn() } = {}) {
  const utils = renderWithProviders(<BaseScreen mother={mother} navigate={navigate} session="HAB-C1" viewedCode="HAB-C1" />, { lang });
  return { ...utils, mother, navigate };
}

/** BaseScreen driven by a stateful stand-in for useMother's period, like in the real app. */
function StatefulBase({ initial = null }) {
  const [period, setPeriod] = useState(initial);
  return <BaseScreen mother={makeMother({ period, setPeriod })} navigate={() => {}} />;
}

const ready = () => waitFor(() => expect(roomPanel()).toBeInTheDocument());

describe('BaseScreen', () => {
  it('opens the worst room first: module_M1 at sol 142, with the CO2 alert row', async () => {
    const fetchMock = stubHabitat();
    renderBase();
    await ready();
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142']);

    expect(roomPanel()).toHaveAttribute('data-room', 'quarters_north');
    expect(roomPanel()).toHaveAttribute('data-tone', 'alert');
    expect(within(roomPanel()).getByRole('heading', { name: 'CREW QUARTERS N' })).toBeInTheDocument();
    expect(within(roomPanel()).getByText(/module_M1 · Habitation module M1/)).toBeInTheDocument();
    expect(mapRoom('quarters_north')).toHaveClass('is-selected', 'is-alert');

    const co2 = row(roomPanel(), 'ppco2');
    expect(co2).toHaveAttribute('data-status', 'alert');
    expect(co2).toHaveAttribute('data-now', 'ok');
    expect(within(co2).getByText('CO2 partial pressure')).toBeInTheDocument();
    expect(within(co2).getByText('2.279')).toBeInTheDocument();
    expect(within(co2).getByText('mmHg')).toBeInTheDocument();
    expect(within(co2).getByText('1.826 – 7.737')).toBeInTheDocument();
    expect(within(co2).getByText('1.5 – 2.5')).toBeInTheDocument();
    expect(within(co2).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(within(co2).getByText('PEAK 7.737 · NOW OK')).toBeInTheDocument();
    expect(within(co2).getByText('21:41')).toBeInTheDocument();
    expect(within(co2).getByText('SENSORS A 2.148 · B 2.41')).toBeInTheDocument();
    expect(within(co2).getByText('SENSOR SUSPECT')).toBeInTheDocument();
    // a real room carries no SIMULATED badge
    expect(within(roomPanel()).queryByText('SIMULATED')).toBeNull();
  });

  it('groups the readings like the sketch and lists the crew present', async () => {
    stubHabitat();
    const { navigate } = renderBase();
    await ready();
    const titles = [...roomPanel().querySelectorAll('.base-group-title')].map(node => node.textContent);
    expect(titles).toEqual([
      'PRESSURE', 'AIR COMPOSITION', 'TEMPERATURE', 'HUMIDITY', 'AIR CONTAMINATION', 'RADIATION',
      'WATER', 'LIGHT & NOISE', 'STRUCTURE', 'POWER', 'OTHER',
    ]);
    const air = roomPanel().querySelector('[data-group="air"]');
    expect([...air.querySelectorAll('.base-row')].map(node => node.getAttribute('data-channel')))
      .toEqual(['o2_fraction', 'ppco2', 'ppo2_inspired']);
    expect(roomPanel().querySelectorAll('.base-row[data-channel]')).toHaveLength(19);
    // categorical channel whose fault has passed
    expect(within(row(roomPanel(), 'subsystem_status')).getByText('FAULT EARLIER THIS SOL · NOW OK')).toBeInTheDocument();
    // unrated channel: no status tag, an INFO marker instead
    expect(within(row(roomPanel(), 'voc_benzene')).getByText('INFO')).toBeInTheDocument();

    const crew = within(roomPanel()).getByRole('button', { name: /C1 Aleksander Polkowski/ });
    expect(within(roomPanel()).getByRole('button', { name: /C2 Bogusław Grzegrzułkiewicz/ })).toBeInTheDocument();
    fireEvent.click(crew);
    expect(navigate).toHaveBeenCalledWith('profile', { viewedCode: 'HAB-C1' });
  });

  it('shows the header line: habitat, atmosphere, sol, SYNTHETIC badge, overall status', async () => {
    stubHabitat();
    renderBase();
    await ready();
    expect(screen.getByRole('heading', { level: 1, name: 'Sealed lava-tube habitat, Elysium Mons region' })).toBeInTheDocument();
    const facts = screen.getByTestId('base-head-facts');
    expect(facts).toHaveTextContent('56.5 kPa · 34% O2');
    expect(facts).toHaveTextContent('SOL 142');
    expect(within(facts).getByText('SYNTHETIC')).toBeInTheDocument();
    expect(within(facts).queryByText('DEMO')).toBeNull();
    expect(within(facts).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Sol' })).toHaveValue(142);
    expect(screen.getByRole('slider')).toHaveAttribute('max', '600');
  });

  it('selecting the reactor shows the SIMULATED badge and simulated rows next to real MOTHER rows', async () => {
    stubHabitat();
    renderBase();
    await ready();
    fireEvent.click(mapRoom('reactor'));

    expect(roomPanel()).toHaveAttribute('data-room', 'reactor');
    expect(mapRoom('reactor')).toHaveAttribute('aria-pressed', 'true');
    expect(mapRoom('quarters_north')).toHaveAttribute('aria-pressed', 'false');
    const head = roomPanel().querySelector('.panel-head');
    expect(within(head).getByRole('heading', { name: 'REACTOR' })).toBeInTheDocument();
    expect(within(head).getByText('SIMULATED')).toBeInTheDocument();
    expect(within(roomPanel()).getByText(/no sensors in the MOTHER database/i)).toBeInTheDocument();

    const core = row(roomPanel(), 'core_outlet_temp');
    expect(core).toHaveClass('is-simulated');
    expect(within(core).getByText('SIMULATED')).toBeInTheDocument();
    for (const channel of ['coolant_flow', 'shield_dose_rate', 'electrical_output_gross']) {
      expect(within(row(roomPanel(), channel)).getByText('SIMULATED')).toBeInTheDocument();
    }
    // the real fission power of the surface zone is shown here too, marked as MOTHER data
    const fission = row(roomPanel(), 'power_fission');
    expect(fission).not.toHaveClass('is-simulated');
    expect(within(fission).queryByText('SIMULATED')).toBeNull();
    expect(within(fission).getByText('MOTHER · SURFACE')).toBeInTheDocument();
    expect(within(fission).getByText('40')).toBeInTheDocument();
  });

  it('selects rooms from the keyboard', async () => {
    stubHabitat();
    renderBase();
    await ready();
    const lab = screen.getByRole('button', { name: /^LAB/ });
    lab.focus();
    fireEvent.keyDown(lab, { key: 'Enter' });
    expect(roomPanel()).toHaveAttribute('data-room', 'lab');
    expect(within(roomPanel()).getByText(/lab · Laboratory/)).toBeInTheDocument();
    expect(within(roomPanel()).getByText('NOBODY')).toBeInTheDocument();
  });

  it('keeps the farm alert on its sub-zone, not on the recreation zone', async () => {
    stubHabitat();
    renderBase({ mother: makeMother({ period: null }) }); // latest sol (600): nothing worse than ok on the map
    await ready();
    expect(roomPanel()).toHaveAttribute('data-room', 'recreation');
    expect(roomPanel()).toHaveAttribute('data-tone', 'default');
    expect(mapRoom('recreation')).toHaveClass('is-ok', 'is-selected');
    expect(mapRoom('recreation').querySelector('.hmap-mark[data-subzone="farm"]')).toHaveClass('is-alert');

    const farm = roomPanel().querySelector('.base-sub[data-subzone="farm"]');
    const gym = roomPanel().querySelector('.base-sub[data-subzone="gym"]');
    expect(farm).toHaveAttribute('data-status', 'alert');
    expect(gym).toHaveAttribute('data-status', 'ok');

    // the flagged sub-zone starts open, the quiet one collapsed; both toggle
    const farmHead = within(farm).getByRole('button', { name: /FARM/ });
    const gymHead = within(gym).getByRole('button', { name: /GYM/ });
    expect(farmHead).toHaveAttribute('aria-expanded', 'true');
    expect(gymHead).toHaveAttribute('aria-expanded', 'false');
    expect(within(row(farm, 'o2_fraction')).getByText('PEAK 34.23 · NOW OK')).toBeInTheDocument();
    expect(row(gym, 'ppco2')).toBeNull();

    fireEvent.click(gymHead);
    expect(gymHead).toHaveAttribute('aria-expanded', 'true');
    expect(row(gym, 'ppco2')).toBeInTheDocument();
    fireEvent.click(farmHead);
    expect(farmHead).toHaveAttribute('aria-expanded', 'false');
    expect(row(farm, 'o2_fraction')).toBeNull();
  });

  it('lists the exterior: surface weather / radiation and the cupolas', async () => {
    stubHabitat();
    renderBase({ mother: makeMother({ period: { sol: 380 } }) });
    await ready();
    const exterior = document.querySelector('.base-exterior');
    expect(within(exterior).getByRole('heading', { name: 'EXTERIOR' })).toBeInTheDocument();
    expect([...exterior.querySelectorAll('.base-ext-zone')].map(node => node.getAttribute('data-zone')))
      .toEqual(['surface', 'cupola_1', 'cupola_2', 'cupola_3', 'cupola_4']);

    const surface = exterior.querySelector('[data-zone="surface"]');
    expect([...surface.querySelectorAll('[data-channel]')].map(node => node.getAttribute('data-channel'))).toEqual([
      'ext_temperature', 'ext_pressure', 'dust_opacity_tau', 'wind_speed', 'uv_flux', 'dose_rate', 'solar_proton_flux_10MeV',
    ]);
    expect(within(surface).getByText('Exterior temperature')).toBeInTheDocument();

    // sol 380: leak at cupola 2 (already sealed again)
    const cupola2 = exterior.querySelector('[data-zone="cupola_2"]');
    expect(within(cupola2).getByText('CUPOLA 2')).toBeInTheDocument();
    expect(within(cupola2).getAllByText('[ ALRT ]').length).toBeGreaterThanOrEqual(1);
    const leak = cupola2.querySelector('[data-channel="leak_detector"]');
    expect(within(leak).getByText('Leak detector (joint)')).toBeInTheDocument();
    expect(within(leak).getByText('OK')).toBeInTheDocument();
    expect(within(leak).getByText('FAULT EARLIER THIS SOL · NOW OK')).toBeInTheDocument();
    expect(exterior).toHaveAttribute('data-tone', 'alert');
    // the cupola alert does not colour any room on the map
    expect(document.querySelectorAll('.hmap-room.is-alert')).toHaveLength(0);
  });

  it('logs the non-routine events and collapses routine EVA traffic into a count', async () => {
    stubHabitat();
    renderBase();
    await ready();
    const log = document.querySelector('.base-events');
    expect(within(log).getByRole('heading', { name: 'EVENT LOG' })).toBeInTheDocument();
    const items = within(log).getAllByRole('listitem');
    expect(items.map(item => item.getAttribute('data-event'))).toEqual(['scrubber_fault', 'eva_end']);

    const fault = items[0];
    expect(within(fault).getByText('SCRUBBER FAULT')).toBeInTheDocument();
    expect(within(fault).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(within(fault).getByText(/MAJOR/)).toBeInTheDocument();
    expect(within(fault).getByText('02:10 – 14:10 UTC')).toBeInTheDocument();
    // an event that started on another sol and is still open
    expect(items[1]).toHaveTextContent('SOL 94 · 04-07 03:20 – OPEN UTC');
    expect(within(log).getByText('ROUTINE, NOT LISTED: 28 EVA STARTS · 30 EVA ENDS')).toBeInTheDocument();
    expect(within(log).queryByText('EVA START')).toBeNull();

    // the zone of an event jumps to its room
    fireEvent.click(mapRoom('lab'));
    expect(roomPanel()).toHaveAttribute('data-room', 'lab');
    fireEvent.click(within(fault).getByRole('button', { name: 'CREW QUARTERS N' }));
    expect(roomPanel()).toHaveAttribute('data-room', 'quarters_north');
  });

  it('writes sol changes to mother.setPeriod, the sol every screen shares', async () => {
    vi.useFakeTimers();
    stubHabitat();
    const { mother } = renderBase();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(roomPanel()).toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '380' } });
    expect(mother.setPeriod).not.toHaveBeenCalled(); // debounced
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mother.setPeriod).toHaveBeenCalledTimes(1);
    expect(mother.setPeriod).toHaveBeenCalledWith({ sol: 380 });

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(mother.setPeriod).toHaveBeenLastCalledWith(null);
  });

  it('a sol change triggers a new request and redraws the screen', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHabitat();
    renderWithProviders(<StatefulBase initial={{ sol: 142 }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142']);
    expect(roomPanel()).toHaveAttribute('data-room', 'quarters_north');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '380' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142', '/api/habitat?sol=380']);
    expect(screen.getByTestId('base-head-facts')).toHaveTextContent('SOL 380');
    // module_M1 is fine at sol 380, so the automatic selection moves on
    expect(roomPanel()).toHaveAttribute('data-room', 'recreation');
    expect(within(document.querySelector('.base-events')).getByText('LEAK')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142', '/api/habitat?sol=380', '/api/habitat']);
    expect(screen.getByTestId('base-head-facts')).toHaveTextContent('SOL 600');
  });

  it('keeps a room the user picked when the sol changes', async () => {
    vi.useFakeTimers();
    stubHabitat();
    renderWithProviders(<StatefulBase initial={{ sol: 142 }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(mapRoom('medbay'));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '380' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByTestId('base-head-facts')).toHaveTextContent('SOL 380');
    expect(roomPanel()).toHaveAttribute('data-room', 'medbay');
  });

  it('keeps its own sol when the selected person is not habitat crew (ISS is addressed by day)', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHabitat();
    const iss = { code: 'ISS-X', kind: 'iss_crew' };
    const mother = makeMother({ subject: iss, selectedCode: 'ISS-X', period: { day: 51 } });
    renderBase({ mother });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat']);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '142' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mother.setPeriod).not.toHaveBeenCalled();
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat', '/api/habitat?sol=142']);
  });

  it('falls back to the DEMO habitat when MOTHER is unreachable', async () => {
    // default fetch stub of the test setup: every request fails
    renderBase({ mother: makeMother({ mode: 'offline', online: false, report: null, period: null }) });
    await ready();
    const facts = screen.getByTestId('base-head-facts');
    expect(within(facts).getByText('DEMO')).toBeInTheDocument();
    expect(within(facts).queryByText('SYNTHETIC')).toBeNull();
    expect(facts).toHaveTextContent('SOL 142');
    expect(screen.getByRole('status')).toHaveTextContent(/MOTHER unreachable/);
    expect(roomPanel()).toHaveAttribute('data-room', 'quarters_north');
    expect(row(roomPanel(), 'ppco2')).toHaveAttribute('data-status', 'alert');
  });

  it('reports a sol without data and keeps the last habitat on screen', async () => {
    vi.useFakeTimers();
    stubHabitat();
    renderWithProviders(<StatefulBase initial={{ sol: 142 }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '77' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByRole('alert')).toHaveTextContent('Habitat data not loaded: no habitat data for sol 77');
    expect(screen.getByTestId('base-head-facts')).toHaveTextContent('SOL 142');
    expect(within(screen.getByTestId('base-head-facts')).queryByText('DEMO')).toBeNull();
  });

  it('speaks Polish when the language is PL (backend labels stay English)', async () => {
    stubHabitat();
    renderBase({ lang: 'pl' });
    await ready();
    expect(within(roomPanel()).getByRole('heading', { name: 'STREFA MIESZKALNA N' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Uszczelniona jaskinia lawowa, rejon Elysium Mons' })).toBeInTheDocument();
    for (const name of ['ŚLUZA 1', 'ŚLUZA 2', 'SERWIS / MAGAZYN', 'SZPITAL', 'STREFA REKREACYJNA', 'REAKTOR']) {
      expect(within(document.querySelector('.hmap')).getByText(name)).toBeInTheDocument();
    }
    expect(within(roomPanel()).getByText('SKŁAD POWIETRZA')).toBeInTheDocument();
    expect(within(roomPanel()).getByText('ZANIECZYSZCZENIA POWIETRZA')).toBeInTheDocument();
    const co2 = row(roomPanel(), 'ppco2');
    expect(within(co2).getByText('CO2 partial pressure')).toBeInTheDocument(); // from MOTHER, not translated
    expect(within(co2).getByText('SZCZYT 7.737 · TERAZ OK')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OTOCZENIE' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'DZIENNIK ZDARZEŃ' })).toBeInTheDocument();
    expect(within(document.querySelector('.base-events')).getByRole('button', { name: 'STREFA MIESZKALNA N' })).toBeInTheDocument();

    fireEvent.click(mapRoom('service'));
    expect(within(roomPanel().querySelector('.panel-head')).getByText('SYMULOWANE')).toBeInTheDocument();
  });
});

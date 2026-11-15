import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BaseScreen from './BaseScreen.jsx';
import { makeMother, renderWithProviders } from '../test/renderApp.jsx';
import { habitatRequests, stubHabitat } from '../habitat/testHelpers.js';
import { clearSolHistoryCache } from '../habitat/useSolHistory.js';

afterEach(() => {
  vi.useRealTimers();
  clearSolHistoryCache();
});

const mapRoom = id => document.querySelector(`.hmap-room[data-room="${id}"]`);
const selectedRoom = () => document.querySelector('.hmap-room.is-selected')?.getAttribute('data-room') ?? null;
const dialog = () => document.querySelector('.dlg');
const roomDialog = () => document.querySelector('.base-dlg[data-room]');
const tile = channel => document.querySelector(`.base-tile[data-channel="${channel}"]`);
const bigButton = id => document.querySelector(`.base-big[data-open="${id}"]`);
const closeDialog = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));

/** Channels of the open tile grid, page by page (the pager replaces scrolling). */
function allTileChannels() {
  const channels = [];
  for (;;) {
    channels.push(...[...dialog().querySelectorAll('.base-tile')].map(node => node.getAttribute('data-channel')));
    const next = within(dialog()).queryByRole('button', { name: 'Next page' });
    if (!next || next.disabled) return channels;
    fireEvent.click(next);
  }
}

/** Turn pages until the tile of a channel is shown; returns it. */
function findTile(channel) {
  for (;;) {
    if (tile(channel)) return tile(channel);
    const next = within(dialog()).queryByRole('button', { name: /Next page|Następna strona/ });
    if (!next || next.disabled) return null;
    fireEvent.click(next);
  }
}

function renderBase({ mother = makeMother({ period: { sol: 142 } }), lang, navigate = vi.fn() } = {}) {
  const utils = renderWithProviders(<BaseScreen mother={mother} navigate={navigate} session="HAB-C1" viewedCode="HAB-C1" />, { lang });
  return { ...utils, mother, navigate };
}

/** BaseScreen driven by a stateful stand-in for useMother's period, like in the real app. */
function StatefulBase({ initial = null }) {
  const [period, setPeriod] = useState(initial);
  return <BaseScreen mother={makeMother({ period, setPeriod })} navigate={() => {}} />;
}

const ready = () => waitFor(() => expect(bigButton('events')).not.toBeDisabled());

describe('BaseScreen', () => {
  it('highlights the worst room; a tap opens it in a popup with big reading tiles', async () => {
    const fetchMock = stubHabitat();
    renderBase();
    await ready();
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142']);
    expect(mapRoom('quarters_north')).toHaveClass('is-selected', 'is-alert');
    expect(dialog()).toBeNull(); // nothing opens by itself

    fireEvent.click(mapRoom('quarters_north'));
    expect(roomDialog()).toHaveAttribute('data-room', 'quarters_north');
    expect(within(dialog()).getByRole('heading', { name: 'CREW QUARTERS N' })).toBeInTheDocument();
    expect(within(roomDialog()).getByText(/module_M1 · Habitation module M1/)).toBeInTheDocument();
    // sol status ALRT in the title bar, the zone is CAUT now: NOW shows the current status once
    expect(within(roomDialog().querySelector('[data-fact="now"]')).getByText('[ CAUT ]')).toBeInTheDocument();

    const co2 = findTile('ppco2');
    expect(co2).toHaveAttribute('data-status', 'alert');
    expect(co2).toHaveAttribute('data-now', 'ok');
    expect(within(co2).getByText('CO2 partial pressure')).toBeInTheDocument();
    expect(within(co2).getByText('2.279')).toBeInTheDocument();
    expect(within(co2).getByText('mmHg')).toBeInTheDocument();
    expect(within(co2).getByText('[ ALRT ]')).toBeInTheDocument();
    // one status per tile: the tag; the note keeps only the extra fact (the peak)
    expect(within(co2).getByText('PEAK 7.737')).toBeInTheDocument();
    expect(within(co2).queryByText(/NOW|OK\b/)).toBeNull();
    expect(within(roomDialog()).queryByText('SIMULATED')).toBeNull();

    // details only on tap: sol min – max, normal range, time, sensors, quality
    fireEvent.click(co2);
    const detail = document.querySelector('.base-detail[data-detail="ppco2"]');
    expect(within(detail).getByText('1.826 – 7.737')).toBeInTheDocument();
    expect(within(detail).getByText('1.5 – 2.5')).toBeInTheDocument();
    expect(within(detail).getByText('21:41')).toBeInTheDocument();
    expect(within(detail).getByText('A 2.148 · B 2.41')).toBeInTheDocument();
    expect(within(detail).getByText('SENSOR SUSPECT')).toBeInTheDocument();
    expect(within(detail).getByText('AIR COMPOSITION')).toBeInTheDocument();
    expect(within(detail).getByText('PEAK 7.737 EARLIER THIS SOL')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: /BACK/ }));
    expect(document.querySelector('.base-detail')).toBeNull();
    expect(tile('ppco2')).toBeInTheDocument();

    closeDialog();
    expect(dialog()).toBeNull();
  });

  it('pages the tiles in group order and lists the crew present', async () => {
    stubHabitat();
    const { navigate } = renderBase();
    await ready();
    fireEvent.click(mapRoom('quarters_north'));
    expect(within(dialog()).getByText('1 / 3')).toBeInTheDocument();
    const channels = allTileChannels();
    expect(channels).toHaveLength(19);
    expect(new Set(channels).size).toBe(19);
    const air = channels.indexOf('o2_fraction');
    expect(channels.slice(air, air + 3)).toEqual(['o2_fraction', 'ppco2', 'ppo2_inspired']);
    // categorical channel whose fault has passed; unrated channel shows INFO
    expect(within(findTile('subsystem_status') ?? tile('subsystem_status')).getByText('EARLIER FAULT')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Previous page' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Previous page' }));
    expect(within(findTile('voc_benzene')).getByText('INFO')).toBeInTheDocument();

    const crew = within(roomDialog()).getByRole('button', { name: /^Aleksander Polkowski$/ });
    expect(within(roomDialog()).getByRole('button', { name: /^Bogusława Grzegrzułkiewicz$/ })).toBeInTheDocument();
    fireEvent.click(crew);
    expect(navigate).toHaveBeenCalledWith('crew', { open: 'HAB-C1' });
  });

  it('shows the header line: habitat, atmosphere, sol, overall status; no badges', async () => {
    stubHabitat();
    renderBase();
    await ready();
    expect(screen.getByRole('heading', { level: 1, name: 'Sealed lava-tube habitat, Elysium Mons region' })).toBeInTheDocument();
    const facts = screen.getByTestId('base-head-facts');
    expect(facts).toHaveTextContent('56.5 kPa · 34% O2');
    expect(facts).toHaveTextContent('SOL 142');
    expect(within(facts).queryByText('SYNTHETIC')).not.toBeInTheDocument();
    expect(within(facts).queryByText('DEMO')).toBeNull();
    expect(within(facts).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Sol' })).toHaveValue(142);
    expect(screen.getByRole('slider')).toHaveAttribute('max', '600');
  });

  it('steps the sol with the big − / + buttons', async () => {
    stubHabitat();
    const { mother } = renderBase();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Previous sol' }));
    expect(mother.setPeriod).toHaveBeenLastCalledWith({ sol: 141 });
    fireEvent.click(screen.getByRole('button', { name: 'Next sol' }));
    expect(mother.setPeriod).toHaveBeenLastCalledWith({ sol: 143 });
  });

  it('the reactor shows simulated tiles next to real MOTHER readings, without badges', async () => {
    stubHabitat();
    renderBase();
    await ready();
    fireEvent.click(mapRoom('reactor'));

    expect(roomDialog()).toHaveAttribute('data-room', 'reactor');
    expect(mapRoom('reactor')).toHaveAttribute('aria-pressed', 'true');
    expect(mapRoom('quarters_north')).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog()).getByRole('heading', { name: 'REACTOR' })).toBeInTheDocument();
    expect(within(dialog()).queryByText('SIMULATED')).not.toBeInTheDocument();
    expect(within(dialog()).queryByText(/no sensors in the MOTHER database/i)).not.toBeInTheDocument();

    expect(findTile('core_outlet_temp')).toHaveClass('is-simulated');
    const fission = findTile('power_fission');
    expect(fission).not.toHaveClass('is-simulated');
    expect(within(fission).getByText('40')).toBeInTheDocument();
    expect(within(dialog()).queryByText('MOTHER · SURFACE')).not.toBeInTheDocument();
  });

  it('opens rooms from the keyboard', async () => {
    stubHabitat();
    renderBase();
    await ready();
    const lab = screen.getByRole('button', { name: /^LAB/ });
    lab.focus();
    fireEvent.keyDown(lab, { key: 'Enter' });
    expect(roomDialog()).toHaveAttribute('data-room', 'lab');
    expect(within(roomDialog()).getByText(/lab · Laboratory/)).toBeInTheDocument();
    expect(within(roomDialog()).getByText('NOBODY')).toBeInTheDocument();
  });

  it('keeps the farm alert on its sub-zone and opens it first', async () => {
    stubHabitat();
    renderBase({ mother: makeMother({ period: null }) }); // latest sol (600)
    await ready();
    expect(selectedRoom()).toBe('recreation');
    expect(mapRoom('recreation')).toHaveClass('is-ok', 'is-selected');
    expect(mapRoom('recreation').querySelector('.hmap-mark[data-subzone="farm"]')).toHaveClass('is-alert');

    fireEvent.click(mapRoom('recreation'));
    const farm = roomDialog().querySelector('.base-seg[data-subzone="farm"]');
    const gym = roomDialog().querySelector('.base-seg[data-subzone="gym"]');
    const own = roomDialog().querySelector('.base-seg[data-subzone="recreation"]');
    expect(farm).toHaveAttribute('data-status', 'alert');
    expect(gym).toHaveAttribute('data-status', 'ok');
    expect(own).toHaveAttribute('data-status', 'ok');
    expect(farm).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog().querySelector('.dlg-head')).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(within(findTile('o2_fraction')).getByText('PEAK 34.23')).toBeInTheDocument();

    fireEvent.click(gym);
    expect(gym).toHaveAttribute('aria-selected', 'true');
    // the gym is OK all sol: its segment tag is the only status, no NOW line repeating it
    expect(roomDialog().querySelector('[data-fact="now"]')).toBeNull();
    expect(findTile('ppco2')).toBeInTheDocument();
    expect(within(roomDialog()).getByText(/^gym · /)).toBeInTheDocument();
  });

  it('EXTERIOR opens the surface and the cupolas, the worst zone first', async () => {
    stubHabitat();
    renderBase({ mother: makeMother({ period: { sol: 380 } }) });
    await ready();
    expect(bigButton('exterior')).toHaveClass('is-alert');
    expect(within(bigButton('exterior')).getByText('[ ALRT ]')).toBeInTheDocument();
    // the cupola alert does not colour any room on the map
    expect(document.querySelectorAll('.hmap-room.is-alert')).toHaveLength(0);

    fireEvent.click(bigButton('exterior'));
    expect(within(dialog()).getByRole('heading', { name: 'EXTERIOR' })).toBeInTheDocument();
    const zones = [...dialog().querySelectorAll('.base-seg')];
    expect(zones.map(node => node.getAttribute('data-zone'))).toEqual(['surface', 'cupola_1', 'cupola_2', 'cupola_3', 'cupola_4']);
    // sol 380: leak at cupola 2 (already sealed again)
    expect(dialog().querySelector('[data-zone="cupola_2"]')).toHaveAttribute('aria-selected', 'true');
    const leak = tile('leak_detector');
    expect(within(leak).getByText('Leak detector (joint)')).toBeInTheDocument();
    expect(within(leak).getByText('OK')).toBeInTheDocument();
    expect(within(leak).getByText('EARLIER FAULT')).toBeInTheDocument();

    fireEvent.click(dialog().querySelector('[data-zone="surface"]'));
    expect([...dialog().querySelectorAll('.base-tile')].map(node => node.getAttribute('data-channel'))).toEqual([
      'ext_temperature', 'ext_pressure', 'dust_opacity_tau', 'wind_speed', 'uv_flux', 'dose_rate', 'solar_proton_flux_10MeV',
    ]);
    expect(within(dialog()).getByText('Exterior temperature')).toBeInTheDocument();
  });

  it('EVENTS lists the non-routine events; routine EVA traffic is a count; a zone opens its room', async () => {
    stubHabitat();
    renderBase();
    await ready();
    expect(within(bigButton('events')).getByText('NON-ROUTINE: 2')).toBeInTheDocument();
    fireEvent.click(bigButton('events'));
    expect(within(dialog()).getByRole('heading', { name: 'EVENT LOG' })).toBeInTheDocument();
    const items = within(dialog()).getAllByRole('listitem');
    expect(items.map(item => item.getAttribute('data-event'))).toEqual(['scrubber_fault', 'eva_end']);

    const fault = items[0];
    expect(within(fault).getByText('SCRUBBER FAULT')).toBeInTheDocument();
    expect(within(fault).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(fault).toHaveTextContent('MAJOR');
    expect(fault).toHaveTextContent('02:10 – 14:10 UTC');
    // an event that started on another sol and is still open
    expect(items[1]).toHaveTextContent('SOL 94 · 04-07 03:20 – OPEN UTC');
    expect(within(dialog()).getByText('ROUTINE, NOT LISTED: 28 EVA STARTS · 30 EVA ENDS')).toBeInTheDocument();
    expect(within(dialog()).queryByText('EVA START')).toBeNull();

    fireEvent.click(within(fault).getByRole('button', { name: 'CREW QUARTERS N' }));
    expect(roomDialog()).toHaveAttribute('data-room', 'quarters_north');
    expect(document.querySelectorAll('.dlg')).toHaveLength(1);
  });

  it('writes sol changes to mother.setPeriod, the sol every screen shares', async () => {
    vi.useFakeTimers();
    stubHabitat();
    const { mother } = renderBase();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(bigButton('events')).not.toBeDisabled();

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
    expect(selectedRoom()).toBe('quarters_north');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '380' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142', '/api/habitat?sol=380']);
    expect(screen.getByTestId('base-head-facts')).toHaveTextContent('SOL 380');
    // module_M1 is fine at sol 380, so the automatic selection moves on
    expect(selectedRoom()).toBe('recreation');
    fireEvent.click(bigButton('events'));
    expect(within(dialog()).getByText('LEAK')).toBeInTheDocument();
    closeDialog();

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
    closeDialog();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sol' }), { target: { value: '380' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByTestId('base-head-facts')).toHaveTextContent('SOL 380');
    expect(selectedRoom()).toBe('medbay');
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

  it('falls back to the built-in habitat when MOTHER is unreachable', async () => {
    // default fetch stub of the test setup: every request fails
    renderBase({ mother: makeMother({ mode: 'offline', online: false, report: null, period: null }) });
    await ready();
    const facts = screen.getByTestId('base-head-facts');
    expect(within(facts).queryByText('DEMO')).not.toBeInTheDocument();
    expect(within(facts).queryByText('SYNTHETIC')).toBeNull();
    expect(facts).toHaveTextContent('SOL 142');
    expect(screen.getByRole('status')).toHaveTextContent(/MOTHER unreachable/);
    expect(selectedRoom()).toBe('quarters_north');
    fireEvent.click(mapRoom('quarters_north'));
    expect(findTile('ppco2')).toHaveAttribute('data-status', 'alert');
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

  it('a reading opens its trend over the last sols, fetched only while that view is open', async () => {
    const fetchMock = stubHabitat();
    renderBase();
    await ready();
    fireEvent.click(mapRoom('quarters_north'));
    const co2 = findTile('ppco2');
    expect(co2.querySelector('[data-chart="range"] [data-part="marker"]')).toBeInTheDocument();
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142']); // the popup alone fetches nothing

    fireEvent.click(co2);
    await waitFor(() => expect(habitatRequests(fetchMock)).toHaveLength(7));
    expect(habitatRequests(fetchMock).slice(1).sort()).toEqual([136, 137, 138, 139, 140, 141].map(sol => `/api/habitat?sol=${sol}`));
    const chart = await screen.findByRole('img', { name: 'Trend: CO2 partial pressure' });
    expect(within(dialog()).getByText('LAST 7 SOLS')).toBeInTheDocument();
    expect([...chart.querySelectorAll('[data-part="sol"]')].map(node => node.textContent))
      .toEqual(['136', '137', '138', '139', '140', '141', '142']);
    expect(chart.querySelectorAll('[data-part="point"]')).toHaveLength(1); // only sol 142 is recorded

    fireEvent.click(within(dialog()).getByRole('button', { name: /BACK/ }));
    fireEvent.click(tile('ppco2'));
    await screen.findByRole('img', { name: 'Trend: CO2 partial pressure' });
    expect(habitatRequests(fetchMock)).toHaveLength(7); // past sols are cached
  });

  it('says there is no history while MOTHER is unreachable', async () => {
    renderBase({ mother: makeMother({ mode: 'offline', online: false, report: null, period: null }) });
    await ready();
    fireEvent.click(mapRoom('quarters_north'));
    fireEvent.click(findTile('ppco2'));
    expect(within(dialog()).getByText('No history: MOTHER is offline.')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('img')).toBeNull();
  });

  it('shows sparklines of the last sols on the exterior tiles', async () => {
    const fetchMock = stubHabitat();
    renderBase({ mother: makeMother({ period: { sol: 380 } }) });
    await ready();
    fireEvent.click(bigButton('exterior'));
    await waitFor(() => expect(habitatRequests(fetchMock)).toHaveLength(7));
    expect(habitatRequests(fetchMock)).toContain('/api/habitat?sol=379');
  });

  it('speaks Polish when the language is PL (backend labels stay English)', async () => {
    stubHabitat();
    renderBase({ lang: 'pl' });
    await ready();
    expect(screen.getByRole('heading', { level: 1, name: 'Uszczelniona jaskinia lawowa, rejon Elysium Mons' })).toBeInTheDocument();
    for (const name of ['ŚLUZA 1', 'ŚLUZA 2', 'SERWIS / MAGAZYN', 'SZPITAL', 'STREFA REKREACYJNA', 'REAKTOR']) {
      expect(within(document.querySelector('.hmap')).getByText(name)).toBeInTheDocument();
    }
    expect(within(bigButton('exterior')).getByText('OTOCZENIE')).toBeInTheDocument();
    expect(within(bigButton('events')).getByText('ZDARZENIA')).toBeInTheDocument();

    fireEvent.click(mapRoom('quarters_north'));
    expect(within(dialog()).getByRole('heading', { name: 'STREFA MIESZKALNA N' })).toBeInTheDocument();
    const co2 = findTile('ppco2');
    expect(within(co2).getByText('CO2 partial pressure')).toBeInTheDocument(); // from MOTHER, not translated
    expect(within(co2).getByText('SZCZYT 7.737')).toBeInTheDocument();
    fireEvent.click(co2);
    expect(within(dialog()).getByText('SKŁAD POWIETRZA')).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: /WSTECZ/ })).toBeInTheDocument();
  });
});

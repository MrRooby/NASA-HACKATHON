import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  channelSeries, clearSolHistoryCache, historySols, readingAt, useSolHistory,
} from './useSolHistory.js';
import { habitatFixtures, habitatRequests, jsonResponse, stubHabitat } from './testHelpers.js';

afterEach(() => clearSolHistoryCache());

const sol142 = habitatFixtures[142];
const sol380 = habitatFixtures[380];
/** Every past sol answers with the sol-380 recording, so a series has a value per sol. */
const anySol = url => (/sol=(13[6-9]|14[01])\b/.test(url) ? jsonResponse(sol380) : undefined);

describe('historySols', () => {
  it('ends at the shown sol, never below sol 1', () => {
    expect(historySols(142)).toEqual([136, 137, 138, 139, 140, 141, 142]);
    expect(historySols(3)).toEqual([1, 2, 3]);
    expect(historySols(null)).toEqual([]);
  });
});

describe('readingAt / channelSeries', () => {
  it('finds a reading by room, sub-zone or exterior zone', () => {
    expect(readingAt(sol142, { room: 'quarters_north' }, 'ppco2').value).toBe(2.279);
    expect(readingAt(sol142, { zone: 'surface' }, 'ext_pressure')).not.toBeNull();
    expect(readingAt(sol142, { room: 'recreation', sub: 'farm' }, 'o2_fraction')).not.toBeNull();
    expect(readingAt(sol142, { room: 'lab' }, 'no_such_channel')).toBeNull();
    expect(readingAt(null, { room: 'lab' }, 'ppco2')).toBeNull();
    const series = channelSeries([{ sol: 141, data: null }, { sol: 142, data: sol142 }], { room: 'quarters_north' }, 'ppco2');
    expect(series).toEqual([{ sol: 141, value: null }, { sol: 142, value: 2.279 }]);
  });
});

describe('useSolHistory', () => {
  it('fetches the six sols before the shown one, in parallel, and reuses the shown data', async () => {
    const fetchMock = stubHabitat(anySol);
    const { result } = renderHook(() => useSolHistory({ sol: 142, data: sol142 }));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(habitatRequests(fetchMock).sort()).toEqual([136, 137, 138, 139, 140, 141].map(sol => `/api/habitat?sol=${sol}`));
    expect(result.current.bySol.map(item => item.sol)).toEqual([136, 137, 138, 139, 140, 141, 142]);
    expect(result.current.bySol[6].data).toBe(sol142);
    expect(result.current.bySol[0].data).toEqual(sol380);

    // past sols are cached: a second view does not fetch again
    const { result: again } = renderHook(() => useSolHistory({ sol: 142, data: sol142 }));
    await waitFor(() => expect(again.current.state).toBe('ready'));
    expect(habitatRequests(fetchMock)).toHaveLength(6);
  });

  it('a sol without data is a gap, not an error', async () => {
    stubHabitat(); // only 142 / 380 / 600 are recorded: the rest answers 404
    const { result } = renderHook(() => useSolHistory({ sol: 142, data: sol142 }));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const series = channelSeries(result.current.bySol, { room: 'quarters_north' }, 'ppco2');
    expect(series.filter(point => point.value != null)).toEqual([{ sol: 142, value: 2.279 }]);
  });

  it('does nothing until enabled and aborts the requests when the view closes', async () => {
    const fetchMock = stubHabitat(() => new Promise(() => {})); // never answers
    const { rerender, unmount } = renderHook(props => useSolHistory(props), {
      initialProps: { sol: 142, data: sol142, enabled: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ sol: 142, data: sol142, enabled: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const signals = fetchMock.mock.calls.map(([, init]) => init?.signal);
    expect(signals.every(signal => signal && !signal.aborted)).toBe(true);
    unmount();
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });

  it('has no history offline (built-in demo habitat): nothing is fetched', () => {
    const fetchMock = stubHabitat();
    const { result } = renderHook(() => useSolHistory({ sol: 142, data: { ...sol142, demo: true }, offline: true }));
    expect(result.current.state).toBe('offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

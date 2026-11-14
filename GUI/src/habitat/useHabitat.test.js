import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHabitat } from './useHabitat.js';
import { DEMO_SOL, getDemoHabitat } from './demoHabitat.js';
import { habitatFixtures, habitatRequests, habitatRoute, jsonResponse, stubHabitat } from './testHelpers.js';

afterEach(() => {
  vi.useRealTimers();
});

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe('useHabitat', () => {
  it('loads the latest sol, then the requested sol when it changes', async () => {
    const fetchMock = stubHabitat();
    const { result, rerender } = renderHook(({ sol }) => useHabitat({ sol, pollMs: 0 }), { initialProps: { sol: null } });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data?.as_of.sol).toBe(600));
    expect(result.current).toMatchObject({ loading: false, error: null, offline: false });
    expect(result.current.data.demo).toBeUndefined();

    rerender({ sol: 142 });
    await waitFor(() => expect(result.current.data?.as_of.sol).toBe(142));
    expect(result.current.data).toEqual(habitatFixtures[142]);
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat', '/api/habitat?sol=142']);
  });

  it('polls every pollMs and refreshes on demand', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHabitat();
    const { result } = renderHook(() => useHabitat({ sol: 142, pollMs: 30000 }));
    await flush();
    expect(habitatRequests(fetchMock)).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(29999); });
    expect(habitatRequests(fetchMock)).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=142', '/api/habitat?sol=142']);

    await act(async () => { await result.current.refresh(); });
    expect(habitatRequests(fetchMock)).toHaveLength(3);
  });

  it('does not fetch while disabled', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHabitat();
    const { result } = renderHook(() => useHabitat({ enabled: false, pollMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ data: null, loading: false, offline: false });
  });

  it('falls back to the bundled demo habitat when MOTHER is unreachable, and recovers on the next poll', async () => {
    vi.useFakeTimers();
    let down = true;
    const fetchMock = stubHabitat(() => (down ? Promise.reject(new TypeError('fetch failed')) : undefined));
    const { result } = renderHook(() => useHabitat({ sol: 380, pollMs: 30000 }));
    await flush();

    expect(result.current.offline).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatchObject({ kind: 'network' });
    expect(result.current.data.demo).toBe(true);
    expect(result.current.data.as_of.sol).toBe(DEMO_SOL);
    expect(result.current.data.zones).toHaveLength(14);

    down = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(result.current).toMatchObject({ offline: false, error: null });
    expect(result.current.data.demo).toBeUndefined();
    expect(result.current.data.as_of.sol).toBe(380);
    expect(habitatRequests(fetchMock)).toEqual(['/api/habitat?sol=380', '/api/habitat?sol=380']);
  });

  it('uses the demo habitat for 503 (database down) too', async () => {
    stubHabitat(() => jsonResponse({ error: 'database unreachable', hint: 'start the VPN' }, { status: 503 }));
    const { result } = renderHook(() => useHabitat({ pollMs: 0 }));
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.data.demo).toBe(true);
    expect(result.current.error).toMatchObject({ status: 503, hint: 'start the VPN' });
  });

  it('keeps the data on screen and reports the error for a non-offline failure (404)', async () => {
    stubHabitat();
    const { result, rerender } = renderHook(({ sol }) => useHabitat({ sol, pollMs: 0 }), { initialProps: { sol: 142 } });
    await waitFor(() => expect(result.current.data?.as_of.sol).toBe(142));

    rerender({ sol: 9999 });
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 404 }));
    expect(result.current.offline).toBe(false);
    expect(result.current.data.as_of.sol).toBe(142);
    expect(result.current.data.demo).toBeUndefined();
  });

  it('ignores the answer of a superseded request', async () => {
    const pending = [];
    stubHabitat(url => new Promise(resolve => { pending.push({ url, resolve }); }));
    const { result, rerender } = renderHook(({ sol }) => useHabitat({ sol, pollMs: 0 }), { initialProps: { sol: 142 } });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ sol: 380 });
    await waitFor(() => expect(pending).toHaveLength(2));

    // the newer request answers first, the stale one afterwards
    await act(async () => { pending[1].resolve(habitatRoute(pending[1].url)); });
    await waitFor(() => expect(result.current.data?.as_of.sol).toBe(380));
    await act(async () => { pending[0].resolve(habitatRoute(pending[0].url)); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data.as_of.sol).toBe(380);
    expect(result.current.loading).toBe(false);
  });

  it('demo data is a recorded sol-142 response marked demo, not the test fixture object', () => {
    const demo = getDemoHabitat();
    expect(demo.demo).toBe(true);
    expect(demo.as_of.sol).toBe(142);
    expect(demo.zones.find(zone => zone.code === 'module_M1').status).toBe('alert');
    expect(demo.events.some(event => event.type === 'scrubber_fault')).toBe(true);
  });
});

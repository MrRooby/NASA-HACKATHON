import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useMother, { defaultSubject, periodKind } from './useMother.js';
import { fixtures, requestedPaths, stubMother } from './test/mother.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('useMother helpers', () => {
  it('defaults to the first habitat crew member, else the first person', () => {
    expect(defaultSubject(fixtures.subjects).code).toBe('HAB-C1');
    expect(defaultSubject(fixtures.subjects.filter(s => s.kind !== 'habitat_crew')).code).toBe('SYN-01');
    expect(defaultSubject([])).toBeNull();
  });

  it('addresses habitat crew by sol and everyone else by flight day', () => {
    expect(periodKind({ kind: 'habitat_crew' })).toBe('sol');
    expect(periodKind({ kind: 'crew_health' })).toBe('day');
  });
});

describe('useMother', () => {
  it('connects, loads the default report and switches person', async () => {
    const fetchMock = stubMother();
    const { result } = renderHook(() => useMother());
    await waitFor(() => expect(result.current.report?.subject.code).toBe('HAB-C1'));
    expect(result.current).toMatchObject({ mode: 'online', online: true, selectedCode: 'HAB-C1', error: null });
    await waitFor(() => expect(result.current.overview).toHaveLength(18));

    act(() => result.current.selectSubject('HAB-C2'));
    await waitFor(() => expect(result.current.report?.subject.code).toBe('HAB-C2'));
    act(() => result.current.setPeriod({ sol: 142 }));
    await waitFor(() => expect(requestedPaths(fetchMock)).toContain('/api/organs/HAB-C2?sol=142'));
  });

  it('polls the selected report every 30 s while online', async () => {
    vi.useFakeTimers();
    const fetchMock = stubMother();
    const { result } = renderHook(() => useMother({ pollMs: 30000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.mode).toBe('online');
    const reportCalls = () => requestedPaths(fetchMock).filter(path => path === '/api/organs/HAB-C1').length;
    expect(reportCalls()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(29999); });
    expect(reportCalls()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(reportCalls()).toBe(2);
  });

  it('falls back offline when fetch rejects and reconnects on the next poll', async () => {
    vi.useFakeTimers();
    let up = false;
    const fetchMock = stubMother(() => (up ? undefined : Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useMother({ pollMs: 30000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.mode).toBe('offline');
    expect(result.current.error).toMatchObject({ kind: 'network' });
    expect(result.current.report).toBeNull();

    up = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(result.current.mode).toBe('online');
    expect(result.current.report?.subject.code).toBe('HAB-C1');
    expect(requestedPaths(fetchMock).filter(path => path === '/api/status')).toHaveLength(2);
  });
});

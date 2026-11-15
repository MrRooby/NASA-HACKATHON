import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import useVitalsHistory from './useVitalsHistory.js';

afterEach(() => vi.unstubAllGlobals());

describe('useVitalsHistory', () => {
  it('asks MOTHER for the last 7 sols and turns each report into readings', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async url => { urls.push(String(url)); return new Response(JSON.stringify(habC4Sol142), { status: 200 }); }));
    const { result } = renderHook(() => useVitalsHistory('HAB-C4', 142, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(urls.map(url => url.split('sol=')[1]).sort()).toEqual(['136', '137', '138', '139', '140', '141', '142']);
    expect(result.current.rows.map(row => row.sol)).toEqual([136, 137, 138, 139, 140, 141, 142]);
    expect(result.current.rows[6].vitals.find(item => item.id === 'hr').value).toBe(62);
  });

  it('does nothing while disabled', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useVitalsHistory('HAB-C4', 142, false));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTrendCache, demoSeries, runLimited, trendSols, useOrganTrend } from './useOrganTrend.js';
import { recordMeasurement } from '../shared/measurements.js';
import { demoReport } from '../data/demoReports.js';
import { fixtures } from '../test/mother.js';

vi.mock('../api.js', async importOriginal => ({ ...(await importOriginal()), getOrganReport: vi.fn() }));
const { getOrganReport } = await import('../api.js');

/** The sol-142 fixture re-stamped as another sol, with the kidney stone-risk value shifted. */
const reportAt = sol => {
  const report = structuredClone(fixtures.habC4Sol142);
  report.as_of = { sol };
  const kidneys = report.organs.find(card => card.organ === 'kidneys');
  kidneys.checks.find(check => check.code === 'hydration').value = 1 + sol / 10000;
  return report;
};

beforeEach(() => {
  clearTrendCache();
  getOrganReport.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useOrganTrend helpers', () => {
  it('lists the last N sols up to the current one, never below 0', () => {
    expect(trendSols(142, 3)).toEqual([140, 141, 142]);
    expect(trendSols(2, 14)).toEqual([0, 1, 2]);
    expect(trendSols(null)).toEqual([]);
  });

  it('runs jobs with limited concurrency', async () => {
    let running = 0;
    let peak = 0;
    const jobs = Array.from({ length: 9 }, () => async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 1));
      running -= 1;
    });
    await runLimited(jobs, 3);
    expect(peak).toBe(3);
  });

  it('builds a deterministic demo series that ends on the shown value', () => {
    const report = demoReport('HAB-C4');
    const a = demoSeries(report, 'kidneys', 14);
    const b = demoSeries(report, 'kidneys', 14);
    expect(a).toEqual(b);
    expect(a.hydration).toHaveLength(14);
    expect(a.hydration.at(-1)).toEqual({ sol: 142, value: report.organs.find(c => c.organ === 'kidneys').checks.find(c => c.code === 'hydration').value });
    expect(a.stone_risk.every(point => point.value === 1)).toBe(true); // small integer counts stay flat
  });
});

describe('useOrganTrend', () => {
  it('fetches the last sols three at a time, caches them and builds numeric series', async () => {
    let inFlight = 0;
    let peak = 0;
    getOrganReport.mockImplementation(async (code, { sol }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 2));
      inFlight -= 1;
      return reportAt(sol);
    });
    const { result, rerender } = renderHook(({ organ }) => useOrganTrend('HAB-C4', organ, { sol: 142, online: true, sols: 6 }), { initialProps: { organ: 'kidneys' } });
    await waitFor(() => expect(result.current.series.hydration).toHaveLength(6));
    expect(result.current.demo).toBe(false);
    expect(result.current.series.hydration.map(point => point.sol)).toEqual([137, 138, 139, 140, 141, 142]);
    expect(result.current.series.hydration[0].value).toBeCloseTo(1.0137);
    expect(result.current.series.uti).toBeUndefined(); // non-numeric checks have no series
    expect(peak).toBeLessThanOrEqual(3);
    expect(getOrganReport).toHaveBeenCalledTimes(6);
    expect(getOrganReport.mock.calls.every(([code, , options]) => code === 'HAB-C4' && options.signal instanceof AbortSignal)).toBe(true);

    // Another organ of the same person and sols: served from the cache.
    rerender({ organ: 'heart' });
    await waitFor(() => expect(result.current.series.map).toHaveLength(6));
    expect(getOrganReport).toHaveBeenCalledTimes(6);
  });

  it('aborts the requests in flight when it goes away', async () => {
    const signals = [];
    getOrganReport.mockImplementation((code, query, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useOrganTrend('HAB-C1', 'heart', { sol: 50, online: true, sols: 5 }));
    await waitFor(() => expect(signals).toHaveLength(3));
    unmount();
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });

  it('is a DEMO series offline and never fetches', () => {
    const report = demoReport('HAB-C4');
    const { result } = renderHook(() => useOrganTrend('HAB-C4', 'limbs', { sol: 142, online: false, report }));
    expect(result.current.demo).toBe(true);
    expect(result.current.series.perfusion_left_leg.at(-1).value).toBe(25);
    expect(getOrganReport).not.toHaveBeenCalled();
  });

  it('adds the person\'s own measurements as a separate series and follows new entries', () => {
    recordMeasurement('HAB-C4', 'water', { ml: 250 }, 141);
    recordMeasurement('HAB-C4', 'water', { ml: 250 }, 141);
    recordMeasurement('HAB-C4', 'urine_volume', { liters: 1.8 }, 141);
    recordMeasurement('HAB-C1', 'urine_volume', { liters: 3 }, 141);
    const { result } = renderHook(() => useOrganTrend('HAB-C4', 'kidneys', { sol: 142, online: false, report: demoReport('HAB-C4') }));
    expect(result.current.own['water.ml']).toEqual([expect.objectContaining({ sol: 141, value: 500 })]);
    expect(result.current.own['urine_volume.liters']).toEqual([expect.objectContaining({ sol: 141, value: 1.8 })]);
    act(() => { recordMeasurement('HAB-C4', 'urine_volume', { liters: 2.6 }, 142); });
    expect(result.current.own['urine_volume.liters'].map(point => point.value)).toEqual([1.8, 2.6]);
  });
});

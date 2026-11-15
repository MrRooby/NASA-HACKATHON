import { describe, expect, it } from 'vitest';
import { LIVE_SECONDS, primeSignals, stepSignal } from './useSimulatedVitals.js';

// Deterministic generator (mulberry32) so the statistics below are stable.
const seeded = seed => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('simulated vitals', () => {
  it('primes a full window of seconds for every known signal and ignores unknown ones', () => {
    const { points } = primeSignals({ heart_rate_resting: 67, spo2: 97.5, bmd_hip_spine_pct_baseline: 75 }, 0, LIVE_SECONDS, seeded(1));
    expect(Object.keys(points)).toEqual(['heart_rate_resting', 'spo2']);
    expect(points.spo2).toHaveLength(LIVE_SECONDS + 1);
    expect(points.spo2[0][0]).toBe(-LIVE_SECONDS);
    expect(points.spo2.at(-1)[0]).toBe(0);
  });

  it('stays around the real value (mean-reverting) and inside physiological limits', () => {
    const random = seeded(7);
    const state = { x: 67, mu: 67 };
    const values = Array.from({ length: 3600 }, (_, t) => stepSignal('heart_rate_resting', state, t, random));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(Math.abs(mean - 67)).toBeLessThan(1);
    expect(Math.max(...values)).toBeLessThan(80);
    expect(Math.min(...values)).toBeGreaterThan(54);

    const spo2 = { x: 99.9, mu: 99.9 };
    for (let t = 0; t < 600; t += 1) expect(stepSignal('spo2', spo2, t, random)).toBeLessThanOrEqual(100);
  });
});

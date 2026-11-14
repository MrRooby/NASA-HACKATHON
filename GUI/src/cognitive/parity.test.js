import { describe, expect, it } from 'vitest';
import { score } from './engine/score.js';
import { baseline, pctChange, performanceZ } from './engine/stats.js';

// The SAME fixtures feed MOTHER's pytest (cognitive_scoring.py) and this JS port.
const modules = import.meta.glob('../../../config/cognitive/fixtures/*.json', { eager: true });
const fixtures = Object.entries(modules).map(([path, m]) => [path.split('/').pop(), m.default ?? m]);

const TOL = 1e-6;
function expectClose(actual, expected, where) {
  if (expected === null) { expect(actual, where).toBeNull(); return; }
  expect(actual, where).not.toBeNull();
  expect(Number.isFinite(actual), `${where} finite`).toBe(true);
  expect(Math.abs(actual - expected), `${where}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOL);
}

describe('scoring parity with cognitive_scoring.py', () => {
  const scoring = fixtures.filter(([, f]) => f.trials);  // report_cases.json is checked in selfmode.test.jsx
  it('finds the shared fixtures', () => {
    expect(scoring.length).toBeGreaterThanOrEqual(10);
    expect(fixtures.some(([name]) => name === 'baseline_z.json')).toBe(true);
  });

  it.each(scoring)('%s', (_name, fx) => {
    const out = score(fx.test_id, fx.trials, fx.duration_s);
    expect(out.status).toBe(fx.expected.status);
    expect(out.quality).toBe(fx.expected.quality);
    expect(out.n_trials).toBe(fx.expected.n_trials);
    expect(Object.keys(out.metrics).sort()).toEqual(Object.keys(fx.expected.metrics).sort());
    for (const [key, value] of Object.entries(fx.expected.metrics)) expectClose(out.metrics[key], value, key);
    expect(JSON.stringify(out)).not.toMatch(/NaN|Infinity|null.*undefined/);
  });
});

describe('baseline / z-score parity', () => {
  const cases = fixtures.filter(([name, f]) => f.cases && name !== 'report_cases.json').flatMap(([, f]) => f.cases);
  it.each(cases.map((c, i) => [`${c.metric} #${i}`, c]))('%s', (_n, c) => {
    const base = baseline(c.baseline_values);
    if (c.baseline === null) { expect(base).toBeNull(); expect(performanceZ(c.metric, c.x, base)).toBe(c.z); return; }
    expectClose(base.mean, c.baseline.mean, 'mean');
    expectClose(base.sd, c.baseline.sd, 'sd');
    expect(base.n).toBe(c.baseline.n);
    expectClose(performanceZ(c.metric, c.x, base), c.z, 'z');
    expectClose(pctChange(c.x, base), c.pct_change, 'pct_change');
  });

  it('has no baseline before 3 sessions', () => {
    expect(baseline([1, 2])).toBeNull();
    expect(performanceZ('pvt_median_rt_ms', 300, null)).toBeNull();
  });
});

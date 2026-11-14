import { describe, expect, it } from 'vitest';
import { fnv1a32, mulberry32, seedFrom, shuffle, stimulusSetFor } from './engine/prng.js';
import { dprime, invNorm, mean, median, sd, tenth } from './engine/stats.js';

describe('stats', () => {
  it('median / mean / sd follow the Python conventions', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([1])).toBeNull();
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4); // sample SD (n - 1)
  });

  it('tenth = ceil(0.1 n), at least 1 for n > 0', () => {
    expect([0, 1, 7, 10, 11, 50].map(tenth)).toEqual([0, 1, 1, 1, 2, 5]);
  });

  it('invNorm matches reference values (Python NormalDist) within 1e-9', () => {
    const ref = [
      [1e-9, -5.9978070150076865], [1e-5, -4.2648907939228256], [0.001, -3.090232306167813],
      [0.02, -2.0537489106318225], [0.02425, -1.9729610513118845], [0.1, -1.2815515655446008],
      [0.3, -0.5244005127080407], [0.5, 0], [0.7, 0.5244005127080407], [0.975, 1.9599639845400536],
      [0.99, 2.3263478740408408], [0.999999, 4.753424308817089], [0.0123, -2.247626755795138],
    ];
    for (const [p, z] of ref) expect(Math.abs(invNorm(p) - z), `p=${p}`).toBeLessThan(1e-9);
    expect(invNorm(0.5)).toBe(0);
    expect(invNorm(0.975)).toBeCloseTo(1.959963985, 6);
    expect(Number.isFinite(invNorm(1e-9))).toBe(true);
  });

  it('dprime is finite at 0 % / 100 % and null without trials', () => {
    expect(Number.isFinite(dprime(90, 90, 0, 30))).toBe(true);
    expect(dprime(81, 90, 6, 30)).toBeCloseTo(2.07, 1);
    expect(dprime(1, 0, 0, 30)).toBeNull();
    expect(dprime(1, 10, 0, 0)).toBeNull();
  });
});

describe('prng', () => {
  it('FNV-1a 32 matches known vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
  it('seeds are stable and sensitive to every part', () => {
    const base = seedFrom('SYN-01', 'pvt', 'A', 1);
    expect(seedFrom('SYN-01', 'pvt', 'A', 1)).toBe(base);
    expect(seedFrom('SYN-01', 'pvt', 'A', 2)).not.toBe(base);
    expect(seedFrom('SYN-02', 'pvt', 'A', 1)).not.toBe(base);
    expect(seedFrom('SYN-01', 'pvt', 'A', 1)).toBe(fnv1a32('SYN-01|pvt|A|1'));
  });
  it('mulberry32 is deterministic in [0, 1) and shuffle keeps the items', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
    expect(shuffle(mulberry32(1), [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('rotates stimulus sets A-D by session number', () => {
    expect([1, 2, 3, 4, 5, 6].map(stimulusSetFor)).toEqual(['A', 'B', 'C', 'D', 'A', 'B']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from './engine/runner.js';
import { calibrateFrames, deviceWarnings, inputTime, onsetViaRaf, summarizeFrames, timerResolution } from './engine/clock.js';
import { useFake } from './helpers.js';

beforeEach(() => { useFake(); });
afterEach(() => { vi.useRealTimers(); });

describe('clock', () => {
  it("uses event.timeStamp ('e') when it is on the performance.now() scale, else falls back ('h')", () => {
    vi.advanceTimersByTime(5000);
    expect(inputTime({ timeStamp: performance.now() - 3 })).toEqual({ t: performance.now() - 3, src: 'e' });
    expect(inputTime({ timeStamp: Date.now() })).toEqual({ t: performance.now(), src: 'h' }); // epoch ms (old Safari)
    expect(inputTime({ timeStamp: undefined }).src).toBe('h');
    expect(inputTime({ timeStamp: NaN }).src).toBe('h');
  });

  it('onset: DOM change in one frame, tOnset recorded in the next', () => {
    const sched = createScheduler();
    const log = [];
    onsetViaRaf(sched, () => log.push('show'), { onSchedule: t => log.push(['sched', t]), onOnset: (t, s) => log.push(['onset', t, s]) });
    expect(log).toEqual([]);
    vi.advanceTimersByTime(16);
    expect(log[0]).toBe('show');
    vi.advanceTimersByTime(16);
    const [, tOnset, tSchedule] = log[2];
    expect(tOnset).toBeGreaterThan(tSchedule);
    sched.cancelAll();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('scheduler cancelAll stops pending timeouts and frames', () => {
    const sched = createScheduler();
    const fn = vi.fn();
    sched.setTimeout(fn, 100); sched.raf(fn);
    sched.cancelAll();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    expect(sched.setTimeout(fn, 1)).toBeNull();
  });

  it('frame summary: refresh_hz from the median delta, jitter = p95 - p5', () => {
    const times = [0]; for (let i = 1; i <= 120; i += 1) times.push(times[i - 1] + (i % 30 === 0 ? 20 : 16.667));
    const s = summarizeFrames(times);
    expect(s.refresh_hz).toBeCloseTo(60, 0);
    expect(s.frame_jitter_ms).toBeGreaterThanOrEqual(0);
    expect(summarizeFrames([1])).toEqual({ refresh_hz: null, frame_jitter_ms: null });
  });

  it('calibrates over 120 frames and warns for slow / jittery / coarse devices', async () => {
    const job = calibrateFrames(120);
    await vi.advanceTimersByTimeAsync(3000);
    const r = await job.promise;
    expect(r.refresh_hz).toBeGreaterThan(55);
    expect(r.refresh_hz).toBeLessThan(65);
    expect(deviceWarnings(r)).toEqual([]);
    expect(deviceWarnings({ refresh_hz: 30, frame_jitter_ms: 6, timer_resolution_ms: 100 })).toHaveLength(3);
  });

  it('timer resolution probe terminates', () => {
    expect(() => timerResolution({ maxMs: 5 })).not.toThrow();
  });
});

import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { press, stepUntil, useFake } from '../../helpers.js';
import { goNoGoPractice, goNoGoSequence } from './sequence.js';
import { scoreGonogo } from './scoring.js';
import GoNoGoTask from './GoNoGoTask.jsx';

beforeEach(() => { useFake(); });
afterEach(() => { vi.useRealTimers(); });

describe('gonogo sequence (200 seeds)', () => {
  it('satisfies every rule of the protocol, deterministically and fast', () => {
    const t0 = performance.now();
    for (let seed = 1; seed <= 200; seed += 1) {
      const seq = goNoGoSequence(seed * 7919);
      expect(seq).toHaveLength(120);
      expect(seq.filter(t => t.stimulus === 'go')).toHaveLength(90);
      expect(seq.filter(t => t.stimulus === 'nogo')).toHaveLength(30);
      expect(seq.slice(0, 3).every(t => t.stimulus === 'go')).toBe(true);
      let run = 0;
      for (const t of seq) {
        run = t.stimulus === 'nogo' ? run + 1 : 0;
        expect(run).toBeLessThanOrEqual(2);
        expect(t.iti_ms).toBeGreaterThanOrEqual(750);
        expect(t.iti_ms).toBeLessThanOrEqual(1250);
      }
      for (let q = 0; q < 4; q += 1) {
        const n = seq.slice(q * 30, q * 30 + 30).filter(t => t.stimulus === 'nogo').length;
        expect([7, 8]).toContain(n);
      }
      expect(goNoGoSequence(seed * 7919)).toEqual(seq);
    }
    expect(performance.now() - t0).toBeLessThan(50 * 200); // far below the 50 ms / sequence budget
  });

  it('practice: 10 trials, 3 NO-GO, first 3 GO', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const p = goNoGoPractice(seed);
      expect(p).toHaveLength(10);
      expect(p.filter(t => t.stimulus === 'nogo')).toHaveLength(3);
      expect(p.slice(0, 3).every(t => t.stimulus === 'go')).toBe(true);
    }
  });
});

describe('gonogo scoring', () => {
  const mk = (stimulus, event_type, rt_ms = null, extra = {}) => ({ stimulus, event_type, rt_ms, ...extra });
  it('6/30 commissions = 0.20, 9 omissions of 91 GO, anticipation excluded from RT', () => {
    const trials = [
      ...Array.from({ length: 9 }, () => mk('go', 'omission')),
      ...Array.from({ length: 81 }, () => mk('go', 'hit', 300)),
      mk('go', 'hit', 120, { anticipation: true }),
      ...Array.from({ length: 6 }, () => mk('nogo', 'commission', 350)),
      ...Array.from({ length: 24 }, () => mk('nogo', 'correct_rejection')),
    ];
    const m = scoreGonogo(trials).metrics;
    expect(m.gonogo_commission_rate).toBeCloseTo(0.2, 10);
    expect(m.gonogo_omission_rate).toBeCloseTo(9 / 91, 10);
    expect(m.gonogo_mean_rt_go_ms).toBe(300);
  });
});

describe('GoNoGoTask', () => {
  const SEED = 99;
  const setup = () => {
    const controlRef = createRef();
    const onComplete = vi.fn();
    const utils = render(<GoNoGoTask seed={SEED} practice controlRef={controlRef} onComplete={onComplete} />);
    const vis = id => utils.getByTestId(id).style.visibility === 'visible';
    return { ...utils, controlRef, onComplete, vis, trials: () => controlRef.current.snapshot().trials };
  };
  const seq = goNoGoPractice(SEED);

  it('no reaction to a circle for 800 ms is an omission', () => {
    const { vis, trials } = setup();
    stepUntil(() => vis('gng-circle'));
    stepUntil(() => trials().length === 1, { limit: 1200 });
    expect(trials()[0]).toMatchObject({ stimulus: 'go', event_type: 'omission', rt_ms: null, is_practice: true });
  });

  it('the stimulus disappears after 500 ms but a reaction up to 800 ms still counts', () => {
    const { vis, trials } = setup();
    stepUntil(() => vis('gng-circle'));
    act(() => { vi.advanceTimersByTime(60); }); // onset recorded
    act(() => { vi.advanceTimersByTime(500); });
    expect(vis('gng-circle')).toBe(false);
    act(() => { vi.advanceTimersByTime(100); });
    press('Space');
    stepUntil(() => trials().length === 1, { limit: 400 });
    expect(trials()[0]).toMatchObject({ event_type: 'hit', anticipation: false, valid: true });
    expect(trials()[0].rt_ms).toBeGreaterThan(550);
    expect(trials()[0].rt_ms).toBeLessThan(800);
  });

  it('Space on the square is a commission; a second press in the same trial is ignored', () => {
    const { vis, trials, controlRef } = setup();
    const firstNogo = seq.findIndex(t => t.stimulus === 'nogo');
    stepUntil(() => vis('gng-square'));
    act(() => { vi.advanceTimersByTime(50); });
    press('Space');
    const first = controlRef.current.snapshot();
    act(() => { vi.advanceTimersByTime(40); });
    press('Space');
    stepUntil(() => trials().length === firstNogo + 1, { limit: 1200 });
    const t = trials()[firstNogo];
    expect(t).toMatchObject({ stimulus: 'nogo', event_type: 'commission', expected: 'withhold', actual: 'press' });
    expect(controlRef.current.snapshot().events.filter(e => e.kind === 'extra_press').length).toBeGreaterThanOrEqual(1);
    expect(first).toBeTruthy();
  });

  it('a press during the ITI is not a response', () => {
    const { trials } = setup();
    act(() => { vi.advanceTimersByTime(300); });
    press('Space');
    stepUntil(() => trials().length === 1, { limit: 3000 });
    expect(trials()[0].event_type).toBe('omission');
  });

  it('runs the whole practice and reports completion without leaving timers', () => {
    const { onComplete, unmount } = setup();
    stepUntil(() => onComplete.mock.calls.length === 1, { step: 20, limit: 60000 });
    expect(onComplete.mock.calls[0][0].trials).toHaveLength(10);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

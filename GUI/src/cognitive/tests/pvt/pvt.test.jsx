import { StrictMode, createRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { press, stepUntil, tap, useFake } from '../../helpers.js';
import { drawIsi, isiSequence } from './sequence.js';
import { classifyPvt, scorePvt } from './scoring.js';
import PvtTask from './PvtTask.jsx';
import { mulberry32 } from '../../engine/prng.js';

beforeEach(() => { useFake(); });
afterEach(() => { vi.useRealTimers(); });

describe('pvt sequence', () => {
  it('10 000 ISIs lie in [1000, 4000] with mean 2500 +- 30; same seed, same sequence', () => {
    const xs = isiSequence(12345, 10000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(1000);
    expect(Math.max(...xs)).toBeLessThanOrEqual(4000);
    expect(Math.abs(xs.reduce((a, b) => a + b, 0) / xs.length - 2500)).toBeLessThan(30);
    expect(isiSequence(12345, 50)).toEqual(xs.slice(0, 50));
    expect(isiSequence(12346, 50)).not.toEqual(xs.slice(0, 50));
    expect(drawIsi(mulberry32(1))).toBe(isiSequence(1, 1)[0]);
  });
});

describe('pvt scoring', () => {
  const mk = (rts, extra = {}) => rts.map((rt, idx) => ({ idx, rt_ms: rt, event_type: classifyPvt(rt), ...extra }));
  it('classifies 99 / 100 / 354 / 355', () => {
    expect([99, 100, 354, 355, null].map(classifyPvt)).toEqual(['false_start', 'response', 'response', 'lapse', 'lapse']);
  });
  it('[250,300,354,355,99,100] -> 1 lapse, 1 false start, median 300, score 66.67', () => {
    const out = scorePvt(mk([250, 300, 354, 355, 99, 100]));
    expect(out.metrics.pvt_lapses).toBe(1);
    expect(out.metrics.pvt_false_starts).toBe(1);
    expect(out.metrics.pvt_median_rt_ms).toBe(300); // median of [250,300,354,355,100] sorted -> 300
    expect(out.metrics.pvt_score).toBeCloseTo(66.667, 2);
    expect(out.quality).toBe('low'); // fewer than 20 valid RTs
  });
  it('empty list -> every metric null, no NaN', () => {
    const out = scorePvt([]);
    expect(Object.values(out.metrics).every(v => v === null)).toBe(true);
    expect(out.status).toBe('invalid');
  });
});

describe('PvtTask', () => {
  const setup = (props = {}) => {
    const controlRef = createRef();
    const onComplete = vi.fn();
    const utils = render(<PvtTask seed={777} controlRef={controlRef} onComplete={onComplete} {...props} />);
    return { ...utils, controlRef, onComplete, counter: () => utils.getByTestId('pvt-counter') };
  };
  const isi = () => isiSequence(777, 3);

  it('response 250 ms after the stimulus is a valid "response"', () => {
    const { controlRef, counter } = setup();
    expect(counter().style.visibility).toBe('hidden');
    stepUntil(() => counter().style.visibility === 'visible');
    act(() => { vi.advanceTimersByTime(40); }); // second frame -> onset recorded
    act(() => { vi.advanceTimersByTime(250); });
    press('Space');
    const [t] = controlRef.current.snapshot().trials;
    expect(t.event_type).toBe('response');
    expect(t.rt_ms).toBeGreaterThanOrEqual(250);
    expect(t.rt_ms).toBeLessThan(300);
    expect(t.ts_source).toBe('e');
    expect(t.stimulus).toBe('counter');
    expect(t.valid).toBe(true);
    expect(t.isi_ms).toBeGreaterThanOrEqual(isi()[0]);
  });

  it('a press during the ISI is a false start and the ISI restarts with a new draw', () => {
    const { controlRef, counter } = setup();
    act(() => { vi.advanceTimersByTime(500); });
    press('Space');
    const snap = controlRef.current.snapshot();
    expect(snap.trials).toHaveLength(1);
    expect(snap.trials[0]).toMatchObject({ event_type: 'false_start', rt_ms: null, t_onset_ms: null });
    expect(counter().style.visibility).toBe('hidden');
    // a NEW ISI (the 2nd draw) counts from the press and INCLUDES the 1 s feedback (Basner 2011)
    act(() => { vi.advanceTimersByTime(1000); });
    expect(counter().style.visibility).toBe('hidden');
    const waited = 1000 + stepUntil(() => counter().style.visibility === 'visible');
    expect(waited).toBeGreaterThanOrEqual(isi()[1] - 20);
    expect(waited).toBeLessThan(isi()[1] + 60);
  });

  it('after a response the next stimulus comes one ISI after the response, feedback included (Basner 2011)', () => {
    const { controlRef, counter } = setup();
    stepUntil(() => counter().style.visibility === 'visible');
    act(() => { vi.advanceTimersByTime(40); });
    act(() => { vi.advanceTimersByTime(250); });
    press('Space');
    expect(counter().style.visibility).toBe('visible'); // the frozen RT is the feedback
    act(() => { vi.advanceTimersByTime(1000); });       // 1 s feedback is part of the ISI
    const waited = 1000 + stepUntil(() => counter().style.visibility === 'visible');
    expect(waited).toBeGreaterThanOrEqual(isi()[1] - 20);
    expect(waited).toBeLessThan(isi()[1] + 60);
    act(() => { vi.advanceTimersByTime(40); });  // second frame -> onset recorded
    act(() => { vi.advanceTimersByTime(300); });
    press('Space');
    const t2 = controlRef.current.snapshot().trials[1];
    expect(t2.isi_ms).toBeGreaterThanOrEqual(isi()[1] - 1);   // recorded ISI = response -> next onset
    expect(t2.isi_ms).toBeLessThan(isi()[1] + 60);
  });

  it('auto-repeat is ignored', () => {
    const { controlRef, counter } = setup();
    stepUntil(() => counter().style.visibility === 'visible');
    act(() => { vi.advanceTimersByTime(300); });
    press('Space', { repeat: true });
    expect(controlRef.current.snapshot().trials).toHaveLength(0);
    press('Space');
    expect(controlRef.current.snapshot().trials).toHaveLength(1);
    press('Space'); // second press during feedback is only logged
    const snap = controlRef.current.snapshot();
    expect(snap.trials).toHaveLength(1);
    expect(snap.events.some(e => e.kind === 'extra_press')).toBe(true);
  });

  it('prevents the default of Space (no page scroll / button click)', () => {
    setup();
    expect(press('Space').defaultPrevented).toBe(true);
    expect(press('KeyA').defaultPrevented).toBe(false);
  });

  it('a tap on the field counts as a response and sets device_class touch', () => {
    const onFirstInput = vi.fn();
    const { controlRef, counter, getByTestId } = setup({ onFirstInput });
    stepUntil(() => counter().style.visibility === 'visible');
    act(() => { vi.advanceTimersByTime(300); });
    tap(getByTestId('cog-field'));
    expect(controlRef.current.snapshot().trials[0].event_type).toBe('response');
    expect(onFirstInput).toHaveBeenCalledWith('touch');
  });

  it('30 s without a reaction is a timeout lapse', () => {
    const { controlRef, counter } = setup();
    stepUntil(() => counter().style.visibility === 'visible');
    act(() => { vi.advanceTimersByTime(30100); });
    expect(controlRef.current.snapshot().trials[0]).toMatchObject({ event_type: 'lapse', timeout: true, rt_ms: null });
  });

  it('practice mode ends after 3 trials and marks them is_practice', () => {
    const { onComplete, counter } = setup({ practice: true });
    for (let i = 0; i < 3; i += 1) {
      stepUntil(() => counter().style.visibility === 'visible');
      act(() => { vi.advanceTimersByTime(200); });
      press('Space');
      act(() => { vi.advanceTimersByTime(1000); });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    const res = onComplete.mock.calls[0][0];
    expect(res.trials).toHaveLength(3);
    expect(res.trials.every(t => t.is_practice)).toBe(true);
    expect(res.device_class).toBe('keyboard');
  });

  it('unmount in the middle of a trial leaves no timers or frames', () => {
    const { unmount, counter } = setup();
    stepUntil(() => counter().style.visibility === 'visible');
    act(() => { vi.advanceTimersByTime(100); });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('survives StrictMode double mount: exactly one live test', () => {
    const onComplete = vi.fn();
    const controlRef = createRef();
    const { unmount } = render(<StrictMode><PvtTask seed={777} controlRef={controlRef} onComplete={onComplete} /></StrictMode>);
    act(() => { vi.advanceTimersByTime(0); }); // flush React's own scheduler tick
    expect(vi.getTimerCount()).toBe(1); // one ISI timer, not two
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

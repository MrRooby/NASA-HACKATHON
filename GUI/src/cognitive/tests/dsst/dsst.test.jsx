import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { press, stamp, stepUntil, tap, useFake } from '../../helpers.js';
import DsstTask, { digitFromCode } from './DsstTask.jsx';
import { SETS, SHAPE_OF, dsstPractice, dsstSequence, shapeFor } from './sequence.js';
import { scoreDsst } from './scoring.js';

beforeEach(() => { useFake(); });
afterEach(() => { vi.useRealTimers(); });

describe('dsst sequence', () => {
  it('every block of 9 is a permutation of 1-9 and no symbol repeats back to back', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const seq = dsstSequence(seed, 30);
      expect(seq).toHaveLength(270);
      for (let b = 0; b < 30; b += 1) expect([...seq.slice(b * 9, b * 9 + 9)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (let i = 1; i < seq.length; i += 1) expect(seq[i]).not.toBe(seq[i - 1]);
      expect(dsstSequence(seed, 30)).toEqual(seq);
    }
    expect([...dsstPractice(5)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('sets A-D are different permutations of the 9 shapes', () => {
    const keys = SETS.map(s => SHAPE_OF[s].join(','));
    expect(new Set(keys).size).toBe(4);
    for (const s of SETS) expect([...SHAPE_OF[s]].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('dsst scoring', () => {
  it('40 correct + 5 errors in 90 s -> 26.67 / min, accuracy 0.889', () => {
    const t = [...Array.from({ length: 40 }, () => ({ event_type: 'correct', rt_ms: 1500 })), ...Array.from({ length: 5 }, () => ({ event_type: 'error', rt_ms: 1500 }))];
    const out = scoreDsst(t, 90);
    expect(out.metrics.dsst_throughput_per_min).toBeCloseTo(26.667, 2);
    expect(out.metrics.dsst_accuracy).toBeCloseTo(0.8889, 3);
    expect(out.status).toBe('complete');
  });
  it('accuracy 0.3 is invalid', () => {
    const t = [...Array.from({ length: 3 }, () => ({ event_type: 'correct', rt_ms: 1 })), ...Array.from({ length: 7 }, () => ({ event_type: 'error', rt_ms: 1 }))];
    expect(scoreDsst(t, 90).status).toBe('invalid');
  });
  it('maps event.code: Digit3 / Numpad3 = 3, letters and 0 ignored', () => {
    expect(['Digit3', 'Numpad3', 'Digit1', 'Numpad9'].map(digitFromCode)).toEqual([3, 3, 1, 9]);
    expect(['KeyA', 'Digit0', 'Numpad0', 'Space', undefined].map(digitFromCode)).toEqual([null, null, null, null, null]);
  });
});

describe('DsstTask', () => {
  const SET = 'B';
  const setup = (props = {}) => {
    const controlRef = createRef();
    const onComplete = vi.fn();
    const utils = render(<DsstTask seed={4242} set={SET} controlRef={controlRef} onComplete={onComplete} {...props} />);
    const shown = () => {
      const el = [...utils.container.querySelectorAll('[data-shape]')].find(e => e.style.display === 'block');
      return el ? SHAPE_OF[SET].indexOf(Number(el.dataset.shape)) + 1 : null;
    };
    return { ...utils, controlRef, onComplete, shown, trials: () => controlRef.current.snapshot().trials };
  };
  const wait = shown => { stepUntil(() => shown() != null); act(() => { vi.advanceTimersByTime(40); }); };

  it('shows the key with the current set and answers via Digit keys', () => {
    const { shown, trials, container } = setup();
    expect(container.querySelectorAll('.cog-key-cell')).toHaveLength(9);
    wait(shown);
    const d = shown();
    press(`Digit${d}`);
    expect(trials()[0]).toMatchObject({ event_type: 'correct', expected: String(d), actual: String(d), stimulus: `B${d}`, is_practice: false });
    act(() => { vi.advanceTimersByTime(40); }); // next symbol is painted on the following frame
    expect(shown()).not.toBeNull();
    expect(shown()).not.toBe(d); // never the same symbol twice in a row
  });

  it('Numpad3 counts as 3 and letters are ignored', () => {
    const { shown, trials } = setup();
    wait(shown);
    const d = shown();
    press('KeyA');
    expect(trials()).toHaveLength(0);
    press(`Numpad${d}`);
    expect(trials()[0].actual).toBe(String(d));
    expect(trials()[0].event_type).toBe('correct');
  });

  it('on-screen keypad: a tap answers, a wrong digit is an error and the next symbol follows immediately', () => {
    const onFirstInput = vi.fn();
    const { shown, trials } = setup({ onFirstInput });
    wait(shown);
    const d = shown();
    const wrong = d === 3 ? 4 : 3;
    tap(screen.getByRole('button', { name: `Digit ${wrong}` }));
    expect(trials()[0]).toMatchObject({ event_type: 'error', expected: String(d), actual: String(wrong) });
    expect(onFirstInput).toHaveBeenCalledWith('touch');
    expect(shown()).not.toBeNull();
  });

  it('keypad: numpad order (7-8-9 on top), digits only, a tap on the digit text answers', () => {
    const { shown, trials, container } = setup();
    const keys = [...container.querySelectorAll('.cog-keypad-btn')];
    expect(keys.map(k => k.dataset.digit)).toEqual(['7', '8', '9', '4', '5', '6', '1', '2', '3']);
    expect(container.querySelectorAll('.cog-keypad .cog-symbol')).toHaveLength(0);
    wait(shown);
    const d = shown();
    const btn = screen.getByRole('button', { name: `Digit ${d}` });
    tap(btn);
    expect(btn).toHaveClass('is-pressed');
    expect(trials()[0]).toMatchObject({ event_type: 'correct', actual: String(d) });
    tap(screen.getByRole('button', { name: 'STOP' }));
    expect(trials()).toHaveLength(1);
  });

  it('ends after 90 s and ignores answers stamped after the deadline', () => {
    const { shown, trials, onComplete } = setup();
    wait(shown);
    act(() => { vi.advanceTimersByTime(89900); });
    const d = shown();
    // an answer whose timestamp is past the limit although the timer has not fired yet
    const ev = stamp(new KeyboardEvent('keydown', { code: `Digit${d}`, cancelable: true }), performance.now() + 500);
    act(() => { window.dispatchEvent(ev); });
    expect(trials()).toHaveLength(0);
    stepUntil(() => onComplete.mock.calls.length === 1, { limit: 3000 });
    expect(onComplete.mock.calls[0][0].duration_s).toBe(90);
    press(`Digit${d}`); // after the end nothing is recorded
    expect(onComplete.mock.calls[0][0].trials).toHaveLength(0);
  });

  it('practice: 9 trials with feedback, then completion; unmount leaves no timers', () => {
    const { shown, onComplete, unmount } = setup({ practice: true });
    for (let i = 0; i < 9; i += 1) { wait(shown); press(`Digit${shown()}`); }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].trials).toHaveLength(9);
    expect(shapeFor('A', 1)).toBe(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.keyDown(window, { code: 'Digit1' });
  });
});

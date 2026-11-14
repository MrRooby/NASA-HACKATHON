import React, { useRef } from 'react';
import { inputTime, onsetViaRaf } from '../../engine/clock.js';
import { mulberry32 } from '../../engine/prng.js';
import { attachInput, makeTrial, useTrialRunner } from '../../engine/runner.js';
import { createTaskKit } from '../../engine/taskKit.js';
import { DSST_DURATION_S, createDsstStream, dsstPractice, shapeFor, stimulusId } from './sequence.js';
import { Symbol as ShapeSymbol } from './symbols.jsx';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const digitFromCode = code => {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code || '');
  return m ? Number(m[1]) : null;
};

/** DSST (dsst-1.0). Props: seed, set ('A'-'D'), practice (9 trials with feedback), durationS. */
export default function DsstTask({ seed, set = 'A', practice = false, durationS = DSST_DURATION_S, onComplete, onFirstInput, onEscape, controlRef }) {
  const fieldRef = useRef(null);
  const stimRef = useRef(null);
  const hintRef = useRef(null);
  const props = useRef({});
  props.current = { onComplete, onFirstInput, onEscape };

  useTrialRunner(sched => {
    const field = fieldRef.current;
    const symbolEls = [...stimRef.current.querySelectorAll('[data-shape]')];
    const hint = hintRef.current;
    const practiceDigits = practice ? dsstPractice(seed) : null;
    const stream = practice ? null : createDsstStream(mulberry32(seed));
    const trials = [];
    const kit = createTaskKit({
      getTrials: () => trials,
      onComplete: r => props.current.onComplete?.(r),
      onFirstInput: c => props.current.onFirstInput?.(c),
      controlRef,
      extra: () => ({ duration_s: durationS }),
    });

    let phase = 'idle'; // switching | ready | done
    let digit = null;
    let tOnset = null;
    let testEnd = null;
    let shown = 0;

    function nextDigit() {
      return practice ? practiceDigits[shown] : stream.next();
    }

    function showNext() {
      if (kit.done) return;
      if (practice && shown >= practiceDigits.length) { phase = 'done'; kit.finish(); return; }
      digit = nextDigit();
      shown += 1;
      phase = 'switching';
      const shape = shapeFor(set, digit);
      onsetViaRaf(sched, () => {
        symbolEls.forEach(el => { el.style.display = el.dataset.shape === String(shape) ? 'block' : 'none'; });
      }, {
        onSchedule: t => {
          tOnset = t;
          phase = 'ready';
          kit.guard.trialStart();
          if (!practice && testEnd == null) {
            testEnd = t + durationS * 1000;
            sched.setTimeout(endTest, durationS * 1000);
          }
        },
        onOnset: t => { if (phase === 'ready') tOnset = t; },
      });
    }

    function endTest() {
      if (kit.done) return;
      phase = 'done';
      kit.finish(); // the symbol on screen at the deadline is not recorded
    }

    function answer(value, e) {
      if (kit.done || phase !== 'ready') return;
      kit.noteInput(e);
      const { t, src } = inputTime(e);
      if (!practice && t > testEnd) return; // answers after the time limit are not recorded
      const ok = value === digit;
      const { valid, focus_lost } = kit.guard.trialEnd();
      trials.push(makeTrial({
        idx: trials.length, is_practice: practice, stimulus: stimulusId(set, digit),
        t_onset_ms: tOnset, t_response_ms: t, rt_ms: Math.max(0, t - tOnset),
        expected: String(digit), actual: String(value), event_type: ok ? 'correct' : 'error',
        valid, focus_lost, ts_source: src,
      }));
      if (practice) hint.textContent = ok ? 'Correct' : `Wrong: the key for this symbol is ${digit}`;
      showNext();
    }

    const detach = attachInput({
      pointerEl: field,
      keys: e => digitFromCode(e.code) != null,
      onKey: e => answer(digitFromCode(e.code), e),
      onPointer: e => {
        const el = e.target?.closest?.('[data-digit]');
        if (el) answer(Number(el.dataset.digit), e);
      },
      onEscape: () => props.current.onEscape?.(),
    });
    field.focus?.();
    showNext();

    return () => {
      detach();
      kit.dispose();
    };
  });

  return (
    <div className="cog-field cog-field-dsst" ref={fieldRef} tabIndex={-1} data-testid="cog-field" role="application" aria-label="Symbol-digit test: press the digit key that matches the symbol">
      <div className="cog-key" aria-label="Symbol key">
        {DIGITS.map(d => (
          <div className="cog-key-cell" key={d}>
            <ShapeSymbol shape={shapeFor(set, d)} size={30} />
            <span>{d}</span>
          </div>
        ))}
      </div>
      <div className="cog-stim-box" ref={stimRef} data-testid="dsst-stimulus">
        {Array.from({ length: 9 }, (_, shape) => (
          <div key={shape} data-shape={shape} style={{ display: 'none' }}>
            <ShapeSymbol shape={shape} size={96} />
          </div>
        ))}
      </div>
      <div className="cog-hint" ref={hintRef} aria-live="polite" />
      <div className="cog-keypad" role="group" aria-label="On-screen keypad">
        {DIGITS.map(d => (
          <button type="button" key={d} data-digit={d} className="cog-keypad-btn" tabIndex={-1} aria-label={`Digit ${d}`}>
            <ShapeSymbol shape={shapeFor(set, d)} size={22} />
            <span>{d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

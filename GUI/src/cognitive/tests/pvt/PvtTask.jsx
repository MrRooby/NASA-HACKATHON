import React, { useRef } from 'react';
import { inputTime, onsetViaRaf, now } from '../../engine/clock.js';
import { mulberry32 } from '../../engine/prng.js';
import { attachInput, makeTrial, useTrialRunner } from '../../engine/runner.js';
import { createTaskKit } from '../../engine/taskKit.js';
import StopButton from '../../StopButton.jsx';
import { drawIsi } from './sequence.js';
import { PVT_TIMEOUT_MS, classifyPvt } from './scoring.js';

export const PVT_DURATION_MS = 180000;
export const PVT_PRACTICE_TRIALS = 3;
export const PVT_FEEDBACK_MS = 1000;

/**
 * PVT-B (pvtb-1.0). The counter is shown by direct DOM mutation (no React state in the trial loop).
 * Props: seed, practice (3 trials with is_practice), durationMs, onComplete(result), onFirstInput(cls),
 * onEscape(), controlRef ({ current: { snapshot() } } filled by the task).
 */
export default function PvtTask({ seed, practice = false, durationMs = PVT_DURATION_MS, onComplete, onFirstInput, onEscape, controlRef }) {
  const fieldRef = useRef(null);
  const counterRef = useRef(null);
  const hintRef = useRef(null);
  const props = useRef({});
  props.current = { onComplete, onFirstInput, onEscape };

  useTrialRunner(sched => {
    const field = fieldRef.current;
    const counter = counterRef.current;
    const hint = hintRef.current;
    const rng = mulberry32(seed);
    const trials = [];
    const kit = createTaskKit({
      getTrials: () => trials,
      onComplete: r => props.current.onComplete?.(r),
      onFirstInput: c => props.current.onFirstInput?.(c),
      controlRef,
      extra: () => ({ duration_s: durationMs / 1000 }),
    });

    let phase = 'idle'; // isi | pending | stim | feedback | done
    let testStart = null;
    let isiTimer = null;
    let timeoutTimer = null;
    let counterFrame = null;
    let tIsiStart = 0;
    let tOnset = null;
    let tSchedule = null;
    let plannedIsi = 0;
    // Basner 2011: "ISIs varied randomly from 1-4 s (including a 1 s RT feedback interval)". The ISI is drawn at the
    // response (or false start / timeout) and the 1 s feedback is part of it; only the very first trial has no feedback.
    let pendingIsi = null; // { isi, t0 } drawn in feedback()

    const setCounter = text => { counter.textContent = text; };
    const showCounter = visible => { counter.style.visibility = visible ? 'visible' : 'hidden'; };
    const setHint = text => { hint.textContent = text; };

    function record(fields) {
      const { valid, focus_lost } = kit.guard.trialEnd();
      trials.push(makeTrial({ idx: trials.length, is_practice: practice, stimulus: 'counter', valid, focus_lost, ...fields }));
    }

    function startIsi() {
      if (kit.done) return;
      if (testStart == null) testStart = now();
      const finished = practice ? trials.length >= PVT_PRACTICE_TRIALS : now() - testStart >= durationMs;
      if (finished) { phase = 'done'; kit.finish(); return; }
      phase = 'isi';
      kit.guard.trialStart();
      showCounter(false);
      setHint('');
      let wait;
      if (pendingIsi) {
        ({ isi: plannedIsi, t0: tIsiStart } = pendingIsi);
        wait = Math.max(0, plannedIsi - (now() - tIsiStart)); // the remainder after the 1 s feedback
      } else {
        plannedIsi = drawIsi(rng);
        tIsiStart = now();
        wait = plannedIsi;
      }
      pendingIsi = null;
      tOnset = null;
      isiTimer = sched.setTimeout(showStimulus, wait);
    }

    function showStimulus() {
      phase = 'pending'; // ISI over, stimulus not painted yet: a press now is still a false start
      onsetViaRaf(sched, () => {
        if (phase !== 'pending') return;
        setCounter('0');
        showCounter(true);
      }, {
        onSchedule: t => { if (phase !== 'pending') return; tSchedule = t; tOnset = t; phase = 'stim'; },
        onOnset: t => {
          if (phase !== 'stim') return;
          tOnset = t;
          const tick = () => {
            setCounter(String(Math.floor(now() - tOnset)));
            counterFrame = sched.raf(tick);
          };
          tick();
          timeoutTimer = sched.setTimeout(onTimeout, PVT_TIMEOUT_MS);
        },
      });
    }

    function feedback(text, t0 = now()) {
      phase = 'feedback';
      pendingIsi = { isi: drawIsi(rng), t0 }; // next ISI counts from the response; feedback fills its first 1000 ms
      sched.setTimeout(startIsi, PVT_FEEDBACK_MS);
      if (text != null) setHint(text);
    }

    function stopCounter() {
      sched.cancelRaf(counterFrame);
      sched.clearTimeout(timeoutTimer);
      counterFrame = null;
      timeoutTimer = null;
    }

    function onTimeout() {
      if (phase !== 'stim') return;
      stopCounter();
      record({
        isi_ms: tOnset - tIsiStart, t_onset_ms: tOnset, t_response_ms: null, rt_ms: null,
        event_type: 'lapse', timeout: true,
      });
      setCounter('30000');
      feedback('No response');
    }

    function onPress(e) {
      if (kit.done) return;
      kit.noteInput(e);
      const { t, src } = inputTime(e);
      if (phase === 'isi' || phase === 'pending') {
        sched.clearTimeout(isiTimer);
        record({
          isi_ms: t - tIsiStart, t_onset_ms: null, t_response_ms: t, rt_ms: null,
          event_type: 'false_start', ts_source: src,
        });
        showCounter(false);
        feedback('Too early', t);
      } else if (phase === 'stim') {
        const rt = Math.max(0, t - tOnset);
        stopCounter();
        record({
          isi_ms: tOnset - tIsiStart, t_onset_ms: tOnset, t_response_ms: t, rt_ms: rt,
          event_type: classifyPvt(rt), ts_source: src,
        });
        setCounter(String(Math.round(rt)));
        feedback(null, t);
      } else if (phase === 'feedback') {
        kit.log('extra_press');
      }
    }

    const detach = attachInput({
      pointerEl: field,
      keys: e => e.code === 'Space',
      onKey: onPress,
      onPointer: onPress,
      onEscape: () => props.current.onEscape?.(),
    });
    field.focus?.();
    startIsi();

    return () => {
      detach();
      kit.dispose();
    };
  });

  return (
    <div className="cog-field" ref={fieldRef} tabIndex={-1} data-testid="cog-field" role="application" aria-label="Reaction time test: press Space or tap anywhere when the counter appears">
      <StopButton onStop={() => props.current.onEscape?.()} />
      <div className="cog-pvt-counter" ref={counterRef} data-testid="pvt-counter" style={{ visibility: 'hidden' }}>0</div>
      <div className="cog-hint" ref={hintRef} aria-live="polite" data-testid="pvt-hint" />
    </div>
  );
}

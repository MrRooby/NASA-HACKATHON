import React, { useRef } from 'react';
import { inputTime, onsetViaRaf } from '../../engine/clock.js';
import { attachInput, makeTrial, useTrialRunner } from '../../engine/runner.js';
import { createTaskKit } from '../../engine/taskKit.js';
import { GONOGO_ANTICIPATION_MS } from './scoring.js';
import { goNoGoPractice, goNoGoSequence, goNoGoShort } from './sequence.js';

export const STIMULUS_MS = 500;
export const WINDOW_MS = 800;

/** Go/No-Go (gonogo-1.0): circle = press, square = do not press. Same props as PvtTask; `shortTrials` {total, nogo} = demo run. */
export default function GoNoGoTask({ seed, practice = false, shortTrials = null, onComplete, onFirstInput, onEscape, controlRef }) {
  const fieldRef = useRef(null);
  const goRef = useRef(null);
  const nogoRef = useRef(null);
  const hintRef = useRef(null);
  const props = useRef({});
  props.current = { onComplete, onFirstInput, onEscape };

  useTrialRunner(sched => {
    const field = fieldRef.current;
    const shapes = { go: goRef.current, nogo: nogoRef.current };
    const hint = hintRef.current;
    const seq = practice ? goNoGoPractice(seed) : shortTrials ? goNoGoShort(seed, shortTrials.total, shortTrials.nogo) : goNoGoSequence(seed);
    const trials = [];
    const kit = createTaskKit({
      getTrials: () => trials,
      onComplete: r => props.current.onComplete?.(r),
      onFirstInput: c => props.current.onFirstInput?.(c),
      controlRef,
    });

    let phase = 'idle'; // iti | window | done
    let i = -1;
    let tItiStart = 0;
    let tOnset = null;
    let response = null;
    let current = null;

    const hide = () => { shapes.go.style.visibility = 'hidden'; shapes.nogo.style.visibility = 'hidden'; };

    function startTrial() {
      if (kit.done) return;
      i += 1;
      if (i >= seq.length) { phase = 'done'; kit.finish(); return; }
      current = seq[i];
      phase = 'iti';
      response = null;
      tOnset = null;
      kit.guard.trialStart();
      tItiStart = performance.now();
      sched.setTimeout(showStimulus, current.iti_ms);
    }

    function showStimulus() {
      const kind = current.stimulus;
      onsetViaRaf(sched, () => { hint.textContent = ''; shapes[kind].style.visibility = 'visible'; }, {
        onSchedule: t => { tOnset = t; phase = 'window'; },
        onOnset: t => {
          if (phase !== 'window') return;
          tOnset = t;
          sched.setTimeout(hide, STIMULUS_MS);
          sched.setTimeout(endTrial, WINDOW_MS);
        },
      });
    }

    function endTrial() {
      if (phase !== 'window') return;
      phase = 'gap';
      hide();
      const isGo = current.stimulus === 'go';
      const responded = response != null;
      const rt = responded ? Math.max(0, response.t - tOnset) : null;
      let eventType;
      if (isGo) eventType = responded ? 'hit' : 'omission';
      else eventType = responded ? 'commission' : 'correct_rejection';
      const { valid, focus_lost } = kit.guard.trialEnd();
      trials.push(makeTrial({
        idx: trials.length, is_practice: practice, stimulus: current.stimulus,
        isi_ms: tOnset - tItiStart, t_onset_ms: tOnset, t_response_ms: responded ? response.t : null, rt_ms: rt,
        expected: isGo ? 'press' : 'withhold', actual: responded ? 'press' : 'withhold',
        event_type: eventType, anticipation: isGo && responded && rt < GONOGO_ANTICIPATION_MS,
        valid, focus_lost, ts_source: responded ? response.src : null,
      }));
      if (practice) {
        const good = eventType === 'hit' || eventType === 'correct_rejection';
        hint.textContent = good ? 'Correct' : (isGo ? 'Missed: press for the circle' : 'Wrong: do not press for the square');
      }
      startTrial();
    }

    function onPress(e) {
      if (kit.done) return;
      kit.noteInput(e);
      const { t, src } = inputTime(e);
      if (phase === 'window') {
        if (response != null) { kit.log('extra_press'); return; }
        if (t - tOnset > WINDOW_MS) { kit.log('late_press'); return; }
        response = { t, src };
      } else {
        kit.log('extra_press', phase);
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
    startTrial();

    return () => {
      detach();
      kit.dispose();
    };
  });

  return (
    <div className="cog-field" ref={fieldRef} tabIndex={-1} data-testid="cog-field" role="application" aria-label="Go/No-Go test: press Space or tap for the circle, do nothing for the square">
      <div className="cog-gng">
        <div className="cog-shape cog-shape-circle" ref={goRef} data-testid="gng-circle" style={{ visibility: 'hidden' }} />
        <div className="cog-shape cog-shape-square" ref={nogoRef} data-testid="gng-square" style={{ visibility: 'hidden' }} />
      </div>
      <div className="cog-hint" ref={hintRef} aria-live="polite" />
    </div>
  );
}

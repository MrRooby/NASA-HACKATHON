import React, { useEffect, useMemo, useRef, useState } from 'react';
import Calibration from './Calibration.jsx';
import ResultCard from './ResultCard.jsx';
import Survey from './Survey.jsx';
import { seedFrom, stimulusSetFor } from './engine/prng.js';
import { DEMO_OVERRIDES, PROTOCOLS } from './engine/protocols.js';
import { apiSink } from './engine/sink.js';
import { acquireTabLock } from './engine/tabLock.js';
import { requestWakeLock } from './engine/wakeLock.js';
import { assess, batteryFor, buildPayload, bumpLocalSessionNo, localSessionNo, sessionStatus, uuid4 } from './session.js';
import DsstTask from './tests/dsst/DsstTask.jsx';
import GoNoGoTask from './tests/gonogo/GoNoGoTask.jsx';
import PvtTask from './tests/pvt/PvtTask.jsx';

const TASKS = { pvt: PvtTask, gonogo: GoNoGoTask, dsst: DsstTask };

const INSTRUCTIONS = {
  pvt: [
    'A red counter will appear at random moments.',
    'As soon as it appears, press Space (or tap the field) as fast as you can.',
    'Do not press before it appears. The test lasts 3 minutes.',
  ],
  gonogo: [
    'Shapes appear one at a time in the middle of the screen.',
    'When you see a circle, press Space (or tap) as fast as you can.',
    'When you see a square, do nothing.',
  ],
  dsst: [
    'Each symbol has a digit. The key is always shown at the top.',
    'Press the digit that matches the symbol you see (keyboard 1-9, numpad, or the on-screen keypad).',
    'Answer as fast and as accurately as you can. The test lasts 90 seconds.',
  ],
};

const PRACTICE_NOTE = { pvt: '3 practice trials', gonogo: '10 practice trials', dsst: '9 practice trials' };

/**
 * `sink` decides where a finished session goes (default: MOTHER via apiSink). `demo` runs shortened protocols and marks
 * the session is_practice / status_reason 'demo'. `resultExtra({ test, payload, scored, demo })` renders under the result card.
 * One session (Quick = PVT, Full = PVT then Go/No-Go and DSST in alternating order).
 * survey -> calibrate -> per test: instructions -> practice -> ready -> test -> result.
 */
export default function SessionFlow({ subject, mission = null, mode = 'quick', tiles = null, sink = apiSink, demo = false, resultExtra = null, onExit, onRunningChange, onSaved }) {
  const tileOf = id => (tiles || []).find(t => t.test_id === id) || null;
  const order = useMemo(() => {
    const pvtNo = tileOf('pvt')?.next?.session_no ?? localSessionNo(subject, 'pvt');
    return batteryFor(mode, pvtNo);
  }, [mode, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const battery = useMemo(() => (mode === 'full' ? uuid4() : null), [mode]);

  const [lock, setLock] = useState('checking');
  const [stage, setStage] = useState('survey');
  const [pos, setPos] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [context, setContext] = useState(null);
  const [device, setDevice] = useState({});
  const [outcome, setOutcome] = useState(null);

  const test = order[pos];
  const info = useMemo(() => {
    const tile = tileOf(test);
    const sessionNo = tile?.next?.session_no ?? localSessionNo(subject, test);
    const stimulusSet = tile?.next?.stimulus_set ?? stimulusSetFor(sessionNo);
    return { sessionNo, stimulusSet, seed: seedFrom(subject, test, stimulusSet, sessionNo), baselineReady: Boolean(tile?.baseline?.ready) };
  }, [test, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const practiceRef = useRef(null);
  const startedAt = useRef(null);
  const controlRef = useRef(null);
  const firstInput = useRef(null);

  useEffect(() => {
    const l = acquireTabLock({ name: 'cognitive-test' });
    setLock(l.acquired ? 'ok' : 'busy');
    return () => l.release();
  }, []);

  const running = stage === 'practice' || stage === 'ready' || stage === 'run';
  useEffect(() => { onRunningChange?.(running); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onRunningChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return undefined;
    const wl = requestWakeLock();
    return () => wl.release();
  }, [running]);

  async function finalize(res, aborted) {
    const completedAt = Date.now();
    const { status, reason } = sessionStatus({ aborted, focus: res.focus });
    const device_class = res.device_class || practiceRef.current?.device_class || firstInput.current || 'keyboard';
    const lowTimer = device.timer_resolution_ms != null && device.timer_resolution_ms > 2;
    const { payload, scored } = buildPayload({
      subject, mission, test, sessionNo: info.sessionNo, stimulusSet: info.stimulusSet, seed: info.seed,
      battery: battery ? { uuid: battery, position: pos } : null,
      status, statusReason: reason || (lowTimer ? 'timer_resolution_over_2ms' : null),
      startedAt: startedAt.current, completedAt,
      durationS: res.duration_s ?? Math.round((completedAt - startedAt.current) / 1000),
      device: { ...device, device_class }, context, practice: practiceRef.current, main: res,
    });
    if (demo) { payload.is_practice = true; payload.status_reason = 'demo'; }
    setStage('saving');
    const saved = await sink.submit(payload);
    if (saved.state !== 'rejected') bumpLocalSessionNo(subject, test, info.sessionNo);
    onSaved?.(saved);
    const assessment = assess(test, scored, { baselineReady: info.baselineReady && !demo, sessionStatus: status, serverStatus: saved.response?.status });
    if (demo && assessment.text === 'BASELINE BUILDING') assessment.note = 'Demo run: only to check the flow. It is never counted in your baseline.';
    setOutcome({ scored, payload, saveState: saved.state, sessionStatus: status, assessment });
    setStage('result');
  }

  const confirmAbort = () => {
    if (!controlRef.current) return;
    // eslint-disable-next-line no-alert
    if (window.confirm('Stop this test? Your partial result will be saved but not counted.')) {
      const snap = controlRef.current.snapshot();
      if (stage === 'run') finalize(snap, true);
      else onExit?.();
    }
  };

  const next = () => {
    if (pos + 1 < order.length) { setPos(pos + 1); setAttempt(0); practiceRef.current = null; setOutcome(null); setStage('instructions'); }
    else onExit?.();
  };
  const repeat = () => { setAttempt(a => a + 1); practiceRef.current = null; setOutcome(null); setStage('instructions'); };

  if (lock === 'checking') return null;
  if (lock === 'busy') {
    return (
      <div className="cog-card" role="alert">
        <h2 className="cog-h2">A test is already running in another window</h2>
        <p className="cog-muted">Close it or wait for it to finish, then try again.</p>
        <button type="button" className="btn-secondary cog-btn" onClick={() => onExit?.()}>BACK</button>
      </div>
    );
  }

  if (stage === 'survey') return <Survey onDone={c => { setContext(c); setStage('calibrate'); }} />;
  if (stage === 'calibrate') return <Calibration onDone={d => { setDevice(d); setStage('instructions'); }} />;

  const Task = TASKS[test];
  const overrides = demo ? DEMO_OVERRIDES[test] : null; // applied to the scored run only, never to practice
  const label = PROTOCOLS[test].label;
  const step = order.length > 1 ? ` (${pos + 1} of ${order.length})` : '';

  if (stage === 'instructions') {
    return (
      <div className="cog-card">
        <h2 className="cog-h2">{label}{step}</h2>
        <ul className="cog-steps">{INSTRUCTIONS[test].map(s => <li key={s}>{s}</li>)}</ul>
        {demo && <p className="cog-warn" data-testid="demo-note">DEMO: shortened test, never counted in your baseline.</p>}
        <p className="cog-muted">First: {PRACTICE_NOTE[test]} with feedback. They are not scored.</p>
        <button type="button" className="btn-primary cog-btn" onClick={() => setStage('practice')}>START PRACTICE</button>
      </div>
    );
  }
  if (stage === 'practice') {
    return (
      <Task key={`practice-${test}-${attempt}`} seed={info.seed} set={info.stimulusSet} practice
        controlRef={controlRef}
        onFirstInput={c => { firstInput.current = firstInput.current || c; }}
        onEscape={confirmAbort}
        onComplete={res => { practiceRef.current = res; setStage('ready'); }} />
    );
  }
  if (stage === 'ready') {
    return (
      <div className="cog-card">
        <h2 className="cog-h2">Practice finished</h2>
        <p className="cog-muted">The real test starts now and is scored. Keep this window in front.</p>
        <button type="button" className="btn-primary cog-btn" autoFocus onClick={() => { startedAt.current = Date.now(); setStage('run'); }}>START TEST</button>
      </div>
    );
  }
  if (stage === 'run') {
    return (
      <Task key={`run-${test}-${attempt}`} seed={info.seed} set={info.stimulusSet} {...overrides}
        controlRef={controlRef}
        onFirstInput={c => { firstInput.current = firstInput.current || c; }}
        onEscape={confirmAbort}
        onComplete={res => finalize(res, false)} />
    );
  }
  if (stage === 'saving') return <div className="cog-card" role="status"><h2 className="cog-h2">Saving...</h2></div>;
  if (stage === 'result' && outcome) {
    return (
      <>
        <ResultCard test={test} scored={outcome.scored} assessment={outcome.assessment} saveState={outcome.saveState}
          saveMessages={sink.messages} hasNext={pos + 1 < order.length} onNext={next} onRepeat={repeat} />
        {resultExtra?.({ test, payload: outcome.payload, scored: outcome.scored, demo })}
      </>
    );
  }
  return null;
}

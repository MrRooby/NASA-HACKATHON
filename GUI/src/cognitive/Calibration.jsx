import React, { useEffect, useState } from 'react';
import { calibrateFrames, deviceWarnings, timerResolution } from './engine/clock.js';

/** Measures the screen (120 frames) and the timer resolution, warns about slow devices. */
export default function Calibration({ onDone, frames = 120 }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const job = calibrateFrames(frames);
    let alive = true;
    job.promise.then(r => {
      if (!alive) return;
      setResult({ ...r, timer_resolution_ms: timerResolution() });
    });
    return () => { alive = false; job.cancel(); };
  }, [frames]);

  if (!result) {
    return (
      <div className="cog-card" role="status">
        <h2 className="cog-h2">Checking your screen...</h2>
        <p className="cog-muted">This takes about two seconds. Please keep this window in front.</p>
      </div>
    );
  }
  const warnings = deviceWarnings(result);
  return (
    <div className="cog-card">
      <h2 className="cog-h2">Screen check</h2>
      <dl className="cog-dl">
        <dt>Refresh rate</dt><dd>{result.refresh_hz ?? '-'} Hz</dd>
        <dt>Frame jitter</dt><dd>{result.frame_jitter_ms ?? '-'} ms</dd>
        <dt>Timer resolution</dt><dd>{result.timer_resolution_ms ?? '-'} ms</dd>
      </dl>
      {warnings.length === 0
        ? <p className="cog-muted">Your device looks suitable for timing tests.</p>
        : warnings.map(w => <p key={w} className="cog-warn" role="alert">{w}</p>)}
      <button type="button" className="btn-primary cog-btn" onClick={() => onDone(result)}>CONTINUE</button>
    </div>
  );
}

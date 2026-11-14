import React, { useEffect, useState } from 'react';
import { Button, DataRow, Panel } from '../components/index.js';
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
      <Panel className="cog-card" title="Checking your screen..." role="status">
        <p className="cog-muted">This takes about two seconds. Please keep this window in front.<span className="cursor" /></p>
      </Panel>
    );
  }
  const warnings = deviceWarnings(result);
  return (
    <Panel className="cog-card" title="Screen check" tone={warnings.length ? 'caution' : 'default'}>
      <div className="cog-rows">
        <DataRow label="Refresh rate" value={result.refresh_hz ?? '-'} unit="Hz" />
        <DataRow label="Frame jitter" value={result.frame_jitter_ms ?? '-'} unit="ms" />
        <DataRow label="Timer resolution" value={result.timer_resolution_ms ?? '-'} unit="ms" />
      </div>
      {warnings.length === 0
        ? <p className="cog-muted">Your device looks suitable for timing tests.</p>
        : warnings.map(w => <p key={w} className="cog-warn" role="alert">{w}</p>)}
      <div className="cog-actions"><Button variant="primary" className="cog-btn" onClick={() => onDone(result)}>CONTINUE</Button></div>
    </Panel>
  );
}

import React, { useEffect, useState } from 'react';
import { Button, DataRow, Panel } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { calibrateFrames, deviceWarnings, timerResolution } from './engine/clock.js';

/** Measures the screen (120 frames) and the timer resolution, warns about slow devices. */
export default function Calibration({ onDone, frames = 120 }) {
  const t = useT();
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
      <Panel className="cog-card" title={t('tests.calChecking')} role="status">
        <p className="cog-lead">{t('tests.calWait')}<span className="cursor" /></p>
      </Panel>
    );
  }
  const warnings = deviceWarnings(result);
  return (
    <Panel className="cog-card" title={t('tests.calTitle')} tone={warnings.length ? 'caution' : 'default'}>
      <div className="cog-rows cog-rows-big">
        <DataRow label={t('tests.calRefresh')} value={result.refresh_hz ?? '-'} unit="Hz" />
        <DataRow label={t('tests.calJitter')} value={result.frame_jitter_ms ?? '-'} unit="ms" />
        <DataRow label={t('tests.calTimer')} value={result.timer_resolution_ms ?? '-'} unit="ms" />
      </div>
      {warnings.length === 0
        ? <p className="cog-lead">{t('tests.calOk')}</p>
        : warnings.map(w => <p key={w} className="cog-warn" role="alert">{w}</p>)}
      <div className="cog-actions cog-actions-big"><Button variant="primary" className="cog-btn cog-btn-big" onClick={() => onDone(result)}>{t('tests.continue')}</Button></div>
    </Panel>
  );
}

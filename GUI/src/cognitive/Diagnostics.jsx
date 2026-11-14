import React from 'react';
import { diagnose } from './engine/diagnostics.js';
import { fmt } from './session.js';

function Histogram({ hist }) {
  if (!hist.bins.length) return <p className="cog-muted">No valid reaction times in this run.</p>;
  const W = 300;
  const H = 90;
  const peak = Math.max(...hist.bins.map(b => b.count), 1);
  const bw = W / hist.bins.length;
  return (
    <svg className="cog-hist" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Distribution of reaction times" data-testid="rt-hist">
      {hist.bins.map((b, i) => {
        const h = (b.count / peak) * H;
        return <rect key={b.from} x={i * bw + 1} y={H - h} width={bw - 2} height={h} className="cog-hist-bar"><title>{`${Math.round(b.from)}-${Math.round(b.to)} ms: ${b.count}`}</title></rect>;
      })}
      <line x1="0" y1={H} x2={W} y2={H} className="cog-hist-axis" />
      <text x="0" y={H + 12} className="cog-hist-label">{Math.round(hist.min)} ms</text>
      <text x={W} y={H + 12} textAnchor="end" className="cog-hist-label">{Math.round(hist.max)} ms</text>
    </svg>
  );
}

/** Standalone-only panel after a session: does this device measure reliably? */
export default function Diagnostics({ payload, demo = false }) {
  const d = diagnose(payload, { demo });
  const pct = d.ts_h.share == null ? '-' : `${Math.round(d.ts_h.share * 100)} %`;
  return (
    <div className="cog-card cog-diag" data-testid="diagnostics">
      <h2 className="cog-h2">Device diagnostics</h2>
      <Histogram hist={d.histogram} />
      <dl className="cog-dl">
        <dt>Trials stamped with the high-resolution clock ('h')</dt><dd data-testid="diag-h">{d.ts_h.n} of {d.ts_h.total} ({pct})</dd>
        <dt>Screen refresh rate</dt><dd>{fmt(d.device.refresh_hz, 0, ' Hz')}</dd>
        <dt>Frame jitter</dt><dd>{fmt(d.device.frame_jitter_ms, 2, ' ms')}</dd>
        <dt>Timer resolution</dt><dd>{fmt(d.device.timer_resolution_ms, 2, ' ms')}</dd>
        <dt>Focus lost</dt><dd>{fmt(d.device.focus_lost_ms, 0, ' ms')}</dd>
        <dt>Actual vs planned interval (mean abs. difference)</dt>
        <dd data-testid="diag-isi">{d.isi ? `${fmt(d.isi.mean_abs_diff_ms, 1, ' ms')} (${d.isi.n} trials)` : 'not available'}</dd>
      </dl>
    </div>
  );
}

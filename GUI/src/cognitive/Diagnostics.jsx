import React from 'react';
import { DataRow, Panel } from '../components/index.js';
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
    <Panel className="cog-card cog-diag" title="Device diagnostics" data-testid="diagnostics">
      <Histogram hist={d.histogram} />
      <div className="cog-rows">
        <DataRow label="Trials stamped with the high-resolution clock ('h')" value={<span data-testid="diag-h">{d.ts_h.n} of {d.ts_h.total} ({pct})</span>} />
        <DataRow label="Screen refresh rate" value={fmt(d.device.refresh_hz, 0, ' Hz')} />
        <DataRow label="Frame jitter" value={fmt(d.device.frame_jitter_ms, 2, ' ms')} />
        <DataRow label="Timer resolution" value={fmt(d.device.timer_resolution_ms, 2, ' ms')} />
        <DataRow label="Focus lost" value={fmt(d.device.focus_lost_ms, 0, ' ms')} />
        <DataRow label="Actual vs planned interval (mean abs. difference)"
          value={<span data-testid="diag-isi">{d.isi ? `${fmt(d.isi.mean_abs_diff_ms, 1, ' ms')} (${d.isi.n} trials)` : 'not available'}</span>} />
      </div>
    </Panel>
  );
}

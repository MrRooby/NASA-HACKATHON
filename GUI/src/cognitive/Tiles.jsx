import React from 'react';
import { BASELINE_NEEDED, PROTOCOLS } from './engine/protocols.js';
import { fmt } from './session.js';

const STATUS_TEXT = { ok: 'OK', caution: 'CAUTION', alert: 'ALERT', no_data: 'BUILDING BASELINE' };
const STATUS_ICON = { ok: '✓', caution: '!', alert: '⚠', no_data: 'i' };

/** Small inline SVG trend line (same look as the dashboard sparklines). */
export function TrendSpark({ values, status = 'ok' }) {
  const v = (values || []).filter(x => typeof x === 'number' && Number.isFinite(x));
  if (v.length < 2) return <span className="cog-muted cog-spark-empty">no trend yet</span>;
  const max = Math.max(...v);
  const min = Math.min(...v);
  const y = x => 28 - ((x - min) / (max - min || 1)) * 24;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${y(x)}`).join(' ');
  return (
    <svg className={`spark ${status === 'no_data' ? 'ok' : status}`} viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={`Trend of the last ${v.length} sessions`}>
      <polyline points={pts} />
      <circle cx="100" cy={y(v[v.length - 1])} r="2.5" />
    </svg>
  );
}

export const emptyTile = id => ({
  test_id: id, label: PROTOCOLS[id].label, status: 'no_data', headline: `Building your baseline (0/${BASELINE_NEEDED})`,
  baseline: { n: 0, needed: BASELINE_NEEDED, ready: false }, latest: null, trend: [], next: null,
});

function keyValue(tile) {
  const m = tile.latest?.metrics;
  if (!m) return null;
  if (tile.test_id === 'pvt') return ['Median reaction time', fmt(m.pvt_median_rt_ms, 0, ' ms')];
  if (tile.test_id === 'gonogo') return ['Commission errors', fmt(m.gonogo_commission_rate != null ? m.gonogo_commission_rate * 100 : null, 0, ' %')];
  return ['Speed', fmt(m.dsst_throughput_per_min, 1, ' / min')];
}

export function Tile({ tile }) {
  const kv = keyValue(tile);
  const n = tile.baseline?.n ?? 0;
  const needed = tile.baseline?.needed ?? BASELINE_NEEDED;
  return (
    <section className={`data-panel cog-tile cog-tile-${tile.status}`} data-testid={`tile-${tile.test_id}`} data-status={tile.status}>
      <div className="panel-header">
        <span className="panel-title">{tile.label}</span>
        <span className={`cog-badge cog-badge-${tile.status}`}><span aria-hidden="true">{STATUS_ICON[tile.status]}</span> {STATUS_TEXT[tile.status] || String(tile.status).toUpperCase()}</span>
      </div>
      <div className="cog-tile-body">
        <p className="cog-headline">{tile.headline}</p>
        {kv && <p className="cog-kv"><span>{kv[0]}</span><strong>{kv[1]}</strong></p>}
        <p className="cog-muted">Baseline {n}/{needed}{tile.baseline?.ready ? ' (ready)' : ''}</p>
        <TrendSpark values={(tile.trend || []).map(p => p.value)} status={tile.status} />
        {tile.next && <p className="cog-muted">Next: session {tile.next.session_no}, set {tile.next.stimulus_set}</p>}
      </div>
    </section>
  );
}

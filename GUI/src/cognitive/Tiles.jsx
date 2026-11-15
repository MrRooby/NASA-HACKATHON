import React from 'react';
import { Panel, SegBar, StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { BASELINE_NEEDED, PROTOCOLS } from './engine/protocols.js';
import { fmt } from './session.js';

const STATUSES = ['ok', 'caution', 'alert', 'no_data'];
const safeStatus = status => (STATUSES.includes(status) ? status : 'no_data');

/**
 * Small inline SVG trend line: straight segments, square caps, colour by status
 * (theme variables, see .cog-spark in cognitive.css).
 */
export function TrendSpark({ values, status = 'ok' }) {
  const t = useT();
  const v = (values || []).filter(x => typeof x === 'number' && Number.isFinite(x));
  if (v.length < 2) return <span className="cog-muted cog-spark-empty">{t('tests.noTrend')}</span>;
  const max = Math.max(...v);
  const min = Math.min(...v);
  const y = x => 28 - ((x - min) / (max - min || 1)) * 24;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${y(x)}`).join(' ');
  return (
    <svg className={`cog-spark cog-spark-${safeStatus(status)}`} viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={t('tests.trendLabel', { n: v.length })}>
      <polyline points={pts} />
      <rect x="98.5" y={y(v[v.length - 1]) - 3} width="1.5" height="6" />
    </svg>
  );
}

export const emptyTile = id => ({
  test_id: id, label: PROTOCOLS[id].label, status: 'no_data', headline: `Building your baseline (0/${BASELINE_NEEDED})`,
  baseline: { n: 0, needed: BASELINE_NEEDED, ready: false }, latest: null, trend: [], next: null,
});

function keyValue(tile, t) {
  const m = tile.latest?.metrics;
  if (!m) return null;
  if (tile.test_id === 'pvt') return [t('tests.metricPvt'), fmt(m.pvt_median_rt_ms, 0, ' ms')];
  if (tile.test_id === 'gonogo') return [t('tests.metricGonogo'), fmt(m.gonogo_commission_rate != null ? m.gonogo_commission_rate * 100 : null, 0, ' %')];
  return [t('tests.metricDsst'), fmt(m.dsst_throughput_per_min, 1, ' / min')];
}

/** One test as a framed panel: tone and [ OK ] / [ CAUT ] / [ ALRT ] / [ ---- ] by status. */
export function Tile({ tile }) {
  const t = useT();
  const kv = keyValue(tile, t);
  const n = tile.baseline?.n ?? 0;
  const needed = tile.baseline?.needed ?? BASELINE_NEEDED;
  const status = safeStatus(tile.status);
  return (
    <Panel
      className={`cog-tile cog-tile-${status}`}
      title={tile.label}
      meta={<StatusTag status={status} />}
      tone={status === 'no_data' ? 'default' : status}
      data-testid={`tile-${tile.test_id}`}
      data-status={tile.status}
    >
      {status === 'no_data' && <p className="cog-note">{t('tests.buildingBaseline')}</p>}
      <p className="cog-headline">{tile.headline}</p>
      {kv && <p className="cog-line"><span className="label">{kv[0]}</span> <strong>{kv[1]}</strong></p>}
      <p className="cog-line">
        <span className="label">{t('tests.baseline')}</span> {n}/{needed}{tile.baseline?.ready ? ` ${t('tests.baselineReady')}` : ''}{' '}
        <SegBar value={n} max={needed} segments={needed} status={tile.baseline?.ready ? 'ok' : 'no_data'} label={t('tests.baseline')} />
      </p>
      <TrendSpark values={(tile.trend || []).map(p => p.value)} status={status} />
      {tile.next && <p className="cog-muted">{t('tests.next', { n: tile.next.session_no, set: tile.next.stimulus_set })}</p>}
    </Panel>
  );
}

/* ── Big touch tiles of the [ TESTS ] screen ─────────────────────────────── */

/** NavIcon per test (closest existing glyphs). */
export const TEST_ICONS = { pvt: 'timer', gonogo: 'traffic', dsst: 'dialpad' };

/** Last result as one big number: [value, unit] or null. */
export function bigValue(tile) {
  const m = tile.latest?.metrics;
  if (!m) return null;
  if (tile.test_id === 'pvt') return [fmt(m.pvt_median_rt_ms, 0), 'ms'];
  if (tile.test_id === 'gonogo') return [fmt(m.gonogo_commission_rate != null ? m.gonogo_commission_rate * 100 : null, 0), '%'];
  return [fmt(m.dsst_throughput_per_min, 1), '/min'];
}

const METRIC_KEY = { pvt: 'tests.metricPvt', gonogo: 'tests.metricGonogo', dsst: 'tests.metricDsst' };

/** One test as a big button: icon, name, last result as one big number, status. Opens the details. */
export function BigTile({ tile, onOpen }) {
  const t = useT();
  const status = safeStatus(tile.status);
  const value = bigValue(tile);
  const n = tile.baseline?.n ?? 0;
  const needed = tile.baseline?.needed ?? BASELINE_NEEDED;
  return (
    <button type="button" className={`cog-big cog-big-${status}`} onClick={() => onOpen?.(tile.test_id)}
      data-testid={`tile-${tile.test_id}`} data-status={tile.status} data-tone={status === 'no_data' ? 'default' : status}>
      <span className="cog-big-names">
        <span className="cog-big-name">{t(`tests.name_${tile.test_id}`)}</span>
        <span className="cog-big-what">{t(`tests.what_${tile.test_id}`)}</span>
      </span>
      <NavIcon name={TEST_ICONS[tile.test_id] || 'tests'} className="cog-big-icon" />
      <span className="cog-big-value" aria-label={t(METRIC_KEY[tile.test_id])}>
        {value ? <>{value[0]}<span className="cog-big-unit">{value[1]}</span></> : '—'}
      </span>
      <span className="cog-big-metric">{t(METRIC_KEY[tile.test_id])}</span>
      <StatusTag status={status} className="cog-big-status" />
      {status === 'no_data'
        ? <span className="cog-big-line">{t('tests.buildingBaseline')} {n}/{needed}</span>
        : <span className="cog-big-line">{tile.headline}</span>}
      <span className="cog-big-more">{t('tests.more')}</span>
    </button>
  );
}

/** Details of one test (inside a DataDialog): how it works, last result, baseline, trend. */
export function TileDetail({ tile }) {
  const t = useT();
  const status = safeStatus(tile.status);
  const value = bigValue(tile);
  const n = tile.baseline?.n ?? 0;
  const needed = tile.baseline?.needed ?? BASELINE_NEEDED;
  const id = tile.test_id;
  return (
    <div className="cog-detail" data-testid={`detail-${id}`}>
      <section className="cog-detail-how">
        <h3>{t('tests.howTitle')}</h3>
        <ul className="cog-steps">
          {[1, 2, 3].map(i => <li key={i}>{t(`tests.how_${id}_${i}`)}</li>)}
        </ul>
        <p className="cog-detail-why"><span className="label">{t('tests.whyTitle')}</span> {t(`tests.why_${id}`)}</p>
      </section>
      <section className="cog-detail-data">
        <p className="cog-detail-headline">{tile.headline}</p>
        <p className="cog-detail-value">
          <span className="label">{t(METRIC_KEY[id])}</span>
          <strong>{value ? <>{value[0]}<span className="cog-big-unit">{value[1]}</span></> : '—'}</strong>
        </p>
        <p className="cog-detail-line">
          <span className="label">{t('tests.baseline')}</span>
          <strong>{n}/{needed}{tile.baseline?.ready ? ` ${t('tests.baselineReady')}` : ''}</strong>
          <SegBar value={n} max={needed} segments={needed} status={tile.baseline?.ready ? 'ok' : 'no_data'} label={t('tests.baseline')} />
        </p>
        <p className="cog-detail-trend-label label">{t('tests.trendTitle')}</p>
        <div className="cog-detail-trend"><TrendSpark values={(tile.trend || []).map(p => p.value)} status={status} /></div>
        {tile.next && <p className="cog-detail-line">{t('tests.next', { n: tile.next.session_no, set: tile.next.stimulus_set })}</p>}
      </section>
    </div>
  );
}

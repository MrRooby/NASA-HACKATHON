import { useT } from '../i18n/index.js';
import { STATUS_COLOUR, normalizeStatus } from './status.js';
import './ui.css';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Scale and positions (0..1) of a range bar. min/max default to an auto scale around
 * low, high and value; one-sided limits (low or high null) open the band to the scale edge.
 * Returns { min, max, pos, off: 'below'|'above'|null, bandStart, bandEnd, inBand }.
 */
export function rangeGeometry({ value, min, max, low, high }) {
  const v = num(value);
  const lo = num(low);
  const hi = num(high);
  let a = num(min);
  let b = num(max);
  if (a == null || b == null) {
    const known = [lo, hi, v].filter(x => x != null);
    if (!known.length) return { min: 0, max: 1, pos: null, off: null, bandStart: null, bandEnd: null, inBand: null };
    const kLo = Math.min(...known);
    const kHi = Math.max(...known);
    const span = Math.max(kHi - kLo, Math.abs(kHi) * 0.2, 1e-6);
    if (a == null) a = kLo - span * 0.3;
    if (b == null) b = kHi + span * 0.3;
    if (num(min) == null && kLo >= 0 && a < 0) a = 0;
  }
  if (b <= a) b = a + 1;
  const frac = x => (x - a) / (b - a);
  const clamp01 = x => Math.min(1, Math.max(0, x));
  let pos = null;
  let off = null;
  if (v != null) {
    const raw = frac(v);
    if (raw < 0) off = 'below';
    else if (raw > 1) off = 'above';
    pos = clamp01(raw);
  }
  const hasBand = lo != null || hi != null;
  const bandStart = hasBand ? clamp01(lo != null ? frac(lo) : 0) : null;
  const bandEnd = hasBand ? clamp01(hi != null ? frac(hi) : 1) : null;
  const inBand = v == null || !hasBand ? null : (lo == null || v >= lo) && (hi == null || v <= hi);
  return { min: a, max: b, pos, off, bandStart, bandEnd, inBand };
}

const fmt = x => {
  if (x == null) return '';
  const abs = Math.abs(x);
  return String(abs >= 100 || Number.isInteger(x) ? Math.round(x) : abs >= 10 ? x.toFixed(1) : +x.toFixed(2));
};

/**
 * <RangeBar value min? max? low? high? status? unit? compact? />: analog indicator.
 * Full-scale track, normal band [low..high], marker at the value (arrow at the edge when off scale).
 */
export function RangeBar({ value, min, max, low, high, status, unit, compact = false, className = '' }) {
  const t = useT();
  const g = rangeGeometry({ value, min, max, low, high });
  const s = status ? normalizeStatus(status) : g.pos == null ? 'no_data' : g.inBand === false ? 'caution' : 'ok';
  const pct = x => `${(x * 100).toFixed(2)}%`;
  const lo = num(low);
  const hi = num(high);
  const title = [
    num(value) != null ? `${fmt(num(value))}${unit ? ` ${unit}` : ''}` : t('ui.noValue'),
    lo != null || hi != null ? t('ui.rangeNormal', { low: lo != null ? fmt(lo) : '…', high: hi != null ? fmt(hi) : '…' }) : '',
    g.off === 'below' ? t('ui.rangeBelow') : g.off === 'above' ? t('ui.rangeAbove') : '',
  ].filter(Boolean).join(' · ');
  return (
    <div
      className={`ui-range ${compact ? 'ui-range--compact' : ''} ${className}`.trim()}
      data-status={s}
      data-off={g.off || undefined}
      role="meter"
      aria-valuenow={num(value) ?? undefined}
      aria-valuemin={g.min}
      aria-valuemax={g.max}
      aria-label={title}
      title={title}
      style={{ '--mark': STATUS_COLOUR[s] }}
    >
      <div className="ui-range__track">
        {g.bandStart != null && (
          <div className="ui-range__band" style={{ left: pct(g.bandStart), width: pct(Math.max(0, g.bandEnd - g.bandStart)) }} />
        )}
        {g.pos != null && (
          <div className={`ui-range__marker ${g.off ? `ui-range__marker--${g.off}` : ''}`} data-pos={g.pos.toFixed(4)} style={{ left: pct(g.pos) }} />
        )}
      </div>
      {!compact && (lo != null || hi != null) && (
        <div className="ui-range__scale" aria-hidden="true">
          {lo != null && <span className="ui-range__num" style={{ left: pct(g.bandStart) }}>{fmt(lo)}</span>}
          {hi != null && <span className="ui-range__num ui-range__num--hi" style={{ left: pct(g.bandEnd) }}>{fmt(hi)}</span>}
        </div>
      )}
    </div>
  );
}

import React, { useLayoutEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelIcon, iconForReadingCategory } from '../pixel/index.js';
import { BigNumber, RangeBar, StatusShape } from '../ui/index.js';
import { formatNumber, formatValue, peakValue } from './model.js';
import { isGuiSimulated } from './simulatedRooms.js';

const RATED = ['ok', 'caution', 'alert'];
const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Status of the sol (worst) for a tile; null for channels without a threshold. */
export const tileStatus = reading => {
  const status = reading?.worst_status ?? reading?.status;
  return RATED.includes(status) ? status : null;
};

/** Short channel name from base.ch_<channel>, else the backend label. */
export function shortLabel(reading, t) {
  const key = `base.ch_${reading?.channel}`;
  const text = t(key);
  return text === key ? reading?.label ?? reading?.channel : text;
}

/**
 * Common scale of the bar: normal band, latest value, the sol's min / max, padded.
 * Returns { min, max } or null when there is nothing numeric to draw.
 */
export function tileScale(reading) {
  const known = [reading?.normal_min, reading?.normal_max, reading?.value, reading?.min, reading?.max].map(num).filter(v => v != null);
  if (!known.length) return null;
  let lo = Math.min(...known);
  let hi = Math.max(...known);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 1e-6);
  lo -= span * 0.15;
  hi += span * 0.15;
  if (Math.min(...known) >= 0 && lo < 0) lo = 0;
  return { min: lo, max: hi };
}

/**
 * One gauge tile of a habitat reading: category icon, short label, status shape, big
 * value, analog bar (normal band + latest value), and the worst moment of the sol as a
 * small ▼ marker on the bar (no text).
 */
export function GaugeTile({ reading, compact = false }) {
  const t = useT();
  const status = tileStatus(reading);
  const now = RATED.includes(reading.status) ? reading.status : null;
  const value = num(reading.value);
  const text = value != null ? formatNumber(value) : formatValue(reading);
  const scale = value != null ? tileScale(reading) : null;
  const peak = num(peakValue(reading));
  const showPeak = scale && peak != null && peak !== value && (status === 'caution' || status === 'alert');
  const peakPos = showPeak ? Math.min(1, Math.max(0, (peak - scale.min) / (scale.max - scale.min))) : null;
  const label = shortLabel(reading, t);
  const tone = status === 'caution' || status === 'alert' ? status : 'quiet';
  const title = [reading.label, reading.unit ? `[${reading.unit}]` : null, showPeak ? `${t('base.peak')} ${formatNumber(peak)}` : null]
    .filter(Boolean).join(' ');
  return (
    <div
      className={`gt gt--${tone}${compact ? ' gt--compact' : ''}`}
      data-channel={reading.channel}
      data-status={status ?? 'unrated'}
      data-now={reading.status ?? 'unrated'}
      data-sim={isGuiSimulated(reading) || undefined}
      title={title}
    >
      <div className="gt-head">
        <PixelIcon name={iconForReadingCategory(reading.category, reading.channel)} size={compact ? 20 : 24} />
        <span className="gt-label">{label}</span>
        {status && status !== 'ok' && <StatusShape status={status} size={14} />}
      </div>
      <BigNumber value={text} unit={value != null ? reading.unit || undefined : undefined} status={now ?? undefined} size="sm" className="gt-value" />
      {scale && (
        <div className="gt-bar">
          <RangeBar
            value={value}
            min={scale.min}
            max={scale.max}
            low={num(reading.normal_min) ?? undefined}
            high={num(reading.normal_max) ?? undefined}
            status={now ?? (num(reading.normal_min) == null && num(reading.normal_max) == null ? 'no_data' : undefined)}
            unit={reading.unit}
            compact
          />
          {showPeak && (
            <span
              className={`gt-peak is-${status}`}
              data-testid="peak-marker"
              style={{ left: `${(peakPos * 100).toFixed(2)}%` }}
              aria-label={`${t('base.peak')} ${formatNumber(peak)} ${reading.unit ?? ''}`.trim()}
              role="img"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * useGridFit(ref, { minWidth, height, gap, fallback }) -> { cols, rows, size }: how many tiles of
 * at least minWidth × height px fit in the element (no scrolling). jsdom (no layout) -> fallback.
 */
export function useGridFit(ref, { minWidth, height, gap = 8, fallback = { cols: 4, rows: 2 } }) {
  const [fit, setFit] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const cols = Math.max(1, Math.floor((w + gap) / (minWidth + gap)));
      const rows = Math.max(1, Math.floor((h + gap) / (height + gap)));
      setFit(prev => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, minWidth, height, gap]);
  return { ...fit, size: fit.cols * fit.rows };
}

export default GaugeTile;

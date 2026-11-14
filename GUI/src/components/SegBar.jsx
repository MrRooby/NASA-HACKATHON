import React from 'react';
import { cx } from './cx.js';
import { normalizeStatus } from './StatusTag.jsx';

/** Number of lit segments for value / max (0 when the value is missing). */
export function filledSegments(value, max = 100, segments = 20) {
  const number = Number(value);
  if (value == null || value === '' || !Number.isFinite(number) || !(max > 0)) return 0;
  return Math.round(Math.min(1, Math.max(0, number / max)) * segments);
}

/**
 * Segmented block bar (█ ░ style), no smooth fill.
 * props: value (number|null), max (100), status 'ok'|'caution'|'alert'|'no_data' (colour; omitted = accent),
 *        segments (20), label (accessible name), className.
 */
export default function SegBar({ value, max = 100, status, segments = 20, label, className, ...rest }) {
  const filled = filledSegments(value, max, segments);
  const number = Number(value);
  const hasValue = value != null && value !== '' && Number.isFinite(number);
  return (
    <span
      className={cx('segbar', status && `segbar-${normalizeStatus(status)}`, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={hasValue ? number : undefined}
      data-filled={filled}
      {...rest}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span key={index} className={cx('seg', index < filled ? 'seg-on' : 'seg-off')} aria-hidden="true" />
      ))}
    </span>
  );
}

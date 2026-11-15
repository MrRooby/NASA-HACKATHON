import React, { useEffect, useRef, useState } from 'react';
import { formatNumber } from './model.js';
import './charts.css';

const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
const num = value => (finite(value) ? Number(value) : null);
const isFlagged = status => status === 'caution' || status === 'alert';

/** Domain [lo, hi] that holds every given number, padded a little; null when there is none. */
export function chartDomain(values, pad = 0.08) {
  const list = values.map(num).filter(value => value != null);
  if (list.length === 0) return null;
  let lo = Math.min(...list);
  let hi = Math.max(...list);
  if (lo === hi) {
    const spread = Math.abs(lo) * 0.1 || 1;
    lo -= spread;
    hi += spread;
  }
  const extra = (hi - lo) * pad;
  return [lo - extra, hi + extra];
}

/**
 * Sol range of one reading as a horizontal bar: the normal band shaded, the sol's min – max
 * as a bar, the latest value as a marker (status colour only when it is not OK).
 * Nothing is drawn for a reading without numbers.
 */
export function RangeBar({ reading, className }) {
  const value = num(reading?.value);
  const min = num(reading?.min);
  const max = num(reading?.max);
  const normalMin = num(reading?.normal_min);
  const normalMax = num(reading?.normal_max);
  const domain = chartDomain([value, min, max, normalMin, normalMax]);
  if (!domain || value == null) return null;
  const [lo, hi] = domain;
  const pct = x => `${(((x - lo) / (hi - lo)) * 100).toFixed(2)}%`;
  const width = (a, b) => `${(((b - a) / (hi - lo)) * 100).toFixed(2)}%`;
  const bandLo = normalMin ?? lo;
  const bandHi = normalMax ?? hi;
  const now = isFlagged(reading?.status) ? reading.status : 'ok';
  return (
    <svg className={['chart-range', className].filter(Boolean).join(' ')} width="100%" height="20" aria-hidden="true" data-chart="range">
      <rect className="chart-track" x="0" y="9" width="100%" height="2" />
      {(normalMin != null || normalMax != null) && (
        <rect className="chart-band" data-part="band" x={pct(bandLo)} y="2" width={width(bandLo, bandHi)} height="16" />
      )}
      {min != null && max != null && (
        <rect className="chart-solrange" data-part="solrange" x={pct(min)} y="7" width={width(min, max)} height="6" />
      )}
      <line className={`chart-marker is-${now}`} data-part="marker" data-status={now} x1={pct(value)} x2={pct(value)} y1="0" y2="20" />
    </svg>
  );
}

/** Size of an element in CSS pixels (0 × 0 until measured, or where ResizeObserver is missing). */
function useBoxSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Runs of consecutive points with a value (a sol without data breaks the line). */
const segments = points => points.reduce((runs, point) => {
  if (point.value == null) runs.push([]);
  else runs[runs.length - 1].push(point);
  return runs;
}, [[]]).filter(run => run.length > 0);

/**
 * Trend of one channel over a few sols: a line with a dot per sol, the normal band as a
 * shaded area, sol numbers on the x axis, values with the unit on the y axis. Drawn in real
 * pixels (measured), so the text keeps its size on every screen.
 * props: points [{ sol, value | null }], normalMin, normalMax, unit, status (colours the last dot),
 *        label (accessible name), fallback size for tests.
 */
export function TrendChart({ points, normalMin, normalMax, unit, status, label, width: fixedWidth, height: fixedHeight }) {
  const boxRef = useRef(null);
  const measured = useBoxSize(boxRef);
  const width = fixedWidth ?? (measured.width || 600);
  const height = fixedHeight ?? (measured.height || 280);
  const lo = num(normalMin);
  const hi = num(normalMax);
  const domain = chartDomain([...points.map(point => point.value), lo, hi], 0.1);

  const left = 78;
  const right = 18;
  const top = 30;
  const bottom = 40;
  const plotW = Math.max(10, width - left - right);
  const plotH = Math.max(10, height - top - bottom);
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = index => left + (points.length > 1 ? index * step : plotW / 2);
  const y = value => (domain ? top + plotH - ((value - domain[0]) / (domain[1] - domain[0])) * plotH : top + plotH / 2);
  const ticks = domain ? [domain[0], (domain[0] + domain[1]) / 2, domain[1]] : [];
  const lastIndex = points.reduce((found, point, index) => (point.value != null ? index : found), -1);
  const lastStatus = isFlagged(status) ? status : 'ok';

  return (
    <div ref={boxRef} className="chart-trend-box">
      <svg className="chart-trend" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} data-chart="trend">
        {domain && (lo != null || hi != null) && (
          <rect
            className="chart-band"
            data-part="band"
            x={left}
            y={y(Math.min(hi ?? domain[1], domain[1]))}
            width={plotW}
            height={Math.max(0, y(Math.max(lo ?? domain[0], domain[0])) - y(Math.min(hi ?? domain[1], domain[1])))}
          />
        )}
        {ticks.map(tick => (
          <g key={tick} className="chart-tick">
            <line className="chart-grid" x1={left} x2={left + plotW} y1={y(tick)} y2={y(tick)} />
            <text className="chart-axis" x={left - 10} y={y(tick)} textAnchor="end" dominantBaseline="central">{formatNumber(tick)}</text>
          </g>
        ))}
        {unit ? <text className="chart-axis chart-unit" x={left - 10} y={12} textAnchor="end" dominantBaseline="central">{unit}</text> : null}
        <line className="chart-axis-line" x1={left} x2={left + plotW} y1={top + plotH} y2={top + plotH} />
        {points.map((point, index) => (
          <text key={point.sol} className="chart-axis" data-part="sol" x={x(index)} y={top + plotH + 22} textAnchor="middle" dominantBaseline="central">
            {point.sol}
          </text>
        ))}
        {segments(points).map(run => (
          <polyline
            key={run[0].sol}
            className="chart-line"
            points={run.map(point => `${x(points.indexOf(point)).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')}
          />
        ))}
        {points.map((point, index) => (point.value == null ? null : (
          <circle
            key={point.sol}
            className={`chart-dot${index === lastIndex ? ` is-last is-${lastStatus}` : ''}`}
            data-part="point"
            data-sol={point.sol}
            cx={x(index)}
            cy={y(point.value)}
            r={index === lastIndex ? 7 : 5}
          />
        )))}
      </svg>
    </div>
  );
}

/** Tiny trend line for a tile: no axes. Nothing for fewer than two values. */
export function Sparkline({ points, className }) {
  const values = points.filter(point => point.value != null);
  if (values.length < 2) return null;
  const domain = chartDomain(values.map(point => point.value), 0.15);
  const W = 100;
  const H = 30;
  const x = index => (points.length > 1 ? (index / (points.length - 1)) * (W - 6) + 3 : W / 2);
  const y = value => H - 3 - ((value - domain[0]) / (domain[1] - domain[0])) * (H - 6);
  return (
    <svg className={['chart-spark', className].filter(Boolean).join(' ')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" data-chart="spark">
      {segments(points).map(run => (
        <polyline
          key={run[0].sol}
          className="chart-line"
          vectorEffect="non-scaling-stroke"
          points={run.map(point => `${x(points.indexOf(point)).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')}
        />
      ))}
    </svg>
  );
}

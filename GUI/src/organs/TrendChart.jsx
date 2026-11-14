import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { normalRange, bandsRange } from './rating.js';

// Enlarged trend of one metric (opened by clicking its sparkline): step line of the MOTHER series,
// the person's own entries as accent squares, the status bands shaded behind, sol axis.
// Every point is a button: clicking it shows that sol's value in the readout.

const BAND_FILL = { ok: 'var(--ok)', caution: 'var(--caution)', alert: 'var(--alert)' };

export function useBoxSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const fmt = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  return String(abs >= 100 ? Math.round(value) : abs >= 10 ? +value.toFixed(1) : +value.toFixed(2));
};

/**
 * <TrendChart series own bands unit label currentSol />
 *   series: [{ sol, value }] (MOTHER), own: [{ sol, value }] (self-measurements, sol may be null = current sol)
 */
export function TrendChart({ series = [], own = [], bands = null, unit = '', label = '', currentSol = null }) {
  const t = useT();
  const box = useRef(null);
  const { width, height } = useBoxSize(box);
  const ownPoints = own.map(point => ({ ...point, sol: point.sol ?? currentSol })).filter(point => typeof point.sol === 'number');
  const all = [...series, ...ownPoints];
  const [picked, setPicked] = useState(null);
  const last = series[series.length - 1] || ownPoints[ownPoints.length - 1] || null;
  const shown = picked || last;

  const values = all.map(point => point.value);
  const range = (bands && bandsRange(bands, values.length ? Math.min(...values) : null)) || null;
  let lo = Math.min(...values, ...(range ? [range[0]] : []));
  let hi = Math.max(...values, ...(range ? [range[1]] : []));
  if (bands && values.length) {
    const vmax = Math.max(...values);
    const vmin = Math.min(...values);
    // Keep the scale readable: do not let a far open band edge squash the data.
    const span = Math.max(vmax - vmin, (hi - lo) * 0.15);
    lo = Math.max(lo, vmin - span * 1.5);
    hi = Math.min(hi, vmax + span * 1.5);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi === lo) { lo -= 1; hi += 1; }
  const sols = all.map(point => point.sol);
  const s0 = sols.length ? Math.min(...sols) : 0;
  const s1 = sols.length ? Math.max(...sols) : 1;

  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = Math.max(10, height - padT - padB);
  const x = sol => padL + (s1 === s0 ? plotW / 2 : ((sol - s0) / (s1 - s0)) * plotW);
  const y = value => padT + ((hi - Math.min(hi, Math.max(lo, value))) / (hi - lo)) * plotH;

  let path = '';
  series.forEach((point, index) => {
    path += index === 0 ? `M${x(point.sol).toFixed(1)} ${y(point.value).toFixed(1)}` : ` H${x(point.sol).toFixed(1)} V${y(point.value).toFixed(1)}`;
  });
  const normal = bands ? normalRange(bands) : null;

  return (
    <div className="trend-chart" data-points={series.length} data-own={ownPoints.length}>
      <div className="trend-readout" role="status">
        <span className="trend-label">{label}</span>
        {shown ? (
          <span className="trend-value">
            <span className="trend-sol">{t('organs.solN', { n: shown.sol })}</span>
            <strong>{fmt(shown.value)}</strong> <span className="trend-unit">{unit}</span>
            {shown.self ? <span className="trend-self">{t('organs.self')}</span> : null}
          </span>
        ) : <span className="trend-sol">{t('organs.noTrend')}</span>}
      </div>
      <div className="trend-box" ref={box}>
        {width > 0 && height > 0 && all.length > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('organs.trendOf', { what: label })}>
            {(bands || []).map((band, index) => {
              const top = y(band.max ?? hi);
              const bottom = y(band.min ?? lo);
              if (bottom - top <= 0) return null;
              return <rect key={index} x={padL} y={top} width={plotW} height={bottom - top} fill={BAND_FILL[band.status] || 'transparent'} opacity={band.status === 'ok' ? 0.14 : 0.08} />;
            })}
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} className="trend-axis" />
            <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} className="trend-axis" />
            {normal && [normal[0], normal[1]].map((edge, index) => (edge == null || edge < lo || edge > hi ? null : (
              <g key={index}>
                <line x1={padL} x2={padL + plotW} y1={y(edge)} y2={y(edge)} className="trend-edge" />
                <text x={padL - 6} y={y(edge) + 5} className="trend-tick" textAnchor="end">{fmt(edge)}</text>
              </g>
            )))}
            <text x={padL} y={height - 4} className="trend-tick">{t('organs.solN', { n: s0 })}</text>
            <text x={padL + plotW} y={height - 4} className="trend-tick" textAnchor="end">{t('organs.solN', { n: s1 })}</text>
            {path && <path d={path} className="trend-line" shapeRendering="crispEdges" />}
            {series.map(point => (
              <rect
                key={`m${point.sol}`}
                x={x(point.sol) - 4}
                y={y(point.value) - 4}
                width="8"
                height="8"
                className="trend-point"
                data-picked={picked && !picked.self && picked.sol === point.sol ? 'true' : undefined}
                tabIndex={0}
                role="button"
                aria-label={`${t('organs.solN', { n: point.sol })}: ${fmt(point.value)} ${unit}`}
                onClick={() => setPicked(point)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setPicked(point); }}
              />
            ))}
            {ownPoints.map((point, index) => (
              <rect
                key={`o${index}`}
                x={x(point.sol) - 5}
                y={y(point.value) - 5}
                width="10"
                height="10"
                className="trend-own"
                tabIndex={0}
                role="button"
                aria-label={`${t('organs.self')} ${t('organs.solN', { n: point.sol })}: ${fmt(point.value)} ${unit}`}
                onClick={() => setPicked({ ...point, self: true })}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

export default TrendChart;

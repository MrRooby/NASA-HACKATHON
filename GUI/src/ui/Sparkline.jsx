import { useT } from '../i18n/index.js';
import { STATUS_COLOUR, normalizeStatus } from './status.js';
import './ui.css';

const num = v => {
  const x = v && typeof v === 'object' ? v.value : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

/**
 * Points of a step line in a width×height box (2 px padding): [{ x, y, v }], gaps (null) skipped.
 * The y scale includes low/high so the normal band is always in view.
 */
export function sparkPoints(values, { width, height, low, high }) {
  const vs = (values || []).map(num);
  const known = vs.filter(v => v != null);
  const extra = [low, high].filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!known.length) return { points: [], y: () => 0 };
  let lo = Math.min(...known, ...extra);
  let hi = Math.max(...known, ...extra);
  if (hi === lo) { lo -= 1; hi += 1; }
  const pad = 2;
  const n = vs.length;
  const x = i => pad + (n === 1 ? 0 : (i * (width - 2 * pad)) / (n - 1));
  const y = v => pad + ((hi - v) * (height - 2 * pad)) / (hi - lo);
  const points = vs.map((v, i) => (v == null ? null : { x: x(i), y: y(v), v })).filter(Boolean);
  return { points, y };
}

/**
 * <Sparkline values status? low? high? width? height? showLast? />: crisp trend line with the
 * normal band shaded and the last point marked. Fewer than 2 points → "—".
 */
export function Sparkline({ values, status, low, high, width = 120, height = 32, showLast = true, label, className = '' }) {
  const t = useT();
  const { points, y } = sparkPoints(values, { width, height, low, high });
  if (points.length < 2) {
    return <span className={`ui-spark ui-spark--empty ${className}`.trim()} data-points={points.length} style={{ width, height }}>{t('ui.noValue')}</span>;
  }
  const s = normalizeStatus(status ?? 'ok');
  const hasBand = typeof low === 'number' || typeof high === 'number';
  const bandTop = typeof high === 'number' ? y(high) : 0;
  const bandBottom = typeof low === 'number' ? y(low) : height;
  // Step path: hold each value until the next sample.
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` H${points[i].x.toFixed(1)} V${points[i].y.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return (
    <svg
      className={`ui-spark ${className}`.trim()}
      data-points={points.length}
      data-status={s}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label || t('ui.trend')}
      style={{ '--mark': STATUS_COLOUR[s] }}
    >
      {hasBand && <rect className="ui-spark__band" x="0" y={Math.min(bandTop, bandBottom)} width={width} height={Math.abs(bandBottom - bandTop)} />}
      <path className="ui-spark__line" d={d} shapeRendering="crispEdges" vectorEffect="non-scaling-stroke" />
      {showLast && <rect className="ui-spark__last" x={last.x - 2.5} y={last.y - 2.5} width="5" height="5" shapeRendering="crispEdges" />}
    </svg>
  );
}

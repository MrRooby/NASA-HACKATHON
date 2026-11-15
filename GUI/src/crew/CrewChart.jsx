import React from 'react';
import { gridStep, normalRanges, valueRange, windowPoints } from './crewMetrics.js';

const W = 1000;
const H = 300;

/**
 * Task-manager style chart (CREW person view): a grid that scrolls with the data, the normal band
 * of the indicator, one or two lines with a filled area under the first, and a pulsing marker on
 * the latest point. The SVG stretches to its box; labels are HTML so they never stretch.
 * props: lines [{ points: [[sol, value]...], tone: 'ok'|'caution'|'alert'|'no_data' }],
 *        bands (MOTHER bands of the first line), x0, x1 (sol window), big (axis labels),
 *        format(value) -> text for the axis labels, solLabel(n) -> text, label (accessible name).
 */
export default function CrewChart({ lines, bands, x0, x1, big = false, format = String, solLabel = String, label }) {
  const visible = lines.map(line => windowPoints(line.points, x0, x1));
  const [low, high] = valueRange(visible);
  const span = Math.max(x1 - x0, 1e-6);
  const px = x => ((x - x0) / span) * W;
  const py = y => H - ((y - low) / (high - low)) * H;
  const path = points => points.map(([x, y], index) => `${index ? 'L' : 'M'}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('');

  const step = gridStep(span);
  const verticals = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) verticals.push(x);

  const normal = normalRanges(bands)
    .map(([from, to]) => [Math.max(from ?? -Infinity, low), Math.min(to ?? Infinity, high)])
    .filter(([from, to]) => to > from);

  const first = visible[0] || [];
  const last = first.length ? first[first.length - 1] : null;
  const area = first.length > 1
    ? `${path(first)}L${px(last[0]).toFixed(1)},${H}L${px(first[0][0]).toFixed(1)},${H}Z`
    : null;

  return (
    <span className={big ? 'crew-chart crew-chart-big' : 'crew-chart'} role="img" aria-label={label}>
      <span className="crew-chart-box">
        <span className="crew-chart-plot">
          <svg className="crew-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {normal.map(([from, to]) => (
              <rect key={`${from}-${to}`} className="crew-chart-normal" x="0" width={W} y={py(to)} height={Math.max(py(from) - py(to), 0)} />
            ))}
            {verticals.map(x => <line key={x} className="crew-chart-grid" x1={px(x)} x2={px(x)} y1="0" y2={H} />)}
            {[0.25, 0.5, 0.75].map(f => <line key={f} className="crew-chart-grid" x1="0" x2={W} y1={H * f} y2={H * f} />)}
            {area ? <path className={`crew-chart-area crew-tone-${lines[0].tone}`} d={area} /> : null}
            {visible.map((points, index) => (points.length > 1 ? (
              <path
                key={index}
                className={`crew-chart-line crew-tone-${lines[index].tone}${index > 0 ? ' crew-chart-line-2' : ''}`}
                d={path(points)}
              />
            ) : null))}
          </svg>
          {visible.map((points, index) => {
            const point = points[points.length - 1];
            if (!point) return null;
            const left = Math.min(Math.max(px(point[0]) / W, 0), 1) * 100;
            const top = Math.min(Math.max(py(point[1]) / H, 0), 1) * 100;
            return <span key={index} className={`crew-chart-dot crew-tone-${lines[index].tone}`} style={{ left: `${left}%`, top: `${top}%` }} aria-hidden="true" />;
          })}
        </span>
        {big ? (
          <>
            <span className="crew-chart-axis crew-chart-axis-top" aria-hidden="true">{format(high)}</span>
            <span className="crew-chart-axis crew-chart-axis-bottom" aria-hidden="true">{format(low)}</span>
          </>
        ) : null}
      </span>
      {big ? (
        <span className="crew-chart-x" aria-hidden="true">
          <span>{solLabel(Math.round(x0))}</span>
          <span>{solLabel(Math.round(x1))}</span>
        </span>
      ) : null}
    </span>
  );
}

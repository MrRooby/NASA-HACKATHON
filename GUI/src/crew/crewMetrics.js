// Live charts of the crew person view (CREW screen only): which MOTHER indicators are shown,
// how a value is classified against the indicator's normal bands, and the window arithmetic.

/**
 * Seven charts (at most seven items per group, DESIGN.md §1). `lines` are MOTHER indicator ids;
 * the first line decides the tile status. `organ` links the chart to its organ card. `estimate`: MOTHER
 * derives the value instead of measuring it (bone density cannot be measured in flight; the career dose
 * fills days without a dosimeter reading with the typical Mars dose), so the UI labels it ESTIMATE.
 */
export const METRICS = [
  { id: 'hr', organ: 'heart', unit: 'bpm', digits: 0, lines: [{ key: 'heart_rate_resting' }] },
  {
    id: 'bp', organ: 'heart', unit: 'mmHg', digits: 0, joiner: '/',
    lines: [{ key: 'bp_systolic', label: 'lineSys' }, { key: 'bp_diastolic', label: 'lineDia' }],
  },
  { id: 'spo2', organ: 'lungs', unit: '%', digits: 1, lines: [{ key: 'spo2' }] },
  { id: 'temp', organ: null, unit: '°C', digits: 1, lines: [{ key: 'body_temperature' }] },
  { id: 'pvt', organ: 'brain', unitKey: 'unitPvt', digits: 0, signed: true, lines: [{ key: 'reaction_time_pct_change' }] },
  {
    id: 'bmd', organ: 'musculoskeletal', estimate: true, unitKey: 'unitBmd', digits: 1, joiner: ' · ',
    lines: [{ key: 'bmd_hip_spine_pct_baseline', label: 'lineHip' }, { key: 'bmd_femoral_neck_pct_baseline', label: 'lineFemoral' }],
  },
  { id: 'rad', organ: 'exposure', estimate: true, unit: 'mSv', digits: 0, lines: [{ key: 'radiation_career_mSv' }] },
];

export const WINDOWS = [30, 90, 180, null]; // sols; null = whole mission
export const TILE_WINDOW = 60;

const RANK = { no_data: 0, ok: 1, caution: 2, alert: 3 };
export const worstStatus = statuses => statuses.reduce((worst, status) => (RANK[status] > RANK[worst] ? status : worst), 'no_data');

/** Status of `value` from MOTHER bands [[low|null, high|null, status], ...] (low inclusive, high exclusive). */
export function bandStatus(value, bands) {
  if (value == null || !Number.isFinite(value)) return 'no_data';
  if (!Array.isArray(bands) || bands.length === 0) return 'no_data';
  const band = bands.find(([low, high]) => (low == null || value >= low) && (high == null || value < high));
  return band && RANK[band[2]] ? band[2] : 'no_data';
}

/** Normal range(s) as [low|null, high|null] pairs, neighbouring 'ok' bands merged. */
export function normalRanges(bands) {
  const ranges = [];
  for (const [low, high, status] of bands || []) {
    if (status !== 'ok') continue;
    const last = ranges[ranges.length - 1];
    if (last && last[1] != null && low != null && last[1] === low) last[1] = high;
    else ranges.push([low, high]);
  }
  return ranges;
}

/** Points with x in [x0, x1], plus the one just before x0 so the line enters the chart from the edge. */
export function windowPoints(points, x0, x1) {
  if (!Array.isArray(points)) return [];
  const inside = [];
  let before = null;
  for (const point of points) {
    if (!Array.isArray(point) || point[1] == null) continue;
    if (point[0] < x0) before = point;
    else if (point[0] <= x1) inside.push(point);
  }
  return before ? [before, ...inside] : inside;
}

/** Last point with x <= x1 (the value "now" at the cursor), or null. */
export function latestPoint(points, x1 = Infinity) {
  if (!Array.isArray(points)) return null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (Array.isArray(point) && point[1] != null && point[0] <= x1) return point;
  }
  return null;
}

/** First and last x over all lines of a metric for one subject: [first, last] or null. */
export function seriesExtent(seriesOfSubject, metric) {
  let first = Infinity;
  let last = -Infinity;
  for (const { key } of metric.lines) {
    const points = seriesOfSubject?.[key];
    if (!Array.isArray(points) || points.length === 0) continue;
    first = Math.min(first, points[0][0]);
    last = Math.max(last, points[points.length - 1][0]);
  }
  return Number.isFinite(first) ? [first, last] : null;
}

/** Min / mean / max of the points with x in [x0, x1], and the change from the first to the last of them. */
export function windowStats(points, x0, x1) {
  const values = (points || []).filter(point => point && point[1] != null && point[0] >= x0 && point[0] <= x1).map(point => point[1]);
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: sum / values.length,
    change: values[values.length - 1] - values[0],
    count: values.length,
  };
}

/** Grid step (sols) for a window: about six vertical lines. */
export function gridStep(span) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200];
  return steps.find(step => span / step <= 7) ?? 500;
}

/** Y range of the visible lines with a margin; never flat. */
export function valueRange(lines) {
  let low = Infinity;
  let high = -Infinity;
  for (const points of lines) {
    for (const [, value] of points) {
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }
  if (!Number.isFinite(low)) return [0, 1];
  const minSpan = Math.max(Math.abs(high), Math.abs(low), 1) * 0.02;
  if (high - low < minSpan) {
    const middle = (high + low) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  const margin = (high - low) * 0.12;
  return [low - margin, high + margin];
}

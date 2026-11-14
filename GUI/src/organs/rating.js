// Value -> status for the organ screen: own measurements (catalog fields) and MOTHER checks.
//
// Bands are { min?, max?, status, basis } with an exclusive upper bound, exactly like
// config/thresholds.json. Every band carries `basis`: 'source' (value from a cited source) or
// 'team_assumption' (our decision; the UI shows it). All values are demonstrational.
import { evaluateValue, thresholdById } from '../checkin/thresholdLogic.js';

const KNOWN = ['ok', 'caution', 'alert', 'no_data'];
export const knownStatus = status => (KNOWN.includes(status) ? status : 'no_data');

/** Bands of a config indicator (config/thresholds.json), or null. */
export function configBands(configId) {
  const indicator = thresholdById[configId];
  if (!indicator?.bands?.length) return null;
  return indicator.bands.map(({ min, max, status, basis }) => ({ min, max, status, basis }));
}

/** Band that contains `value` (upper bound exclusive), or null. */
export function bandFor(bands, value) {
  if (!Array.isArray(bands) || typeof value !== 'number' || !Number.isFinite(value)) return null;
  return bands.find(band => (band.min == null || value >= band.min) && (band.max == null || value < band.max)) || null;
}

/** Display range [lo, hi] for a RangeBar: the finite edges of the bands, padded where open. */
export function bandsRange(bands, value = null) {
  if (!Array.isArray(bands) || bands.length === 0) return null;
  const edges = bands.flatMap(band => [band.min, band.max]).filter(edge => typeof edge === 'number' && Number.isFinite(edge));
  if (edges.length === 0) return null;
  let lo = Math.min(...edges);
  let hi = Math.max(...edges);
  const span = hi - lo || Math.abs(hi) || 1;
  if (bands.some(band => band.min == null)) lo -= span * 0.25;
  if (bands.some(band => band.max == null)) hi += span * 0.25;
  if (typeof value === 'number' && Number.isFinite(value)) {
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  // Absolute scales never go below zero (doses, volumes, percentages ...).
  if (lo < 0 && edges.every(edge => edge >= 0)) lo = 0;
  return [lo, hi];
}

/** First ok band as [min, max] (one side may be null), for the "normal" label. */
export function normalRange(bands) {
  const ok = (bands || []).filter(band => band.status === 'ok');
  if (ok.length === 0) return null;
  const mins = ok.map(band => band.min);
  const maxs = ok.map(band => band.max);
  return [mins.includes(undefined) || mins.includes(null) ? null : Math.min(...mins), maxs.includes(undefined) || maxs.includes(null) ? null : Math.max(...maxs)];
}

/**
 * Rate one catalog field value: { status, message, action, basis, escalate, bands }.
 * Field rules, in order: `configId` (config/thresholds.json via evaluateValue), own `bands`,
 * otherwise status null (nothing to rate against; the UI shows the value only).
 */
export function rateField(field, value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (value === '' || value == null || !Number.isFinite(number)) return { status: null, bands: null };
  if (field?.configId && thresholdById[field.configId]) {
    const band = evaluateValue(field.configId, number);
    return {
      status: knownStatus(band.status),
      message: band.message || '',
      action: band.action || '',
      basis: band.basis || null,
      escalate: band.escalate === true,
      bands: configBands(field.configId),
    };
  }
  if (Array.isArray(field?.bands)) {
    const band = bandFor(field.bands, number);
    return {
      status: band ? knownStatus(band.status) : 'caution',
      message: band?.messageKey ?? '',
      action: band?.actionKey ?? '',
      basis: band?.basis ?? 'team_assumption',
      escalate: band?.status === 'alert',
      bands: field.bands,
    };
  }
  return { status: null, bands: null };
}

/** Worst of several statuses (alert > caution > ok); null when none. */
export function worst(statuses) {
  const rank = { ok: 1, caution: 2, alert: 3 };
  let out = null;
  for (const status of statuses) {
    if (!rank[status]) continue;
    if (!out || rank[status] > rank[out]) out = status;
  }
  return out;
}

// ── MOTHER checks ───────────────────────────────────────────────────────────
// Ranges of the checks MOTHER sends (check.code), taken from the check's own `formula` and
// `reference` (see MOTHER), so the bar shows the same limits MOTHER rated against.
const S = 'source';
const T = 'team_assumption';
export const CHECK_BANDS = {
  spo2: configBands('spo2'),
  glucose: configBands('glucose_fasting'),
  // Same limits as config radiation_career_mSv, drawn from 0 mSv.
  dose_career: (configBands('radiation_career_mSv') || []).map(band => ({ ...band, min: band.min ?? 0, max: band.max ?? 700 })),
  sleep_eeg: [{ min: 50, max: 75, status: 'caution', basis: T }, { min: 75, max: 85, status: 'caution', basis: S }, { min: 85, max: 101, status: 'ok', basis: S }],
  potassium: [{ max: 3.5, status: 'caution', basis: S }, { min: 3.5, max: 5.5, status: 'ok', basis: S }, { min: 5.5, max: 6.5, status: 'caution', basis: S }, { min: 6.5, status: 'alert', basis: S }],
  shock_index: [{ max: 0.5, status: 'ok', basis: S }, { min: 0.5, max: 0.7, status: 'ok', basis: S }, { min: 0.7, max: 0.9, status: 'caution', basis: S }, { min: 0.9, max: 1.5, status: 'alert', basis: S }],
  map: [{ min: 40, max: 65, status: 'alert', basis: S }, { min: 65, max: 70, status: 'caution', basis: T }, { min: 70, max: 105, status: 'ok', basis: S }, { min: 105, max: 130, status: 'caution', basis: T }],
  sodium: [{ min: 120, max: 125, status: 'alert', basis: S }, { min: 125, max: 135, status: 'caution', basis: S }, { min: 135, max: 145.01, status: 'ok', basis: S }, { min: 145.01, max: 155, status: 'caution', basis: S }, { min: 155, max: 160, status: 'alert', basis: S }],
  calcium_corrected: [{ min: 7, max: 8.5, status: 'caution', basis: S }, { min: 8.5, max: 10.5, status: 'ok', basis: S }, { min: 10.5, max: 12, status: 'caution', basis: S }],
  anion_gap: [{ min: 0, max: 8, status: 'caution', basis: S }, { min: 8, max: 16, status: 'ok', basis: S }, { min: 16, max: 24, status: 'caution', basis: S }],
  hemoglobin: [{ min: 6, max: 12, status: 'caution', basis: S }, { min: 12, max: 18, status: 'ok', basis: S }],
  wbc: [{ min: 0, max: 3.8, status: 'caution', basis: S }, { min: 3.8, max: 10.8, status: 'ok', basis: S }, { min: 10.8, max: 16, status: 'caution', basis: S }],
  stone_risk: [{ min: 0, max: 1, status: 'ok', basis: S }, { min: 1, max: 3, status: 'caution', basis: S }, { min: 3, max: 5, status: 'alert', basis: T }],
  hydration: [{ min: 1.0, max: 1.02, status: 'ok', basis: S }, { min: 1.02, max: 1.03, status: 'caution', basis: S }, { min: 1.03, max: 1.04, status: 'alert', basis: S }],
  uacr: [{ min: 0, max: 30, status: 'ok', basis: S }, { min: 30, max: 300, status: 'caution', basis: S }, { min: 300, max: 400, status: 'alert', basis: S }],
  egfr: [{ min: 0, max: 30, status: 'alert', basis: S }, { min: 30, max: 60, status: 'caution', basis: S }, { min: 60, max: 130, status: 'ok', basis: S }],
  bun_cr_ratio: [{ min: 0, max: 10, status: 'caution', basis: S }, { min: 10, max: 20, status: 'ok', basis: S }, { min: 20, max: 30, status: 'caution', basis: S }],
  bristol: [{ min: 1, max: 3, status: 'caution', basis: S }, { min: 3, max: 6, status: 'ok', basis: S }, { min: 6, max: 8, status: 'caution', basis: S }],
  perfusion: [{ min: 0, max: 30, status: 'alert', basis: T }, { min: 30, max: 50, status: 'caution', basis: T }, { min: 50, max: 101, status: 'ok', basis: T }],
  crush_syndrome: [{ min: 0, max: 1, status: 'ok', basis: T }, { min: 1, max: 2, status: 'caution', basis: T }, { min: 2, max: 4, status: 'alert', basis: T }],
};

const NORMAL_PATTERN = /normal\s*([0-9.]+)\s*[–-]\s*([0-9.]+)/i;
const NORMAL_AT_LEAST = /normal\s*(?:≥|>=)\s*([0-9.]+)/i;

/**
 * Bands for one MOTHER check: the table above by code (perfusion_* share one), else a range
 * parsed from the formula ("normal 135–145", "normal ≥95%"); null when there is nothing numeric.
 */
export function checkBands(check) {
  if (!check || typeof check.value !== 'number') return null;
  const code = String(check.code || '');
  if (CHECK_BANDS[code]) return CHECK_BANDS[code];
  if (code.startsWith('perfusion_')) return CHECK_BANDS.perfusion;
  const formula = String(check.formula || '');
  const range = formula.match(NORMAL_PATTERN);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    const pad = (hi - lo) * 0.5;
    return [
      { min: lo - pad, max: lo, status: 'caution', basis: check.basis || S },
      { min: lo, max: hi, status: 'ok', basis: check.basis || S },
      { min: hi, max: hi + pad, status: 'caution', basis: check.basis || S },
    ];
  }
  const floor = formula.match(NORMAL_AT_LEAST);
  if (floor) {
    const lo = Number(floor[1]);
    return [{ min: lo * 0.8, max: lo, status: 'caution', basis: check.basis || S }, { min: lo, max: lo * 1.1, status: 'ok', basis: check.basis || S }];
  }
  return null;
}

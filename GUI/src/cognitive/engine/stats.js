// Statistics shared by the three scorers. Conventions are IDENTICAL to
// MOTHER/mother/cognitive_scoring.py (keep them in sync):
//   median of an even-length list = mean of the two middle values; sample SD (n - 1),
//   null when fewer than 2 values; "10 %" of n = ceil(0.1 * n); never NaN / Infinity.

export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mean(values) {
  const v = [...values];
  if (v.length === 0) return null;
  let s = 0;
  for (const x of v) s += x;
  return s / v.length;
}

export function sd(values) {
  const v = [...values];
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
}

export const tenth = n => (n > 0 ? Math.ceil(0.1 * n) : 0);

// --- inverse normal CDF -------------------------------------------------------------
// Acklam's rational approximation (rel. error ~1e-9) plus ONE Halley refinement step with an
// accurate erfc, so the result matches Python's statistics.NormalDist().inv_cdf to ~1e-15.

const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

/** erfc(z) for z >= 0 with ~1e-15 relative accuracy (Taylor series / continued fraction). */
function erfcPos(z) {
  if (z < 2.5) {
    // erf(z) = 2/sqrt(pi) * sum (-1)^n z^(2n+1) / (n! (2n+1))
    let term = z;
    let sum = z;
    for (let n = 1; n < 100; n += 1) {
      term *= -z * z / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-18) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  let t = z;
  for (let k = 80; k >= 1; k -= 1) t = z + (k / 2) / t;
  return Math.exp(-z * z) / (Math.sqrt(Math.PI) * t);
}

export const erfc = x => (x >= 0 ? erfcPos(x) : 2 - erfcPos(-x));
const normCdf = x => 0.5 * erfc(-x / Math.SQRT2);

export function invNorm(p) {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const pLow = 0.02425;
  let x;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
        ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q /
        (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
         ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  // one Halley step (use the lower tail for accuracy)
  const upper = p > 0.5;
  const e = upper ? (1 - normCdf(x)) - (1 - p) : normCdf(x) - p;
  const u = (upper ? -e : e) * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** d' with the log-linear correction (Hautus 1995): finite even for 0 % / 100 % rates. */
export function dprime(hits, nSignal, falseAlarms, nNoise) {
  if (nSignal <= 0 || nNoise <= 0) return null;
  const h = (hits + 0.5) / (nSignal + 1);
  const f = (falseAlarms + 0.5) / (nNoise + 1);
  return invNorm(h) - invNorm(f);
}

// --- baseline / performance z (for offline display; MOTHER is authoritative) ---------
export const BASELINE_MIN_SESSIONS = 3;
export const BASELINE_MAX_SESSIONS = 5;

export const METRIC_DIRECTION = {
  pvt_median_rt_ms: -1, pvt_mean_rt_ms: -1, pvt_mean_inv_rt: 1, pvt_slowest10_inv_rt: 1,
  pvt_fastest10_rt_ms: -1, pvt_lapses: -1, pvt_false_starts: -1, pvt_score: 1,
  gonogo_commission_rate: -1, gonogo_omission_rate: -1, gonogo_mean_rt_go_ms: -1,
  gonogo_sd_rt_go_ms: -1, gonogo_dprime: 1,
  dsst_correct: 1, dsst_errors: -1, dsst_attempts: 1, dsst_throughput_per_min: 1,
  dsst_accuracy: 1, dsst_median_rt_correct_ms: -1,
};

export const SD_FLOOR = {
  pvt_median_rt_ms: ['rel', 0.05], pvt_mean_rt_ms: ['rel', 0.05], pvt_mean_inv_rt: ['rel', 0.05],
  gonogo_mean_rt_go_ms: ['rel', 0.05], dsst_median_rt_correct_ms: ['rel', 0.05],
  dsst_correct: ['abs', 2.0], dsst_throughput_per_min: ['abs', 1.33],
  gonogo_commission_rate: ['abs', 0.03], gonogo_omission_rate: ['abs', 0.03],
  pvt_lapses: ['abs', 1.0], gonogo_dprime: ['abs', 0.25],
};

/** Fixed baseline from the first qualifying sessions (oldest first). null until 3 sessions exist. */
export function baseline(values) {
  const v = values.filter(x => x != null).map(Number).slice(0, BASELINE_MAX_SESSIONS);
  if (v.length < BASELINE_MIN_SESSIONS) return null;
  return { mean: v.reduce((a, b) => a + b, 0) / v.length, sd: sd(v), n: v.length };
}

export function flooredSd(metric, mu, s) {
  const [kind, val] = SD_FLOOR[metric] || ['rel', 0.05];
  const floor = kind === 'rel' ? Math.abs(mu) * val : val;
  return Math.max(s || 0, floor, 1e-9);
}

/** Negative = worse than own baseline, whatever the metric's direction. */
export function performanceZ(metric, x, base) {
  if (x == null || base == null) return null;
  const s = flooredSd(metric, base.mean, base.sd);
  const dir = metric in METRIC_DIRECTION ? METRIC_DIRECTION[metric] : 1;
  return (dir * (Number(x) - base.mean)) / s;
}

export function pctChange(x, base) {
  if (x == null || base == null || !base.mean) return null;
  return ((Number(x) - base.mean) / base.mean) * 100;
}

// Line-by-line port of cognitive_scoring.score_pvt / classify_pvt (MOTHER is the source of truth).
import { mean, median, tenth } from '../../engine/stats.js';

export const PVT_FALSE_START_MS = 100.0;
export const PVT_LAPSE_MS = 355.0;
export const PVT_TIMEOUT_MS = 30000.0;
export const PVT_MIN_VALID = 20;
export const PVT_EVENT_TYPES = ['response', 'lapse', 'false_start'];

export const isScored = t => !(t.is_practice ?? false) && (t.valid ?? true);
const rtOf = t => (t.rt_ms == null ? null : Number(t.rt_ms));

export function classifyPvt(rtMs) {
  if (rtMs == null) return 'lapse';
  if (rtMs < PVT_FALSE_START_MS) return 'false_start';
  if (rtMs < PVT_LAPSE_MS) return 'response';
  return 'lapse';
}

export function scorePvt(trials) {
  const ts = trials.filter(t => isScored(t) && PVT_EVENT_TYPES.includes(t.event_type));
  const n = ts.length;
  const fs = ts.filter(t => t.event_type === 'false_start').length;
  const lapses = ts.filter(t => t.event_type === 'lapse').length;
  const rts = ts
    .filter(t => (t.event_type === 'response' || t.event_type === 'lapse') && !(t.timeout ?? false) && rtOf(t) != null)
    .map(rtOf);
  const k = tenth(rts.length);
  const srt = [...rts].sort((a, b) => a - b);
  const metrics = {
    pvt_median_rt_ms: median(rts),
    pvt_mean_rt_ms: mean(rts),
    pvt_mean_inv_rt: rts.length ? mean(rts.map(r => 1000.0 / r)) : null,
    pvt_slowest10_inv_rt: k ? mean(srt.slice(-k).map(r => 1000.0 / r)) : null,
    pvt_fastest10_rt_ms: k ? mean(srt.slice(0, k)) : null,
    pvt_lapses: n ? lapses : null,
    pvt_false_starts: n ? fs : null,
    pvt_score: n ? 100.0 - (100.0 * (lapses + fs)) / n : null,
  };
  const quality = rts.length >= PVT_MIN_VALID ? 'ok' : 'low';
  return { metrics, quality, status: n ? 'complete' : 'invalid', n_trials: n };
}

export const score = scorePvt;

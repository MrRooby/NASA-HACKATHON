// Line-by-line port of cognitive_scoring.score_dsst.
import { median } from '../../engine/stats.js';
import { isScored } from '../pvt/scoring.js';

export const DSST_MIN_ACCURACY = 0.6;
export const DSST_EVENT_TYPES = ['correct', 'error'];

export function scoreDsst(trials, durationS = 90.0) {
  const ts = trials.filter(t => isScored(t) && DSST_EVENT_TYPES.includes(t.event_type));
  const correct = ts.filter(t => t.event_type === 'correct').length;
  const errors = ts.filter(t => t.event_type === 'error').length;
  const attempts = correct + errors;
  const accuracy = attempts ? correct / attempts : null;
  const rts = ts.filter(t => t.event_type === 'correct' && t.rt_ms != null).map(t => Number(t.rt_ms));
  const metrics = {
    dsst_correct: correct,
    dsst_errors: errors,
    dsst_attempts: attempts,
    dsst_throughput_per_min: durationS > 0 ? correct / (durationS / 60.0) : null,
    dsst_accuracy: accuracy,
    dsst_median_rt_correct_ms: median(rts),
  };
  const status = attempts && accuracy !== null && accuracy >= DSST_MIN_ACCURACY ? 'complete' : 'invalid';
  return { metrics, quality: 'ok', status, n_trials: attempts };
}

export const score = scoreDsst;

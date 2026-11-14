// Line-by-line port of cognitive_scoring.score_gonogo.
import { dprime, mean, sd } from '../../engine/stats.js';
import { isScored } from '../pvt/scoring.js';

export const GONOGO_ANTICIPATION_MS = 150.0;
export const GONOGO_EVENT_TYPES = ['hit', 'omission', 'commission', 'correct_rejection'];

export function scoreGonogo(trials) {
  const ts = trials.filter(t => isScored(t) && GONOGO_EVENT_TYPES.includes(t.event_type));
  const go = ts.filter(t => t.stimulus === 'go');
  const nogo = ts.filter(t => t.stimulus === 'nogo');
  const hits = go.filter(t => t.event_type === 'hit').length;
  const omissions = go.filter(t => t.event_type === 'omission').length;
  const commissions = nogo.filter(t => t.event_type === 'commission').length;
  const rts = go
    .filter(t => t.event_type === 'hit' && !(t.anticipation ?? false) && t.rt_ms != null)
    .map(t => Number(t.rt_ms));
  const metrics = {
    gonogo_commission_rate: nogo.length ? commissions / nogo.length : null,
    gonogo_omission_rate: go.length ? omissions / go.length : null,
    gonogo_mean_rt_go_ms: mean(rts),
    gonogo_sd_rt_go_ms: sd(rts),
    gonogo_dprime: dprime(hits, go.length, commissions, nogo.length),
  };
  const status = go.length && nogo.length ? 'complete' : 'invalid';
  return { metrics, quality: 'ok', status, n_trials: ts.length };
}

export const score = scoreGonogo;

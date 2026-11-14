// Is this device measuring reliably? Pure helpers behind the standalone "diagnostics" panel.
import { DEMO_OVERRIDES } from './protocols.js';
import { goNoGoSequence, goNoGoShort } from '../tests/gonogo/sequence.js';
import { isiSequence } from '../tests/pvt/sequence.js';

const mainTrials = trials => (trials || []).filter(t => !t.is_practice);

/** Histogram of the valid reaction times of the scored trials (equal-width bins). */
export function rtHistogram(rts, bins = 12) {
  if (!rts.length) return { bins: [], min: null, max: null };
  const lo = Math.floor(Math.min(...rts) / 10) * 10;
  const hi = Math.max(Math.ceil(Math.max(...rts) / 10) * 10, lo + 10);
  const w = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: 0 }));
  for (const r of rts) out[Math.min(bins - 1, Math.floor((r - lo) / w))].count += 1;
  return { bins: out, min: lo, max: hi };
}

/** Planned inter-stimulus intervals of the scored run, rebuilt from the seed (same stream the task used). */
export function plannedIsi(test, seed, n, demo = false) {
  if (test === 'pvt') return isiSequence(seed, n);
  if (test === 'gonogo') {
    const seq = demo ? goNoGoShort(seed, DEMO_OVERRIDES.gonogo.shortTrials.total, DEMO_OVERRIDES.gonogo.shortTrials.nogo) : goNoGoSequence(seed);
    return seq.slice(0, n).map(s => s.iti_ms);
  }
  return null;
}

export function diagnose(payload, { demo = false } = {}) {
  const trials = mainTrials(payload.trials);
  const rts = trials.filter(t => t.valid !== false && t.rt_ms != null && !t.timeout).map(t => t.rt_ms);
  const stamped = trials.filter(t => t.ts_source != null);
  const hi = stamped.filter(t => t.ts_source === 'h').length;
  const d = payload.device || {};
  let isi = null;
  const planned = plannedIsi(payload.test_id, payload.seed, trials.length, demo);
  if (planned) {
    const diffs = [];
    trials.forEach((t, i) => {
      if (t.isi_ms != null && t.t_onset_ms != null && planned[i] != null) diffs.push(Math.abs(t.isi_ms - planned[i]));
    });
    if (diffs.length) isi = { n: diffs.length, mean_abs_diff_ms: diffs.reduce((a, b) => a + b, 0) / diffs.length };
  }
  return {
    histogram: rtHistogram(rts), n_rt: rts.length,
    ts_h: { n: hi, total: stamped.length, share: stamped.length ? hi / stamped.length : null },
    device: {
      refresh_hz: d.refresh_hz ?? null, frame_jitter_ms: d.frame_jitter_ms ?? null,
      timer_resolution_ms: d.timer_resolution_ms ?? null, focus_lost_ms: d.focus_lost_ms ?? 0,
    },
    isi,
  };
}

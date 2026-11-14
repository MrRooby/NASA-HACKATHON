// Builds the POST /api/cognitive/sessions body exactly as CONTRACT section 3 describes it.
import { APP_VERSION, PROTOCOLS } from './engine/protocols.js';
import { score } from './engine/score.js';

export function uuid4() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Practice trials first (is_practice), then the scored trials; idx / seq renumbered without gaps. */
export function mergeTrials(practice, main) {
  return [...(practice?.trials || []), ...(main?.trials || [])].map((t, idx) => ({ ...t, idx }));
}
export function mergeEvents(practice, main) {
  return [...(practice?.events || []), ...(main?.events || [])].map((e, seq) => ({ ...e, seq }));
}

export function buildPayload({
  subject, mission = null, test, sessionNo, stimulusSet, seed, battery = null,
  status, statusReason = null, startedAt, completedAt, durationS = null,
  device = {}, context = {}, practice = null, main = null,
}) {
  const proto = PROTOCOLS[test];
  const trials = mergeTrials(practice, main);
  const scored = score(test, trials, durationS);
  const clientMetrics = Object.fromEntries(Object.entries(scored.metrics).filter(([, v]) => v != null));
  const payload = {
    client_session_uuid: uuid4(),
    subject_code: subject,
    test_id: test,
    protocol_version: proto.protocol_version,
    app_version: APP_VERSION,
    stimulus_set: stimulusSet,
    seed,
    session_no: sessionNo,
    battery_uuid: battery ? battery.uuid : null,
    battery_position: battery ? battery.position : null,
    is_practice: false,
    status,
    status_reason: statusReason,
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    tz_offset_min: -new Date(startedAt).getTimezoneOffset(),
    duration_s: durationS,
    device: {
      device_class: device.device_class || 'keyboard',
      user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || null,
      screen_w: typeof screen !== 'undefined' ? screen.width : null,
      screen_h: typeof screen !== 'undefined' ? screen.height : null,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      refresh_hz: device.refresh_hz ?? null,
      frame_jitter_ms: device.frame_jitter_ms ?? null,
      timer_resolution_ms: device.timer_resolution_ms ?? null,
      focus_lost_ms: Math.round(((practice?.focus?.focus_lost_ms) || 0) + ((main?.focus?.focus_lost_ms) || 0)),
    },
    context,
    client_metrics: clientMetrics,
    trials,
    events: mergeEvents(practice, main),
  };
  if (mission) payload.mission_code = mission;
  return { payload, scored };
}

/** Session status from the run: aborted > interrupted (focus guard) > complete. */
export function sessionStatus({ aborted, focus }) {
  if (aborted) return { status: 'aborted', reason: 'user_aborted' };
  if (focus?.interrupted) return { status: 'interrupted', reason: focus.reason };
  return { status: 'complete', reason: null };
}

/** Full battery: PVT, then Go/No-Go and DSST in alternating order by session number. */
export function batteryFor(mode, pvtSessionNo) {
  if (mode !== 'full') return ['pvt'];
  return pvtSessionNo % 2 === 1 ? ['pvt', 'gonogo', 'dsst'] : ['pvt', 'dsst', 'gonogo'];
}

// --- local session counter, used when MOTHER cannot tell us the next session number --------
const counterKey = (subject, test) => `cognitive.session-no.${subject}.${test}`;
export function localSessionNo(subject, test) {
  try { return (Number(window.localStorage.getItem(counterKey(subject, test))) || 0) + 1; } catch { return 1; }
}
export function bumpLocalSessionNo(subject, test, used) {
  try { window.localStorage.setItem(counterKey(subject, test), String(used)); } catch { /* ignore */ }
}

// --- result assessment (absolute rules only; the baseline comparison is on the tiles) ------
export function assess(test, scored, { baselineReady = false, sessionStatus: sessStatus = 'complete', serverStatus = null } = {}) {
  const m = scored.metrics;
  if (sessStatus !== 'complete') return { status: 'no_data', repeat: true, text: 'NOT COUNTED', note: sessStatus === 'aborted' ? 'The test was stopped before the end.' : 'Focus was lost during the test, so it was not counted. Please repeat it.' };
  if (scored.status === 'invalid' || serverStatus === 'invalid') {
    return { status: 'no_data', repeat: true, text: 'NOT COUNTED', note: test === 'dsst' ? 'Too many wrong answers. Check the symbol key and try again.' : 'Not enough valid trials.' };
  }
  if (scored.quality === 'low') return { status: 'no_data', repeat: true, text: 'LOW QUALITY', note: 'Too few valid reactions to compare with your baseline.' };
  if (!baselineReady) return { status: 'no_data', text: 'BASELINE BUILDING', note: 'Saved. Your baseline needs 3 valid sessions before results are rated.' };
  let status = 'ok';
  const worse = s => { if (s === 'alert' || (s === 'caution' && status === 'ok')) status = s; };
  if (test === 'pvt' && m.pvt_lapses != null) worse(m.pvt_lapses >= 6 ? 'alert' : m.pvt_lapses >= 3 ? 'caution' : 'ok');
  if (test === 'gonogo' && m.gonogo_commission_rate != null) worse(m.gonogo_commission_rate >= 0.3 ? 'alert' : m.gonogo_commission_rate >= 0.15 ? 'caution' : 'ok');
  const text = { ok: 'WITHIN YOUR USUAL RANGE', caution: 'CAUTION', alert: 'ALERT' }[status];
  return { status, text, note: 'The full comparison with your baseline is on the Cognitive tests page.' };
}

export const fmt = (v, digits = 0, suffix = '') => (v == null || !Number.isFinite(v) ? '-' : `${v.toFixed(digits)}${suffix}`);

export function metricLines(test, m) {
  if (test === 'pvt') return [['Median reaction time', fmt(m.pvt_median_rt_ms, 0, ' ms')], ['Lapses (>= 355 ms)', fmt(m.pvt_lapses)], ['False starts', fmt(m.pvt_false_starts)]];
  if (test === 'gonogo') return [['Commission errors', fmt(m.gonogo_commission_rate != null ? m.gonogo_commission_rate * 100 : null, 0, ' %')], ['Omissions', fmt(m.gonogo_omission_rate != null ? m.gonogo_omission_rate * 100 : null, 0, ' %')], ['Mean reaction time', fmt(m.gonogo_mean_rt_go_ms, 0, ' ms')]];
  return [['Correct answers', fmt(m.dsst_correct)], ['Accuracy', fmt(m.dsst_accuracy != null ? m.dsst_accuracy * 100 : null, 0, ' %')], ['Speed', fmt(m.dsst_throughput_per_min, 1, ' / min')]];
}

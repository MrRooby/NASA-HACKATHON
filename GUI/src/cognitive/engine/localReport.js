// Local port of MOTHER's GET /api/cognitive/{subject} (MOTHER/mother/cognitive.py `_test_block`,
// `cognitive_report`, the status rules). Source of truth for the numbers is the Python code; the parity test
// replays config/cognitive/fixtures/report_cases.json against this file.
import { BASELINE_MAX_SESSIONS, BASELINE_MIN_SESSIONS, baseline, pctChange, performanceZ } from './stats.js';
import { stimulusSetFor } from './prng.js';

export const SCHEMA_VERSION = 'cog-1.0';
export const DISCLAIMER = 'Performance indicator compared with your own baseline - not a diagnosis.';
export const TESTS = ['pvt', 'gonogo', 'dsst'];
export const LABELS = { pvt: 'Reaction time (PVT)', gonogo: 'Response inhibition (Go/No-Go)', dsst: 'Processing speed (DSST)' };
export const KEY_METRIC = { pvt: 'pvt_median_rt_ms', gonogo: 'gonogo_commission_rate', dsst: 'dsst_throughput_per_min' };
export const TREND_LEN = 12;
const NEEDED = BASELINE_MIN_SESSIONS;

/** Python's f"{x:.{d}f}" (round-half-even on exact ties, "-0" kept); `sign` adds the "+" flag like "{x:+.1f}". */
export function pyFixed(x, d = 0, sign = false) {
  const neg = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  const scale = 10 ** d;
  const s = a * scale;
  let out;
  if (Math.abs(s % 1) === 0.5 && s / scale === a) {
    const lo = Math.floor(s);
    out = ((lo % 2 === 0 ? lo : lo + 1) / scale).toFixed(d);
  } else out = a.toFixed(d);
  return (neg ? '-' : sign ? '+' : '') + out;
}

const plural = lap => (lap === 1 ? '' : 's');

function rulePvt(m, pct) {
  const out = [];
  if (pct != null) {
    out.push([pct >= 20 ? 'alert' : pct >= 10 ? 'caution' : 'ok', `Reaction time ${pyFixed(pct, 0, true)}% vs your baseline.`]);
  }
  const lap = m.pvt_lapses;
  if (lap != null) {
    out.push([lap >= 6 ? 'alert' : lap >= 3 ? 'caution' : 'ok', `${pyFixed(lap, 0)} lapse${plural(lap)} (responses of 355 ms or more) in the latest test.`]);
  }
  return out;
}

function ruleGonogo(m) {
  const r = m.gonogo_commission_rate;
  if (r == null) return [];
  return [[r >= 0.30 ? 'alert' : r >= 0.15 ? 'caution' : 'ok', `Pressed on ${pyFixed(r * 100, 0)}% of No-Go trials.`]];
}

function ruleDsst(m, z) {
  if (z == null) return [];
  const t = m.dsst_throughput_per_min;
  const st = z <= -2 ? 'alert' : z < -1 ? 'caution' : 'ok';
  return t != null ? [[st, `Processing speed ${pyFixed(t, 0)} symbols/min (z ${pyFixed(z, 1, true)} vs your baseline).`]] : [];
}

const RANK = { ok: 0, caution: 1, alert: 2 };

export function statusOf(test, metrics, z, pct) {
  const key = KEY_METRIC[test];
  const rules = test === 'pvt' ? rulePvt(metrics, pct[key]) : test === 'gonogo' ? ruleGonogo(metrics, z[key]) : ruleDsst(metrics, z[key]);
  if (rules.length === 0) return ['no_data', 'The latest session has no usable result.'];
  return rules.reduce((best, r) => (RANK[r[0]] > RANK[best[0]] ? r : best)); // worst wins, first on a tie
}

const ms = v => (v instanceof Date ? v.getTime() : Date.parse(v));
const iso = v => new Date(v).toISOString();

export function testBlock(test, sessions) {
  const mine = sessions.filter(s => s.test_id === test)
    .sort((a, b) => (ms(a.started_at) - ms(b.started_at)) || (a.session_id - b.session_id));
  const valid = mine.filter(s => s.status === 'complete' && !s.is_practice);
  const latest = valid.length ? valid[valid.length - 1] : null;
  const device = latest ? latest.device_class : null;
  // baseline = the first qualifying sessions BEFORE the latest one (never the latest itself)
  const qualifying = valid.filter(s => s.quality === 'ok' && s.device_class === device && s !== latest);
  const baseSessions = qualifying.slice(0, BASELINE_MAX_SESSIONS);
  const n = baseSessions.length;
  const ready = n >= NEEDED;
  const key = KEY_METRIC[test];
  const m = s => s.metrics || {};
  const maxNo = mine.reduce((acc, s) => (s.status_reason === 'demo' ? acc : Math.max(acc, Number(s.session_no) || 0)), 0);
  const trend = valid.filter(s => m(s)[key] != null).map(s => ({ started_at: iso(s.started_at), value: m(s)[key] })).slice(-TREND_LEN);
  const block = {
    test_id: test, label: LABELS[test], status: 'no_data', headline: `Building your baseline (${Math.min(n, NEEDED)}/${NEEDED}).`,
    baseline: { n, needed: NEEDED, ready }, latest: null, trend,
    next: { session_no: maxNo + 1, stimulus_set: stimulusSetFor(maxNo + 1) },
  };
  let zKey = null;
  if (latest) {
    const lm = m(latest);
    const z = {};
    for (const code of Object.keys(lm)) {
      const base = ready ? baseline(baseSessions.map(s => m(s)[code])) : null;
      const zz = performanceZ(code, lm[code], base);
      if (zz != null) z[code] = zz;
    }
    const pct = {};
    if (ready) {
      const p = pctChange(lm[key], baseline(baseSessions.map(s => m(s)[key])));
      if (p != null) pct[key] = p;
    }
    block.latest = {
      session_id: Number(latest.session_id), started_at: iso(latest.started_at), session_no: latest.session_no,
      quality: latest.quality, metrics: lm, z, pct_change: pct,
    };
    if (ready) {
      [block.status, block.headline] = statusOf(test, lm, z, pct);
      if (latest.quality !== 'ok' && block.status !== 'no_data') block.headline += ' (low-quality session: interpret with care)';
    }
    zKey = z[key] ?? null;
  }
  return [block, zKey];
}

/** Rows in the shape of astro_api.cognitive_sessions + metrics from stored local records (or rows as they are). */
export function toRows(stored) {
  return stored.map((s, i) => {
    const r = s.local_result;
    if (!r) return s;
    return {
      session_id: i + 1, test_id: s.test_id, session_no: s.session_no, stimulus_set: s.stimulus_set,
      status: r.status, quality: r.quality, is_practice: Boolean(r.is_practice), status_reason: r.status_reason ?? null,
      started_at: s.started_at, device_class: s.device?.device_class ?? 'keyboard', metrics: r.metrics || {},
    };
  });
}

/** Same shape as GET /api/cognitive/{subject}. `sessions` = stored local records (or fixture rows). */
export function localReport(subject, sessions) {
  const mine = (sessions || []).filter(s => s.subject_code == null || s.subject_code === subject);
  const rows = toRows(mine);
  const tests = [];
  const zs = [];
  for (const t of TESTS) {
    const [block, zKey] = testBlock(t, rows);
    tests.push(block);
    zs.push(block.baseline.ready ? zKey : null);
  }
  const composite = zs.every(z => z != null) ? zs.reduce((a, b) => a + b, 0) / 3 : null;
  return {
    schema_version: SCHEMA_VERSION, subject: { code: subject, data_kind: 'self_test' }, disclaimer: DISCLAIMER, tests, composite_z: composite,
  };
}

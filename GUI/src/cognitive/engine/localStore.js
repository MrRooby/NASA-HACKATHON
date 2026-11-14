// "Tests on yourself": everything stays in this browser (localStorage). Nothing here ever calls the network.
// Keys are `cognitive.self.*`, separate from the astronaut queue keys (`cognitive.queue.v1`, ...).
import { TESTS, localReport } from './localReport.js';
import { METRIC_DIRECTION } from './stats.js';
import { score } from './score.js';

export { localReport };
export const SESSIONS_KEY = 'cognitive.self.sessions.v1';
export const NAME_KEY = 'cognitive.self.name';
export const DEFAULT_NAME = 'SELF';
export const MIN_TIMER_RESOLUTION_MS = 2;
export const SCORING_VERSION = '1.0';
export const CSV_METRICS = Object.keys(METRIC_DIRECTION);
export const CSV_COLUMNS = ['started_at', 'test_id', 'session_no', 'status', 'quality', 'is_practice', 'device_class', ...CSV_METRICS];

export const cleanName = raw => (String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || DEFAULT_NAME);
export const subjectFor = name => `SELF-${cleanName(name)}`;

export function loadName() {
  try { return cleanName(window.localStorage.getItem(NAME_KEY)); } catch { return DEFAULT_NAME; }
}
export function saveName(name) {
  try { window.localStorage.setItem(NAME_KEY, cleanName(name)); } catch { /* ignore */ }
}

function readAll() {
  try {
    const v = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeAll(list) { window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(list)); } // may throw (quota)

export function listSessions(subject = null) {
  const all = readAll();
  return subject ? all.filter(s => s.subject_code === subject) : all;
}

export function clearSessions() {
  try { window.localStorage.removeItem(SESSIONS_KEY); } catch { /* ignore */ }
}

/** Server-equivalent result of a payload (save_session rules in MOTHER/mother/cognitive.py). */
export function buildLocalResult(payload, existing = []) {
  const sc = score(payload.test_id, payload.trials || [], payload.duration_s);
  const status = payload.status === 'complete' && sc.status === 'invalid' ? 'invalid' : payload.status;
  let quality = sc.quality;
  const timer = payload.device?.timer_resolution_ms;
  if (timer != null && timer > MIN_TIMER_RESOLUTION_MS) quality = 'low';
  let reason = payload.status_reason ?? null;
  if (status === 'invalid' && !reason) reason = 'scoring: too few usable trials or accuracy below minimum';
  // the very first complete session per person and test is practice (demo runs do not count)
  const nOk = existing.filter(s => s.subject_code === payload.subject_code && s.test_id === payload.test_id
    && s.local_result?.status === 'complete' && s.local_result?.status_reason !== 'demo').length;
  const isPractice = Boolean(payload.is_practice) || nOk === 0;
  return {
    status, quality, is_practice: isPractice, status_reason: reason, scoring_version: SCORING_VERSION,
    metrics: sc.metrics, n_trials: sc.n_trials ?? null,
  };
}

/** Stores a POST-format payload plus its local result. Duplicate client_session_uuid -> the stored one. Throws on quota. */
export function addSession(payload) {
  const all = readAll();
  const dup = all.find(s => s.client_session_uuid === payload.client_session_uuid);
  if (dup) return { record: dup, duplicate: true };
  const record = { ...payload, local_result: buildLocalResult(payload, all) };
  writeAll([...all, record]);
  return { record, duplicate: false };
}

export const exportJson = (subject = null) => JSON.stringify(listSessions(subject), null, 2);

const csvCell = v => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(subject = null) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of listSessions(subject)) {
    const r = s.local_result || {};
    const row = [s.started_at, s.test_id, s.session_no, r.status, r.quality, r.is_practice ? 1 : 0, s.device?.device_class,
      ...CSV_METRICS.map(k => (r.metrics ? r.metrics[k] : null))];
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function validShape(s) {
  return s && typeof s === 'object' && typeof s.client_session_uuid === 'string' && s.client_session_uuid
    && TESTS.includes(s.test_id) && typeof s.subject_code === 'string' && Number.isFinite(Date.parse(s.started_at))
    && Array.isArray(s.trials) && s.device && typeof s.device === 'object';
}

/** Imports an exported JSON array. Returns { added, skipped, invalid } or { error }. Dedupes by client_session_uuid. */
export function importJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'This file is not valid JSON.' }; }
  if (data && !Array.isArray(data) && Array.isArray(data.sessions)) data = data.sessions;
  if (!Array.isArray(data)) return { error: 'Expected a JSON array of sessions.' };
  const all = readAll();
  const seen = new Set(all.map(s => s.client_session_uuid));
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  for (const s of data) {
    if (!validShape(s)) { invalid += 1; continue; }
    if (seen.has(s.client_session_uuid)) { skipped += 1; continue; }
    seen.add(s.client_session_uuid);
    all.push(s.local_result ? s : { ...s, local_result: buildLocalResult(s, all) });
    added += 1;
  }
  if (added) {
    try { writeAll(all); } catch { return { error: 'Browser storage is full or blocked: nothing was imported.' }; }
  }
  return { added, skipped, invalid };
}

/** Browser download of a text file (no network). */
export function downloadText(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

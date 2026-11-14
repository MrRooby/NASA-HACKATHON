// Offline queue (S8): finished sessions that could not be sent wait in localStorage, keyed by
// client_session_uuid, and are retried on 'online' and every 30 s. POST is idempotent (200 = already
// stored), so a session is removed on 200 AND 201. 422 (and other permanent 4xx) go to a "rejected"
// list and are never retried. Every storage access is wrapped: a full or blocked storage keeps the
// data in memory for this tab and reports it.
import { ApiError, isOfflineError } from '../../api.js';
import { postSession } from './api.js';

export const QUEUE_KEY = 'cognitive.queue.v1';
export const REJECTED_KEY = 'cognitive.rejected.v1';
export const FLUSH_INTERVAL_MS = 30000;
const REJECT_STATUSES = new Set([400, 404, 413, 422]);
const MAX_REJECTED = 20;

const memory = { [QUEUE_KEY]: [], [REJECTED_KEY]: [] };
const listeners = new Set();
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });

function load(key) {
  let list = [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch { /* unreadable storage: memory only */ }
  const ids = new Set(list.map(item => item.id));
  for (const item of memory[key]) if (!ids.has(item.id)) list.push(item);
  return list;
}

/** Returns true when the list reached localStorage. */
function save(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    memory[key] = [];
    return true;
  } catch {
    memory[key] = list; // QuotaExceededError / blocked: keep in memory
    return false;
  }
}

export const pendingCount = () => load(QUEUE_KEY).length;
export const pendingItems = () => load(QUEUE_KEY).map(item => item.payload);
export const rejectedItems = () => load(REJECTED_KEY);

export function subscribe(listener) {
  listeners.add(listener);
  const onStorage = e => { if (!e.key || e.key === QUEUE_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

/** Add (or replace) a session. Returns { persisted } - false when only kept in memory. */
export function enqueue(payload) {
  const id = payload.client_session_uuid;
  const list = load(QUEUE_KEY).filter(item => item.id !== id);
  list.push({ id, payload, queued_at: new Date().toISOString(), attempts: 0 });
  const persisted = save(QUEUE_KEY, list);
  notify();
  return { persisted };
}

function removeFromQueue(id) {
  memory[QUEUE_KEY] = memory[QUEUE_KEY].filter(item => item.id !== id);
  save(QUEUE_KEY, load(QUEUE_KEY).filter(item => item.id !== id));
}

function moveToRejected(item, error) {
  removeFromQueue(item.id);
  const rejected = load(REJECTED_KEY).filter(r => r.id !== item.id);
  rejected.push({ ...item, rejected_at: new Date().toISOString(), status: error.status, reason: error.message });
  save(REJECTED_KEY, rejected.slice(-MAX_REJECTED));
}

let flushing = null;

/**
 * Try to send every queued session, oldest first. Stops at the first connectivity error.
 * Returns { sent, rejected, remaining }.
 */
export function flushQueue({ post = postSession } = {}) {
  if (flushing) return flushing;
  flushing = (async () => {
    const result = { sent: 0, rejected: 0, remaining: 0 };
    for (const item of load(QUEUE_KEY)) {
      try {
        await post(item.payload);
        removeFromQueue(item.id); // 201 new, 200 duplicate
        result.sent += 1;
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'http' && REJECT_STATUSES.has(error.status)) {
          moveToRejected(item, error);
          result.rejected += 1;
        } else if (isOfflineError(error) || error instanceof ApiError) {
          break; // MOTHER / network down, or 403/5xx: retry later
        } else {
          break;
        }
      }
    }
    result.remaining = pendingCount();
    notify();
    return result;
  })().finally(() => { flushing = null; });
  return flushing;
}

/**
 * Send a finished session: straight to MOTHER, queued when MOTHER is unreachable.
 * Resolves { state: 'sent' | 'queued' | 'rejected', response?, error?, persisted? }.
 */
export async function submitSession(payload, { post = postSession } = {}) {
  try {
    const response = await post(payload);
    return { state: 'sent', response };
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && REJECT_STATUSES.has(error.status)) {
      const item = { id: payload.client_session_uuid, payload, queued_at: new Date().toISOString(), attempts: 1 };
      const rejected = load(REJECTED_KEY).filter(r => r.id !== item.id);
      rejected.push({ ...item, rejected_at: new Date().toISOString(), status: error.status, reason: error.message });
      save(REJECTED_KEY, rejected.slice(-MAX_REJECTED));
      return { state: 'rejected', error };
    }
    const { persisted } = enqueue(payload);
    return { state: 'queued', error, persisted };
  }
}

/** Flush on 'online' and every 30 s. Returns a stop function. */
export function startAutoFlush({ intervalMs = FLUSH_INTERVAL_MS, onFlushed, post } = {}) {
  const run = () => {
    if (pendingCount() === 0) return;
    flushQueue({ post }).then(r => { if (r.sent || r.rejected) onFlushed?.(r); }).catch(() => {});
  };
  window.addEventListener('online', run);
  const timer = setInterval(run, intervalMs);
  run();
  return () => { window.removeEventListener('online', run); clearInterval(timer); };
}

/** Test helper: forget the in-memory fallback. */
export function resetQueueMemory() {
  memory[QUEUE_KEY] = [];
  memory[REJECTED_KEY] = [];
}

import { useEffect, useState } from 'react';
import { getOrganReport } from '../api.js';
import { demoReport } from '../data/demoReports.js';

// Organ reports of the crew at the shared sol (GET /api/organs/{code}[?sol=N]) for the side
// panel and the top-bar counters: one request per person and sol however many components ask,
// refreshed every POLL_MS while anybody listens. A failed request keeps the last report.

export const REPORT_POLL_MS = 30000;
const entries = new Map(); // `${code}|${sol}` -> { code, sol, data, inflight, listeners, timer }
const keyOf = (code, sol) => `${code}|${sol ?? 'latest'}`;

function entryFor(code, sol) {
  const key = keyOf(code, sol);
  if (!entries.has(key)) entries.set(key, { code, sol, data: null, inflight: null, listeners: new Set(), timer: null });
  return entries.get(key);
}

function load(entry) {
  if (entry.inflight) return entry.inflight;
  entry.inflight = getOrganReport(entry.code, entry.sol != null ? { sol: entry.sol } : {}, { timeoutMs: 20000 })
    .then(body => { entry.data = body || entry.data; })
    .catch(() => {})
    .finally(() => {
      entry.inflight = null;
      entry.listeners.forEach(fn => fn());
    });
  return entry.inflight;
}

/** Test helper. */
export function resetSharedReports() {
  for (const entry of entries.values()) clearInterval(entry.timer);
  entries.clear();
}

/**
 * useSharedReports(codes, { mode, sol, pollMs }) -> { [code]: report }
 *   mode 'online'  -> live reports (missing until the first answer)
 *   mode 'offline' -> the built-in demo reports
 *   otherwise      -> {} (still connecting)
 */
export function useSharedReports(codes, { mode, sol = null, pollMs = REPORT_POLL_MS } = {}) {
  const [, setTick] = useState(0);
  const key = (codes || []).join(',');
  const online = mode === 'online';

  useEffect(() => {
    if (!online || !key) return undefined;
    const bump = () => setTick(n => n + 1);
    const list = key.split(',').map(code => entryFor(code, sol));
    for (const entry of list) {
      entry.listeners.add(bump);
      if (!entry.data || entry.listeners.size === 1) load(entry);
      if (pollMs && !entry.timer) entry.timer = setInterval(() => load(entry), pollMs);
    }
    return () => {
      for (const entry of list) {
        entry.listeners.delete(bump);
        if (entry.listeners.size === 0) {
          clearInterval(entry.timer);
          entry.timer = null;
          if (entries.get(keyOf(entry.code, entry.sol)) === entry) entries.delete(keyOf(entry.code, entry.sol));
        }
      }
    };
  }, [key, online, sol, pollMs]);

  if (mode === 'offline') return Object.fromEntries((codes || []).map(code => [code, demoReport(code)]).filter(([, report]) => report));
  if (!online) return {};
  return Object.fromEntries((codes || []).map(code => [code, entries.get(keyOf(code, sol))?.data ?? null]).filter(([, report]) => report));
}

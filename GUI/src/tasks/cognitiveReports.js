import { useEffect, useState } from 'react';
import { getCognitive } from '../cognitive/engine/api.js';

// GET /api/cognitive/{code} for the people in the task list, shared and cached for a minute.
// Any failure (404 unknown person, 503, offline) just means "no cognitive tasks" for that person.

export const COGNITIVE_TTL_MS = 60000;
const cache = new Map(); // code -> { at, data, inflight }
const listeners = new Set();

function fetchReport(code) {
  const hit = cache.get(code);
  if (hit?.inflight) return;
  if (hit && Date.now() - hit.at < COGNITIVE_TTL_MS) return;
  const entry = { at: Date.now(), data: hit?.data ?? null, inflight: true };
  cache.set(code, entry);
  getCognitive(code, { timeoutMs: 8000 })
    .then(body => { entry.data = body && Array.isArray(body.tests) ? body : null; })
    .catch(() => { entry.data = null; })
    .finally(() => {
      entry.inflight = false;
      entry.at = Date.now();
      listeners.forEach(fn => fn());
    });
}

export function resetCognitiveReports() {
  cache.clear();
}

/** { [code]: cognitive report } for `codes`; empty while disabled (e.g. MOTHER offline). */
export function useCognitiveReports(codes, enabled = true) {
  const [, setTick] = useState(0);
  const key = (codes || []).join(',');

  useEffect(() => {
    if (!enabled || !key) return undefined;
    const bump = () => setTick(n => n + 1);
    listeners.add(bump);
    const refresh = () => key.split(',').forEach(fetchReport);
    refresh();
    const timer = setInterval(refresh, COGNITIVE_TTL_MS);
    return () => {
      listeners.delete(bump);
      clearInterval(timer);
    };
  }, [key, enabled]);

  if (!enabled) return {};
  return Object.fromEntries((codes || []).map(code => [code, cache.get(code)?.data ?? null]).filter(([, data]) => data));
}

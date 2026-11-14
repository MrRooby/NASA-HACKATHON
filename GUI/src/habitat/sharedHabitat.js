import { useEffect, useState } from 'react';
import { getHabitat, isOfflineError } from '../api.js';
import { getDemoHabitat } from './demoHabitat.js';
import { HABITAT_POLL_MS } from './useHabitat.js';

// One GET /api/habitat per sol for every small consumer (task list, alert list, top-bar
// counters), instead of one poll per component. Same result shape as useHabitat.

const entries = new Map(); // key -> { state, listeners:Set, timer, inflight }
const keyOf = sol => (sol == null ? 'latest' : String(sol));
const EMPTY = { data: null, loading: true, error: null, offline: false };

function entryFor(sol) {
  const key = keyOf(sol);
  if (!entries.has(key)) entries.set(key, { sol, state: EMPTY, listeners: new Set(), timer: null, inflight: null });
  return entries.get(key);
}

function publish(entry, patch) {
  entry.state = { ...entry.state, ...patch };
  entry.listeners.forEach(fn => fn(entry.state));
}

function load(entry) {
  if (entry.inflight) return entry.inflight;
  if (!entry.listeners.size && entries.get(keyOf(entry.sol)) !== entry) return Promise.resolve();
  entry.inflight = getHabitat({ sol: entry.sol })
    .then(body => publish(entry, { data: body, loading: false, error: null, offline: false }))
    .catch(error => {
      const info = { message: error?.message || String(error), status: error?.status ?? null, kind: error?.kind ?? null };
      if (isOfflineError(error)) publish(entry, { data: getDemoHabitat(), loading: false, error: info, offline: true });
      else publish(entry, { loading: false, error: info, offline: false });
    })
    .finally(() => { entry.inflight = null; });
  return entry.inflight;
}

/** Test helper: forget every cached sol. */
export function resetSharedHabitat() {
  for (const entry of entries.values()) clearInterval(entry.timer);
  entries.clear();
}

/** useSharedHabitat({ sol, enabled, pollMs }) -> { data, loading, error, offline } (shared per sol). */
export function useSharedHabitat({ sol = null, enabled = true, pollMs = HABITAT_POLL_MS } = {}) {
  const entry = entryFor(sol);
  const [state, setState] = useState(entry.state);

  useEffect(() => {
    if (!enabled) return undefined;
    const current = entryFor(sol);
    setState(current.state);
    current.listeners.add(setState);
    if (current.state.data == null || current.listeners.size === 1) load(current);
    if (pollMs && !current.timer) current.timer = setInterval(() => load(current), pollMs);
    return () => {
      current.listeners.delete(setState);
      if (current.listeners.size === 0) {
        // Nobody left: drop the entry, the next consumer starts fresh.
        clearInterval(current.timer);
        current.timer = null;
        if (entries.get(keyOf(sol)) === current) entries.delete(keyOf(sol));
      }
    };
  }, [sol, enabled, pollMs]);

  return enabled ? state : { ...EMPTY, loading: false };
}

export default useSharedHabitat;

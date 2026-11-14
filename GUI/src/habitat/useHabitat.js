import { useCallback, useEffect, useRef, useState } from 'react';
import { getHabitat, isOfflineError } from '../api.js';
import { getDemoHabitat } from './demoHabitat.js';

export const HABITAT_POLL_MS = 30000;

const toErrorInfo = error => ({
  message: error?.message || String(error),
  hint: error?.hint ?? null,
  status: error?.status ?? null,
  kind: error?.kind ?? null,
});

/**
 * Habitat zones of one sol from MOTHER (GET /api/habitat[?sol=N]).
 *
 * sol: null = latest sol with data.
 * Returns { data, loading, error, offline, refresh }:
 *   data    -> the API response, or the bundled demo habitat (`data.demo === true`)
 *              when MOTHER is unreachable
 *   offline -> true while the demo fallback is shown
 *   error   -> { message, hint, status, kind } of the last failed request, else null
 *   refresh -> fetch again now
 *
 * Polls every `pollMs` (0 disables polling). A newer request cancels the previous one,
 * so a slow answer for an old sol never overwrites the current one.
 */
export function useHabitat({ sol = null, enabled = true, pollMs = HABITAT_POLL_MS } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);

  const alive = useRef(true);
  const requestId = useRef(0);
  const abort = useRef(null);
  const solRef = useRef(sol);
  solRef.current = sol;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const body = await getHabitat({ sol: solRef.current }, { signal: controller.signal });
      if (!alive.current || id !== requestId.current) return;
      setData(body);
      setError(null);
      setOffline(false);
    } catch (err) {
      if (!alive.current || id !== requestId.current || err?.kind === 'aborted') return;
      setError(toErrorInfo(err));
      if (isOfflineError(err)) {
        setData(getDemoHabitat());
        setOffline(true);
      } else {
        // e.g. 404 for a sol without data: keep what is on screen, report the error.
        setOffline(false);
      }
    } finally {
      if (alive.current && id === requestId.current) setLoading(false);
    }
  }, []);

  // First load and every sol change.
  useEffect(() => {
    if (!enabled) {
      abort.current?.abort();
      setLoading(false);
      return;
    }
    load();
  }, [enabled, sol, load]);

  // Periodic refresh (also reconnects after an offline fallback).
  useEffect(() => {
    if (!enabled || !pollMs) return undefined;
    const timer = setInterval(load, pollMs);
    return () => clearInterval(timer);
  }, [enabled, pollMs, load]);

  return { data, loading, error, offline, refresh: load };
}

export default useHabitat;

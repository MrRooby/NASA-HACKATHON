import { useEffect, useState } from 'react';
import { getOrganReport } from '../api.js';
import { vitalsFromReport } from './vitals.js';

export const HISTORY_SOLS = 7;

/**
 * The basic readings of the last HISTORY_SOLS sols (oldest first) for one crew member:
 * one GET /api/organs/{code}?sol=N per sol, only while `enabled` (the history dialog is open).
 * -> { loading, error, rows: [{ sol, vitals }] }
 */
export default function useVitalsHistory(code, sol, enabled) {
  const [state, setState] = useState({ loading: false, error: null, rows: [] });
  useEffect(() => {
    if (!enabled || !code || sol == null) return undefined;
    const controller = new AbortController();
    const sols = Array.from({ length: HISTORY_SOLS }, (_, i) => sol - (HISTORY_SOLS - 1) + i).filter(n => n >= 1);
    setState({ loading: true, error: null, rows: [] });
    Promise.allSettled(sols.map(n => getOrganReport(code, { sol: n }, { signal: controller.signal })))
      .then(results => {
        if (controller.signal.aborted) return;
        const rows = results.map((result, i) => ({
          sol: sols[i],
          vitals: result.status === 'fulfilled' ? vitalsFromReport(result.value) : null,
        }));
        const failed = results.every(result => result.status === 'rejected');
        setState({ loading: false, error: failed ? results[0].reason : null, rows });
      });
    return () => controller.abort();
  }, [code, sol, enabled]);
  return state;
}

// Organ report of every roster member, for the CREW screen. The crew overview of MOTHER
// (GET /api/organs) assesses every subject in the database and can take longer than the app's
// overview timeout, which left the roster on "Loading…". One report per person
// (GET /api/organs/{code}, ~0.5 s each) is fast, so the roster asks for those itself.
// Offline: the built-in demo reports (HAB-C1..C4). Unknown people (404) stay null = "no data".
import { useEffect, useState } from 'react';
import { getOrganReport } from '../api.js';
import { demoReport } from '../data/demoReports.js';

export const ROSTER_POLL_MS = 30000;

/** useRosterReports(codes, { mode }) -> { reports: { code: report | null }, loading } */
export function useRosterReports(codes, { mode, pollMs = ROSTER_POLL_MS } = {}) {
  const key = codes.join(',');
  const [state, setState] = useState({ reports: {}, loading: true });

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (mode === 'offline') {
      setState({ reports: Object.fromEntries(list.map(code => [code, demoReport(code)])), loading: false });
      return undefined;
    }
    if (mode !== 'online') {
      setState({ reports: {}, loading: true });
      return undefined;
    }
    let alive = true;
    const controller = new AbortController();
    const load = async () => {
      const entries = await Promise.all(list.map(async code => {
        try {
          return [code, await getOrganReport(code, {}, { signal: controller.signal })];
        } catch {
          return [code, null];
        }
      }));
      if (alive) {
        setState(previous => ({
          // keep the last good report of a person if one refresh fails
          reports: Object.fromEntries(entries.map(([code, report]) => [code, report ?? previous.reports[code] ?? null])),
          loading: false,
        }));
      }
    };
    load();
    const timer = pollMs ? setInterval(load, pollMs) : null;
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [key, mode, pollMs]);

  return state;
}

export default useRosterReports;

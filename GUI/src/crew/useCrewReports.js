import { useEffect, useState } from 'react';
import { getOrganReport } from '../api.js';
import { demoReport } from '../data/demoReports.js';

export const CREW_POLL_MS = 30000;

/**
 * Organ reports of several people at the shared sol: { reports: { code: report|null }, loading }.
 * Online: GET /api/organs/{code}[?sol=N] for each code (refreshed every pollMs).
 * Offline: the built-in demo reports (demo: true). Connecting: no reports yet.
 */
export function useCrewReports(codes, { mode, period, pollMs = CREW_POLL_MS } = {}) {
  const online = mode === 'online';
  const key = codes.join(',');
  const sol = period?.sol ?? null;
  const [state, setState] = useState({ reports: {}, loading: true, key: null });

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (mode !== 'online' && mode !== 'offline') {
      // Still connecting: nothing yet (the tiles show "no data", not demo records).
      setState({ reports: {}, loading: true, key: null });
      return undefined;
    }
    if (!online) {
      setState({ reports: Object.fromEntries(list.map(code => [code, demoReport(code)])), loading: false, key: `${key}|demo` });
      return undefined;
    }
    let alive = true;
    const controller = new AbortController();
    const load = async () => {
      const entries = await Promise.all(list.map(async code => {
        try {
          return [code, await getOrganReport(code, sol != null ? { sol } : {}, { signal: controller.signal })];
        } catch {
          return [code, null];
        }
      }));
      if (!alive) return;
      setState(previous => {
        const reports = Object.fromEntries(entries.map(([code, report]) => [code, report ?? (previous.key === `${key}|${sol}` ? previous.reports[code] : null) ?? null]));
        return { reports, loading: false, key: `${key}|${sol}` };
      });
    };
    setState(previous => ({ ...previous, loading: true }));
    load();
    const timer = pollMs ? setInterval(load, pollMs) : null;
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [key, mode, online, sol, pollMs]);

  return { reports: state.reports, loading: state.loading };
}

export default useCrewReports;

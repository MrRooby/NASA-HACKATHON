// Mission time series for the crew person view (CrewPerson.jsx, CREW screen only).
// Source: GET /api/dashboard of MOTHER (data.series[<health subject>] = { indicator: [[sol, value], ...] },
// data.meta.indicators = { indicator: { label, unit, bands, context } }). The response is large, so it is
// fetched once and kept here; afterwards only GET /api/status is polled and the series are fetched again
// when the database version changes (a new import), which is what makes the charts "live".
import { useEffect, useState } from 'react';
import { getStatus, request } from '../api.js';

export const SERIES_POLL_MS = 30000;
const RETRY_MS = 5000; // MOTHER still computing the dashboard
const DASHBOARD_TIMEOUT_MS = 60000;

const cache = { version: null, data: null };

/** Test helper: forget the cached dashboard. */
export function resetSeriesCache() {
  cache.version = null;
  cache.data = null;
}

/** The parts of GET /api/dashboard the person view needs, or null when it is not ready. */
export function extractSeries(dashboard) {
  const data = dashboard?.data;
  if (dashboard?.status !== 'ready' || !data?.series) return null;
  return { series: data.series, indicators: data.meta?.indicators ?? {} };
}

/**
 * useCrewSeries({ online }) -> { state: 'offline' | 'loading' | 'ready' | 'error', series, indicators, updatedAt }
 * `series[subjectCode][indicator]` is a list of [sol, value] points.
 */
export function useCrewSeries({ online, pollMs = SERIES_POLL_MS } = {}) {
  const [result, setResult] = useState(() => (cache.data
    ? { state: 'ready', ...cache.data, updatedAt: null }
    : { state: online ? 'loading' : 'offline', series: null, indicators: null, updatedAt: null }));

  useEffect(() => {
    if (!online) {
      setResult(current => (current.state === 'ready' ? current : { state: 'offline', series: null, indicators: null, updatedAt: null }));
      return undefined;
    }
    let alive = true;
    let timer = null;

    const tick = async () => {
      let delay = pollMs;
      try {
        const status = await getStatus();
        const version = status?.database?.version ?? null;
        if (!cache.data || version == null || version !== cache.version) {
          const dashboard = await request('/api/dashboard', { timeoutMs: DASHBOARD_TIMEOUT_MS });
          const data = extractSeries(dashboard);
          if (data) {
            cache.data = data;
            cache.version = dashboard.version ?? version;
          } else {
            delay = RETRY_MS;
          }
        }
        if (alive && cache.data) setResult({ state: 'ready', ...cache.data, updatedAt: new Date() });
      } catch {
        if (alive) setResult(current => (current.state === 'ready' ? current : { state: 'error', series: null, indicators: null, updatedAt: null }));
      }
      if (alive && pollMs) timer = setTimeout(tick, delay);
    };

    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [online, pollMs]);

  return result;
}

export default useCrewSeries;

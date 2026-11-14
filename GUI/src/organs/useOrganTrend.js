// Trend series for the organ panel.
//
// useOrganTrend(code, organ, { sol, online, report, sols }) ->
//   {
//     series:  { [checkCode]: [{ sol, value }] }   numeric MOTHER checks of this organ, oldest first
//     own:     { ['<kind>.<field>']: [{ sol, value, at }] }   the person's own measurements (shared store)
//     demo:    true when `series` is synthetic (MOTHER offline / demo report)
//     loading: true while sols are still being fetched
//   }
//
// Online: GET /api/organs/{code}?sol=N for the last `sols` sols up to `sol` (default 14), three
// requests at a time, every report cached in memory per code + sol (one fetch serves all ten organs),
// all requests aborted when the person / sol changes or the panel goes away.
// Offline: a deterministic synthetic series around the value of the shown (demo) report.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getOrganReport } from '../api.js';
import { MEASUREMENTS_KEY, listMeasurements, subscribeMeasurements } from '../shared/measurements.js';
import { ORGAN_BY_ID } from './catalog.js';

export const TREND_SOLS = 14;
export const TREND_CONCURRENCY = 3;

const cache = new Map(); // `${code}|${sol}` -> organ report

export function clearTrendCache() {
  cache.clear();
}

const cacheKey = (code, sol) => `${code}|${sol}`;
const isNumber = value => typeof value === 'number' && Number.isFinite(value);

/** Run `jobs` (functions returning promises) with at most `limit` in flight. Resolves when all settle. */
export async function runLimited(jobs, limit = TREND_CONCURRENCY, signal) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !signal?.aborted) {
      const job = jobs[next++];
      try { await job(); } catch { /* one missing sol never breaks the trend */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

/** Sols to fetch: the `count` sols ending at `sol` (never below 0). */
export function trendSols(sol, count = TREND_SOLS) {
  if (!isNumber(sol)) return [];
  const first = Math.max(0, sol - count + 1);
  return Array.from({ length: sol - first + 1 }, (_, index) => first + index);
}

/** { checkCode: [{ sol, value }] } of one organ from cached reports, oldest first. */
export function seriesFromReports(reports, organ) {
  const out = {};
  for (const report of reports) {
    const sol = report?.as_of?.sol;
    const card = (report?.organs || []).find(item => item?.organ === organ);
    if (!isNumber(sol) || !card) continue;
    for (const check of card.checks || []) {
      if (!check?.code || !isNumber(check.value)) continue;
      (out[check.code] ||= []).push({ sol, value: check.value });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.sol - b.sol);
  return out;
}

// Small deterministic PRNG (mulberry32) seeded from a string.
function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic (DEMO) series of one organ around the values of `report`: `count` sols ending at the
 * report's sol, a gentle random walk (±3 % of the value) that lands exactly on the shown value.
 * Integer-valued checks (counts, scores) stay integers and constant.
 */
export function demoSeries(report, organ, count = TREND_SOLS) {
  const card = (report?.organs || []).find(item => item?.organ === organ);
  const endSol = isNumber(report?.as_of?.sol) ? report.as_of.sol : count;
  const out = {};
  for (const check of card?.checks || []) {
    if (!check?.code || !isNumber(check.value)) continue;
    const random = seeded(`${report?.subject?.code}|${check.code}`);
    const value = check.value;
    const integer = Number.isInteger(value) && Math.abs(value) < 20;
    const scale = Math.abs(value) * 0.03 || 0.05;
    const points = new Array(count);
    let offset = 0;
    // Walk back from the shown value, so the newest point is exactly it.
    for (let index = count - 1; index >= 0; index--) {
      points[index] = { sol: endSol - (count - 1 - index), value: integer ? value : Number((value + offset).toFixed(3)) };
      offset += (random() - 0.5) * scale;
    }
    out[check.code] = points.filter(point => point.sol >= 0);
  }
  return out;
}

/** Own measurements as series: `${kind}.${field}` -> [{ sol, value, at }]. Water is summed per sol. */
export function ownSeries(entries, kinds) {
  const out = {};
  const wanted = new Set(kinds);
  for (const entry of entries || []) {
    if (!wanted.has(entry.kind)) continue;
    for (const [key, value] of Object.entries(entry.values || {})) {
      if (!isNumber(value)) continue;
      const id = `${entry.kind}.${key}`;
      const list = (out[id] ||= []);
      if (entry.kind === 'water' && list.length && list[list.length - 1].sol === entry.sol) {
        list[list.length - 1] = { ...list[list.length - 1], value: list[list.length - 1].value + value, at: entry.at };
      } else {
        list.push({ sol: entry.sol, value, at: entry.at });
      }
    }
  }
  return out;
}

function useMeasurementsVersion() {
  return useSyncExternalStore(
    subscribeMeasurements,
    () => {
      try { return window.localStorage.getItem(MEASUREMENTS_KEY) || ''; } catch { return ''; }
    },
    () => '',
  );
}

export function useOrganTrend(code, organ, { sol = null, online = false, report = null, sols = TREND_SOLS } = {}) {
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const wanted = useMemo(() => (online && code ? trendSols(sol, sols) : []), [online, code, sol, sols]);

  // The report on screen is the newest sol: seed the cache with it.
  useEffect(() => {
    if (online && code && report?.subject?.code === code && isNumber(report?.as_of?.sol) && !report.demo) {
      cache.set(cacheKey(code, report.as_of.sol), report);
    }
  }, [online, code, report]);

  useEffect(() => {
    const missing = wanted.filter(item => !cache.has(cacheKey(code, item)));
    if (missing.length === 0) { setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    // Newest first, so the right end of the chart fills in first.
    const jobs = [...missing].reverse().map(item => async () => {
      const data = await getOrganReport(code, { sol: item }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      cache.set(cacheKey(code, item), data);
      setTick(n => n + 1);
    });
    runLimited(jobs, TREND_CONCURRENCY, controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [code, wanted]);

  const series = useMemo(() => {
    if (!organ) return {};
    if (!online || report?.demo) return demoSeries(report, organ, sols);
    const reports = wanted.map(item => cache.get(cacheKey(code, item))).filter(Boolean);
    return seriesFromReports(reports, organ);
  }, [online, report, organ, sols, wanted, code, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const version = useMeasurementsVersion();
  const own = useMemo(() => {
    const kinds = (ORGAN_BY_ID[organ]?.actions || []).map(action => action.kind).filter(Boolean);
    return code ? ownSeries(listMeasurements({ code }), kinds) : {};
  }, [code, organ, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return { series, own, demo: !online || Boolean(report?.demo), loading };
}

export default useOrganTrend;

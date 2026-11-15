import { useEffect, useMemo, useState } from 'react';
import { getHabitat, isOfflineError } from '../api.js';
import { deriveHabitat } from './model.js';

/** Sols shown in a trend: the current one and the six before it. */
export const HISTORY_SOLS = 7;

// Past sols do not change any more: keep their responses for the session.
const pastSols = new Map(); // sol -> response (null = no data for that sol)

/** Forget the cached sols (tests). */
export function clearSolHistoryCache() {
  pastSols.clear();
}

/** The sols of a trend ending at `sol`: [sol-6 … sol], never below 1. */
export function historySols(sol, count = HISTORY_SOLS) {
  if (!Number.isFinite(Number(sol))) return [];
  const last = Number(sol);
  const first = Math.max(1, last - count + 1);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * GET /api/habitat for the sols before the shown one, only while `enabled` (a trend is on
 * screen). Requests run in parallel and are aborted when the view closes; past sols are cached.
 *
 * props: sol (shown sol), data (its response, reused for that sol), offline (demo fallback:
 *        there is no history to fetch), enabled.
 * Returns { state: 'idle' | 'loading' | 'ready' | 'offline', bySol: [{ sol, data | null }] }.
 */
export function useSolHistory({ sol, data, offline = false, enabled = true, count = HISTORY_SOLS }) {
  const noHistory = offline || Boolean(data?.demo);
  const sols = useMemo(() => historySols(sol, count), [sol, count]);
  const [, setVersion] = useState(0);
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (!enabled || noHistory || sols.length === 0) {
      setState(noHistory ? 'offline' : 'idle');
      return undefined;
    }
    const missing = sols.slice(0, -1).filter(item => !pastSols.has(item));
    if (missing.length === 0) {
      setState('ready');
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    let lostLink = false;
    setState('loading');
    Promise.all(missing.map(item => getHabitat({ sol: item }, { signal: controller.signal })
      .then(body => { pastSols.set(item, body); })
      .catch(error => {
        if (error?.kind === 'aborted') return;
        if (isOfflineError(error)) lostLink = true;
        else pastSols.set(item, null); // e.g. 404: that sol has no data
      })))
      .then(() => {
        if (cancelled) return;
        setVersion(version => version + 1);
        setState(lostLink ? 'offline' : 'ready');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, noHistory, sols]);

  const bySol = sols.map((item, index) => ({
    sol: item,
    data: index === sols.length - 1 ? data ?? null : pastSols.get(item) ?? null,
  }));
  return { state: noHistory ? 'offline' : state, bySol };
}

/**
 * Where a reading lives in a response, so it can be found again in another sol:
 * { room: id, sub: code | null } for map rooms (simulated rooms are derived per sol too)
 * or { zone: code } for exterior zones.
 */
export function readingAt(data, locator, channel) {
  if (!data || !locator) return null;
  let readings = [];
  if (locator.zone) {
    readings = (data.zones || []).find(zone => zone.code === locator.zone)?.readings || [];
  } else if (locator.room) {
    const room = deriveHabitat(data).rooms.find(item => item.id === locator.room);
    readings = (locator.sub ? room?.subZones.find(sub => sub.code === locator.sub)?.readings : room?.readings) || [];
  }
  return readings.find(reading => reading.channel === channel) || null;
}

/** [{ sol, value | null }] of one channel: the latest value of each sol. */
export function channelSeries(bySol, locator, channel) {
  return bySol.map(({ sol, data }) => {
    const raw = readingAt(data, locator, channel)?.value;
    const value = raw == null || raw === '' ? NaN : Number(raw);
    return { sol, value: Number.isFinite(value) ? value : null };
  });
}

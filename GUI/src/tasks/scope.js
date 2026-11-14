import { useMemo } from 'react';
import { CREW_CODES } from '../data/crewProfiles.js';
import { demoOverview } from '../data/demoReports.js';
import { useSharedHabitat } from '../habitat/sharedHabitat.js';
import { useSharedReports } from './sharedReports.js';

// What the side panel (tasks + alerts) and the top-bar counters read: one place, so they
// agree. Per person: the organ report at the shared sol (mother.report when it is theirs,
// else a shared GET /api/organs/{code}), falling back to the crew overview statuses. While
// MOTHER is offline the built-in demo records stand in, like everywhere else in the GUI.

/** Organ cards of one person: the full report when there is one, else the overview statuses. */
export function organCards({ code, report, overview }) {
  if (report?.subject?.code === code && Array.isArray(report.organs)) return report.organs;
  const entry = (overview || []).find(item => item?.subject?.code === code);
  if (!entry?.organs) return [];
  return Object.entries(entry.organs).map(([organ, status]) => ({ organ, status }));
}

/**
 * usePanelScope({ mother, route }) -> {
 *   scopeCode (person screen) | null (crew), codes, online, overview, report (of scopeCode or null),
 *   reports { code: report }, organs { code: cards }, habitat, habitatOffline, sol
 * }
 */
export function usePanelScope({ mother, route, code: explicitCode } = {}) {
  const scopeCode = route?.code ?? explicitCode ?? null;
  const mode = mother?.mode ?? (mother?.online ? 'online' : 'offline');
  const online = mode === 'online';
  const solParam = mother?.period?.sol ?? null;
  const codes = useMemo(() => (scopeCode ? [scopeCode] : CREW_CODES), [scopeCode]);
  const { data: habitat, offline: habitatOffline } = useSharedHabitat({ sol: solParam });
  // Person screen: mother.report is already theirs, no second request.
  const sharedCodes = useMemo(() => (scopeCode && online ? [] : codes), [scopeCode, online, codes]);
  const shared = useSharedReports(sharedCodes, { mode, sol: solParam });
  const sharedKey = codes.map(code => `${code}:${shared[code]?.generated_at ?? ''}:${shared[code]?.as_of?.sol ?? ''}`).join(',');

  const demo = useMemo(() => demoOverview(), []);
  const overview = online ? mother?.overview ?? null : mode === 'offline' ? demo : null;
  const motherReport = mother?.report ?? null;

  return useMemo(() => {
    const reportFor = code => (online && motherReport?.subject?.code === code && (solParam == null || motherReport?.as_of?.sol === solParam)
      ? motherReport
      : shared[code] ?? null);
    const reports = Object.fromEntries(codes.map(code => [code, reportFor(code)]));
    const organs = Object.fromEntries(codes.map(code => [code, organCards({ code, report: reports[code], overview })]));
    const report = scopeCode ? reports[scopeCode] : null;
    const anyReport = Object.values(reports).find(Boolean);
    const sol = solParam ?? motherReport?.as_of?.sol ?? anyReport?.as_of?.sol ?? habitat?.as_of?.sol ?? null;
    return { scopeCode, codes, online, overview, report, reports, organs, habitat, habitatOffline, sol: sol == null ? null : Number(sol) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeCode, codes, online, overview, motherReport, habitat, habitatOffline, solParam, sharedKey]);
}

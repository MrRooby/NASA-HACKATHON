import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrganReport, getOverview, getStatus, getSubjects, isOfflineError } from './api.js';

export const POLL_MS = 30000;

/** Habitat crew (Mars) is addressed by sol, everyone else (ISS / real flights) by flight day. */
export const periodKind = subject => (subject?.kind === 'habitat_crew' ? 'sol' : 'day');

/** Default person: the first habitat crew member (HAB-C1) when present, else the first subject. */
export function defaultSubject(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) return null;
  return subjects.find(subject => subject.kind === 'habitat_crew') || subjects[0];
}

const toErrorInfo = error => ({
  message: error?.message || String(error),
  hint: error?.hint ?? null,
  status: error?.status ?? null,
  kind: error?.kind ?? null,
});

/**
 * Connection to MOTHER.
 *
 * mode: 'connecting' -> first contact in progress (the GUI shows the demo data meanwhile)
 *       'online'     -> MOTHER and its database answer; real data is shown
 *       'offline'    -> unreachable / timeout / 503; the GUI falls back to the demo data
 *
 * Polls every `pollMs`: online -> refresh the selected person's report and the crew
 * overview; offline -> try to reconnect.
 */
export default function useMother({ pollMs = POLL_MS, enabled = true } = {}) {
  const [mode, setMode] = useState('connecting');
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [period, setPeriodState] = useState(null); // null = latest; else { sol } or { day }
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [overview, setOverview] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const alive = useRef(true);
  const reportRequest = useRef(0);
  const reportAbort = useRef(null);
  // Latest values for the polling timer.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedCodeRef = useRef(selectedCode);
  selectedCodeRef.current = selectedCode;
  const periodRef = useRef(period);
  periodRef.current = period;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      reportAbort.current?.abort();
    };
  }, []);

  const goOffline = useCallback(err => {
    if (!alive.current) return;
    setMode('offline');
    setError(toErrorInfo(err));
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const data = await getOverview();
      if (alive.current) setOverview(Array.isArray(data) ? data : null);
    } catch {
      // The crew grid is optional: keep the last one and do not drop the connection for it.
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      const health = await getStatus();
      if (!alive.current) return;
      setStatus(health);
      if (health?.database && health.database.reachable === false) {
        goOffline({
          message: health.database.error || 'MOTHER database unreachable',
          hint: health.database.hint,
          status: 503,
          kind: 'http',
        });
        return;
      }
      const list = await getSubjects();
      if (!alive.current) return;
      const people = Array.isArray(list) ? list : [];
      setSubjects(people);
      setSelectedCode(current => (current && people.some(p => p.code === current) ? current : defaultSubject(people)?.code ?? null));
      setError(null);
      setMode('online');
      loadOverview();
    } catch (err) {
      goOffline(err);
    }
  }, [goOffline, loadOverview]);

  const loadReport = useCallback(async (code, currentPeriod) => {
    if (!code) return;
    const id = ++reportRequest.current;
    reportAbort.current?.abort();
    const controller = new AbortController();
    reportAbort.current = controller;
    setLoadingReport(true);
    try {
      const data = await getOrganReport(code, currentPeriod || {}, { signal: controller.signal });
      if (!alive.current || id !== reportRequest.current) return;
      setReport(data);
      setReportError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!alive.current || id !== reportRequest.current || err?.kind === 'aborted') return;
      if (isOfflineError(err)) goOffline(err);
      else setReportError(toErrorInfo(err)); // e.g. 404 unknown person: stay online, show the error
    } finally {
      if (alive.current && id === reportRequest.current) setLoadingReport(false);
    }
  }, [goOffline]);

  // First contact.
  useEffect(() => {
    if (enabled) connect();
  }, [enabled, connect]);

  // Person or sol/day changed -> new report.
  useEffect(() => {
    if (mode === 'online' && selectedCode) loadReport(selectedCode, period);
  }, [mode, selectedCode, period, loadReport]);

  // Periodic refresh / reconnect.
  useEffect(() => {
    if (!enabled || !pollMs) return undefined;
    const timer = setInterval(() => {
      if (modeRef.current === 'online') {
        loadReport(selectedCodeRef.current, periodRef.current);
        loadOverview();
      } else if (modeRef.current === 'offline') {
        connect();
      }
    }, pollMs);
    return () => clearInterval(timer);
  }, [enabled, pollMs, connect, loadReport, loadOverview]);

  const selectSubject = useCallback(code => {
    if (!code || code === selectedCodeRef.current) return;
    setSelectedCode(code);
    setPeriodState(null); // a new person starts at their latest sol / day
    setReport(null);
    setReportError(null);
  }, []);

  /** setPeriod(null) -> latest; setPeriod({ sol: 142 }) or setPeriod({ day: 51 }). */
  const setPeriod = useCallback(next => setPeriodState(next || null), []);

  const subject = subjects.find(item => item.code === selectedCode) || null;

  return {
    mode,
    online: mode === 'online',
    error,
    status,
    subjects,
    subject,
    selectedCode,
    selectSubject,
    period,
    setPeriod,
    report,
    reportError,
    loadingReport,
    overview,
    lastUpdated,
    reconnect: connect,
  };
}

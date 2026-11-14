import { useMemo } from 'react';
import { demoReport } from '../data/demoReports.js';
import { periodKind } from '../useMother.js';

/**
 * Which organ report a screen shows for `viewedCode`, given the MOTHER hook (src/useMother.js).
 *
 * state:
 *   'live'     -> mother is online and its report belongs to viewedCode
 *   'stale'    -> the link dropped but the last real report of viewedCode is still held
 *   'demo'     -> offline / connecting without a report: built-in demo report (report.demo === true)
 *   'awaiting' -> online, the report has not arrived yet
 *   'error'    -> online, the report request failed (e.g. 404 unknown person); see `error`
 *   'empty'    -> offline and there is no demo record for this code
 *
 * Returns { report (or null), state, demo (bool), error, kind ('sol' | 'day'), asOf (number | null) }.
 * The App keeps mother's selected subject equal to viewedCode; a report of another
 * person (one render behind after a switch) is never shown.
 */
export function useCrewReport(mother, viewedCode) {
  const mode = mother?.mode ?? 'offline';
  const online = mode === 'online';
  const held = mother?.report ?? null;
  const heldCode = held?.subject?.code;
  const own = held && (heldCode == null || viewedCode == null || heldCode === viewedCode) ? held : null;
  const fallback = useMemo(() => (online || own ? null : demoReport(viewedCode)), [online, own, viewedCode]);

  const report = own ?? fallback;
  let state;
  if (own) state = online ? 'live' : 'stale';
  else if (online) state = mother?.reportError ? 'error' : 'awaiting';
  else state = fallback ? 'demo' : 'empty';

  // Habitat crew (Mars) is addressed by sol, everyone else by flight day. Offline there is no
  // subject list, so fall back on the report itself, then on the crew code.
  let kind;
  if (report?.as_of?.sol != null) kind = 'sol';
  else if (report?.as_of?.day != null) kind = 'day';
  else if (mother?.subject) kind = periodKind(mother.subject);
  else kind = /^HAB-/i.test(String(viewedCode ?? '')) ? 'sol' : 'day';
  const asOf = report?.as_of?.[kind] ?? null;

  return {
    report,
    state,
    mode,
    demo: state === 'demo',
    error: state === 'error' ? mother.reportError : null,
    kind,
    asOf,
  };
}

/** i18n key of the terminal notice for a state (null when there is nothing to say). */
export function noticeKey(state, mode) {
  if (state === 'demo') return mode === 'connecting' ? 'home.connecting' : 'home.linkLost';
  if (state === 'stale') return 'home.linkLostStale';
  if (state === 'awaiting') return 'home.awaiting';
  if (state === 'empty') return 'home.noRecord';
  if (state === 'error') return 'home.telemetryFault';
  return null;
}

export default useCrewReport;

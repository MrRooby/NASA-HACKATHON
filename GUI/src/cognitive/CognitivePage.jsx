import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSubjects, isOfflineError } from '../api.js';
import SessionFlow from './SessionFlow.jsx';
import { getCognitive } from './engine/api.js';
import { DISCLAIMER, TEST_ORDER } from './engine/protocols.js';
import { Tile, TrendSpark, emptyTile } from './Tiles.jsx';
import { pendingCount, startAutoFlush, subscribe } from './engine/queue.js';
import { fmt } from './session.js';

const SUBJECT_KEY = 'cognitive.subject';
// standalone local-only page (GUI/cognitive.html); BASE_URL keeps it working when the app is served from a sub-path
export const SELF_TEST_URL = `${import.meta.env.BASE_URL || '/'}cognitive.html`;
const SUBJECTS_CACHE = 'cognitive.subjects';
export { TrendSpark };

const store = {
  get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* ignore */ } },
};

function readCachedSubjects() {
  try { const v = JSON.parse(store.get(SUBJECTS_CACHE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

function useSubjects(motherSubjects) {
  const [list, setList] = useState(() => (motherSubjects?.length ? motherSubjects : readCachedSubjects()));
  useEffect(() => {
    if (motherSubjects?.length) { setList(motherSubjects); return undefined; }
    let alive = true;
    getSubjects().then(data => {
      if (!alive || !Array.isArray(data)) return;
      setList(data);
      store.set(SUBJECTS_CACHE, JSON.stringify(data.map(({ code, label, data_kind, synthetic }) => ({ code, label, data_kind, synthetic }))));
    }).catch(() => {});
    return () => { alive = false; };
  }, [motherSubjects]);
  return list;
}

/** Cognitive tests page. `mother` (optional) supplies the crew list the rest of the app already loaded. */
export default function CognitivePage({ mother = null, onRunningChange }) {
  const subjects = useSubjects(mother?.subjects);
  const [code, setCode] = useState(() => store.get(SUBJECT_KEY) || '');
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);
  const [queued, setQueued] = useState(() => pendingCount());
  const [flow, setFlow] = useState(null); // { mode }
  const [reloadTick, setReloadTick] = useState(0);

  // Subject: remembered choice, else the app's current person, else the first one.
  useEffect(() => {
    if (subjects.length === 0) return;
    if (code && subjects.some(s => s.code === code)) return;
    const preferred = (mother?.selectedCode && subjects.find(s => s.code === mother.selectedCode)) || subjects[0];
    setCode(preferred.code);
  }, [subjects, code, mother?.selectedCode]);

  const choose = value => { setCode(value); store.set(SUBJECT_KEY, value); };
  const subject = subjects.find(s => s.code === code) || (code ? { code } : null);

  useEffect(() => {
    if (!code) return undefined;
    const controller = new AbortController();
    setError(null);
    getCognitive(code, { signal: controller.signal }).then(body => {
      setData(body);
      setOffline(false);
    }).catch(err => {
      if (err?.kind === 'aborted') return;
      setData(null);
      if (isOfflineError(err)) setOffline(true);
      else { setOffline(false); setError(err); }
    });
    return () => controller.abort();
  }, [code, reloadTick]);

  useEffect(() => {
    const unsub = subscribe(() => setQueued(pendingCount()));
    const stop = startAutoFlush({ onFlushed: () => { setQueued(pendingCount()); setReloadTick(t => t + 1); } });
    return () => { unsub(); stop(); };
  }, []);

  const setRunning = useCallback(v => onRunningChange?.(v), [onRunningChange]);

  const tiles = useMemo(
    () => TEST_ORDER.map(id => (data?.tests || []).find(t => t.test_id === id) || emptyTile(id)),
    [data],
  );

  if (flow && code) {
    return (
      <div className="cog-run">
        <SessionFlow subject={code} mode={flow.mode} tiles={data?.tests || null} onRunningChange={setRunning}
          onSaved={() => setQueued(pendingCount())}
          onExit={() => { setFlow(null); setRunning(false); setReloadTick(t => t + 1); }} />
      </div>
    );
  }

  const synthetic = (data?.subject?.data_kind || subject?.data_kind) === 'synthetic' || subject?.synthetic === true;

  return (
    <div className="cog-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">COGNITIVE PERFORMANCE · COMPARED WITH YOUR OWN BASELINE</div>
          <h1 className="page-h1">COGNITIVE TESTS</h1>
        </div>
        <div className="header-actions">
          <label className="cog-select">
            <span>Person</span>
            {subjects.length > 0
              ? (
                <select value={code} onChange={e => choose(e.target.value)} aria-label="Person">
                  {subjects.map(s => <option key={s.code} value={s.code}>{s.label ? `${s.label} (${s.code})` : s.code}</option>)}
                </select>
              )
              : <input value={code} onChange={e => choose(e.target.value.trim())} placeholder="e.g. SYN-01" aria-label="Person code" />}
          </label>
        </div>
      </div>

      {offline && (
        <div className="cog-banner cog-banner-offline" role="status">
          MOTHER is not reachable. You can still run tests: results are kept on this device and sent later.
        </div>
      )}
      {queued > 0 && (
        <div className="cog-banner" role="status" data-testid="queued-banner">
          {queued === 1 ? '1 result is waiting to be sent' : `${queued} results are waiting to be sent`}
        </div>
      )}
      {error && <div className="cog-banner cog-banner-offline" role="alert">{error.status === 404 ? 'No cognitive data for this person yet.' : error.message}</div>}
      {synthetic && <div className="cog-banner cog-banner-synth" data-testid="synthetic-label">Synthetic data: simulated person, not a real participant.</div>}

      <div className="cog-actions cog-actions-top">
        <button type="button" className="btn-primary cog-btn" disabled={!code} onClick={() => setFlow({ mode: 'quick' })}>QUICK TEST · PVT (~4 min)</button>
        <button type="button" className="btn-secondary cog-btn" disabled={!code} onClick={() => setFlow({ mode: 'full' })}>FULL BATTERY (~8 min)</button>
      </div>
      <p className="cog-muted cog-self-link">
        Want to try the tests on yourself?{' '}
        <a href={SELF_TEST_URL} target="_blank" rel="noopener" data-testid="self-test-link">Open self-test mode ↗</a>
        {' '}(results stay only in your browser and are never sent to the crew database).
      </p>

      <div className="cog-tiles">
        {tiles.map(t => <Tile key={t.test_id} tile={t} />)}
      </div>

      {data?.composite_z != null && <p className="cog-muted">Overall change vs your baseline (z): {fmt(data.composite_z, 2)}</p>}
      <p className="cog-disclaimer">{data?.disclaimer || DISCLAIMER}</p>
    </div>
  );
}

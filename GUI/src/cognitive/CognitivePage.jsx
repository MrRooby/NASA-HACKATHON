import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSubjects, isOfflineError } from '../api.js';
import { Button } from '../components/index.js';
import { useT } from '../i18n/index.js';
import SessionFlow from './SessionFlow.jsx';
import { getCognitive } from './engine/api.js';
import { DISCLAIMER, TEST_ORDER } from './engine/protocols.js';
import { Tile, TrendSpark, emptyTile } from './Tiles.jsx';
import { pendingCount, startAutoFlush, subscribe } from './engine/queue.js';
import { fmt } from './session.js';
import './cognitive.css';

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

/**
 * Cognitive tests page. `mother` (optional) supplies the crew list the rest of the app already loaded.
 * `fixedCode` pins the person (no selector, nothing remembered); `personName` is shown next to it.
 * `readOnly` shows the tiles only: no test can be started (someone else's results).
 * Texts are translated (namespace `tests`); without an I18nProvider they are the English originals.
 */
export default function CognitivePage({ mother = null, onRunningChange, fixedCode = null, personName = null, readOnly = false }) {
  const t = useT();
  const subjects = useSubjects(mother?.subjects);
  const [chosen, setChosen] = useState(() => (fixedCode ? '' : store.get(SUBJECT_KEY) || ''));
  const code = fixedCode || chosen;
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);
  const [queued, setQueued] = useState(() => pendingCount());
  const [flow, setFlow] = useState(null); // { mode }
  const [reloadTick, setReloadTick] = useState(0);

  // Subject: remembered choice, else the app's current person, else the first one.
  useEffect(() => {
    if (fixedCode || subjects.length === 0) return;
    if (chosen && subjects.some(s => s.code === chosen)) return;
    const preferred = (mother?.selectedCode && subjects.find(s => s.code === mother.selectedCode)) || subjects[0];
    setChosen(preferred.code);
  }, [fixedCode, subjects, chosen, mother?.selectedCode]);

  const choose = value => { setChosen(value); store.set(SUBJECT_KEY, value); };
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
    const stop = startAutoFlush({ onFlushed: () => { setQueued(pendingCount()); setReloadTick(n => n + 1); } });
    return () => { unsub(); stop(); };
  }, []);

  const setRunning = useCallback(v => onRunningChange?.(v), [onRunningChange]);

  const tiles = useMemo(
    () => TEST_ORDER.map(id => (data?.tests || []).find(item => item.test_id === id) || emptyTile(id)),
    [data],
  );

  if (flow && code && !readOnly) {
    return (
      <div className="cog-run">
        <SessionFlow subject={code} mode={flow.mode} tiles={data?.tests || null} onRunningChange={setRunning}
          onSaved={() => setQueued(pendingCount())}
          onExit={() => { setFlow(null); setRunning(false); setReloadTick(n => n + 1); }} />
      </div>
    );
  }

  const synthetic = (data?.subject?.data_kind || subject?.data_kind) === 'synthetic' || subject?.synthetic === true;

  return (
    <div className="cog-page" data-readonly={readOnly ? 'true' : 'false'}>
      <header className="cog-head">
        <div>
          <p className="cog-eyebrow">{t('tests.eyebrow')}</p>
          <h1>{t('tests.title')}</h1>
        </div>
        {fixedCode
          ? (
            <p className="cog-select" data-testid="cog-person">
              <span>{t('tests.person')}</span>
              <span className="cog-person">{personName ? `${personName} · ${code}` : (subject?.label && subject.label !== code ? `${subject.label} · ${code}` : code)}</span>
            </p>
          )
          : (
            <label className="cog-select">
              <span>{t('tests.person')}</span>
              {subjects.length > 0
                ? (
                  <select value={code} onChange={e => choose(e.target.value)} aria-label={t('tests.person')}>
                    {subjects.map(s => <option key={s.code} value={s.code}>{s.label ? `${s.label} (${s.code})` : s.code}</option>)}
                  </select>
                )
                : <input value={code} onChange={e => choose(e.target.value.trim())} placeholder={t('tests.personPlaceholder')} aria-label={t('tests.personCode')} />}
            </label>
          )}
      </header>

      {offline && (
        <p className="cog-banner cog-banner-offline" role="status">
          {readOnly ? t('tests.offlineReadOnly') : t('tests.offline')}
        </p>
      )}
      {queued > 0 && (
        <p className="cog-banner" role="status" data-testid="queued-banner">
          {queued === 1 ? t('tests.queuedOne') : t('tests.queuedMany', { n: queued })}
        </p>
      )}
      {error && <p className="cog-banner cog-banner-offline" role="alert">{error.status === 404 ? t('tests.noData') : error.message}</p>}
      {synthetic && <p className="cog-banner cog-banner-synth" data-testid="synthetic-label">{t('tests.synthetic')}</p>}

      {!readOnly && (
        <div className="cog-actions">
          <Button variant="primary" className="cog-btn" disabled={!code} onClick={() => setFlow({ mode: 'quick' })}>{t('tests.quick')}</Button>
          <Button className="cog-btn" disabled={!code} onClick={() => setFlow({ mode: 'full' })}>{t('tests.full')}</Button>
        </div>
      )}
      <p className="cog-muted cog-self-link">
        {t('tests.selfIntro')}{' '}
        <a href={SELF_TEST_URL} target="_blank" rel="noopener" data-testid="self-test-link">{t('tests.selfLink')}</a>
        {' '}{t('tests.selfNote')}
      </p>

      <div className="cog-tiles">
        {tiles.map(item => <Tile key={item.test_id} tile={item} />)}
      </div>

      {data?.composite_z != null && <p className="cog-muted">{t('tests.compositeZ', { z: fmt(data.composite_z, 2) })}</p>}
      <p className="cog-disclaimer">{data?.disclaimer || DISCLAIMER}</p>
    </div>
  );
}

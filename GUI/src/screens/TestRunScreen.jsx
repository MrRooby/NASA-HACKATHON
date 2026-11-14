import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelAvatar, PixelIcon } from '../pixel/index.js';
import { Badge } from '../ui/index.js';
import { isOfflineError } from '../api.js';
import { getProfile } from '../data/crewProfiles.js';
import SessionFlow from '../cognitive/SessionFlow.jsx';
import { getCognitive } from '../cognitive/engine/api.js';
import { pendingCount, startAutoFlush, subscribe } from '../cognitive/engine/queue.js';
import { recordMeasurement } from '../shared/measurements.js';
import '../cognitive/cognitive.css';
import './testrun.css';

// TEST screen (GUI/DESIGN.md §4.4): a cognitive session of route.code on the whole window
// (the App hides the top bar and the side panel). route.test 'quick' = PVT, 'full' = battery
// (PVT, Go/No-Go, DSST). Session flow, scoring and timing are src/cognitive (unchanged); results go
// to MOTHER through its queue (kept on this device while MOTHER is offline).
// Leaving (EXIT, or the end of the session) returns to the person with the brain organ open.

export default function TestRunScreen({ mother, route, navigate }) {
  const t = useT();
  const code = route?.code ?? null;
  const mode = route?.test === 'full' ? 'full' : 'quick';
  const profile = getProfile(code);
  const [tiles, setTiles] = useState(undefined); // undefined = loading, null = none / offline
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(() => pendingCount());
  const recorded = useRef(false);

  // Session numbers / stimulus sets come from MOTHER's tiles; without them SessionFlow uses local counters.
  useEffect(() => {
    if (!code) return undefined;
    const controller = new AbortController();
    getCognitive(code, { signal: controller.signal })
      .then(body => { setTiles(Array.isArray(body?.tests) ? body.tests : null); setOffline(false); })
      .catch(err => {
        if (err?.kind === 'aborted') return;
        setTiles(null);
        setOffline(isOfflineError(err));
      });
    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    const unsubscribe = subscribe(() => setQueued(pendingCount()));
    const stop = startAutoFlush({ onFlushed: () => setQueued(pendingCount()) });
    return () => { unsubscribe(); stop(); };
  }, []);

  const exit = useCallback(() => navigate?.({ screen: 'person', code, organ: 'brain' }), [navigate, code]);

  // A finished test ticks off the cognitive task of this sol (shared measurement store).
  const onSaved = useCallback(saved => {
    setQueued(pendingCount());
    if (recorded.current || saved?.state === 'rejected') return;
    recorded.current = true;
    const sol = mother?.report?.subject?.code === code ? mother?.report?.as_of?.sol ?? null : null;
    recordMeasurement(code, mode === 'full' ? 'cognitive_full' : 'cognitive_pvt', { state: saved?.state ?? 'saved' }, sol);
  }, [code, mode, mother]);

  return (
    <div className="testrun" data-testid="test-run" data-mode={mode}>
      <header className="testrun-head">
        <PixelIcon name={mode === 'full' ? 'dsst' : 'pvt'} size={32} />
        <h1 className="testrun-title">{t('person.testTitle')}</h1>
        <span className="testrun-mode">{mode === 'full' ? t('person.testFull') : t('person.testQuick')}</span>
        <span className="testrun-who">
          <PixelAvatar code={code} size={32} />
          <span>{profile?.name ?? code}</span>
        </span>
        {offline ? <span className="testrun-note" role="status">{t('person.testOffline')}</span> : null}
        {queued > 0 ? <Badge kind="todo" title={t('person.testQueued', { n: queued })} /> : null}
        <button type="button" className="testrun-exit" onClick={exit}>
          <PixelIcon name="back" size={24} /> {t('person.testExit')}
        </button>
      </header>
      <main className="testrun-body">
        {code && tiles !== undefined ? (
          <div className="cog-run">
            <SessionFlow subject={code} mode={mode} tiles={tiles} onSaved={onSaved} onExit={exit} />
          </div>
        ) : (
          <p className="testrun-loading" role="status"><PixelIcon name="clock" size={32} animate /></p>
        )}
      </main>
    </div>
  );
}

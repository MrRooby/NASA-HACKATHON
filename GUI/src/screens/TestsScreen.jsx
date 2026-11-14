import React, { Suspense, lazy, useEffect } from 'react';
import { Button, Panel } from '../components/index.js';
import { useT } from '../i18n/index.js';
import './tests.css';

// The cognitive module (PVT, Go/No-Go, DSST) is loaded only when the screen is opened.
const CognitivePage = lazy(() => import('../cognitive/CognitivePage.jsx'));

/**
 * TESTS screen: cognitive tests of the viewed crew member (src/cognitive, backend /api/cognitive/*).
 * A test can be run only from your own session; someone else's tiles are read-only.
 * While a test runs the app chrome is hidden through setChromeHidden (steady frame timing).
 * props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile, setChromeHidden }
 */
export default function TestsScreen({ mother, session, viewedCode, setViewedCode, navigate, profile, setChromeHidden }) {
  const t = useT();
  const isOwn = viewedCode === session;
  const name = profile?.name ?? viewedCode ?? '—';

  // Never leave the chrome hidden behind when the screen goes away mid-test.
  useEffect(() => () => setChromeHidden?.(false), [setChromeHidden]);

  const backToOwn = () => {
    setViewedCode?.(session);
    navigate?.('tests');
  };

  return (
    <div className="tests-screen" data-own={isOwn ? 'true' : 'false'}>
      {!isOwn ? (
        <div className="tests-readonly" role="status" data-testid="read-only-banner">
          <span className="tests-readonly-text">{t('tests.readOnly', { name: String(name).toUpperCase() })}</span>
          <span className="tests-readonly-hint">{t('tests.readOnlyHint')}</span>
          <Button onClick={backToOwn}>{t('tests.backToOwn')}</Button>
        </div>
      ) : null}

      <Suspense
        fallback={(
          <Panel title={t('tests.title')}>
            <p className="upper dim" role="status">{t('tests.loading')}<span className="cursor" /></p>
          </Panel>
        )}
      >
        <CognitivePage
          key={viewedCode}
          mother={mother}
          fixedCode={viewedCode}
          personName={profile?.name ?? null}
          readOnly={!isOwn}
          onRunningChange={setChromeHidden}
        />
      </Suspense>
    </div>
  );
}

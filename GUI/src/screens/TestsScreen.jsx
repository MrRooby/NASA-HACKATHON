import React from 'react';
import { Badge, Panel } from '../components/index.js';
import { useT } from '../i18n/index.js';
import './tests.css';

// PLACEHOLDER reserved for the future "tests" screen. Props shared by every screen:
//   { mother, session, viewedCode, setViewedCode, navigate, profile }
export default function TestsScreen() {
  const t = useT();
  return (
    <div className="tests-screen">
      <Panel title={t('tests.title')} meta={<Badge kind="todo" />}>
        <p className="upper dim">{t('common.underConstruction')}<span className="cursor" /></p>
      </Panel>
    </div>
  );
}

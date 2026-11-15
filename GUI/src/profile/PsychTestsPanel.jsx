import React, { useState } from 'react';
import { Button } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import { Pager } from '../home/DataDialog.jsx';
import { COGNITIVE_BATTERY, PSYCH_TEST_CATALOG, listPsychResults, listPsychTests } from '../data/crewStore.js';
import { localized } from '../crew/crewStatus.js';
import { useStoreList } from './useStoreList.js';

const PER_PAGE = 3;

/** Latest result per test id (highest sol). */
function latestByTest(results) {
  const latest = {};
  for (const result of results) {
    const current = latest[result.testId];
    if (!current || (result.sol ?? -1) > (current.sol ?? -1)) latest[result.testId] = result;
  }
  return latest;
}

/**
 * PSYCH TESTS popup body: the cognitive battery (PVT, Go/No-Go, DSST, real, runs on the TESTS
 * screen) on top, then the test catalogue paged two at a time, with the last result and the next
 * due sol. The questionnaires are not connected yet: static catalogue (crewStore.PSYCH_TEST_CATALOG),
 * no results, START disabled; all of it is read through crewStore, so real data needs no change
 * here (see GUI/TODO.md, section b).
 * props: crewCode ('HAB-C1'), isOwn (only the person themselves starts a test),
 *        onStart(test) — opens the test runner; without it every START stays disabled.
 */
export default function PsychTestsPanel({ crewCode, isOwn, onStart }) {
  const { t, lang } = useI18n();
  const tests = useStoreList(listPsychTests, [], PSYCH_TEST_CATALOG);
  const results = useStoreList(() => listPsychResults(crewCode), [crewCode]);
  const latest = latestByTest(results.items);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(tests.items.length / PER_PAGE));
  const safe = Math.min(page, pages - 1);
  const slice = tests.items.slice(safe * PER_PAGE, safe * PER_PAGE + PER_PAGE);

  return (
    <div className="pf-tests">
      <div className="pf-battery" data-testid="cognitive-battery">
        <span className="pf-battery-text">{t('profile.testsBattery')}</span>
        <Button variant="primary" className="pf-big" disabled={!onStart || !isOwn} onClick={() => onStart?.(COGNITIVE_BATTERY)}>
          {t('profile.testsOpenBattery')}
        </Button>
      </div>

      <ul className="pf-test-list">
        {slice.map(test => {
          const last = latest[test.id];
          const name = localized(test.name, lang);
          const nextDue = last?.sol != null && test.cadence?.everySols ? last.sol + test.cadence.everySols : null;
          return (
            <li key={test.id} className="pf-test" data-test-id={test.id}>
              <div className="pf-test-main">
                <h3 className="pf-test-name">{name}</h3>
                <p className="pf-test-purpose">{localized(test.purpose, lang)}</p>
                <p className="pf-test-meta">
                  <span className="pf-test-cadence">{localized(test.cadence?.label, lang)} · {t('profile.testsDuration', { n: test.durationMin })}</span>
                  <span>{t('profile.testsColLast')}: <b data-cell="last">{last ? `${last.score ?? '—'} · ${t('common.solN', { n: last.sol })}` : '—'}</b></span>
                  <span>{t('profile.testsColNext')}: <b data-cell="next">{nextDue != null ? t('common.solN', { n: nextDue }) : '—'}</b></span>
                </p>
                <p className="pf-test-ref">{t('profile.testsReference')}: {test.reference}</p>
              </div>
              <Button
                className="pf-big"
                disabled={!onStart || !test.available || !isOwn}
                aria-label={`${t('profile.testsStart')}: ${name}`}
                onClick={() => onStart?.(test)}
              >
                {t('profile.testsStart')}
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="pf-dlg-foot">
        <span className="pf-note-off">{t('profile.testsHint')}</span>
        <Pager page={safe} pages={pages} onPage={setPage} />
      </div>
    </div>
  );
}

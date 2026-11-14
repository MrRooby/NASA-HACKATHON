import React from 'react';
import { Badge, Button, Panel } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import { PSYCH_TEST_CATALOG, listPsychResults, listPsychTests } from '../data/crewStore.js';
import { localized } from '../crew/crewStatus.js';
import { useStoreList } from './useStoreList.js';

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
 * List of psychological tests with the last result and the next due sol per test.
 * SKELETON: the catalogue is static (crewStore.PSYCH_TEST_CATALOG), there are no results
 * and no test can be started; all of it is read through crewStore, so real data needs
 * no change here (see GUI/TODO.md, section b).
 * props: crewCode ('HAB-C1'), isOwn (only the person themselves starts a test),
 *        onStart(test) — the future test runner; without it [ START ] stays disabled.
 */
export default function PsychTestsPanel({ crewCode, isOwn, onStart }) {
  const { t, lang } = useI18n();
  const tests = useStoreList(listPsychTests, [], PSYCH_TEST_CATALOG);
  const results = useStoreList(() => listPsychResults(crewCode), [crewCode]);
  const latest = latestByTest(results.items);
  const connected = tests.connected && results.connected;

  return (
    <Panel
      className="profile-tests"
      title={t('profile.testsTitle')}
      meta={connected ? null : <Badge kind="todo" data-testid="tests-todo">{t('profile.notConnected')}</Badge>}
    >
      <p className="profile-hint">{t('profile.testsHint')}</p>
      <div className="profile-table-wrap">
        <table className="table profile-tests-table">
          <thead>
            <tr>
              <th scope="col">{t('profile.testsColName')}</th>
              <th scope="col">{t('profile.testsColPurpose')}</th>
              <th scope="col">{t('profile.testsColCadence')}</th>
              <th scope="col">{t('profile.testsColLast')}</th>
              <th scope="col">{t('profile.testsColNext')}</th>
              <th scope="col"><span className="visually-hidden">{t('profile.testsColAction')}</span></th>
            </tr>
          </thead>
          <tbody>
            {tests.items.map(test => {
              const last = latest[test.id];
              const name = localized(test.name, lang);
              const nextDue = last?.sol != null && test.cadence?.everySols ? last.sol + test.cadence.everySols : null;
              return (
                <tr key={test.id} data-test-id={test.id}>
                  <th scope="row" className="profile-test-name">{name}</th>
                  <td className="profile-test-purpose">
                    {localized(test.purpose, lang)}
                    <span className="profile-test-ref">{t('profile.testsReference')}: {test.reference}</span>
                  </td>
                  <td className="profile-test-cadence">
                    {localized(test.cadence?.label, lang)}
                    <span className="profile-test-ref">{t('profile.testsDuration', { n: test.durationMin })}</span>
                  </td>
                  <td data-cell="last">{last ? `${last.score ?? '—'} · ${t('common.solN', { n: last.sol })}` : '—'}</td>
                  <td data-cell="next">{nextDue != null ? t('common.solN', { n: nextDue }) : '—'}</td>
                  <td className="profile-test-action">
                    <Button
                      small
                      disabled={!onStart || !test.available || !isOwn}
                      aria-label={`${t('profile.testsStart')}: ${name}`}
                      onClick={() => onStart?.(test)}
                    >
                      {t('profile.testsStart')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="profile-hint">{t('profile.testsAssumption')}</p>
    </Panel>
  );
}

import React, { useState } from 'react';
import { Button, Panel } from '../components/index.js';
import { useT } from '../i18n/index.js';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const SLEEP_STEPS = Array.from({ length: 29 }, (_, i) => i * 0.5);
const SLEEP_START = 7;

/**
 * Pre-test questionnaire on one screen: every answer is a row of big touch buttons (sleep hours: − / +).
 * Each question also keeps a visually hidden <select> bound to the same value (keyboard, screen readers, tests).
 * onDone(context) with the CONTRACT field names.
 */
export default function Survey({ onDone }) {
  const t = useT();
  const [v, setV] = useState({ sleep_h: '', sleep_quality: '', fatigue: '', kss: '', stress: '', caffeine_3h: 'no' });
  const put = (key, value) => setV(cur => ({ ...cur, [key]: String(value) }));
  const set = key => e => put(key, e.target.value);
  const complete = ['sleep_h', 'sleep_quality', 'fatigue', 'kss', 'stress'].every(k => v[k] !== '');

  const submit = e => {
    e.preventDefault();
    if (!complete) return;
    onDone({
      sleep_h: Number(v.sleep_h), sleep_quality: Number(v.sleep_quality), fatigue: Number(v.fatigue),
      kss: Number(v.kss), stress: Number(v.stress), caffeine_3h: v.caffeine_3h === 'yes',
    });
  };

  const hidden = (id, values) => (
    <select id={id} className="cog-sr" tabIndex={-1} value={v[id]} onChange={set(id)} required>
      <option value="">{t('tests.choose')}</option>
      {values.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  const head = (id, label, hint) => (
    <div className="cog-q-head">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="cog-q-hint">{hint}</span>}
    </div>
  );

  const scale = (id, label, from, to, hint) => (
    <div className="cog-q" data-q={id}>
      {head(id, label, hint)}
      {hidden(id, range(from, to))}
      <div className="cog-q-row" style={{ '--n': to - from + 1 }}>
        {range(from, to).map(n => (
          <button key={n} type="button" className="cog-q-btn" aria-pressed={v[id] === String(n)}
            aria-label={`${label}: ${n}`} onClick={() => put(id, n)}>{n}</button>
        ))}
      </div>
    </div>
  );

  const sleepIdx = v.sleep_h === '' ? -1 : SLEEP_STEPS.indexOf(Number(v.sleep_h));
  const stepSleep = dir => {
    if (sleepIdx < 0) { put('sleep_h', SLEEP_START); return; }
    const i = Math.min(SLEEP_STEPS.length - 1, Math.max(0, sleepIdx + dir));
    put('sleep_h', SLEEP_STEPS[i]);
  };
  const sleepLabel = t('tests.qSleepH');

  return (
    <Panel className="cog-card cog-survey" title={t('tests.surveyTitle')}>
      <form onSubmit={submit}>
        <div className="cog-q-grid">
          <div className="cog-q" data-q="sleep_h">
            {head('sleep_h', sleepLabel, t('tests.hSleepH'))}
            {hidden('sleep_h', SLEEP_STEPS)}
            <div className="cog-q-stepper">
              <button type="button" className="cog-q-btn cog-q-step" aria-label={`${sleepLabel} −0.5`} onClick={() => stepSleep(-1)}>−</button>
              <output className="cog-q-out" htmlFor="sleep_h">{v.sleep_h === '' ? '—' : `${v.sleep_h} h`}</output>
              <button type="button" className="cog-q-btn cog-q-step" aria-label={`${sleepLabel} +0.5`} onClick={() => stepSleep(1)}>+</button>
            </div>
          </div>
          {scale('kss', t('tests.qKss'), 1, 9, t('tests.hKss'))}
          {scale('sleep_quality', t('tests.qSleepQuality'), 1, 10, t('tests.hSleepQuality'))}
          {scale('stress', t('tests.qStress'), 1, 10, t('tests.hStress'))}
          {scale('fatigue', t('tests.qFatigue'), 1, 10, t('tests.hFatigue'))}
          <fieldset className="cog-q cog-q-radio">
            <legend className="cog-q-head"><span>{t('tests.qCaffeine')}</span></legend>
            <div className="cog-q-row" style={{ '--n': 2 }}>
              {['no', 'yes'].map(val => (
                <label key={val} className="cog-q-btn cog-q-choice" data-checked={v.caffeine_3h === val ? 'true' : 'false'}>
                  <input type="radio" className="cog-sr" name="caffeine" value={val} checked={v.caffeine_3h === val} onChange={set('caffeine_3h')} />
                  {t(val === 'yes' ? 'tests.yes' : 'tests.no')}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="cog-actions cog-actions-big">
          <Button type="submit" variant="primary" className="cog-btn cog-btn-big" disabled={!complete}>{t('tests.continue')}</Button>
        </div>
      </form>
    </Panel>
  );
}

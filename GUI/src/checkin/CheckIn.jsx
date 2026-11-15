import React, { useId, useState } from 'react';
import { Button, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { Pager } from '../home/DataDialog.jsx';
import './checkin.css';

/** Check-in field -> id of the reading in thresholdLogic.initialBiometrics. */
export const FIELD_TO_METRIC = {
  systolic: 'sbp',
  diastolic: 'dbp',
  hr: 'hr',
  glucose: 'glucose',
  temperature: 'temperature',
  sleep: 'sleep',
  mood: 'mood',
};

/** Values the form starts with (demo readings, rated by thresholdLogic like any other). */
export const CHECKIN_DEFAULTS = {
  systolic: 128, diastolic: 82, hr: 68, glucose: 92, temperature: 36.8,
  sleep: 6.2, mood: 4, symptoms: 'NONE',
};

// Labels are i18n keys of the `profile` namespace (the check-in lives on the profile screen).
// One step = one screen without scrolling; `inc` is what the − / + buttons add.
export const CHECKIN_STEPS = [
  { id: 'heart', title: 'profile.checkinStepHeart', icon: 'heart', fields: [
    { key: 'systolic',  label: 'profile.checkinSystolic',  unit: 'mmHg', inc: 1 },
    { key: 'diastolic', label: 'profile.checkinDiastolic', unit: 'mmHg', inc: 1 },
    { key: 'hr',        label: 'profile.checkinHeartRate', unit: 'bpm',  inc: 1 },
  ]},
  { id: 'body', title: 'profile.checkinStepBody', icon: 'glucose', fields: [
    { key: 'glucose',     label: 'profile.checkinGlucose',     unit: 'mg/dL', inc: 1 },
    { key: 'temperature', label: 'profile.checkinTemperature', unit: '°C', inc: 0.1, step: 0.1 },
    { key: 'sleep',       label: 'profile.checkinSleep',       unit: 'h', inc: 0.5, step: 0.1 },
  ]},
  { id: 'mind', title: 'profile.checkinStepMind', icon: 'tests', fields: [] },
];

const SYMPTOMS = [
  ['NONE', 'profile.checkinSymptomNone'],
  ['HEADACHE', 'profile.checkinSymptomHeadache'],
  ['DIZZINESS', 'profile.checkinSymptomDizziness'],
  ['FATIGUE', 'profile.checkinSymptomFatigue'],
  ['OTHER', 'profile.checkinSymptomOther'],
];

/** Status tag and, outside the normal band, the message and action of config/thresholds.json. */
function Assessment({ reading }) {
  if (!reading) return null;
  const flagged = reading.status === 'caution' || reading.status === 'alert';
  return (
    <>
      <StatusTag status={reading.status} className="intake-tag" />
      {flagged && (reading.message || reading.action) ? (
        <p className="intake-guidance" role="note">
          {reading.message}
          {reading.action ? <span className="intake-action"> &gt; {reading.action}</span> : null}
        </p>
      ) : null}
    </>
  );
}

/** One number reading: label, big [ − ] value [ + ] stepper, unit, status and guidance. */
function NumberField({ uid, field, value, reading, onChange }) {
  const t = useT();
  const label = t(field.label);
  const bump = sign => {
    const current = Number(value);
    const base = Number.isFinite(current) && value !== '' ? current : CHECKIN_DEFAULTS[field.key];
    onChange(Math.round((base + sign * field.inc) * 10) / 10);
  };
  return (
    <div className={cx('intake-field', reading?.status && `intake-${reading.status}`)} data-field={field.key} data-status={reading?.status}>
      <label className="intake-label" htmlFor={`${uid}-${field.key}`}>{label}</label>
      <div className="intake-stepper">
        <button type="button" className="intake-step" aria-label={t('profile.checkinLess', { label })} onClick={() => bump(-1)}>−</button>
        <input
          id={`${uid}-${field.key}`}
          className="intake-input"
          type="number"
          inputMode="decimal"
          step={field.step}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        <button type="button" className="intake-step" aria-label={t('profile.checkinMore', { label })} onClick={() => bump(1)}>+</button>
      </div>
      <div className="intake-meta">
        <span className="intake-unit">{field.unit}</span>
        <Assessment reading={reading} />
      </div>
    </div>
  );
}

/**
 * Daily check-in form, paged in three steps so it fits one touch screen:
 * 1 blood pressure + heart rate, 2 glucose + temperature + sleep, 3 mood + symptoms.
 * props: onSubmit(event, values) — form submit (the commit button is on every step);
 *        onUpdate(metricId, value) — every edit of a reading (wire it to thresholdLogic.updateBiometric);
 *        biometrics — current assessed readings (optional; gives every field its status tag and guidance);
 *        values / onValuesChange — optional controlled values (keeps them when the form is closed
 *        and opened again); status — node shown next to the commit button (e.g. the commit confirmation).
 * Field labels are translated; messages and actions come from config/thresholds.json (English).
 */
export default function CheckIn({ onSubmit, onUpdate, biometrics, values, onValuesChange, status = null }) {
  const t = useT();
  const uid = useId();
  const [ownVals, setOwnVals] = useState(CHECKIN_DEFAULTS);
  const vals = values ?? ownVals;
  const setVals = onValuesChange ?? setOwnVals;
  const [step, setStep] = useState(0);
  const current = CHECKIN_STEPS[step];

  const set = (k, v) => {
    setVals(c => ({ ...c, [k]: v }));
    const metricId = FIELD_TO_METRIC[k];
    if (metricId) onUpdate?.(metricId, v);
  };
  const readingOf = key => biometrics?.find(item => item.id === FIELD_TO_METRIC[key]);
  const mood = readingOf('mood');

  return (
    <form className="intake-form" data-step={current.id} onSubmit={event => onSubmit?.(event, vals)}>
      <ol className="intake-steps" aria-label={t('profile.checkinSteps')}>
        {CHECKIN_STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className={cx('intake-steptab', index === step && 'is-current')}
              aria-current={index === step ? 'step' : undefined}
              onClick={() => setStep(index)}
            >
              <NavIcon name={item.icon} className="intake-steptab-icon" />
              <span>{index + 1} · {t(item.title)}</span>
            </button>
          </li>
        ))}
      </ol>

      {current.fields.length ? (
        <div className="intake-grid">
          {current.fields.map(field => (
            <NumberField
              key={field.key}
              uid={uid}
              field={field}
              value={vals[field.key]}
              reading={readingOf(field.key)}
              onChange={value => set(field.key, value)}
            />
          ))}
        </div>
      ) : (
        <div className="intake-grid intake-grid-mind">
          <div className={cx('intake-field', mood?.status && `intake-${mood.status}`)} data-field="mood" data-status={mood?.status}>
            <span className="intake-label" id={`${uid}-mood`}>{t('profile.checkinMood')}</span>
            <div className="intake-choices intake-mood" role="group" aria-labelledby={`${uid}-mood`}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  className={cx('intake-choice', vals.mood === n && 'is-on')}
                  aria-pressed={vals.mood === n}
                  onClick={() => set('mood', n)}
                >{n}</button>
              ))}
            </div>
            <div className="intake-meta">
              <span className="intake-unit">{t('profile.checkinMoodHint')}</span>
              <Assessment reading={mood} />
            </div>
          </div>
          <div className="intake-field" data-field="symptoms">
            <span className="intake-label" id={`${uid}-symptoms`}>{t('profile.checkinSymptoms')}</span>
            <div className="intake-choices intake-symptoms" role="group" aria-labelledby={`${uid}-symptoms`}>
              {SYMPTOMS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cx('intake-choice', vals.symptoms === value && 'is-on')}
                  aria-pressed={vals.symptoms === value}
                  onClick={() => set('symptoms', value)}
                >{t(label)}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="intake-footer">
        <Pager page={step} pages={CHECKIN_STEPS.length} onPage={setStep} />
        <div className="intake-state">{status}</div>
        <Button type="submit" variant="primary" className="intake-commit">{t('profile.checkinCommit')}</Button>
      </div>
    </form>
  );
}

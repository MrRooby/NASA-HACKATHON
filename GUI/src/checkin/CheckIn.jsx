import React, { useId, useState } from 'react';
import { Button, StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
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

// Labels are i18n keys of the `profile` namespace (the check-in lives on the profile screen).
const SECTIONS = [
  { id: 'cardio', title: 'profile.checkinSectionVitals', tag: 'profile.checkinTagDevice', items: [
    { key: 'systolic',  label: 'profile.checkinSystolic',  unit: 'mmHg', type: 'number' },
    { key: 'diastolic', label: 'profile.checkinDiastolic', unit: 'mmHg', type: 'number' },
    { key: 'hr',        label: 'profile.checkinHeartRate', unit: 'bpm',  type: 'number' },
    { key: 'glucose', label: 'profile.checkinGlucose', unit: 'mg/dL', type: 'number' },
    { key: 'temperature', label: 'profile.checkinTemperature', unit: '°C', type: 'number', step: 0.1 },
  ]},
  { id: 'recovery', title: 'profile.checkinSectionRecovery', tag: 'profile.checkinTagSelf', items: [
    { key: 'sleep', label: 'profile.checkinSleep', unit: 'h', type: 'number', step: 0.1 },
  ]},
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
      <StatusTag status={reading.status} />
      {flagged && (reading.message || reading.action) ? (
        <p className="intake-guidance" role="note">
          {reading.message}
          {reading.action ? <span className="intake-action"> &gt; {reading.action}</span> : null}
        </p>
      ) : null}
    </>
  );
}

/**
 * Daily check-in form (logic of the first GUI, restyled to the terminal kit).
 * props: onSubmit(event, values) — form submit; onUpdate(metricId, value) — every edit of a
 *        reading (wire it to thresholdLogic.updateBiometric); biometrics — current assessed
 *        readings (optional; gives every field its status tag and guidance); sol — shown in the head.
 * Field labels are translated; messages and actions come from config/thresholds.json (English).
 */
export default function CheckIn({ onSubmit, onUpdate, biometrics, sol = null }) {
  const t = useT();
  const uid = useId();
  const [vals, setVals] = useState({
    systolic: 128, diastolic: 82, hr: 68, glucose: 92, temperature: 36.8,
    sleep: 6.2, mood: 4, symptoms: 'NONE'
  });
  const set = (k, v) => {
    setVals(c => ({ ...c, [k]: v }));
    const metricId = FIELD_TO_METRIC[k];
    if (metricId) onUpdate?.(metricId, v);
  };
  const readingOf = key => biometrics?.find(item => item.id === FIELD_TO_METRIC[key]);
  const fieldClass = key => {
    const status = readingOf(key)?.status;
    return `intake-field${status ? ` intake-${status}` : ''}`;
  };

  return (
    <form className="intake-form" onSubmit={event => onSubmit?.(event, vals)}>
      <p className="intake-head label">
        {t('profile.checkinHead')} · {sol != null ? t('common.solN', { n: sol }) : t('common.solUnknown')} · {t('profile.checkinEstimate')}
      </p>

      {SECTIONS.map(section => (
        <section className="intake-section" key={section.id}>
          <header className="intake-section-head">
            <h3>{t(section.title)}</h3>
            <span className="label">{t(section.tag)}</span>
          </header>
          <div className="intake-grid">
            {section.items.map(f => (
              <div className={fieldClass(f.key)} data-field={f.key} data-status={readingOf(f.key)?.status} key={f.key}>
                <label className="intake-label" htmlFor={`${uid}-${f.key}`}>{t(f.label)}</label>
                <div className="intake-input-row">
                  <input
                    id={`${uid}-${f.key}`}
                    className="intake-input"
                    type={f.type}
                    step={f.step}
                    value={vals[f.key]}
                    onChange={e => set(f.key, e.target.value)}
                  />
                  <span className="intake-unit">{f.unit}</span>
                  <Assessment reading={readingOf(f.key)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="intake-section">
        <header className="intake-section-head">
          <h3>{t('profile.checkinSectionPsych')}</h3>
          <span className="label">{t('profile.checkinTagSelf')}</span>
        </header>
        <div className="intake-grid">
          <div className={fieldClass('mood')} data-field="mood" data-status={readingOf('mood')?.status}>
            <span className="intake-label" id={`${uid}-mood`}>{t('profile.checkinMood')}</span>
            <div className="intake-input-row">
              <div className="mood-row" role="group" aria-labelledby={`${uid}-mood`}>
                {[1,2,3,4,5].map(n => (
                  <Button
                    key={n}
                    className={`mood-btn${vals.mood === n ? ' sel' : ''}`}
                    active={vals.mood === n}
                    aria-pressed={vals.mood === n}
                    onClick={() => set('mood', n)}
                  >{n}</Button>
                ))}
              </div>
              <Assessment reading={readingOf('mood')} />
            </div>
            <span className="intake-hint">{t('profile.checkinMoodHint')}</span>
          </div>
          <div className="intake-field" data-field="symptoms">
            <label className="intake-label" htmlFor={`${uid}-symptoms`}>{t('profile.checkinSymptoms')}</label>
            <select
              id={`${uid}-symptoms`}
              className="intake-select"
              value={vals.symptoms}
              onChange={e => set('symptoms', e.target.value)}
            >
              {SYMPTOMS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="intake-footer">
        <span className="intake-autosave">{t('profile.checkinNotStored')}</span>
        <div className="intake-actions">
          <Button type="submit" variant="primary">{t('profile.checkinCommit')}</Button>
        </div>
      </div>
    </form>
  );
}

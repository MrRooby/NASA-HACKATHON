import React, { useEffect, useMemo, useRef } from 'react';
import { StatusTag } from '../components/index.js';
import CrewPortrait from '../crew/CrewPortrait.jsx';
import { useI18n } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { getCrewWellbeing, valueStatus } from './crewWellbeing.js';

/**
 * Day popup sub-view: how each of the 10 crew members was doing on that day.
 * Two columns of five rows, no scrolling: photo, full name, then one status tag with mood / sleep / stress
 * (a value outside its limit is coloured, the word is only in the tag) and a one-line note.
 * props: date (Date), onBack.
 */
export default function CrewWellbeingView({ date, onBack }) {
  const { t, lang } = useI18n();
  const backRef = useRef(null);
  const crew = useMemo(() => getCrewWellbeing(date), [date]);
  const flagged = crew.filter(person => person.status !== 'ok').length;
  const decimal = useMemo(() => new Intl.NumberFormat(lang === 'pl' ? 'pl-PL' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [lang]);

  useEffect(() => { backRef.current?.focus(); }, []);

  const value = (person, metric, label, text) => (
    <span key={metric} className="cal-wb-value" data-metric={metric} data-tone={valueStatus(metric, person[metric])}>
      <span className="cal-wb-value-label">{label}</span>
      <strong className="cal-wb-value-num">{text}</strong>
    </span>
  );

  return (
    <div className="cal-wb">
      <div className="cal-wb-bar">
        <button ref={backRef} type="button" className="cal-btn cal-wb-back" onClick={onBack}>
          <NavIcon name="prev" className="cal-btn-glyph" />
          <span>{t('calendar.back')}</span>
        </button>
        <h3 className="cal-wb-title">{t('calendar.evWellbeing')}</h3>
        <span className="cal-wb-summary" data-flagged={flagged}>
          {flagged ? t('calendar.needAttention', { n: flagged, total: crew.length }) : t('calendar.allWithinLimits')}
        </span>
      </div>
      <ul className="cal-wb-list" aria-label={t('calendar.wellbeingList')}>
        {crew.map(person => (
          <li key={person.code} className="cal-wb-row" data-code={person.code} data-status={person.status}>
            <CrewPortrait code={person.code} title={person.name} className="cal-wb-photo" />
            <span className="cal-wb-main">
              <span className="cal-wb-name">{person.name}</span>
              <span className="cal-wb-values">
                <StatusTag status={person.status} className="cal-wb-tag" />
                {value(person, 'mood', t('calendar.wbMood'), `${person.mood}/5`)}
                {value(person, 'sleep', t('calendar.wbSleep'), t('calendar.wbHours', { value: decimal.format(person.sleep) }))}
                {value(person, 'stress', t('calendar.wbStress'), `${person.stress}/5`)}
              </span>
              <span className="cal-wb-note">{t(`calendar.${person.noteKey}`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

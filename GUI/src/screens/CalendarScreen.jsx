import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cx } from '../components/index.js';
import { getCalendar } from '../api.js';
import { useI18n } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import DataDialog, { Pager } from '../home/DataDialog.jsx';
import {
  addDays, aggregateStatus, dayLabel, endOfMonth, endOfWeek, formatMonth, formatRange, isoDate,
  monthGrid, sameDay, shiftMonth, startOfMonth, startOfWeek,
} from './calendar.js';
import { getCalendarData } from './calendarData.js';
import './calendar.css';

const TODAY = new Date();
const WEEK_EVENT_LIMIT = 3;
const DIALOG_PAGE_SIZE = 5;
const KINDS = ['base', 'crew', 'mission'];

const localeOf = lang => (lang === 'pl' ? 'pl-PL' : 'en-US');
const percentOrScore = value => `${value}${value <= 5 ? ' / 5' : '%'}`;

function eventsOn(events, day) {
  const key = isoDate(day);
  return events.filter(event => event.date === key);
}

/** One event line: coloured bar by kind + short title. */
function EventLine({ event }) {
  return <li className="cal-event" data-kind={event.kind}>{event.title}</li>;
}

function WeekView({ date, events, status, onSelect }) {
  const { t, lang } = useI18n();
  const start = startOfWeek(date);
  return (
    <div className="cal-week" role="grid" aria-label={t('calendar.weekView')}>
      {Array.from({ length: 7 }, (_, index) => {
        const day = addDays(start, index);
        const dayEvents = eventsOn(events, day);
        const shown = dayEvents.slice(0, WEEK_EVENT_LIMIT);
        const hidden = dayEvents.length - shown.length;
        return (
          <div role="gridcell" className="cal-week-cell" key={isoDate(day)} data-date={isoDate(day)}>
            <button
              type="button"
              className={cx('cal-day', sameDay(day, TODAY) && 'is-today')}
              aria-label={t('calendar.selectDay', { date: isoDate(day) })}
              onClick={() => onSelect(day)}
            >
              <span className="cal-day-head">
                <span className="cal-day-name">{dayLabel(day, localeOf(lang))}</span>
                <span className="cal-day-num">{day.getDate()}</span>
              </span>
              {dayEvents.length ? (
                <ul className="cal-events">
                  {shown.map(event => <EventLine key={event.id} event={event} />)}
                  {hidden > 0 ? <li className="cal-more">{t('calendar.more', { count: hidden })}</li> : null}
                </ul>
              ) : <span className="cal-empty">—</span>}
              <DayStats record={status.find(record => record.date === isoDate(day))} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Bottom of a week column: the day's base and crew numbers. */
function DayStats({ record }) {
  const { t } = useI18n();
  const row = (label, value) => (
    <span className="cal-day-stat">
      <span className="cal-day-stat-label">{label}</span>
      <span className="cal-day-stat-value">{value == null ? '—' : percentOrScore(value)}</span>
    </span>
  );
  return (
    <span className="cal-day-stats">
      {row(t('calendar.kind_base'), record?.baseStatus)}
      {row(t('calendar.kind_crew'), record?.crewWellbeing)}
    </span>
  );
}

function MonthView({ date, events, onSelect }) {
  const { t, lang } = useI18n();
  const month = startOfMonth(date);
  const days = monthGrid(month);
  const weekStart = startOfWeek(month);
  return (
    <div className="cal-month" role="grid" aria-label={t('calendar.monthView')}>
      <div className="cal-weekdays" role="row">
        {Array.from({ length: 7 }, (_, index) => (
          <span role="columnheader" key={index}>{dayLabel(addDays(weekStart, index), localeOf(lang))}</span>
        ))}
      </div>
      <div className="cal-month-grid" style={{ '--cal-weeks': Math.ceil(days.length / 7) }}>
        {days.map(day => {
          const dayEvents = eventsOn(events, day);
          const kinds = KINDS.filter(kind => dayEvents.some(event => event.kind === kind));
          return (
            <button
              type="button"
              key={isoDate(day)}
              className={cx('cal-mday', sameDay(day, TODAY) && 'is-today', day.getMonth() !== month.getMonth() && 'is-outside')}
              aria-label={t('calendar.selectDay', { date: isoDate(day) })}
              onClick={() => onSelect(day)}
            >
              <span className="cal-mday-num">{day.getDate()}</span>
              {dayEvents.length ? (
                <span className="cal-mday-info">
                  <span className="cal-mday-dots" aria-hidden="true">
                    {kinds.map(kind => <span key={kind} className="cal-dot" data-kind={kind} />)}
                  </span>
                  <span className="cal-mday-count">{dayEvents.length}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayDialog({ date, events, status, onClose }) {
  const { t, lang } = useI18n();
  const dayEvents = eventsOn(events, date);
  const dayStatus = status.find(record => record.date === isoDate(date));
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(dayEvents.length / DIALOG_PAGE_SIZE));
  const slice = dayEvents.slice(page * DIALOG_PAGE_SIZE, (page + 1) * DIALOG_PAGE_SIZE);
  const title = date.toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <DataDialog title={title} icon="calendar" onClose={onClose}>
      <div className="cal-dlg">
        <div className="cal-dlg-stats">
          <div className="cal-stat">
            <span className="cal-stat-label">{t('calendar.baseStatus')}</span>
            <strong className="cal-stat-value">{dayStatus?.baseStatus == null ? t('calendar.noData') : percentOrScore(dayStatus.baseStatus)}</strong>
          </div>
          <div className="cal-stat">
            <span className="cal-stat-label">{t('calendar.crewWellbeing')}</span>
            <strong className="cal-stat-value">{dayStatus?.crewWellbeing == null ? t('calendar.noData') : percentOrScore(dayStatus.crewWellbeing)}</strong>
          </div>
        </div>
        {dayEvents.length ? (
          <ul className="cal-dlg-events" aria-label={t('calendar.dayEvents')}>
            {slice.map(event => (
              <li key={event.id} className="cal-dlg-event" data-kind={event.kind}>
                <span className="cal-dlg-event-title">{event.title}</span>
                <span className="cal-dlg-event-kind">{event.startsAt ? `${event.startsAt} · ` : ''}{t(`calendar.kind_${event.kind}`)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="cal-dlg-empty">{t('calendar.noEvents')}</p>}
        <Pager page={page} pages={pages} onPage={setPage} />
      </div>
    </DataDialog>
  );
}

function StatusDialog({ status, range, isMonth, onClose }) {
  const { t } = useI18n();
  const value = item => {
    if (item.value == null || item.value === 'no_data') return t('calendar.noData');
    return item.kind === 'category' ? item.value.toUpperCase() : percentOrScore(item.value);
  };
  const note = item => (item.state === 'partial' ? t('calendar.partialData') : item.state === 'empty' ? t('calendar.noData') : t('calendar.average'));
  return (
    <DataDialog title={t(isMonth ? 'calendar.monthSummaryTitle' : 'calendar.summaryTitle')} icon="gauge" onClose={onClose}>
      <div className="cal-dlg">
        <p className="cal-dlg-range">{range}</p>
        <div className="cal-dlg-stats cal-dlg-stats-big">
          {[['base', 'calendar.baseStatus'], ['crew', 'calendar.crewWellbeing']].map(([key, label]) => (
            <div className="cal-stat" key={key} data-status-state={status[key].state}>
              <span className="cal-stat-label">{t(label)}</span>
              <strong className="cal-stat-value">{value(status[key])}</strong>
              <span className="cal-stat-note">{note(status[key])}</span>
            </div>
          ))}
        </div>
      </div>
    </DataDialog>
  );
}

export default function CalendarScreen() {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const [view, setView] = useState('week');
  const [anchorDate, setAnchorDate] = useState(() => startOfWeek(TODAY));
  const [detailDate, setDetailDate] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const demoData = useMemo(() => getCalendarData(anchorDate), [anchorDate]);
  const [liveData, setLiveData] = useState(null);
  const closeDay = useCallback(() => setDetailDate(null), []);
  const closeStatus = useCallback(() => setStatusOpen(false), []);

  const isWeek = view === 'week';
  const periodStart = isWeek ? startOfWeek(anchorDate) : startOfMonth(anchorDate);
  const periodEnd = isWeek ? endOfWeek(periodStart) : endOfMonth(periodStart);
  const periodLabel = isWeek ? formatRange(periodStart, periodEnd, locale) : formatMonth(periodStart, locale);
  const grid = isWeek ? null : monthGrid(periodStart);
  const requestStartKey = isoDate(isWeek ? periodStart : grid[0]);
  const requestEndKey = isoDate(isWeek ? periodEnd : grid.at(-1));

  useEffect(() => {
    let active = true;
    getCalendar({ start: requestStartKey, end: requestEndKey })
      .then(result => { if (active) setLiveData(result); })
      .catch(() => { if (active) setLiveData(null); });
    return () => { active = false; };
  }, [requestStartKey, requestEndKey]);

  const data = liveData?.source === 'mother' ? liveData : demoData;
  const status = aggregateStatus(data.status, periodStart, periodEnd);

  const move = amount => setAnchorDate(isWeek ? addDays(anchorDate, amount * 7) : shiftMonth(anchorDate, amount));
  const changeView = next => {
    if (next === view) return;
    setView(next);
    setAnchorDate(next === 'week' ? startOfWeek(anchorDate) : startOfMonth(anchorDate));
  };
  const goToToday = () => setAnchorDate(isWeek ? startOfWeek(TODAY) : startOfMonth(TODAY));

  return (
    <div className="cal-screen">
      <div className="cal-bar">
        <button type="button" className="cal-btn cal-btn-icon" aria-label={t('calendar.previous')} onClick={() => move(-1)}>
          <NavIcon name="prev" />
        </button>
        <h1 className="cal-period" aria-live="polite">{periodLabel}</h1>
        <button type="button" className="cal-btn cal-btn-icon" aria-label={t('calendar.next')} onClick={() => move(1)}>
          <NavIcon name="next" />
        </button>
        <button type="button" className="cal-btn" onClick={goToToday}>
          <NavIcon name="calendar" className="cal-btn-glyph" />
          <span>{t('calendar.today')}</span>
        </button>
        <div className="cal-switch" role="group" aria-label={t('calendar.viewLabel')}>
          {['week', 'month'].map(id => (
            <button key={id} type="button" className={cx('cal-btn', view === id && 'is-active')} aria-pressed={view === id} onClick={() => changeView(id)}>
              {t(`calendar.${id}`)}
            </button>
          ))}
        </div>
        <button type="button" className="cal-btn" data-open="status" onClick={() => setStatusOpen(true)}>
          <NavIcon name="gauge" className="cal-btn-glyph" />
          <span>{t('calendar.statusButton')}</span>
        </button>
      </div>
      {isWeek
        ? <WeekView date={anchorDate} events={data.events} status={data.status} onSelect={setDetailDate} />
        : <MonthView date={anchorDate} events={data.events} onSelect={setDetailDate} />}
      {detailDate ? <DayDialog key={isoDate(detailDate)} date={detailDate} events={data.events} status={data.status} onClose={closeDay} /> : null}
      {statusOpen ? (
        <StatusDialog status={status} range={formatRange(periodStart, periodEnd, locale)} isMonth={!isWeek} onClose={closeStatus} />
      ) : null}
    </div>
  );
}

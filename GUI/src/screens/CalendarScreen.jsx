import React, { useEffect, useMemo, useState } from 'react';
import { Button, Panel, StatusTag, cx } from '../components/index.js';
import { getCalendar } from '../api.js';
import { useI18n } from '../i18n/index.js';
import {
  addDays, aggregateStatus, dayLabel, endOfMonth, endOfWeek, formatMonth, formatRange, isoDate,
  monthGrid, sameDay, shiftMonth, startOfMonth, startOfWeek,
} from './calendar.js';
import { getCalendarData } from './calendarData.js';
import './calendar.css';

const TODAY = new Date();

function StatusSummary({ status, weekStart, weekEnd, isMonth }) {
  const { t, lang } = useI18n();
  const item = (label, value, key) => (
    <div className="calendar-summary-item" data-status-state={value.state}>
      <span className="calendar-summary-label">{label}</span>
      <strong>{value.kind === 'category'
        ? <StatusTag status={value.value} />
        : value.value == null ? t('calendar.noData') : `${value.value}${key === 'crew' ? (value.value <= 5 ? ' / 5' : '%') : '%'}`}</strong>
      <span className="calendar-summary-meta">
        {value.state === 'partial' ? t('calendar.partialData') : value.state === 'empty' || value.value === 'no_data' ? t('calendar.noData') : t(`calendar.status_${key}`)}
      </span>
    </div>
  );
  return (
    <Panel className="calendar-summary" title={t(isMonth ? 'calendar.monthSummaryTitle' : 'calendar.summaryTitle')} meta={formatRange(weekStart, weekEnd, lang === 'pl' ? 'pl-PL' : 'en-US')}>
      <p className="calendar-summary-period">{t('calendar.summaryFor', { range: formatRange(weekStart, weekEnd, lang === 'pl' ? 'pl-PL' : 'en-US') })}</p>
      <div className="calendar-summary-grid">
        {item(t('calendar.baseStatus'), status.base, 'base')}
        {item(t('calendar.crewWellbeing'), status.crew, 'crew')}
      </div>
    </Panel>
  );
}

function EventList({ date, events, limit = 3 }) {
  const { t } = useI18n();
  const dayEvents = events.filter(event => event.date === isoDate(date));
  if (!dayEvents.length) return <span className="calendar-empty">{t('calendar.noEvents')}</span>;
  if (dayEvents.length > limit) {
    return (
      <ul className="calendar-events" aria-label={t('calendar.eventsFor', { date: isoDate(date) })}>
        <li className="calendar-more">{t('calendar.moreEvents', { count: dayEvents.length })}</li>
      </ul>
    );
  }
  return (
    <ul className="calendar-events" aria-label={t('calendar.eventsFor', { date: isoDate(date) })}>
      {dayEvents.map(event => <li key={event.id} data-kind={event.kind}>{event.title}</li>)}
    </ul>
  );
}

function WeekView({ date, events, onSelect }) {
  const { t, lang } = useI18n();
  const start = startOfWeek(date);
  return (
    <div className="calendar-week-grid" role="grid" aria-label={t('calendar.weekView')}>
      {Array.from({ length: 7 }, (_, index) => {
        const day = addDays(start, index);
        const today = sameDay(day, TODAY);
        return (
          <div className={cx('calendar-day', today && 'is-today')} key={isoDate(day)} role="gridcell" data-date={isoDate(day)}>
            <button type="button" className="calendar-day-button" onClick={() => onSelect(day)} aria-label={t('calendar.selectDay', { date: isoDate(day) })}>
              <div className="calendar-day-head">
                <span>{dayLabel(day, lang === 'pl' ? 'pl-PL' : 'en-US')}</span>
                <strong>{day.getDate()}</strong>
              </div>
              <EventList date={day} events={events} limit={4} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ date, events, selectedDate, onSelect }) {
  const { t, lang } = useI18n();
  const month = startOfMonth(date);
  const days = monthGrid(month);
  const weekCount = Math.ceil(days.length / 7);
  const weekdayStart = month.getDay() === 0 ? 6 : month.getDay() - 1;
  return (
    <div className="calendar-month" role="grid" aria-label={t('calendar.monthView')}>
      <div className="calendar-weekdays" role="row">
        {Array.from({ length: 7 }, (_, index) => (
          <span role="columnheader" key={index}>
            {dayLabel(addDays(startOfWeek(month), (weekdayStart + index) % 7), lang === 'pl' ? 'pl-PL' : 'en-US')}
          </span>
        ))}
      </div>
      <div className="calendar-month-grid" style={{ '--calendar-weeks': weekCount }}>
        {days.map(day => {
          const selected = sameDay(day, selectedDate);
          return (
            <button
              type="button"
              className={cx('calendar-month-day', sameDay(day, TODAY) && 'is-today', selected && 'is-selected')}
              key={isoDate(day)}
              aria-label={t('calendar.selectDay', { date: isoDate(day) })}
              aria-pressed={selected}
              onClick={() => onSelect(day)}
            >
              <span className="calendar-month-number">{day.getDate()}</span>
              <EventList date={day} events={events} limit={2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayDetails({ date, events, status, onClose }) {
  const { t, lang } = useI18n();
  const dayEvents = events.filter(event => event.date === isoDate(date));
  const dayStatus = status.find(record => record.date === isoDate(date));
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US';
  const [eventOffset, setEventOffset] = useState(0);
  const pageSize = 5;
  const maxOffset = Math.max(0, dayEvents.length - pageSize);
  const visibleEvents = dayEvents.slice(eventOffset, eventOffset + pageSize);
  return (
    <div className="calendar-dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-day-details-title">
        <div className="calendar-dialog-header">
          <div>
            <span className="calendar-dialog-kicker">{t('calendar.dayDetails')}</span>
            <h2 id="calendar-day-details-title">{date.toLocaleDateString(locale, { dateStyle: 'full' })}</h2>
          </div>
          <Button className="calendar-dialog-close" aria-label={t('calendar.closeDetails')} onClick={onClose}>X</Button>
        </div>
        <div className="calendar-dialog-status">
          <div><span>{t('calendar.baseStatus')}</span><strong>{dayStatus?.baseStatus ?? t('calendar.noData')}</strong></div>
          <div><span>{t('calendar.crewWellbeing')}</span><strong>{dayStatus?.crewWellbeing == null ? t('calendar.noData') : `${dayStatus.crewWellbeing}${dayStatus.crewWellbeing <= 5 ? ' / 5' : '%'}`}</strong></div>
        </div>
        <h3>{t('calendar.dayEvents')}</h3>
        {dayEvents.length ? (
          <div className="calendar-dialog-event-browser">
            <Button className="calendar-dialog-scroll" aria-label={t('calendar.scrollUp')} disabled={eventOffset === 0} onClick={() => setEventOffset(offset => Math.max(0, offset - 1))}>▲</Button>
            <ul className="calendar-dialog-events">
              {visibleEvents.map(event => <li key={event.id}><strong>{event.title}</strong><span>{event.startsAt || event.kind}</span></li>)}
            </ul>
            <Button className="calendar-dialog-scroll" aria-label={t('calendar.scrollDown')} disabled={eventOffset === maxOffset} onClick={() => setEventOffset(offset => Math.min(maxOffset, offset + 1))}>▼</Button>
          </div>
        ) : <p className="calendar-empty">{t('calendar.noEvents')}</p>}
      </section>
    </div>
  );
}

export default function CalendarScreen() {
  const { t, lang } = useI18n();
  const [view, setView] = useState('week');
  const [anchorDate, setAnchorDate] = useState(() => startOfWeek(TODAY));
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [detailDate, setDetailDate] = useState(null);
  const demoData = useMemo(() => getCalendarData(anchorDate), [anchorDate]);
  const [liveData, setLiveData] = useState(null);
  const visibleStart = view === 'week' ? startOfWeek(anchorDate) : startOfMonth(anchorDate);
  const summaryStart = view === 'week' ? visibleStart : visibleStart;
  const summaryEnd = view === 'week' ? endOfWeek(summaryStart) : endOfMonth(summaryStart);
  const periodLabel = view === 'week'
    ? formatRange(visibleStart, endOfWeek(visibleStart), lang === 'pl' ? 'pl-PL' : 'en-US')
    : formatMonth(visibleStart, lang === 'pl' ? 'pl-PL' : 'en-US');

  const grid = view === 'week' ? null : monthGrid(visibleStart);
  const requestStart = view === 'week' ? visibleStart : grid[0];
  const requestEnd = view === 'week' ? endOfWeek(visibleStart) : grid.at(-1);
  const requestStartKey = isoDate(requestStart);
  const requestEndKey = isoDate(requestEnd);
  useEffect(() => {
    let active = true;
    getCalendar({ start: requestStartKey, end: requestEndKey })
      .then(result => { if (active) setLiveData(result); })
      .catch(() => { if (active) setLiveData(null); });
    return () => { active = false; };
  }, [requestStartKey, requestEndKey]);
  const data = liveData?.source === 'mother' ? liveData : demoData;
  const status = aggregateStatus(data.status, summaryStart, summaryEnd);

  const move = amount => {
    const next = view === 'week' ? addDays(anchorDate, amount * 7) : shiftMonth(anchorDate, amount);
    setAnchorDate(next);
    setSelectedDate(next);
  };
  const changeView = nextView => {
    setView(nextView);
    setAnchorDate(nextView === 'week' ? startOfWeek(selectedDate) : startOfMonth(anchorDate));
  };
  const goToToday = () => {
    setSelectedDate(TODAY);
    setAnchorDate(view === 'month' ? startOfMonth(TODAY) : startOfWeek(TODAY));
  };
  const selectDay = day => {
    setSelectedDate(day);
    setAnchorDate(view === 'month' ? startOfMonth(day) : day);
    setDetailDate(day);
  };

  return (
    <div className="calendar-screen">
      <Panel className="calendar-panel" title={t('calendar.title')}>
        <div className="calendar-toolbar">
          <Button className="calendar-nav-button" aria-label={t('calendar.previous')} onClick={() => move(-1)}>{t('calendar.previous')}</Button>
          <h1 className="calendar-period" aria-live="polite">{periodLabel}</h1>
          <Button className="calendar-nav-button" aria-label={t('calendar.next')} onClick={() => move(1)}>{t('calendar.next')}</Button>
        </div>
        <div className="calendar-top-controls">
          <Button className="calendar-today-button" onClick={goToToday}>{t('calendar.today')}</Button>
          <div className="calendar-view-switch" role="group" aria-label={t('calendar.viewLabel')}>
          <Button active={view === 'week'} aria-pressed={view === 'week'} onClick={() => changeView('week')}>{t('calendar.week')}</Button>
          <Button active={view === 'month'} aria-pressed={view === 'month'} onClick={() => changeView('month')}>{t('calendar.month')}</Button>
          </div>
        </div>
        {view === 'week'
          ? <WeekView date={anchorDate} events={data.events} onSelect={selectDay} />
          : <MonthView date={anchorDate} events={data.events} selectedDate={selectedDate} onSelect={selectDay} />}
      </Panel>
      <StatusSummary status={status} weekStart={summaryStart} weekEnd={summaryEnd} isMonth={view === 'month'} />
      {detailDate && <DayDetails date={detailDate} events={data.events} status={data.status} onClose={() => setDetailDate(null)} />}
    </div>
  );
}

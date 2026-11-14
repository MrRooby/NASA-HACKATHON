import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelIcon } from '../pixel/index.js';
import { StatusMark } from '../ui/index.js';
import { getProfile } from '../data/crewProfiles.js';

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time className="tb-clock tb-opt" dateTime={now.toISOString()}>
      <span className="num">{now.toISOString().slice(11, 16)}</span> <span className="tb-unit">UTC</span>
    </time>
  );
}

const LINK = {
  online: { key: 'common.linkLive', tone: 'ok' },
  connecting: { key: 'common.linkConnecting', tone: 'caution' },
  offline: { key: 'common.linkDemo', tone: 'caution' },
};

/** CREW ▸ NAME ▸ ORGAN; every crumb but the last is a button. */
function Breadcrumb({ route, navigate }) {
  const t = useT();
  const crumbs = [];
  if (route.screen === 'base') {
    crumbs.push({ label: t('common.navBase'), to: { screen: 'base', room: null } });
    if (route.room) crumbs.push({ label: String(route.room).replace(/_/g, ' ').toUpperCase(), to: null });
  } else {
    crumbs.push({ label: t('common.navCrew'), to: { screen: 'crew' } });
    if (route.code) {
      const profile = getProfile(route.code);
      const name = profile ? profile.name.split(' ')[0] : route.code;
      crumbs.push({ label: name.toUpperCase(), title: profile?.name, to: { screen: 'person', code: route.code, organ: null } });
      if (route.organ) crumbs.push({ label: t(`crew.organShort_${route.organ}`), to: null });
    }
  }
  return (
    <nav className="tb-crumbs" aria-label={t('common.breadcrumb')}>
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <React.Fragment key={index}>
            <span className="tb-sep" aria-hidden="true">▸</span>
            {last
              ? <span className="tb-crumb is-current" aria-current="page" title={crumb.title}>{crumb.label}</span>
              : <button type="button" className="tb-crumb" title={crumb.title} onClick={() => navigate(crumb.to)}>{crumb.label}</button>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * The one-row status bar (56 px). Secondary items (.tb-opt) drop out on narrow screens.
 * props: mother, route, navigate, back, sol: { value, latest, canPrev, canNext, isLatest, prev, next, toLatest },
 *        alerts: { alert, caution }, habitatStatus, tasksOpen, tasksCount, onTasks, onSettings
 */
export default function TopBar({ mother, route, navigate, back, sol, alerts, habitatStatus, tasksOpen, tasksCount, onTasks, onSettings }) {
  const t = useT();
  const link = LINK[mother?.mode] || LINK.connecting;
  const hasAlerts = (alerts?.alert || 0) + (alerts?.caution || 0) > 0;

  return (
    <header className="topbar" data-testid="topbar">
      {route.screen !== 'crew' && (
        <button type="button" className="tb-icon tb-back" onClick={back} aria-label={t('common.back')} title={t('common.back')}>
          <PixelIcon name="back" size={24} />
        </button>
      )}
      <button type="button" className="tb-brand" onClick={() => navigate({ screen: 'crew' })} title={t('common.mission')}>
        {t('common.appName')}
      </button>
      <Breadcrumb route={route} navigate={navigate} />

      <nav className="tb-nav" aria-label={t('common.navMain')}>
        {[['crew', 'crew'], ['base', 'base']].map(([id, icon]) => {
          const current = route.screen === id || (id === 'crew' && route.screen === 'person');
          return (
            <button
              key={id}
              type="button"
              className="tb-navbtn"
              data-nav={id}
              aria-current={current ? 'page' : undefined}
              onClick={() => navigate({ screen: id })}
              title={t(id === 'crew' ? 'common.navCrew' : 'common.navBase')}
            >
              <PixelIcon name={icon} size={24} />
              <span className="tb-navlabel">{t(id === 'crew' ? 'common.navCrew' : 'common.navBase')}</span>
            </button>
          );
        })}
      </nav>

      <span className="tb-spacer" />

      <button
        type="button"
        className={`tb-alarms${hasAlerts ? '' : ' is-quiet'}`}
        onClick={onTasks}
        aria-label={t('common.alarmsSummary', { alert: alerts?.alert || 0, caution: alerts?.caution || 0 })}
        data-testid="tb-alarms"
      >
        <span className={`tb-count tb-count-alert${alerts?.alert ? ' is-on' : ''}`}><span aria-hidden="true">◆</span>{alerts?.alert || 0}</span>
        <span className={`tb-count tb-count-caution${alerts?.caution ? ' is-on' : ''}`}><span aria-hidden="true">▲</span>{alerts?.caution || 0}</span>
      </button>

      <button
        type="button"
        className="tb-habitat tb-opt"
        onClick={() => navigate({ screen: 'base' })}
        title={t('common.habitatStatus')}
        aria-label={`${t('common.habitatStatus')}: ${t(`common.status_${habitatStatus || 'no_data'}`)}`}
      >
        <PixelIcon name="base" size={22} />
        <StatusMark status={habitatStatus || 'no_data'} label={false} />
      </button>

      <div className="tb-sol" role="group" aria-label={t('common.sol')}>
        <button type="button" className="tb-step tb-opt2" onClick={sol.prev} disabled={!sol.canPrev} aria-label={t('common.prevSol')}>‹</button>
        <span className="tb-solvalue" data-testid="topbar-sol">
          <span className="tb-unit">{t('common.sol')}</span> <span className="num">{sol.value ?? '---'}</span>
        </span>
        <button type="button" className="tb-step tb-opt2" onClick={sol.next} disabled={!sol.canNext} aria-label={t('common.nextSol')}>›</button>
        {!sol.isLatest && (
          <button type="button" className="tb-latest tb-opt2" onClick={sol.toLatest}>{t('common.latest')}</button>
        )}
      </div>

      <UtcClock />

      <span className={`tb-link tb-link-${link.tone}`} data-mode={mother?.mode} title={mother?.error?.message || undefined}>
        <span className="tb-dot" aria-hidden="true" />
        <span className="tb-linkword">{t(link.key)}</span>
      </span>

      <button
        type="button"
        className={`tb-tasks${tasksOpen ? ' is-open' : ''}`}
        onClick={onTasks}
        aria-expanded={tasksOpen}
        aria-controls="side-panel"
        data-testid="tb-tasks"
        aria-label={t('common.tasksN', { n: tasksCount })}
      >
        <PixelIcon name="check" size={18} />
        <span className="tb-tasks-word">{t('common.tasks')}</span>
        <span className="num">{tasksCount}</span>
      </button>

      <button type="button" className="tb-icon" onClick={onSettings} aria-label={t('common.navSettings')} title={t('common.navSettings')} data-testid="tb-settings">
        <PixelIcon name="gear" size={24} />
      </button>
    </header>
  );
}

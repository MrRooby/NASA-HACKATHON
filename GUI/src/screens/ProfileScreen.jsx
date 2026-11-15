import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Panel, StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { useHabitat } from '../habitat/useHabitat.js';
import { buildNotifications } from '../notifications/buildNotifications.js';
import NotificationList from '../notifications/NotificationList.jsx';
import CheckIn, { CHECKIN_DEFAULTS } from '../checkin/CheckIn.jsx';
import { createBiometrics, updateBiometric } from '../checkin/thresholdLogic.js';
import DataDialog, { Pager, popupPageSize } from '../home/DataDialog.jsx';
import { setPendingFocus } from '../home/focus.js';
import { useCrewReport } from '../home/useCrewReport.js';
import { findLocation } from '../crew/crewStatus.js';
import PersonalData, { CrewHeader } from '../profile/CrewFilePanel.jsx';
import NotesPanel from '../profile/NotesPanel.jsx';
import PsychTestsPanel from '../profile/PsychTestsPanel.jsx';
import useFitRows from '../profile/useFitRows.js';
import SurgeonReportPanel from '../profile/SurgeonReportPanel.jsx';
import './home.css'; // DataDialog and Pager styles
import './profile.css';

const NOTIFS_PER_PAGE = popupPageSize(4, 3);

/**
 * Notifications that concern one person: their organs and wearables, plus habitat zones and
 * events in the zone they are in or live in (the whole-base list is on the home screen).
 */
export function personalNotifications(items, zones = []) {
  const mine = new Set(zones.filter(Boolean));
  return (items || []).filter(item => {
    if (item.source === 'organ' || item.source === 'device') return true;
    const target = item.target || {};
    return [target.zone, ...(target.zones || [])].some(zone => zone && mine.has(zone));
  });
}

/** NOTIFICATIONS popup body: the personal list, paged instead of scrolled. */
function NotificationsBody({ items, onOpen }) {
  const t = useT();
  const [page, setPage] = useState(0);
  const fit = useFitRows(NOTIFS_PER_PAGE, '.notif');
  const pages = Math.max(1, Math.ceil(items.length / fit.count));
  const safe = Math.min(page, pages - 1);
  return (
    <div className="pf-notifs">
      <div ref={fit.ref} className="pf-notif-fit">
        <NotificationList
          className="pf-notif-list"
          items={items.slice(safe * fit.count, safe * fit.count + fit.count)}
          emptyText={t('profile.notificationsEmpty')}
          onOpen={onOpen}
        />
      </div>
      <Pager page={safe} pages={pages} onPage={setPage} />
    </div>
  );
}

/** One big action tile of the profile screen. */
function Tile({ id, icon, label, info, onOpen }) {
  return (
    <button type="button" className="pf-tile" data-open={id} onClick={onOpen}>
      <NavIcon name={icon} className="pf-tile-icon" />
      <span className="pf-tile-label">{label}</span>
      {info != null ? <span className="pf-tile-info">{info}</span> : null}
    </button>
  );
}

/**
 * PROFILE screen, one screen high: a header (photo, name, role, age · height · weight,
 * location, health status) and big tiles that open popups (DataDialog) or, for the daily
 * check-in, a sub-view with ‹ BACK. On the logged-in person's own profile also the check-in
 * and the flight-surgeon report; another person's profile is read-only.
 * props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }
 */
export default function ProfileScreen({ mother, session, viewedCode, setViewedCode, navigate, profile, route = null }) {
  const t = useT();
  const isOwn = viewedCode === session;
  // Same sources as the home screen: the live report of viewedCode, or the built-in demo
  // report while MOTHER is unreachable; the habitat of the same sol.
  const source = useCrewReport(mother, viewedCode);
  const { report } = source;
  const habitatSol = source.kind === 'sol' ? (source.state === 'live' ? mother?.period?.sol ?? source.asOf : source.asOf) : null;
  const { data: habitat } = useHabitat({ sol: habitatSol ?? null });
  const sol = source.demo ? null : report?.as_of?.sol ?? null; // never stamp real entries with the demo sol

  const notifications = useMemo(() => {
    if (!profile) return [];
    const location = findLocation(habitat, profile.crewCode);
    return personalNotifications(buildNotifications({ report, habitat }), [profile.homeZone, location?.code]);
  }, [report, habitat, profile]);

  // which popup / sub-view is open: null | 'checkin' | 'report' | 'notes' | 'tests' | 'notifs' | 'data'
  const [open, setOpen] = useState(route?.open ?? null);
  // A new navigate('profile', { open }) (e.g. Home's CHECK-IN tile) opens that popup.
  useEffect(() => { if (route?.open) setOpen(route.open); }, [route?.key, route?.open]);
  const close = useCallback(() => setOpen(null), []);

  // Same hand-over as the home screen: the wearables screen opens on the organ / band.
  const openTarget = target => {
    if (!target?.screen) return;
    if (target.screen === 'wearables') setPendingFocus(target);
    navigate(target.screen, target);
  };

  // Check-in of the logged-in person: values and assessed readings, shared by the form and the report.
  const [checkinValues, setCheckinValues] = useState(CHECKIN_DEFAULTS);
  const [biometrics, setBiometrics] = useState(createBiometrics);
  const [committed, setCommitted] = useState(null); // { at, symptoms } of the last committed entry
  const updateReading = (id, value) => setBiometrics(current => updateBiometric(current, id, value));
  const commitCheckIn = (event, values) => {
    event.preventDefault();
    setCommitted({ at: new Date().toISOString(), symptoms: values?.symptoms && values.symptoms !== 'NONE' ? values.symptoms : null });
  };
  const attention = biometrics.filter(item => item.status !== 'ok').length;

  // Cognitive tests (PVT, Go/No-Go, DSST) run on the TESTS screen; the questionnaires have no runner yet.
  const startTest = test => {
    if (isOwn && test?.runner === 'cognitive') navigate('tests');
  };

  const backToOwn = () => {
    setViewedCode(session);
    navigate('profile');
  };

  if (!profile) {
    return (
      <div className="profile-screen">
        <Panel title={t('profile.title')} tone="caution">
          <p>{t('profile.unknownPerson', { code: viewedCode ?? '—' })}</p>
          <Button className="pf-big" onClick={backToOwn}>{t('profile.backToOwn')}</Button>
        </Panel>
      </div>
    );
  }

  // ── sub-view: daily check-in ──
  if (isOwn && open === 'checkin') {
    return (
      <div className="profile-screen" data-own="true" data-view="checkin">
        <section className="pf-sub" aria-labelledby="pf-checkin-title">
          <header className="pf-sub-head">
            <button type="button" className="pf-back" onClick={close}>
              <NavIcon name="prev" />
              <span>{t('profile.back')}</span>
            </button>
            <NavIcon name="checkin" className="pf-sub-icon" />
            <h2 id="pf-checkin-title" className="pf-sub-title">{t('profile.checkinTitle')}</h2>
            <span className="pf-sub-sol">{sol != null ? t('common.solN', { n: sol }) : t('common.solUnknown')}</span>
          </header>
          <CheckIn
            biometrics={biometrics}
            values={checkinValues}
            onValuesChange={setCheckinValues}
            onUpdate={updateReading}
            onSubmit={commitCheckIn}
            status={committed ? (
              <p className="pf-state" role="status">
                <StatusTag status={attention > 0 ? 'caution' : 'ok'} />{' '}
                {t('profile.checkinCommitted', { time: committed.at.slice(11, 16) })}{' '}
                {attention > 0 ? t('profile.checkinAttention', { n: attention }) : t('profile.checkinAllNormal')}
              </p>
            ) : null}
          />
        </section>
      </div>
    );
  }

  const tiles = [
    isOwn && { id: 'checkin', icon: 'checkin', label: t('profile.checkinTitle'), info: committed ? t('profile.tileDoneAt', { time: committed.at.slice(11, 16) }) : t('profile.tileToDo') },
    isOwn && { id: 'report', icon: 'report', label: t('profile.reportTile') },
    { id: 'notes', icon: 'notebook', label: t('profile.notesTitle') },
    { id: 'tests', icon: 'tests', label: t('profile.testsTitle') },
    { id: 'notifs', icon: 'bell', label: t('profile.notificationsTitle'), info: <span data-testid="profile-notification-count">{notifications.length}</span> },
    { id: 'data', icon: 'idcard', label: t('profile.dataTitle') },
  ].filter(Boolean);

  const dialogs = {
    report: { title: t('profile.reportTitle'), icon: 'report', body: <SurgeonReportPanel profile={profile} biometrics={biometrics} symptoms={committed?.symptoms ?? null} mother={mother} sol={sol} /> },
    notes: { title: t('profile.notesTitle'), icon: 'notebook', body: <NotesPanel crewCode={profile.code} isOwn={isOwn} sol={sol} /> },
    tests: { title: t('profile.testsTitle'), icon: 'tests', body: <PsychTestsPanel crewCode={profile.code} isOwn={isOwn} onStart={startTest} /> },
    notifs: { title: t('profile.notificationsTitle'), icon: 'bell', body: <NotificationsBody items={notifications} onOpen={openTarget} /> },
    data: { title: t('profile.dataTitle'), icon: 'idcard', body: <PersonalData profile={profile} habitat={habitat} /> },
  };
  const dialog = open && dialogs[open] && (open !== 'report' || isOwn) ? dialogs[open] : null;

  return (
    <div className="profile-screen" data-own={isOwn ? 'true' : 'false'}>
      {!isOwn ? (
        <div className="pf-readonly" role="status">
          <span className="pf-readonly-text">{t('profile.readOnly', { name: profile.name })}</span>
          <Button className="pf-big" onClick={backToOwn}>{t('profile.backToOwn')}</Button>
        </div>
      ) : null}

      <CrewHeader
        profile={profile}
        report={report}
        mother={mother}
        habitat={habitat}
        actions={(
          <button type="button" className="pf-head-btn" onClick={() => navigate('wearables')}>
            <NavIcon name="bands" className="pf-head-btn-icon" />
            <span>{t('profile.wearableData')}</span>
          </button>
        )}
      />

      <nav className="pf-tiles" data-count={tiles.length} aria-label={t('profile.tilesLabel')}>
        {tiles.map(tile => <Tile key={tile.id} {...tile} onOpen={() => setOpen(tile.id)} />)}
      </nav>

      {dialog ? (
        <DataDialog title={dialog.title} icon={dialog.icon} onClose={close}>
          {dialog.body}
        </DataDialog>
      ) : null}
    </div>
  );
}

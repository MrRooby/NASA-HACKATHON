import React, { useMemo, useState } from 'react';
import { Badge, Button, Panel, StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { buildNotifications } from '../notifications/buildNotifications.js';
import NotificationList from '../notifications/NotificationList.jsx';
import CheckIn from '../checkin/CheckIn.jsx';
import { createBiometrics, updateBiometric } from '../checkin/thresholdLogic.js';
import { setPendingFocus } from '../home/focus.js';
import { useCrewReport } from '../home/useCrewReport.js';
import { findLocation } from '../crew/crewStatus.js';
import CrewFilePanel from '../profile/CrewFilePanel.jsx';
import NotesPanel from '../profile/NotesPanel.jsx';
import PsychTestsPanel from '../profile/PsychTestsPanel.jsx';
import SurgeonReportPanel from '../profile/SurgeonReportPanel.jsx';
import './profile.css';

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

/** [ DAILY CHECK-IN ]: the legacy form plus the confirmation of the committed entry. */
function CheckInPanel({ biometrics, committed, sol, onUpdate, onCommit }) {
  const t = useT();
  const attention = biometrics.filter(item => item.status !== 'ok').length;
  return (
    <Panel
      className="profile-checkin"
      title={t('profile.checkinTitle')}
    >
      <CheckIn biometrics={biometrics} sol={sol} onUpdate={onUpdate} onSubmit={onCommit} />
      {committed ? (
        <p className="profile-checkin-state" role="status">
          <StatusTag status={attention > 0 ? 'caution' : 'ok'} />{' '}
          {t('profile.checkinCommitted', { time: committed.at.slice(11, 16) })}{' '}
          {attention > 0 ? t('profile.checkinAttention', { n: attention }) : t('profile.checkinAllNormal')}
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * PROFILE screen: crew file, notes / diary (skeleton), psychological tests (cognitive battery on the
 * TESTS screen, questionnaires still a skeleton),
 * notifications; on the logged-in person's own profile also the daily check-in and the
 * flight-surgeon report. Another person's profile is read-only.
 * props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }
 */
export default function ProfileScreen({ mother, session, viewedCode, setViewedCode, navigate, profile }) {
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

  // Same hand-over as the home screen: the wearables screen opens on the organ / band.
  const openTarget = target => {
    if (!target?.screen) return;
    if (target.screen === 'wearables') setPendingFocus(target);
    navigate(target.screen, target);
  };

  // Check-in readings of the logged-in person: shared by the form and the flight-surgeon report.
  const [biometrics, setBiometrics] = useState(createBiometrics);
  const [committed, setCommitted] = useState(null); // { at, symptoms } of the last committed entry
  const updateReading = (id, value) => setBiometrics(current => updateBiometric(current, id, value));
  const commitCheckIn = (event, values) => {
    event.preventDefault();
    setCommitted({ at: new Date().toISOString(), symptoms: values?.symptoms && values.symptoms !== 'NONE' ? values.symptoms : null });
  };

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
          <Button onClick={backToOwn}>{t('profile.backToOwn')}</Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="profile-screen" data-own={isOwn ? 'true' : 'false'}>
      {!isOwn ? (
        <div className="profile-readonly" role="status">
          <span className="profile-readonly-text">{t('profile.readOnly', { name: profile.name })}</span>
          <Button onClick={backToOwn}>{t('profile.backToOwn')}</Button>
        </div>
      ) : null}

      <div className="profile-columns">
        <div className="profile-column">
          <CrewFilePanel profile={profile} report={report} mother={mother} habitat={habitat} navigate={navigate} />
          <PsychTestsPanel crewCode={profile.code} isOwn={isOwn} onStart={startTest} />
          {isOwn ? (
            <CheckInPanel
              biometrics={biometrics}
              committed={committed}
              sol={sol}
              onUpdate={updateReading}
              onCommit={commitCheckIn}
            />
          ) : null}
        </div>

        <div className="profile-column">
          <NotesPanel crewCode={profile.code} isOwn={isOwn} sol={sol} />
          <Panel
            className="profile-notifications"
            title={t('profile.notificationsTitle')}
            meta={<span data-testid="profile-notification-count">{notifications.length}</span>}
          >
            <NotificationList
              items={notifications}
              emptyText={t('profile.notificationsEmpty')}
              onOpen={openTarget}
            />
          </Panel>
          {isOwn ? (
            <SurgeonReportPanel
              profile={profile}
              biometrics={biometrics}
              symptoms={committed?.symptoms ?? null}
              mother={mother}
              sol={sol}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

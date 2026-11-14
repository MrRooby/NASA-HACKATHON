import React, { useCallback, useMemo, useRef, useState } from 'react';
import AstronautViewer from '../AstronautViewer.jsx';
import { Badge, Button, Panel, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { getDemoHabitat } from '../habitat/demoHabitat.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { segmentStatusFromReport, worstStatus } from '../organSegments.js';
import ConnectorOverlay, { anchorsMoved } from '../home/ConnectorOverlay.jsx';
import LimbCard from '../home/LimbCard.jsx';
import TelemetryNotice from '../home/TelemetryNotice.jsx';
import { setPendingFocus } from '../home/focus.js';
import { limbsFromReport } from '../home/limbData.js';
import { useCrewReport } from '../home/useCrewReport.js';
import { buildNotifications, countBySeverity } from '../notifications/buildNotifications.js';
import NotificationList from '../notifications/NotificationList.jsx';
import './home.css';

// The model faces the viewer, so the astronaut's own left side is on the viewer's right:
// each card sits on the screen side where its limb is drawn.
const CARD_CORNERS = [
  ['right_arm', 'tl'],
  ['left_arm', 'tr'],
  ['right_leg', 'bl'],
  ['left_leg', 'br'],
];

const isProblem = status => status === 'caution' || status === 'alert';

/**
 * Home: [ WEARABLE DATA ] (four limb bands around the 3D figure) and [ NOTIFICATIONS ].
 * Props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }.
 * The person is viewedCode (the App keeps mother's subject on it); the sol is mother's period
 * (changed on the wearables screen), and the habitat data is fetched for that same sol.
 */
export default function HomeScreen({ mother, viewedCode, navigate, profile }) {
  const t = useT();
  const source = useCrewReport(mother, viewedCode);
  const { report, kind, asOf } = source;

  const { limbs } = useMemo(() => limbsFromReport(report), [report]);
  const byLimb = useMemo(() => Object.fromEntries(limbs.map(item => [item.limb, item])), [limbs]);
  const segmentStatus = useMemo(() => (report ? segmentStatusFromReport(report) : undefined), [report]);

  // Habitat of the same sol as the organ report (habitat crew only). Without a link to
  // MOTHER the built-in demo habitat is used directly: there is nothing to ask.
  const linked = source.mode === 'online';
  const habitatSol = kind === 'sol' ? (source.state === 'live' ? mother?.period?.sol ?? asOf : asOf) : null;
  const habitat = useHabitat({ sol: habitatSol ?? null, enabled: kind === 'sol' && linked && source.state !== 'awaiting' });
  const demoHabitat = useMemo(() => (kind === 'sol' && !linked ? getDemoHabitat() : null), [kind, linked]);
  const habitatData = linked ? habitat?.data ?? null : demoHabitat;
  const notifications = useMemo(() => buildNotifications({ report, habitat: habitatData }), [report, habitatData]);
  const counts = countBySeverity(notifications);

  // Connector lines: the viewer reports limb anchors every frame; keep them only when they move.
  const stageRef = useRef(null);
  const figureRef = useRef(null);
  const anchorsRef = useRef(null);
  const [anchors, setAnchors] = useState(null);
  const onModelFrame = useCallback(next => {
    if (!anchorsMoved(anchorsRef.current, next)) return;
    anchorsRef.current = next;
    setAnchors(next);
  }, []);

  const openScan = useCallback(() => navigate?.('wearables'), [navigate]);
  const openTarget = useCallback(target => {
    if (!target?.screen) return;
    if (target.screen === 'wearables') setPendingFocus(target);
    navigate?.(target.screen, target);
  }, [navigate]);

  const subject = report?.subject;
  const name = profile?.name || subject?.label || viewedCode || '—';
  const overall = report?.overall_status ?? 'no_data';
  const limbTone = worstStatus(limbs.map(item => item.status));
  const badgeKind = source.demo ? 'demo' : subject?.data_kind === 'synthetic' ? 'synthetic' : null;
  const solText = asOf != null
    ? (kind === 'sol' ? t('common.solN', { n: asOf }) : `${t('wearables.flightDay')} ${asOf}`)
    : t('common.solUnknown');

  const countParts = [
    counts.alert ? t('home.notifCountAlert', { n: counts.alert }) : null,
    counts.caution ? t('home.notifCountCaution', { n: counts.caution }) : null,
    counts.info ? t('home.notifCountInfo', { n: counts.info }) : null,
  ].filter(Boolean);
  // Say so when the person's data is real but the habitat part is not (or not there yet).
  const habitatNote = kind !== 'sol' || source.demo ? null
    : habitatData?.demo ? t('home.notifHabitatDemo')
      : linked && habitat?.loading && !habitatData ? t('home.notifHabitatLoading')
        : null;

  return (
    <div className="home-screen">
      <TelemetryNotice source={source} code={viewedCode} />

      <Panel
        className="home-wear-panel"
        title={t('home.wearPanel')}
        tone={isProblem(limbTone) ? limbTone : 'default'}
        meta={(
          <span className="home-meta">
            <span className="home-meta-name">{name}</span>
            {profile?.callsign ? <span className="home-meta-callsign">«{profile.callsign}»</span> : null}
            <span className="home-meta-sol" data-testid="home-sol">{solText}</span>
            {badgeKind ? <Badge kind={badgeKind} /> : null}
          </span>
        )}
      >
        <div className="home-wear" ref={stageRef}>
          {CARD_CORNERS.map(([limb, corner]) => <LimbCard key={limb} data={byLimb[limb]} corner={corner} />)}

          <div
            className="home-figure"
            ref={figureRef}
            role="button"
            tabIndex={0}
            aria-label={t('home.openScan')}
            title={t('home.figureHint')}
            onClick={openScan}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openScan();
              }
            }}
          >
            <AstronautViewer frontView segmentStatus={segmentStatus} onModelFrame={onModelFrame} />
          </div>

          <ConnectorOverlay stageRef={stageRef} modelRef={figureRef} anchors={anchors} />
        </div>

        <div className={cx('home-strip', `home-strip-${overall}`)} data-status={overall}>
          <span className="label">{t('home.overall')}</span>
          <StatusTag status={overall} />
          <span className="home-top-message">{report?.top_message ?? '—'}</span>
          <Button variant="primary" className="home-scan-btn" onClick={openScan}>{t('home.fullScan')}</Button>
        </div>
      </Panel>

      <Panel
        className="home-notif-panel"
        title={t('home.notifPanel')}
        tone={counts.alert ? 'alert' : counts.caution ? 'caution' : 'default'}
        meta={(
          <span className="home-meta" data-testid="notif-counts">
            <span>{countParts.length ? countParts.join(' · ') : t('home.notifCountNone')}</span>
            {habitatNote ? <span className="home-meta-note">{habitatNote}</span> : null}
          </span>
        )}
      >
        <NotificationList items={notifications} onOpen={openTarget} />
      </Panel>
    </div>
  );
}

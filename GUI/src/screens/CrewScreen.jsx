import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { CREW_PROFILES, localize } from '../data/crewProfiles.js';
import { demoOverview } from '../data/demoReports.js';
import { useSharedHabitat } from '../habitat/sharedHabitat.js';
import { ORGANS, crewHealth, findLocation } from '../crew/crewStatus.js';
import { crewVitals } from '../crew/vitals.js';
import { useCrewReports } from '../crew/useCrewReports.js';
import { segmentStatusFromReport, ORGAN_SEGMENTS, LIMB_SEGMENTS, worstStatus } from '../organSegments.js';
import { ORGAN_ICON, PixelAvatar, PixelIcon } from '../pixel/index.js';
import { Badge, StatusMark } from '../ui/index.js';
import BodyModel from '../body/BodyModel.jsx';
import './crew.css';

const CODES = CREW_PROFILES.map(profile => profile.code);
const ORGAN_IDS = ORGANS.map(item => item.organ);

/** { segment: status } from the ten organ statuses alone (overview entry, no limb detail). */
export function segmentStatusFromOrgans(organs) {
  const collected = {};
  for (const [organ, status] of Object.entries(organs || {})) {
    const segments = organ === 'limbs' ? Object.values(LIMB_SEGMENTS).flat() : ORGAN_SEGMENTS[organ] || [];
    for (const segment of segments) (collected[segment] ||= []).push(status);
  }
  return Object.fromEntries(Object.entries(collected).map(([segment, list]) => [segment, worstStatus(list)]));
}

/** 'Grażyna Brzęczyszczykiewicz' -> 'Grażyna B.' (the full name stays in title / aria-label). */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || '';
}

function zoneLabel(t, code) {
  if (!code) return null;
  const key = `crew.zone_${code}`;
  const text = t(key);
  return text === key ? String(code).replace(/_/g, ' ') : text;
}

function Vital({ icon, value, unit, status, label, full }) {
  const tone = status === 'caution' || status === 'alert' ? ` is-${status}` : '';
  return (
    <span className={`crew-vital${tone}`} title={value == null ? label : full} aria-label={value == null ? label : full}>
      <PixelIcon name={icon} size={24} />
      <span className="crew-vital-value num" aria-hidden="true">{value ?? '--'}</span>
      <span className="crew-vital-unit" aria-hidden="true">{unit}</span>
    </span>
  );
}

function CrewTile({ profile, index, health, report, location, provenance, navigate }) {
  const { t, lang } = useI18n();
  const [hover, setHover] = useState(false);
  const status = health.status;
  const loud = status === 'caution' || status === 'alert';
  const segmentStatus = useMemo(
    () => (report ? segmentStatusFromReport(report) : segmentStatusFromOrgans(health.organs)),
    [report, health.organs],
  );
  const vitals = useMemo(() => crewVitals(report), [report]);
  const role = localize(profile.role, lang);
  const open = () => navigate({ screen: 'person', code: profile.code });

  return (
    <li
      className={`crew-tile px-frame crew-tile-${status}`}
      data-code={profile.code}
      data-status={status}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <button type="button" className="crew-tile-hit" onClick={open} aria-label={t('crew.openPerson', { name: profile.name })} title={profile.name} />

      <header className="crew-head">
        <PixelAvatar code={profile.code} size={48} className="crew-avatar" title={t('crew.avatarOf', { name: profile.name })} />
        <div className="crew-id">
          <h2 className="crew-name" title={profile.name} aria-label={profile.name}>{shortName(profile.name)}</h2>
          <p className="crew-role"><span className="crew-callsign">{profile.callsign}</span> · {role}</p>
        </div>
        <StatusMark status={status} size="lg" className="crew-status" />
      </header>
      {loud && health.message ? <p className="crew-msg" title={health.message}>{health.message}</p> : null}

      <div className="crew-model">
        <BodyModel
          segmentStatus={segmentStatus}
          autoRotate
          interactive={false}
          paused={hover}
          phase={index * (Math.PI / 2)}
          label={t('crew.modelOf', { name: profile.name })}
        />
      </div>

      <ul className="crew-organs" aria-label={t('crew.organsOf', { name: profile.name })}>
        {ORGAN_IDS.map(organ => {
          const organStatus = health.organs[organ] ?? 'no_data';
          const organName = t(`crew.organ_${organ}`);
          return (
            <li key={organ}>
              <button
                type="button"
                className={`crew-organ is-${organStatus}`}
                data-organ={organ}
                data-status={organStatus}
                title={`${organName}: ${t(`common.status_${organStatus}`)}`}
                aria-label={t('crew.openOrgan', { organ: organName, status: t(`common.status_${organStatus}`), name: profile.name })}
                onClick={event => {
                  event.stopPropagation();
                  navigate({ screen: 'person', code: profile.code, organ });
                }}
              >
                <PixelIcon name={ORGAN_ICON[organ]} size={32} status={organStatus === 'ok' ? undefined : organStatus} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="crew-vitals" aria-label={t('crew.vitals')}>
        <Vital icon="hr" value={vitals.hr.value} unit="bpm" status={vitals.hr.status} label={t('crew.hr')} full={t('crew.hrFull', { v: vitals.hr.value })} />
        <Vital icon="spo2" value={vitals.spo2.value} unit="%" status={vitals.spo2.status} label={t('crew.spo2')} full={t('crew.spo2Full', { v: vitals.spo2.value })} />
        <Vital icon="sleep" value={vitals.sleep.value} unit="h" status={vitals.sleep.status} label={t('crew.sleep')} full={t('crew.sleepFull', { v: vitals.sleep.value })} />
      </div>

      <footer className="crew-foot">
        <span className="crew-where" data-testid="crew-location" title={t('crew.location')}>
          <span className="crew-pin" aria-hidden="true">⌖</span>
          {location ? zoneLabel(t, location) : t('crew.locationUnknown')}
        </span>
        {provenance ? <Badge kind={provenance} /> : null}
      </footer>
    </li>
  );
}

/**
 * CREW start screen (DESIGN.md §4.1): four crew tiles, each a big button to the person.
 * Rotating 3D body with organ colours, the ten organ icons (each opens the person at that
 * organ), three vitals and where the person is. Live: per-person organ reports at the shared
 * sol (fallback: crew overview); offline: built-in demo records with a DEMO badge.
 * props: { mother, route, navigate }
 */
export default function CrewScreen({ mother, navigate }) {
  const mode = mother?.mode ?? (mother?.online ? 'online' : 'offline');
  const online = mode === 'online';
  const offline = mode === 'offline';
  const { reports } = useCrewReports(CODES, { mode, period: mother?.period });
  const { data: habitat } = useSharedHabitat({ sol: mother?.period?.sol ?? null });

  const live = Array.isArray(mother?.overview) ? mother.overview : null;
  const overview = useMemo(() => live ?? (offline ? demoOverview() : null), [live, offline]);

  return (
    <div className="crew-screen">
      <ol className="crew-grid">
        {CREW_PROFILES.map((profile, index) => {
          const report = reports[profile.code] ?? null;
          const health = crewHealth({ code: profile.code, report, overview });
          const zone = findLocation(habitat, profile.crewCode);
          const provenance = offline || health.demo ? 'demo' : health.synthetic ? 'synthetic' : null;
          return (
            <CrewTile
              key={profile.code}
              profile={profile}
              index={index}
              health={health}
              report={report && report.subject?.code === profile.code ? report : null}
              location={zone?.code ?? null}
              provenance={provenance}
              navigate={navigate}
            />
          );
        })}
      </ol>
    </div>
  );
}

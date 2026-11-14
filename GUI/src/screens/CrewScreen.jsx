import React, { useMemo } from 'react';
import { Avatar, Badge, Button, Panel, StatusTag } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import { CREW_PROFILES } from '../data/crewProfiles.js';
import { demoOverview } from '../data/demoReports.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { ORGANS, ORGAN_STATUS_CODES, crewHealth, findLocation, localized, zoneName } from '../crew/crewStatus.js';
import './crew.css';

const STATUS_KEYS = {
  ok: 'common.statusOk',
  caution: 'common.statusCaution',
  alert: 'common.statusAlert',
  no_data: 'common.statusNoData',
};

/** The ten organ statuses as two text lines per organ: code over status (BRN / OK). */
function OrganStrip({ organs, name }) {
  const { t } = useI18n();
  return (
    <ul className="crew-organs" aria-label={t('crew.organsOf', { name })}>
      {ORGANS.map(({ organ, code }) => {
        const status = organs[organ] ?? 'no_data';
        const label = `${t(`crew.organ_${organ}`)}: ${t(STATUS_KEYS[status])}`;
        return (
          <li key={organ} className={`crew-organ crew-organ-${status}`} data-organ={organ} data-status={status} title={label} aria-label={label}>
            <span aria-hidden="true">{code}</span>
            <span aria-hidden="true">{ORGAN_STATUS_CODES[status]}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CrewRow({ profile, isYou, health, loading, habitat, onOpen }) {
  const { t, lang } = useI18n();
  const location = findLocation(habitat, profile.crewCode);

  return (
    <li className={`crew-member${isYou ? ' crew-member-you' : ''}`} data-code={profile.code} data-status={health.status}>
      <Avatar code={profile.code} size={64} title={t('crew.avatarOf', { name: profile.name })} />

      <div className="crew-member-id">
        <h3 className="crew-member-name">
          {profile.name}
          {isYou ? <> <Badge tone="accent" data-testid="crew-you">{t('crew.you')}</Badge></> : null}
        </h3>
        <p className="crew-member-role">
          <span className="crew-member-callsign">“{profile.callsign}”</span> · {localized(profile.role, lang)} · {profile.code}
        </p>
        <p className="crew-member-where">
          <span className="label">{t('crew.home')}</span> {zoneName(habitat, profile.homeZone) ?? '—'}
          {' · '}
          <span className="label">{t('crew.location')}</span>{' '}
          <span data-testid="crew-location">{location ? zoneName(habitat, location.code) : t('crew.locationUnknown')}</span>
          {location && habitat?.demo ? <> <Badge kind="demo" /></> : null}
        </p>
      </div>

      <div className="crew-member-health">
        <p className="crew-member-status">
          <StatusTag status={health.status} />{' '}
          <span className="crew-member-message">{health.source === 'none'
              ? (loading ? t('common.loading') : t('crew.noRecord'))
              : (health.message || t('crew.noMessage'))}</span>
        </p>
        <OrganStrip organs={health.organs} name={profile.name} />
      </div>

      <div className="crew-member-actions">
        <Button aria-label={`${t('crew.openProfile')}: ${profile.name}`} onClick={() => onOpen(profile.code, 'profile')}>
          {t('crew.openProfile')}
        </Button>
        <Button aria-label={`${t('crew.openWearables')}: ${profile.name}`} onClick={() => onOpen(profile.code, 'wearables')}>
          {t('crew.openWearables')}
        </Button>
      </div>
    </li>
  );
}

/**
 * CREW screen: the four crew members as a vertical roster with their overall status, the ten
 * organ statuses (crew overview of MOTHER, GET /api/organs; the built-in demo overview while
 * MOTHER is unreachable) and where they are (habitat occupancy).
 * props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }
 */
export default function CrewScreen({ mother, session, setViewedCode, navigate }) {
  const { t } = useI18n();
  const { data: habitat } = useHabitat({ sol: null }); // the overview is always the latest sol

  // Live (or last known) overview; without a link the demo records, labelled DEMO.
  const live = Array.isArray(mother?.overview) ? mother.overview : null;
  const overview = useMemo(() => live ?? (mother?.online ? null : demoOverview()), [live, mother?.online]);
  const health = Object.fromEntries(CREW_PROFILES.map(profile => [profile.code, crewHealth({ code: profile.code, overview })]));
  const members = Object.values(health);
  const demo = members.some(item => item.demo);
  const synthetic = members.some(item => item.synthetic);
  const metaText = live ? t('crew.asOfLatest') : overview ? t('crew.noLink') : t('common.loading');

  const open = (code, screen) => {
    setViewedCode(code);
    navigate(screen);
  };

  return (
    <div className="crew-screen">
      <Panel
        title={t('crew.rosterTitle')}
        meta={(
          <>
            <span>{metaText}</span>
            {demo ? <Badge kind="demo" /> : null}
            {synthetic ? <Badge kind="synthetic" /> : null}
            <Badge kind="fictional">{t('crew.fictionalCrew')}</Badge>
          </>
        )}
      >
        <ol className="crew-roster" aria-label={t('crew.rosterTitle')}>
          {CREW_PROFILES.map(profile => (
            <CrewRow
              key={profile.code}
              profile={profile}
              isYou={profile.code === session}
              health={health[profile.code]}
              loading={!overview}
              habitat={habitat}
              onOpen={open}
            />
          ))}
        </ol>
        <p className="crew-legend">{t('crew.legend')}</p>
      </Panel>
    </div>
  );
}

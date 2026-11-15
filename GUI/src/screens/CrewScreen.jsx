import React, { useMemo, useState } from 'react';
import { Badge, Button, Panel, StatusTag } from '../components/index.js';
import CrewPortrait from '../crew/CrewPortrait.jsx';
import CrewLoading from '../crew/CrewLoading.jsx';
import { useI18n } from '../i18n/index.js';
import { ROSTER } from '../crew/roster.js';
import { useRosterReports } from '../crew/useRosterReports.js';
import { demoOverview } from '../data/demoReports.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { ORGANS, crewHealth, findLocation, localized, zoneName } from '../crew/crewStatus.js';
import CrewPerson from '../crew/CrewPerson.jsx';
import { STATUS_GLYPH, UI_GLYPH } from '../crew/glyphs.js';
import './crew.css';

/** Rows of the roster that are always visible; the rest is reached with the arrow blocks. */
export const ROSTER_ROWS = 4;

const STATUS_KEYS = {
  ok: 'common.statusOk',
  caution: 'common.statusCaution',
  alert: 'common.statusAlert',
  no_data: 'common.statusNoData',
};

/** The ten organ statuses: status shape (■ ▲ ◆ ○) + colour + the organ's word; the full
 *  status word is the accessible name and the tooltip. */
function OrganStrip({ organs, name }) {
  const { t } = useI18n();
  return (
    <ul className="crew-organs" aria-label={t('crew.organsOf', { name })}>
      {ORGANS.map(({ organ }) => {
        const status = organs[organ] ?? 'no_data';
        const label = `${t(`crew.organ_${organ}`)}: ${t(STATUS_KEYS[status])}`;
        return (
          <li key={organ} className={`crew-organ crew-organ-${status}`} data-organ={organ} data-status={status} title={label} aria-label={label}>
            <span className="crew-glyph crew-organ-glyph" aria-hidden="true">{STATUS_GLYPH[status]}</span>
            <span className="crew-organ-word" aria-hidden="true">{t(`crew.organShort_${organ}`)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CrewRow({ profile, isYou, health, loading, habitat, onOpen, onOpenPerson }) {
  const { t, lang } = useI18n();
  const location = findLocation(habitat, profile.crewCode);

  // The whole row opens the person view (the name button is the keyboard target and stretches over
  // the row); the two buttons on the right keep opening the full PROFILE and WEARABLES screens.
  return (
    <li
      className={`crew-member${isYou ? ' crew-member-you' : ''}`}
      data-code={profile.code}
      data-status={health.status}
      onClick={() => onOpenPerson(profile.code)}
    >
      <div className="crew-member-row">
      <CrewPortrait code={profile.code} title={t('crew.avatarOf', { name: profile.name })} />

      <div className="crew-member-id">
        <h3 className="crew-member-name">
          <button
            type="button"
            className="crew-member-open"
            aria-label={t('crew.openPerson', { name: profile.name })}
            onClick={event => {
              event.stopPropagation();
              onOpenPerson(profile.code);
            }}
          >
            {profile.name}
          </button>
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
        <Button aria-label={`${t('crew.openProfile')}: ${profile.name}`} onClick={event => { event.stopPropagation(); onOpen(profile.code, 'profile'); }}>
          {t('crew.openProfile')}
        </Button>
        <Button aria-label={`${t('crew.openWearables')}: ${profile.name}`} onClick={event => { event.stopPropagation(); onOpen(profile.code, 'wearables'); }}>
          {t('crew.openWearables')}
        </Button>
      </div>
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
  // Each person's own report (fast) wins; the overview fills in while a report is missing.
  const { reports, loading: reportsLoading } = useRosterReports(ROSTER.map(profile => profile.code), { mode: mother?.mode });
  const health = Object.fromEntries(ROSTER.map(profile => [profile.code, crewHealth({ code: profile.code, report: reports[profile.code] ?? null, overview })]));
  const members = Object.values(health);
  const demo = members.some(item => item.demo);
  const synthetic = members.some(item => item.synthetic);
  // Always four rows; more crew -> paged by the up / down blocks on the right.
  const [first, setFirst] = useState(0);
  const lastFirst = Math.max(0, ROSTER.length - ROSTER_ROWS);
  const start = Math.min(first, lastFirst);
  const shown = ROSTER.slice(start, start + ROSTER_ROWS);
  const paged = ROSTER.length > ROSTER_ROWS;

  const anyReport = Object.values(reports).some(Boolean);
  // Veil until the first data about anyone has arrived (later 30 s refreshes never show it).
  const firstLoad = members.every(item => item.source === 'none') && (reportsLoading || mother?.mode === 'connecting');
  const metaText = !mother?.online && overview ? t('crew.noLink') : live || anyReport ? t('crew.asOfLatest') : t('common.loading');

  const open = (code, screen) => {
    setViewedCode(code);
    navigate(screen);
  };

  // Person view inside the CREW screen (src/crew/CrewPerson.jsx). viewedCode follows it, so MOTHER
  // loads that person's report; going back returns to the logged-in member.
  const [personCode, setPersonCode] = useState(null);
  const openPerson = code => {
    setViewedCode(code);
    setPersonCode(code);
  };
  const closePerson = () => {
    setViewedCode(null);
    setPersonCode(null);
  };

  if (personCode) {
    return (
      <div className="crew-screen">
        <CrewPerson code={personCode} mother={mother} session={session} habitat={habitat} navigate={navigate} onBack={closePerson} />
      </div>
    );
  }

  return (
    <div className="crew-screen" data-loading={firstLoad ? 'true' : undefined}>
      {firstLoad ? <CrewLoading /> : null}
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
        <div className="crew-roster-wrap">
        <ol className="crew-roster" aria-label={t('crew.rosterTitle')} start={start + 1}>
          {shown.map(profile => (
            <CrewRow
              key={profile.code}
              profile={profile}
              isYou={profile.code === session}
              health={health[profile.code]}
              loading={!overview && reportsLoading}
              habitat={habitat}
              onOpen={open}
              onOpenPerson={openPerson}
            />
          ))}
        </ol>
        {paged ? (
          <div className="crew-roster-pager">
            <button
              type="button"
              className="crew-roster-step"
              aria-label={t('crew.rosterUp')}
              disabled={start === 0}
              onClick={() => setFirst(Math.max(0, start - 1))}
            >
              <span className="crew-glyph" aria-hidden="true">{UI_GLYPH.up}</span>
            </button>
            <button
              type="button"
              className="crew-roster-step"
              aria-label={t('crew.rosterDown')}
              disabled={start >= lastFirst}
              onClick={() => setFirst(Math.min(lastFirst, start + 1))}
            >
              <span className="crew-glyph" aria-hidden="true">{UI_GLYPH.down}</span>
            </button>
          </div>
        ) : null}
        </div>
        <p className="crew-legend">
          {['ok', 'caution', 'alert', 'no_data'].map(status => (
            <span key={status} className={`crew-legend-item crew-organ-${status}`}>
              <span className="crew-glyph" aria-hidden="true">{STATUS_GLYPH[status]}</span> {t(STATUS_KEYS[status])}
            </span>
          ))}
          <span className="crew-legend-hint">{t('crew.legend')}</span>
        </p>
      </Panel>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { StatusTag } from '../components/index.js';
import CrewPortrait from '../crew/CrewPortrait.jsx';
import CrewLoading from '../crew/CrewLoading.jsx';
import { useI18n } from '../i18n/index.js';
import { ROSTER } from '../crew/roster.js';
import { useRosterReports } from '../crew/useRosterReports.js';
import { demoOverview } from '../data/demoReports.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { ORGANS, crewHealth, findLocation, localized, zoneName } from '../crew/crewStatus.js';
import { UI_GLYPH } from '../crew/glyphs.js';

/** Rows of the roster shown at once; the rest is reached with the ▲ / ▼ blocks. */
export const ROSTER_ROWS = 5;
import CrewPerson from '../crew/CrewPerson.jsx';
import { getProfile } from '../data/crewProfiles.js';
import NavIcon from '../navIcons.jsx';
import './crew.css';

/** Organs that are not OK, the worst first: ['blood', 'kidneys', ...]. */
function problemOrgans(organs) {
  const rank = { alert: 0, caution: 1 };
  return ORGANS.map(({ organ }) => organ)
    .filter(organ => organs[organ] in rank)
    .sort((a, b) => rank[organs[a]] - rank[organs[b]]);
}

/** The one short line of a tile: the problem organs when not OK, otherwise where the person is. */
function TileLine({ health, loading, habitat, profile }) {
  const { t } = useI18n();
  if (health.source === 'none') {
    return <span className="crew-pt-line crew-pt-line-dim">{loading ? t('common.loading') : t('crew.noRecord')}</span>;
  }
  const problems = problemOrgans(health.organs);
  if ((health.status === 'caution' || health.status === 'alert') && problems.length) {
    const shown = problems.slice(0, 2).map(organ => t(`crew.organShort_${organ}`)).join(' · ');
    const more = problems.length > 2 ? ` +${problems.length - 2}` : '';
    return <span className={`crew-pt-line crew-pt-line-${health.status}`} data-testid="crew-problem">{shown}{more}</span>;
  }
  const location = findLocation(habitat, profile.crewCode);
  return (
    <span className="crew-pt-line" data-testid="crew-location">
      {location ? zoneName(habitat, location.code) : t('crew.locationUnknown')}
    </span>
  );
}

function CrewRow({ profile, isYou, health, loading, habitat, onOpen }) {
  const { t, lang } = useI18n();
  return (
    <li className="crew-row-cell">
      <button
        type="button"
        className={`crew-row${isYou ? ' crew-row-you' : ''}`}
        data-code={profile.code}
        data-status={health.status}
        aria-label={t('crew.openPerson', { name: profile.name })}
        onClick={() => onOpen(profile.code)}
      >
        <span className="crew-row-inner">
          <span className="crew-row-photo">
            <CrewPortrait code={profile.code} title={t('crew.avatarOf', { name: profile.name })} />
          </span>
          <span className="crew-row-id">
            <span className="crew-row-name">
              <span className="crew-row-name-text">{profile.name}</span>
              {isYou ? <span className="crew-you" data-testid="crew-you">{t('crew.you')}</span> : null}
            </span>
            <span className="crew-row-role">{localized(profile.role, lang)} · {profile.code}</span>
          </span>
          <span className="crew-row-health">
            <StatusTag status={health.status} className="crew-row-status" />
            <TileLine health={health} loading={loading} habitat={habitat} profile={profile} />
          </span>
          <span className="crew-glyph crew-row-open" aria-hidden="true">›</span>
        </span>
      </button>
    </li>
  );
}

/**
 * CREW screen: the crew as a list of big rows (photo, name, role · code, one status, one short line),
 * ROSTER_ROWS at once, stepped with the ▲ / ▼ blocks on the right.
 * A tap opens the person view (src/crew/CrewPerson.jsx) as a sub-view with a big ‹ BACK.
 * props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }
 */
export default function CrewScreen({ mother, session, setViewedCode, navigate, route }) {
  const { t } = useI18n();
  const { data: habitat } = useHabitat({ sol: null }); // the overview is always the latest sol

  // Live (or last known) overview; without a link the built-in demo records.
  const live = Array.isArray(mother?.overview) ? mother.overview : null;
  const overview = useMemo(() => live ?? (mother?.online ? null : demoOverview()), [live, mother?.online]);
  // Each person's own report (fast) wins; the overview fills in while a report is missing.
  const { reports, loading: reportsLoading } = useRosterReports(ROSTER.map(profile => profile.code), { mode: mother?.mode });
  const health = Object.fromEntries(ROSTER.map(profile => [profile.code, crewHealth({ code: profile.code, report: reports[profile.code] ?? null, overview })]));
  const members = Object.values(health);

  const anyReport = Object.values(reports).some(Boolean);
  // Veil until the first data about anyone has arrived (later 30 s refreshes never show it).
  const firstLoad = members.every(item => item.source === 'none') && (reportsLoading || mother?.mode === 'connecting');
  const metaText = !mother?.online && overview ? t('crew.noLink') : live || anyReport ? t('crew.asOfLatest') : t('common.loading');
  const counts = { alert: 0, caution: 0 };
  for (const item of members) if (item.status in counts) counts[item.status] += 1;

  // ROSTER_ROWS rows at once; more crew -> stepped one row at a time by the up / down blocks.
  const [first, setFirst] = useState(0);
  const lastFirst = Math.max(0, ROSTER.length - ROSTER_ROWS);
  const start = Math.min(first, lastFirst);
  const shown = ROSTER.slice(start, start + ROSTER_ROWS);
  const paged = ROSTER.length > ROSTER_ROWS;

  // Person view inside the CREW screen. viewedCode follows it, so MOTHER loads that person's report;
  // going back returns to the logged-in member.
  const [personCode, setPersonCode] = useState(null);
  const openPerson = code => {
    setViewedCode(code);
    setPersonCode(code);
  };
  const closePerson = () => {
    setViewedCode(null);
    setPersonCode(null);
  };
  // navigate('crew', { open: 'HAB-C3' }) (e.g. a crew dot on the base map) opens that person
  const routeKey = route?.key;
  const routeOpen = route?.open;
  useEffect(() => {
    const person = getProfile(routeOpen);
    if (person) openPerson(person.code);
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <header className="crew-head">
        <NavIcon name="crew" className="crew-head-icon" />
        <h2 className="crew-head-title">{t('crew.rosterTitle')}</h2>
        {counts.alert ? <span className="crew-count crew-count-alert" data-testid="crew-count-alert"><StatusTag status="alert" /> {counts.alert}</span> : null}
        {counts.caution ? <span className="crew-count crew-count-caution" data-testid="crew-count-caution"><StatusTag status="caution" /> {counts.caution}</span> : null}
        <span className="crew-head-meta">{metaText}</span>
      </header>
      <div className="crew-roster-wrap">
        <ol className="crew-roster" aria-label={t('crew.rosterTitle')} start={start + 1} style={{ '--crew-rows': ROSTER_ROWS }}>
          {shown.map(profile => (
            <CrewRow
              key={profile.code}
              profile={profile}
              isYou={profile.code === session}
              health={health[profile.code]}
              loading={!overview && reportsLoading}
              habitat={habitat}
              onOpen={openPerson}
            />
          ))}
        </ol>
        {paged ? (
          <div className="crew-roster-pager">
            <button type="button" className="crew-roster-step" aria-label={t('crew.rosterUp')} disabled={start === 0} onClick={() => setFirst(Math.max(0, start - 1))}>
              <span className="crew-glyph" aria-hidden="true">{UI_GLYPH.up}</span>
            </button>
            <span className="crew-roster-pos" aria-hidden="true">{start + 1}–{Math.min(start + ROSTER_ROWS, ROSTER.length)}/{ROSTER.length}</span>
            <button type="button" className="crew-roster-step" aria-label={t('crew.rosterDown')} disabled={start >= lastFirst} onClick={() => setFirst(Math.min(lastFirst, start + 1))}>
              <span className="crew-glyph" aria-hidden="true">{UI_GLYPH.down}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

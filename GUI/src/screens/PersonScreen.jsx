import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { PixelAvatar, PixelIcon } from '../pixel/index.js';
import { Badge, StatusMark } from '../ui/index.js';
import BodyModel from '../body/BodyModel.jsx';
import { getProfile, localize } from '../data/crewProfiles.js';
import { useCrewReport } from '../home/useCrewReport.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { findLocation, zoneName } from '../crew/crewStatus.js';
import { segmentStatusFromReport, STATUS_RANK } from '../organSegments.js';
import { ORGANS, ORGAN_BY_ID, organsForSegment, siblingOrgans } from '../organs/catalog.js';
import { OrganPanel } from '../organs/OrganPanel.jsx';
import { knownStatus } from '../organs/rating.js';
import { SurgeonReportView } from '../organs/SurgeonReportView.jsx';
import './person.css';

// PERSON screen (GUI/DESIGN.md §4.2): one crew member.
//   header  back to CREW, portrait, name, callsign, role, status, sol, location, data badges,
//           flight-surgeon report button
//   left    body model (not rotating, organ colours, clickable segments) + the 10 organ buttons
//   right   organ panel of the selected organ (route.organ; default: the worst organ)
// No scrolling at any of the six target sizes: the panel pages / swaps its content instead.

/** Organ with the worst status (alert > caution > ok > no_data); ties keep the contract order. */
export function worstOrgan(statuses) {
  let best = ORGANS[0].id;
  let rank = -1;
  for (const organ of ORGANS) {
    const value = STATUS_RANK[statuses[organ.id]] ?? 0;
    if (value > rank) { best = organ.id; rank = value; }
  }
  return best;
}

/** Organ a click on a body segment selects: the worst of the organs on that segment, contract order on ties. */
export function organForSegment(segment, statuses) {
  const candidates = organsForSegment(segment);
  let pick = null;
  let rank = -1;
  for (const id of candidates) {
    const value = STATUS_RANK[statuses[id]] ?? 0;
    if (value > rank) { pick = id; rank = value; }
  }
  return pick;
}

export default function PersonScreen({ mother, route, navigate }) {
  const { t, lang } = useI18n();
  const code = route?.code ?? null;
  const profile = getProfile(code);
  const source = useCrewReport(mother, code);
  const { report } = source;
  const sol = report?.as_of?.sol ?? null;
  // Demo data never stamps real entries with the demo sol (the task list then matches by UTC day).
  const recordSol = source.demo ? null : sol;
  const { data: habitat } = useHabitat({ sol: source.kind === 'sol' && !source.demo ? sol : null });
  const location = findLocation(habitat, profile?.crewCode);
  const where = location ? zoneName(habitat, location.code) : zoneName(habitat, report?.subject?.home_zone ?? profile?.homeZone);
  const [reportOpen, setReportOpen] = useState(false);

  const statuses = useMemo(
    () => Object.fromEntries(ORGANS.map(organ => [organ.id, knownStatus((report?.organs || []).find(card => card.organ === organ.id)?.status)])),
    [report],
  );
  const segmentStatus = useMemo(() => segmentStatusFromReport(report), [report]);
  const organ = route?.organ && ORGAN_BY_ID[route.organ] ? route.organ : worstOrgan(statuses);
  const overall = report ? knownStatus(report.overall_status) : 'no_data';
  const synthetic = report?.subject?.data_kind === 'synthetic' || mother?.subject?.data_kind === 'synthetic';

  const selectOrgan = id => {
    setReportOpen(false);
    navigate?.({ ...route, screen: 'person', code, organ: id });
  };
  const onSegmentClick = segment => {
    const id = organForSegment(segment, statuses);
    if (id) selectOrgan(id);
  };

  const name = profile?.name ?? code ?? '—';

  return (
    <div className="person" data-testid="person-screen" data-code={code ?? ''}>
      <header className="person-head" data-status={overall}>
        <button type="button" className="person-back" onClick={() => navigate?.({ screen: 'crew' })} aria-label={t('person.backToCrew')}>
          <PixelIcon name="back" size={24} /> <span>{t('person.crew')}</span>
        </button>
        <PixelAvatar code={code} size={44} className="person-avatar" />
        <div className="person-id">
          <h1 className="person-name" title={name}>{name}</h1>
          <span className="person-sub">
            {profile?.callsign ? <span className="person-callsign">«{profile.callsign}»</span> : null}
            {profile ? <span className="person-role">{localize(profile.role, lang)}</span> : null}
          </span>
        </div>
        <StatusMark status={overall} size="lg" className="person-status" />
        <span className="person-chip person-sol" data-testid="person-sol">
          <PixelIcon name="clock" size={20} /> {sol != null ? t('person.solN', { n: sol }) : t('person.solUnknown')}
        </span>
        {where ? <span className="person-chip person-where" title={where}><PixelIcon name="base" size={20} /> <span>{where}</span></span> : null}
        <span className="person-badges">
          {synthetic ? <Badge kind="synthetic" /> : null}
          {source.demo ? <Badge kind="demo" /> : null}
        </span>
        <button
          type="button"
          className="person-report"
          aria-pressed={reportOpen}
          onClick={() => setReportOpen(open => !open)}
          title={t('person.reportHint')}
        >
          <PixelIcon name="satellite" size={28} /> <span>{t('person.report')}</span>
        </button>
      </header>

      <div className="person-body">
        <section className="person-left" aria-label={t('person.body')}>
          <div className="person-model">
            <BodyModel
              segmentStatus={segmentStatus}
              autoRotate={false}
              interactive
              selectedSegments={ORGAN_BY_ID[organ]?.segments || []}
              onSegmentClick={onSegmentClick}
              className="person-model-canvas"
              label={t('person.modelLabel', { name })}
            />
          </div>
          <nav className="person-organs" aria-label={t('person.organs')}>
            {ORGANS.map(item => (
              <button
                key={item.id}
                type="button"
                className="person-organ"
                data-organ={item.id}
                data-status={statuses[item.id]}
                aria-pressed={item.id === organ}
                aria-label={`${t(`organs.name_${item.id}`)}: ${t(`ui.status${{ ok: 'Ok', caution: 'Caution', alert: 'Alert', no_data: 'NoData' }[statuses[item.id]]}`)}`}
                title={t(`organs.name_${item.id}`)}
                onClick={() => selectOrgan(item.id)}
              >
                <PixelIcon name={item.icon} size={32} status={statuses[item.id]} />
              </button>
            ))}
          </nav>
        </section>

        <section className="person-right">
          {reportOpen ? (
            <SurgeonReportView profile={profile} code={code} report={report} sol={sol} mother={mother} onClose={() => setReportOpen(false)} />
          ) : (
            <OrganPanel
              key={`${code}-${organ}`}
              organ={organ}
              report={report}
              code={code}
              sol={sol}
              recordSol={recordSol}
              online={source.state === 'live' || source.state === 'stale'}
              siblings={siblingOrgans(organ)}
              statuses={statuses}
              onSelectOrgan={selectOrgan}
              navigate={navigate}
            />
          )}
        </section>
      </div>
    </div>
  );
}

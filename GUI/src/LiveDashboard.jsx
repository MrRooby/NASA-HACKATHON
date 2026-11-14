import React, { useEffect, useMemo, useRef, useState } from 'react';
import AstronautViewer from './AstronautViewer.jsx';
import { LIMB_SEGMENTS, ORGAN_ORDER, organsForSegment, segmentStatusFromReport, worstStatus } from './organSegments.js';
import { periodKind } from './useMother.js';

// Real data from MOTHER (GET /api/organs/{code}, GET /api/organs). Rendered only while
// the backend is reachable; offline the dashboard keeps the built-in demo view.

const STATUS_TEXT = { ok: 'OK', caution: 'CAUTION', alert: 'ALERT', no_data: 'NO DATA' };

const ORGAN_SHORT = {
  brain: 'Brain', eyes: 'Eyes', heart: 'Heart', lungs: 'Lungs', blood: 'Blood',
  kidneys: 'Kidneys', gut: 'Gut', musculoskeletal: 'Muscle/bone', limbs: 'Limbs', exposure: 'Exposure',
};

// Body regions offered as buttons next to the 3D model (keyboard / touch alternative to hovering).
const REGIONS = [
  { id: 'head', label: 'Head', segments: ['head'] },
  { id: 'chest', label: 'Chest', segments: ['chest'] },
  { id: 'abdomen', label: 'Abdomen', segments: ['abdomen'] },
  { id: 'pelvis', label: 'Pelvis', segments: ['pelvis'] },
  { id: 'left_arm', label: 'Left arm', segments: LIMB_SEGMENTS.left_arm },
  { id: 'right_arm', label: 'Right arm', segments: LIMB_SEGMENTS.right_arm },
  { id: 'left_leg', label: 'Left leg', segments: LIMB_SEGMENTS.left_leg },
  { id: 'right_leg', label: 'Right leg', segments: LIMB_SEGMENTS.right_leg },
];

const regionForSegment = segment =>
  REGIONS.find(region => region.segments.includes(segment)) || { id: segment, label: segment.replace(/_/g, ' '), segments: [segment] };

export function LiveStatusTag({ status }) {
  return <span className={`stag stag-${status}`}>{STATUS_TEXT[status] || String(status).toUpperCase()}</span>;
}

export function formatValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return value == null ? '—' : String(value);
}

function DataKindBadge({ kind }) {
  if (!kind) return null;
  if (kind === 'synthetic') return <span className="data-kind-badge data-kind-synthetic" title="Simulated data, not a real person">SYNTHETIC</span>;
  return <span className="data-kind-badge">{kind.replace(/_/g, ' ').toUpperCase()}</span>;
}

function PersonPicker({ subjects, selectedCode, onSelect }) {
  const groups = [
    ['habitat_crew', 'Mars habitat crew'],
    ['crew_health', 'Crew health records'],
  ];
  const other = subjects.filter(subject => !groups.some(([kind]) => kind === subject.kind));
  const option = subject => (
    <option key={subject.code} value={subject.code}>
      {subject.label}{subject.label !== subject.code ? ` (${subject.code})` : ''}{subject.synthetic ? ' · synthetic' : ''}
    </option>
  );
  return (
    <label className="live-field">
      <span className="live-field-label">Crew member</span>
      <select className="live-select" value={selectedCode || ''} onChange={event => onSelect(event.target.value)} aria-label="Crew member">
        {groups.map(([kind, label]) => {
          const members = subjects.filter(subject => subject.kind === kind);
          return members.length ? <optgroup key={kind} label={label}>{members.map(option)}</optgroup> : null;
        })}
        {other.map(option)}
      </select>
    </label>
  );
}

const SOL_MIN = 1;
const SOL_MAX = 600;

function PeriodControl({ kind, asOf, period, onChange, selectedCode }) {
  const label = kind === 'sol' ? 'Sol' : 'Flight day';
  const [draft, setDraft] = useState(asOf ?? '');
  const dirty = useRef(false);

  // Follow the backend's as_of whenever the user is not editing.
  useEffect(() => {
    dirty.current = false;
    setDraft(asOf ?? '');
  }, [asOf, selectedCode]);

  // Debounced commit, so dragging the slider does not fire one request per step.
  useEffect(() => {
    if (!dirty.current) return undefined;
    const value = Number(draft);
    if (draft === '' || !Number.isFinite(value) || value < 1) return undefined;
    const timer = setTimeout(() => {
      dirty.current = false;
      onChange({ [kind]: Math.round(value) });
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, kind, onChange]);

  const edit = value => {
    dirty.current = true;
    setDraft(value);
  };

  return (
    <div className="live-field live-period">
      <span className="live-field-label">{label}{period ? '' : ' · latest'}</span>
      <div className="live-period-row">
        {kind === 'sol' && (
          <input
            type="range"
            className="live-range"
            min={SOL_MIN}
            max={SOL_MAX}
            value={draft === '' ? SOL_MAX : draft}
            onChange={event => edit(event.target.value)}
            aria-label={`${label} slider`}
          />
        )}
        <input
          type="number"
          className="live-number"
          min={1}
          max={kind === 'sol' ? SOL_MAX : undefined}
          value={draft}
          onChange={event => edit(event.target.value)}
          aria-label={label}
        />
        <button type="button" className="live-latest" onClick={() => onChange(null)} disabled={!period}>Latest</button>
      </div>
    </div>
  );
}

function OrganCard({ card, highlighted }) {
  const [showWhy, setShowWhy] = useState(false);
  const metrics = (card.metrics || []).slice(0, 3);
  return (
    <article className={`organ-card organ-${card.status}${highlighted ? ' organ-card-highlight' : ''}`} data-organ={card.organ}>
      <div className="organ-card-top">
        <span className="organ-dot" aria-hidden />
        <h3>{card.label}</h3>
        <LiveStatusTag status={card.status} />
      </div>
      <p className="organ-headline">{card.headline}</p>
      {metrics.length > 0 && (
        <ul className="organ-metrics">
          {metrics.map(metric => (
            <li key={metric.name} className={`organ-metric metric-${metric.status}`}>
              <span className="organ-metric-name">{metric.name}</span>
              <strong>{formatValue(metric.value)}</strong>
              <small>{metric.unit}</small>
            </li>
          ))}
        </ul>
      )}
      {card.status !== 'ok' && card.action && (
        <div className="organ-action"><span>What to do</span>{card.action}</div>
      )}
      {card.why && (
        <>
          <button type="button" className="organ-why-toggle" aria-expanded={showWhy} onClick={() => setShowWhy(open => !open)}>
            {showWhy ? 'Hide why' : 'Why?'}
          </button>
          {showWhy && <p className="organ-why">{card.why}</p>}
        </>
      )}
    </article>
  );
}

function DeviceAlerts({ devices }) {
  const problems = (devices || []).filter(device => device.status && device.status !== 'ok');
  if (problems.length === 0) return null;
  return (
    <section className="data-panel live-devices">
      <div className="panel-header"><span className="panel-title">WEARABLE SENSORS</span><span className="panel-meta">{problems.length} NEED ATTENTION</span></div>
      <ul>
        {problems.map(device => (
          <li key={device.limb} className={`live-device device-${device.status}`}>
            <LiveStatusTag status={device.status} />
            <strong>{device.limb.replace(/_/g, ' ')}</strong>
            <span>{device.message || device.state}</span>
            {device.battery_pct != null && <small>battery {Math.round(device.battery_pct)}%</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CrewOverview({ overview, selectedCode, onSelect }) {
  if (!Array.isArray(overview) || overview.length === 0) return null;
  return (
    <section className="data-panel crew-overview">
      <div className="panel-header"><span className="panel-title">WHOLE CREW</span><span className="panel-meta">{overview.length} PEOPLE · CLICK A ROW TO OPEN</span></div>
      <div className="crew-table-wrap">
        <table className="crew-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Overall</th>
              {ORGAN_ORDER.map(organ => <th key={organ} className="crew-organ-head">{ORGAN_SHORT[organ]}</th>)}
            </tr>
          </thead>
          <tbody>
            {overview.map(row => (
              <tr key={row.subject.code} className={`crew-row${row.subject.code === selectedCode ? ' crew-row-selected' : ''}`} data-code={row.subject.code}>
                <td>
                  <button type="button" className="crew-pick" onClick={() => onSelect(row.subject.code)} title={row.top_message}>
                    {row.subject.code}
                  </button>
                  {row.subject.data_kind === 'synthetic' && <span className="crew-syn">SYN</span>}
                </td>
                <td><LiveStatusTag status={row.overall_status} /></td>
                {ORGAN_ORDER.map(organ => {
                  const status = row.organs?.[organ] ?? 'no_data';
                  return (
                    <td key={organ} className="crew-cell">
                      <span className={`crew-dot crew-${status}`} title={`${ORGAN_SHORT[organ]}: ${STATUS_TEXT[status] || status}`} aria-label={`${ORGAN_SHORT[organ]} ${STATUS_TEXT[status] || status}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RegionPanel({ region, report, segmentStatus }) {
  if (!region) {
    return (
      <div className="region-panel region-panel-empty">
        <span className="eyebrow">BODY MAP</span>
        <p>Hover or click a body part on the model (or pick a region) to see what MOTHER found there.</p>
      </div>
    );
  }
  const cards = [];
  for (const segment of region.segments) {
    for (const card of organsForSegment(report, segment)) if (!cards.includes(card)) cards.push(card);
  }
  const status = worstStatus(region.segments.map(segment => segmentStatus?.[segment]).filter(Boolean)) || 'no_data';
  return (
    <div className={`region-panel region-${status}`}>
      <div className="region-panel-title"><span className={`body-status-dot body-zone-${status}`} />{region.label}</div>
      {cards.length === 0
        ? <p className="region-empty">No organ card is linked to this part.</p>
        : cards.map(card => (
          <div className="region-organ" key={card.organ}>
            <div className="region-organ-top"><strong>{card.label}</strong><LiveStatusTag status={card.status} /></div>
            <p>{card.headline}</p>
          </div>
        ))}
    </div>
  );
}

export default function LiveDashboard({ mother }) {
  const { report, subject, subjects, selectedCode, selectSubject, period, setPeriod, overview, loadingReport, reportError, lastUpdated } = mother;
  const [hoverSegment, setHoverSegment] = useState(null);
  const [pinnedRegion, setPinnedRegion] = useState(null);

  useEffect(() => { setPinnedRegion(null); setHoverSegment(null); }, [selectedCode]);

  const segmentStatus = useMemo(() => (report ? segmentStatusFromReport(report) : undefined), [report]);
  const kind = periodKind(subject);
  const asOf = report?.as_of?.[kind] ?? report?.as_of?.sol ?? report?.as_of?.day ?? null;
  const reportSubject = report?.subject || subject || {};
  const dataKind = reportSubject.data_kind || subject?.data_kind;
  const exposure = report?.organs?.find(card => card.organ === 'exposure');
  const activeRegion = hoverSegment ? regionForSegment(hoverSegment) : pinnedRegion;
  const activeOrgans = new Set(
    activeRegion ? activeRegion.segments.flatMap(segment => organsForSegment(report, segment).map(card => card.organ)) : [],
  );

  return (
    <div className="health-overview live-overview">
      <section className="data-panel live-toolbar">
        <PersonPicker subjects={subjects} selectedCode={selectedCode} onSelect={selectSubject} />
        <PeriodControl kind={kind} asOf={asOf} period={period} onChange={setPeriod} selectedCode={selectedCode} />
        <div className="live-toolbar-meta">
          {loadingReport ? <span className="live-loading">Updating…</span> : lastUpdated && <span>Updated {lastUpdated.toISOString().slice(11, 19)} UTC</span>}
          <span>Refreshes every 30 s</span>
        </div>
      </section>

      {reportError && (
        <div className="live-error" role="alert">
          <strong>{reportError.status === 404 ? 'Unknown person' : 'Could not load this person'}</strong>
          <span>{reportError.message}{reportError.hint ? ` · ${reportError.hint}` : ''}</span>
        </div>
      )}

      {!report && !reportError && <div className="live-placeholder">Loading organ report from MOTHER…</div>}

      {report && (
        <>
          <section className={`live-statusbar live-statusbar-${report.overall_status}`} aria-label="Overall status">
            <div className="live-statusbar-main">
              <LiveStatusTag status={report.overall_status} />
              <p className="live-top-message">{report.top_message}</p>
            </div>
            <div className="live-statusbar-meta">
              <span className="live-person">{reportSubject.label || selectedCode}</span>
              {reportSubject.mission && <span>{reportSubject.mission}</span>}
              {asOf != null && <span>{kind === 'sol' ? 'SOL' : 'DAY'} {asOf}</span>}
              {reportSubject.home_zone && <span>Zone {reportSubject.home_zone.replace(/_/g, ' ')}</span>}
              <DataKindBadge kind={dataKind} />
            </div>
          </section>

          <section className="body-dashboard data-panel">
            <div className="panel-header">
              <span className="panel-title">BODY MAP</span>
              <span className="panel-meta">LIVE · MOTHER</span>
            </div>
            <div className="live-body-stage">
              <div className="front-body live-front-body">
                <AstronautViewer
                  frontView
                  segmentStatus={segmentStatus}
                  onSegmentHover={setHoverSegment}
                  onSegmentClick={segment => setPinnedRegion(regionForSegment(segment))}
                />
              </div>
              <div className="live-body-side">
                {exposure && (
                  <div className={`env-badge env-${exposure.status}`} title={exposure.why || ''}>
                    <span className="env-badge-label">Environment</span>
                    <LiveStatusTag status={exposure.status} />
                    <p>{exposure.headline}</p>
                  </div>
                )}
                <div className="region-chips" role="group" aria-label="Body regions">
                  {REGIONS.map(region => {
                    const status = worstStatus(region.segments.map(segment => segmentStatus?.[segment]).filter(Boolean)) || 'no_data';
                    return (
                      <button
                        type="button"
                        key={region.id}
                        className={`region-chip region-chip-${status}${pinnedRegion?.id === region.id ? ' selected' : ''}`}
                        aria-pressed={pinnedRegion?.id === region.id}
                        onClick={() => setPinnedRegion(current => (current?.id === region.id ? null : region))}
                      >
                        <span className={`body-status-dot body-zone-${status}`} />{region.label}
                      </button>
                    );
                  })}
                </div>
                <RegionPanel region={activeRegion} report={report} segmentStatus={segmentStatus} />
              </div>
            </div>
            <div className="body-legend">
              <span><i className="legend-dot legend-ok" /> OK</span>
              <span><i className="legend-dot legend-caution" /> Caution</span>
              <span><i className="legend-dot legend-alert" /> Alert</span>
              <span><i className="legend-dot legend-no_data" /> No data</span>
              <span>Educational demo, not medical advice</span>
            </div>
          </section>

          <DeviceAlerts devices={report.devices} />

          <section className="data-panel organ-panel">
            <div className="panel-header"><span className="panel-title">ORGAN CARDS</span><span className="panel-meta">10 SYSTEMS · SCHEMA {report.schema_version || '—'}</span></div>
            <div className="organ-grid">
              {(report.organs || []).map(card => <OrganCard key={card.organ} card={card} highlighted={activeOrgans.has(card.organ)} />)}
            </div>
          </section>
        </>
      )}

      <CrewOverview overview={overview} selectedCode={selectedCode} onSelect={selectSubject} />
    </div>
  );
}

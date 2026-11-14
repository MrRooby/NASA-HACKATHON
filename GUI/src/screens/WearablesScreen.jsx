import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AstronautViewer from '../AstronautViewer.jsx';
import { Badge, Button, DataRow, Panel, SegBar, SolControl, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { LIMB_SEGMENTS, ORGAN_SEGMENTS, organsForSegment, segmentStatusFromReport, worstStatus } from '../organSegments.js';
import LimbCard from '../home/LimbCard.jsx';
import OrganCard from '../home/OrganCard.jsx';
import TelemetryNotice from '../home/TelemetryNotice.jsx';
import { clearPendingFocus, peekPendingFocus } from '../home/focus.js';
import { formatValue, words } from '../home/format.js';
import { limbsFromReport } from '../home/limbData.js';
import { useCrewReport } from '../home/useCrewReport.js';
import './wearables.css';

export const SOL_MAX = 600;
const DAY_MAX = 400;

// Body regions offered as text chips (keyboard / touch alternative to the 3D model).
// Left / right are the astronaut's own sides, as in MOTHER.
export const REGIONS = [
  { id: 'head', labelKey: 'wearables.regionHead', segments: ['head'] },
  { id: 'chest', labelKey: 'wearables.regionChest', segments: ['chest'] },
  { id: 'abdomen', labelKey: 'wearables.regionAbdomen', segments: ['abdomen'] },
  { id: 'pelvis', labelKey: 'wearables.regionPelvis', segments: ['pelvis'] },
  { id: 'left_arm', labelKey: 'wearables.regionLeftArm', segments: LIMB_SEGMENTS.left_arm },
  { id: 'right_arm', labelKey: 'wearables.regionRightArm', segments: LIMB_SEGMENTS.right_arm },
  { id: 'left_leg', labelKey: 'wearables.regionLeftLeg', segments: LIMB_SEGMENTS.left_leg },
  { id: 'right_leg', labelKey: 'wearables.regionRightLeg', segments: LIMB_SEGMENTS.right_leg },
];

const DEVICE_LABEL_KEYS = {
  left_arm: 'wearables.deviceLeftArm',
  right_arm: 'wearables.deviceRightArm',
  left_leg: 'wearables.deviceLeftLeg',
  right_leg: 'wearables.deviceRightLeg',
  head_eeg: 'wearables.deviceHead',
};

/** Region of a model segment; a segment outside every region (neck) is its own region. */
export function regionForSegment(segment) {
  if (!segment) return null;
  return REGIONS.find(region => region.segments.includes(segment))
    || { id: segment, label: words(segment), segments: [segment] };
}

const regionById = id => REGIONS.find(region => region.id === id) || null;

/** Region to open first for a notification target ({ organ, limb } or { device }). */
export function regionForTarget(target) {
  if (!target) return null;
  if (target.limb && regionById(target.limb)) return regionById(target.limb);
  if (target.device) return target.device === 'head_eeg' ? regionById('head') : regionById(target.device);
  const segment = (ORGAN_SEGMENTS[target.organ] || [])[0];
  return segment ? regionForSegment(segment) : null;
}

/** Organ cards mapped to any segment of a region, in report order, without repeats. */
export function organsForRegion(report, region) {
  if (!region) return [];
  const cards = [];
  for (const segment of region.segments) {
    for (const card of organsForSegment(report, segment)) if (!cards.includes(card)) cards.push(card);
  }
  return cards;
}

const isProblem = status => status === 'caution' || status === 'alert';

function DeviceList({ devices }) {
  const t = useT();
  const list = Array.isArray(devices) ? devices.filter(device => device?.limb) : [];
  if (list.length === 0) return <p className="wear-empty">{t('wearables.devicesNone')}</p>;
  // Bands that need attention first; otherwise the order MOTHER sent.
  const sorted = [...list].sort((a, b) => Number(b.status !== 'ok') - Number(a.status !== 'ok'));
  return (
    <ul className="wear-devices">
      {sorted.map(device => {
        const battery = typeof device.battery_pct === 'number' ? Math.round(device.battery_pct) : null;
        const name = DEVICE_LABEL_KEYS[device.limb] ? t(DEVICE_LABEL_KEYS[device.limb]) : words(device.limb);
        return (
          <li key={device.limb} className={cx('wear-device', `wear-device-${device.status ?? 'no_data'}`)} data-device={device.limb} data-status={device.status ?? 'no_data'}>
            <span className="wear-device-name">{name}</span>
            <span className="wear-device-state">{words(device.state) || '—'}</span>
            <span className="wear-device-battery">
              <SegBar value={battery} max={100} status={device.status} segments={10} label={`${t('wearables.battery')}: ${name}`} />
              <span className="wear-device-pct">{battery != null ? `${battery} %` : '—'}</span>
            </span>
            <StatusTag status={device.status} />
            {device.message ? <span className="wear-device-msg">{device.message}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Wearables: the full body scan of one crew member. Header strip, sol control, the 3D
 * astronaut tinted by organ status with region chips, the environment (exposure) card,
 * the ten organ cards and the list of wearable bands.
 * Props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }.
 * Sol: SolControl <-> mother.period / mother.setPeriod({ sol }) (flight day for non-habitat people).
 */
export default function WearablesScreen({ mother, session, viewedCode, navigate, profile }) {
  const t = useT();
  const source = useCrewReport(mother, viewedCode);
  const { report, kind, asOf } = source;

  const [hoverSegment, setHoverSegment] = useState(null);
  // Region pinned by a click; a notification opened on the home screen pre-selects one.
  const [pinned, setPinned] = useState(() => regionForTarget(peekPendingFocus()));
  useEffect(() => { clearPendingFocus(); }, []);

  // Another person: forget the selection (not on the first render, which may carry a hand-over).
  const [personOfSelection, setPersonOfSelection] = useState(viewedCode);
  if (personOfSelection !== viewedCode) {
    setPersonOfSelection(viewedCode);
    setPinned(null);
    setHoverSegment(null);
  }

  const segmentStatus = useMemo(() => (report ? segmentStatusFromReport(report) : undefined), [report]);
  const { limbs } = useMemo(() => limbsFromReport(report), [report]);
  const organs = report?.organs || [];
  const exposure = organs.find(card => card.organ === 'exposure') || null;

  const regionStatus = useCallback(
    region => worstStatus(region.segments.map(segment => segmentStatus?.[segment]).filter(Boolean)) || 'no_data',
    [segmentStatus],
  );
  const regionLabel = region => (region.labelKey ? t(region.labelKey) : region.label);

  const hoverRegion = regionForSegment(hoverSegment);
  const activeRegion = hoverRegion || pinned;
  const activeCards = organsForRegion(report, activeRegion);
  const pinnedCards = organsForRegion(report, pinned);
  const visibleCards = pinned ? pinnedCards : organs;
  const highlighted = new Set(hoverRegion ? organsForRegion(report, hoverRegion).map(card => card.organ) : []);
  const activeLimb = activeRegion && LIMB_SEGMENTS[activeRegion.id] ? limbs.find(item => item.limb === activeRegion.id) : null;

  const togglePin = useCallback(region => {
    setPinned(current => (!region || current?.id === region.id ? null : region));
  }, []);

  const subject = report?.subject;
  const name = profile?.name || subject?.label || viewedCode || '—';
  const overall = report?.overall_status ?? 'no_data';
  const badgeKind = source.demo ? 'demo' : subject?.data_kind === 'synthetic' ? 'synthetic' : null;
  const periodLabel = kind === 'sol' ? t('common.sol') : t('wearables.flightDay');
  const linked = source.mode === 'online';
  const devices = report?.devices;
  const badDevices = (devices || []).filter(device => device?.status && device.status !== 'ok').length;

  return (
    <div className="wearables-screen">
      {session && viewedCode && viewedCode !== session ? (
        <p className="wear-readonly" role="note" data-testid="read-only-banner">
          {t('wearables.readOnly', { name: String(name).toUpperCase() })}
        </p>
      ) : null}

      <TelemetryNotice source={source} code={viewedCode} />

      <Panel
        className="wear-header"
        title={t('wearables.scanPanel')}
        tone={isProblem(overall) ? overall : 'default'}
        meta={badgeKind ? <Badge kind={badgeKind} /> : null}
      >
        <dl className="wear-id">
          <div><dt>{t('wearables.crew')}</dt><dd>{name}{profile?.callsign ? <span className="wear-callsign"> «{profile.callsign}»</span> : null}{viewedCode ? <span className="dim"> · {viewedCode}</span> : null}</dd></div>
          <div><dt>{t('wearables.mission')}</dt><dd>{subject?.mission || '—'}</dd></div>
          <div><dt>{periodLabel}</dt><dd data-testid="wear-sol">{asOf ?? '—'}</dd></div>
          <div><dt>{t('wearables.zone')}</dt><dd>{words(subject?.home_zone || profile?.homeZone) || '—'}</dd></div>
        </dl>

        <div className={cx('wear-status', `wear-status-${overall}`)} data-status={overall}>
          <span className="label">{t('wearables.overall')}</span>
          <StatusTag status={overall} />
          <span className="wear-top-message">{report?.top_message ?? '—'}</span>
        </div>

        <div className="wear-controls">
          {linked ? (
            <SolControl
              value={mother?.period?.[kind] ?? null}
              latest={asOf ?? undefined}
              max={kind === 'sol' ? SOL_MAX : DAY_MAX}
              label={periodLabel}
              onChange={next => mother?.setPeriod?.(next == null ? null : { [kind]: next })}
            />
          ) : (
            <span className="wear-sol-fixed">{periodLabel} {asOf ?? '—'} · {t('wearables.solFixed')}</span>
          )}
          {linked && mother?.loadingReport ? <span className="wear-updating" role="status">{t('wearables.updating')}</span> : null}
          <span className="spacer" />
          <Button onClick={() => navigate?.('home')}>{t('common.back')}</Button>
        </div>
      </Panel>

      <div className="wear-main">
        <Panel className="wear-map" title={t('wearables.bodyMap')} meta={t('wearables.bodyMapMeta')}>
          <div className="wear-figure">
            <AstronautViewer
              segmentStatus={segmentStatus}
              onSegmentHover={setHoverSegment}
              onSegmentClick={segment => togglePin(regionForSegment(segment))}
            />
          </div>

          <div className="wear-chips" role="group" aria-label={t('wearables.regions')}>
            <Button small active={!pinned} aria-pressed={!pinned} onClick={() => setPinned(null)}>{t('wearables.regionAll')}</Button>
            {REGIONS.map(region => {
              const status = regionStatus(region);
              const selected = pinned?.id === region.id;
              return (
                <Button
                  key={region.id}
                  small
                  className={cx('wear-chip', `wear-chip-${status}`)}
                  active={selected}
                  aria-pressed={selected}
                  data-region={region.id}
                  data-status={status}
                  onClick={() => togglePin(region)}
                >
                  {regionLabel(region)}
                </Button>
              );
            })}
          </div>

          <div className="wear-region" data-region={activeRegion?.id ?? ''} aria-live="polite">
            {activeRegion ? (
              <>
                <div className="wear-region-head">
                  <span className="label">{t('wearables.region')}</span>
                  <strong className="wear-region-name">{regionLabel(activeRegion)}</strong>
                  <StatusTag status={regionStatus(activeRegion)} />
                </div>
                {activeCards.length === 0
                  ? <p className="dim">{t('wearables.regionNone')}</p>
                  : (
                    <ul className="wear-region-organs">
                      {activeCards.map(card => (
                        <li key={card.organ} data-organ={card.organ}>
                          <StatusTag status={card.status} /> <strong>{card.label}</strong>
                          <span className="wear-region-headline"> · {card.headline}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </>
            ) : <p className="dim">{t('wearables.regionHint')}</p>}
          </div>
        </Panel>

        <div className="wear-side">
          {activeLimb ? <LimbCard data={activeLimb} className="wear-limb" /> : null}

          <Panel
            className="wear-env"
            title={t('wearables.environment')}
            tone={isProblem(exposure?.status) ? exposure.status : 'default'}
            meta={exposure ? <StatusTag status={exposure.status} /> : null}
            data-organ="exposure"
          >
            {exposure ? (
              <>
                <p className="wear-env-headline">{exposure.headline}</p>
                {(exposure.metrics || []).slice(0, 3).map(metric => (
                  <DataRow
                    key={metric.name}
                    label={metric.name}
                    value={formatValue(metric.value)}
                    unit={metric.unit}
                    status={metric.status && metric.status !== 'ok' ? metric.status : undefined}
                  />
                ))}
                {exposure.status !== 'ok' && exposure.action
                  ? <p className="organ-action"><span className="organ-prompt" aria-hidden="true">&gt; </span>{exposure.action}</p>
                  : null}
              </>
            ) : <p className="wear-empty">{t('wearables.environmentNone')}</p>}
          </Panel>

          <Panel
            className="wear-devices-panel"
            title={t('wearables.devices')}
            tone={badDevices ? 'caution' : 'default'}
            meta={devices?.length
              ? (badDevices
                ? t('wearables.devicesAttention', { n: devices.length, bad: badDevices })
                : t('wearables.devicesOk', { n: devices.length }))
              : null}
          >
            <DeviceList devices={devices} />
          </Panel>
        </div>
      </div>

      <Panel
        className="wear-organs"
        title={t('wearables.organs')}
        meta={(
          <span className="wear-organs-meta">
            <span data-testid="organ-count">
              {pinned
                ? t('wearables.organsFiltered', { n: visibleCards.length, total: organs.length, region: regionLabel(pinned) })
                : t('wearables.organsMeta', { n: organs.length, schema: report?.schema_version || '—' })}
            </span>
            {pinned ? <Button small onClick={() => setPinned(null)}>{t('wearables.showAll')}</Button> : null}
          </span>
        )}
      >
        {visibleCards.length === 0 ? (
          <p className="wear-empty">{organs.length === 0 ? t('wearables.organsNone') : t('wearables.regionNone')}</p>
        ) : (
          <div className="wear-organ-grid">
            {visibleCards.map(card => <OrganCard key={card.organ} card={card} highlighted={highlighted.has(card.organ)} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

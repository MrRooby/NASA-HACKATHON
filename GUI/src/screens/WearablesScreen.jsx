import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AstronautViewer from '../AstronautViewer.jsx';
import { SegBar, SolControl, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { LIMB_SEGMENTS, ORGAN_SEGMENTS, organsForSegment, segmentStatusFromReport, worstStatus } from '../organSegments.js';
import DataDialog, { Pager, popupPageSize } from '../home/DataDialog.jsx';
import LimbCard from '../home/LimbCard.jsx';
import TelemetryNotice from '../home/TelemetryNotice.jsx';
import { clearPendingFocus, peekPendingFocus } from '../home/focus.js';
import { formatValue, words } from '../home/format.js';
import { limbsFromReport } from '../home/limbData.js';
import { useCrewReport } from '../home/useCrewReport.js';
import './wearables.css';

export const SOL_MAX = 600;
const DAY_MAX = 400;
const CHECKS_PER_PAGE = popupPageSize(6, 4);

// Body regions of the 3D model. Left / right are the astronaut's own sides, as in MOTHER.
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

// Closest NavIcon for each organ card (no eye / blood / bone / kidney glyphs yet).
const ORGAN_ICONS = {
  brain: 'brain',
  eyes: 'eye',
  heart: 'heart',
  lungs: 'lungs',
  blood: 'blood',
  kidneys: 'kidneys',
  gut: 'stomach',
  musculoskeletal: 'bone',
  limbs: 'leg',
  exposure: 'radiation',
};

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

/** Popup to open for a notification handed over from the home screen. */
export function dialogForTarget(target) {
  if (!target) return null;
  if (target.limb && regionById(target.limb)) return { kind: 'region', region: regionById(target.limb) };
  if (target.device) return { kind: 'bands' };
  if (target.organ) return { kind: 'organ', organ: target.organ };
  return null;
}

/** The metric shown big on an organ tile: the first one with the card's status, else the first. */
function leadMetric(card) {
  const metrics = card.metrics || [];
  return metrics.find(metric => metric.status === card.status) || metrics[0] || null;
}


/** Right column: one big tile per organ card. */
function OrganTile({ card, highlighted, onOpen }) {
  const t = useT();
  const status = card.status ?? 'no_data';
  const metric = leadMetric(card);
  const value = metric ? formatValue(metric.value) : null;
  return (
    <button
      type="button"
      className={cx('wear-tile', `wear-tile-${status}`, highlighted && 'is-highlight')}
      data-organ={card.organ}
      data-status={status}
      aria-label={`${t('common.open')}: ${card.label}`}
      onClick={() => onOpen(card.organ)}
    >
      <span className="wear-tile-head">
        <NavIcon name={ORGAN_ICONS[card.organ] || 'organs'} className="wear-tile-icon" />
        <span className="wear-tile-name">{card.label}</span>
        <StatusTag status={status} />
      </span>
      {value != null ? (
        <>
          <span className="wear-tile-value">
            {value}
            {metric.unit ? <span className="wear-tile-unit">{metric.unit}</span> : null}
          </span>
          <span className="wear-tile-metric">{metric.name}</span>
        </>
      ) : <span className="wear-tile-headline">{card.headline || '—'}</span>}
    </button>
  );
}

/** Popup body of one organ card: headline, action, its checks (paged) and the rule behind it. */
function OrganBody({ card }) {
  const t = useT();
  const [page, setPage] = useState(0);
  const status = card.status ?? 'no_data';
  const checks = Array.isArray(card.checks) && card.checks.length
    ? card.checks
    : (card.metrics || []).map(metric => ({ label: metric.name, value: metric.value, unit: metric.unit, status: metric.status }));
  const pages = Math.max(1, Math.ceil(checks.length / CHECKS_PER_PAGE));
  const safe = Math.min(page, pages - 1);
  const slice = checks.slice(safe * CHECKS_PER_PAGE, safe * CHECKS_PER_PAGE + CHECKS_PER_PAGE);
  return (
    <div className="wear-dlg" data-organ={card.organ}>
      <p className="wear-dlg-headline">{card.headline}</p>
      {status !== 'ok' && card.action ? (
        <p className="wear-dlg-action"><span aria-hidden="true">&gt; </span>{card.action}</p>
      ) : null}
      {checks.length ? (
        <ul className="wear-checks" aria-label={t('wearables.checks')}>
          {slice.map(check => (
            <li key={check.code || check.label} className={cx('wear-check', `wear-check-${check.status ?? 'no_data'}`)} data-status={check.status ?? 'no_data'}>
              <span className="wear-check-label">{check.label}</span>
              <span className="wear-check-value">
                {formatValue(check.value) ?? '—'}
                {check.unit ? <span className="wear-check-unit">{check.unit}</span> : null}
              </span>
              <StatusTag status={check.status} />
              {check.message ? <span className="wear-check-msg">{check.message}</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className="wear-empty">{t('wearables.checksNone')}</p>}
      <Pager page={safe} pages={pages} onPage={setPage} />
      {card.why ? (
        <p className="wear-dlg-why"><span className="label">{t('wearables.why')}</span> {card.why}</p>
      ) : null}
    </div>
  );
}

/** Popup body of a body region: the limb band (arms / legs) and the organs mapped there. */
function RegionBody({ cards, limb, onOpen }) {
  const t = useT();
  return (
    <div className={cx('wear-region-dlg', limb && 'has-limb')}>
      {limb ? <LimbCard data={limb} className="wear-limb" /> : null}
      {cards.length === 0
        ? <p className="wear-empty">{t('wearables.regionNone')}</p>
        : (
          <div className="wear-region-tiles">
            {cards.map(card => <OrganTile key={card.organ} card={card} onOpen={onOpen} />)}
          </div>
        )}
    </div>
  );
}

/** Popup body: every wearable band with state and battery; bands that need attention first. */
function BandsBody({ devices }) {
  const t = useT();
  const list = Array.isArray(devices) ? devices.filter(device => device?.limb) : [];
  if (list.length === 0) return <p className="wear-empty">{t('wearables.devicesNone')}</p>;
  const sorted = [...list].sort((a, b) => Number(b.status !== 'ok') - Number(a.status !== 'ok'));
  return (
    <ul className="wear-devices" aria-label={t('wearables.devices')}>
      {sorted.map(device => {
        const status = device.status ?? 'no_data';
        const battery = typeof device.battery_pct === 'number' ? Math.round(device.battery_pct) : null;
        const name = DEVICE_LABEL_KEYS[device.limb] ? t(DEVICE_LABEL_KEYS[device.limb]) : words(device.limb);
        return (
          <li key={device.limb} className={cx('wear-device', `wear-device-${status}`)} data-device={device.limb} data-status={status}>
            <span className="wear-device-name">{name}</span>
            <span className="wear-device-state">{words(device.state) || '—'}</span>
            <SegBar value={battery} max={100} status={device.status} segments={10} label={`${t('wearables.battery')}: ${name}`} />
            <span className="wear-device-pct">{battery != null ? `${battery} %` : '—'}</span>
            <StatusTag status={status} />
            {device.message ? <span className="wear-device-msg">{device.message}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Wearables: the full body scan of one crew member, one screen, no scrolling.
 *   header — ‹ BACK, name + overall status, sol control, ENVIRONMENT and BANDS buttons;
 *   left   — the interactive 3D astronaut tinted by organ status (tap a part → popup);
 *   right  — ten organ tiles (tap → popup with checks, action and why).
 * Props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }.
 * Sol: SolControl <-> mother.period / mother.setPeriod({ sol }) (flight day for non-habitat people).
 */
export default function WearablesScreen({ mother, session, viewedCode, navigate, profile }) {
  const t = useT();
  const source = useCrewReport(mother, viewedCode);
  const { report, kind, asOf } = source;

  const [hoverSegment, setHoverSegment] = useState(null);
  // Open popup; a notification opened on the home screen pre-selects one.
  const [dialog, setDialog] = useState(() => dialogForTarget(peekPendingFocus()));
  useEffect(() => { clearPendingFocus(); }, []);
  const close = useCallback(() => setDialog(null), []);

  // Another person: close the popup (not on the first render, which may carry a hand-over).
  const [personOfDialog, setPersonOfDialog] = useState(viewedCode);
  if (personOfDialog !== viewedCode) {
    setPersonOfDialog(viewedCode);
    setDialog(null);
    setHoverSegment(null);
  }

  const segmentStatus = useMemo(() => (report ? segmentStatusFromReport(report) : undefined), [report]);
  const { limbs } = useMemo(() => limbsFromReport(report), [report]);
  const organs = Array.isArray(report?.organs) ? report.organs : [];
  const exposure = organs.find(card => card.organ === 'exposure') || null;
  const devices = Array.isArray(report?.devices) ? report.devices : [];
  const badDevices = devices.filter(device => device?.status && device.status !== 'ok');
  const bandsStatus = devices.length ? worstStatus(devices.map(device => device.status ?? 'no_data')) : 'no_data';

  const regionLabel = region => (region.labelKey ? t(region.labelKey) : region.label);
  const regionStatus = region => worstStatus(region.segments.map(segment => segmentStatus?.[segment]).filter(Boolean)) || 'no_data';
  const hoverRegion = regionForSegment(hoverSegment);
  const highlighted = new Set(organsForRegion(report, hoverRegion).map(card => card.organ));

  const openOrgan = useCallback(organ => setDialog({ kind: 'organ', organ }), []);
  const openSegment = useCallback(segment => {
    const region = regionForSegment(segment);
    if (!region) return;
    const cards = organsForRegion(report, region);
    if (!LIMB_SEGMENTS[region.id] && cards.length === 1) setDialog({ kind: 'organ', organ: cards[0].organ });
    else setDialog({ kind: 'region', region });
  }, [report]);

  const subject = report?.subject;
  const name = profile?.name || subject?.label || viewedCode || '—';
  const overall = report?.overall_status ?? 'no_data';
  const periodLabel = kind === 'sol' ? t('common.sol') : t('wearables.flightDay');
  const linked = source.mode === 'online';

  let dialogView = null;
  if (dialog?.kind === 'organ') {
    const card = organs.find(item => item.organ === dialog.organ);
    dialogView = card ? (
      <DataDialog title={card.label} status={card.status ?? 'no_data'} icon={ORGAN_ICONS[card.organ] || 'organs'} onClose={close}>
        <OrganBody key={card.organ} card={card} />
      </DataDialog>
    ) : (
      <DataDialog title={dialog.organ === 'exposure' ? t('wearables.environment') : words(dialog.organ)} icon="radiation" onClose={close}>
        <p className="wear-empty">{dialog.organ === 'exposure' ? t('wearables.environmentNone') : t('wearables.organsNone')}</p>
      </DataDialog>
    );
  } else if (dialog?.kind === 'region') {
    const { region } = dialog;
    const limb = LIMB_SEGMENTS[region.id] ? limbs.find(item => item.limb === region.id) || null : null;
    dialogView = (
      <DataDialog title={regionLabel(region)} status={regionStatus(region)} icon="body" onClose={close}>
        <RegionBody cards={organsForRegion(report, region)} limb={limb} onOpen={openOrgan} />
      </DataDialog>
    );
  } else if (dialog?.kind === 'bands') {
    dialogView = (
      <DataDialog title={t('wearables.devices')} status={bandsStatus} icon="bands" onClose={close}>
        <BandsBody devices={devices} />
      </DataDialog>
    );
  }

  return (
    <div className="wearables-screen">
      {session && viewedCode && viewedCode !== session ? (
        <p className="wear-readonly" role="note" data-testid="read-only-banner">
          {t('wearables.readOnly', { name: String(name).toUpperCase() })}
        </p>
      ) : null}

      <TelemetryNotice source={source} code={viewedCode} />

      <header className="wear-head" data-status={overall}>
        <button type="button" className="wear-back" onClick={() => navigate?.('home')}>
          <NavIcon name="prev" className="wear-back-icon" />
          <span>{t('common.back')}</span>
        </button>

        <div className={cx('wear-who', `wear-who-${overall}`)}>
          <span className="wear-who-line">
            <span className="wear-name">{name}</span>
            <StatusTag status={overall} className="wear-overall" />
          </span>
          <span className="wear-top-message" title={report?.top_message || undefined}>{report?.top_message ?? '—'}</span>
        </div>

        <div className="wear-sol">
          {linked ? (
            <SolControl
              value={mother?.period?.[kind] ?? null}
              latest={asOf ?? undefined}
              max={kind === 'sol' ? SOL_MAX : DAY_MAX}
              label={periodLabel}
              onChange={next => mother?.setPeriod?.(next == null ? null : { [kind]: next })}
            />
          ) : (
            <span className="wear-sol-fixed">
              {periodLabel} <strong data-testid="wear-sol">{asOf ?? '—'}</strong>
              <span className="wear-sol-note">{t('wearables.solFixed')}</span>
            </span>
          )}
          {linked ? <span className="visually-hidden" data-testid="wear-sol">{asOf ?? '—'}</span> : null}
          {linked && mother?.loadingReport ? <span className="wear-updating" role="status">{t('wearables.updating')}</span> : null}
        </div>

        <div className="wear-actions">
          <button
            type="button"
            className={cx('wear-action', `wear-action-${exposure?.status ?? 'no_data'}`)}
            data-open="environment"
            data-status={exposure?.status ?? 'no_data'}
            onClick={() => setDialog({ kind: 'organ', organ: 'exposure' })}
          >
            <NavIcon name="radiation" className="wear-action-icon" />
            <span className="wear-action-label">{t('wearables.environment')}</span>
            <StatusTag status={exposure?.status} />
          </button>
          <button
            type="button"
            className={cx('wear-action', `wear-action-${bandsStatus}`)}
            data-open="bands"
            data-status={bandsStatus}
            onClick={() => setDialog({ kind: 'bands' })}
          >
            <NavIcon name="bands" className="wear-action-icon" />
            <span className="wear-action-label">{t('wearables.devices')}</span>
            <span className="wear-action-count" data-testid="bands-count">
              {badDevices.length ? t('wearables.devicesBad', { bad: badDevices.length, n: devices.length }) : t('wearables.devicesCount', { n: devices.length })}
            </span>
          </button>
        </div>
      </header>

      <div className="wear-stage">
        <section className="wear-figure" aria-label={t('wearables.bodyMap')} title={t('wearables.bodyMapHint')}>
          <AstronautViewer
            model={profile?.model}
            sol={kind === 'sol' ? asOf : null}
            segmentStatus={segmentStatus}
            onSegmentHover={setHoverSegment}
            onSegmentClick={openSegment}
          />
          <span className="wear-figure-hint" aria-hidden="true">{hoverRegion ? regionLabel(hoverRegion) : t('wearables.bodyMapHint')}</span>
        </section>

        <section className="wear-organs" aria-label={t('wearables.organs')}>
          {organs.length === 0
            ? <p className="wear-empty">{t('wearables.organsNone')}</p>
            : organs.map(card => (
              <OrganTile key={card.organ} card={card} highlighted={highlighted.has(card.organ)} onOpen={openOrgan} />
            ))}
        </section>
      </div>

      {dialogView}
    </div>
  );
}

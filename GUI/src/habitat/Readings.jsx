import React from 'react';
import { Badge, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import {
  formatNormal, formatNumber, formatRange, formatTimeUtc, formatValue, groupReadings, hasRecovered, peakValue,
} from './model.js';
import { isGuiSimulated } from './simulatedRooms.js';

const NOW_KEYS = { ok: 'base.nowOk', caution: 'base.nowCaution', alert: 'base.nowAlert' };
const QUALITY_KEYS = { suspect: 'base.qualitySuspect', sensor_fault: 'base.qualityFault' };

/** Status shown on a row: the worst of the sol; null for channels without a threshold. */
export const rowStatus = reading => {
  const status = reading?.worst_status ?? reading?.status;
  return status === 'ok' || status === 'caution' || status === 'alert' ? status : null;
};

/**
 * Note for a reading whose fault has already passed: "PEAK 7.737 · NOW OK"
 * (categorical channels: "FAULT EARLIER THIS SOL · NOW OK"); null otherwise.
 */
export function recoveryNote(reading, t) {
  if (!hasRecovered(reading)) return null;
  const now = t(NOW_KEYS[reading.status] || 'base.nowOk');
  const peak = formatNumber(peakValue(reading));
  return peak != null ? t('base.peakNow', { peak, now }) : t('base.faultEarlier', { now });
}

/** "A 2.148 · B 2.41" for channels with redundant sensors; null otherwise. */
export function sensorsText(reading) {
  const sensors = reading?.sensors;
  if (!sensors || typeof sensors !== 'object') return null;
  const parts = Object.entries(sensors)
    .filter(([, value]) => value != null)
    .map(([name, value]) => `${name} ${formatNumber(value) ?? value}`);
  return parts.length ? parts.join(' · ') : null;
}

function ReadingRow({ reading }) {
  const t = useT();
  const status = rowStatus(reading); // worst of the sol: the tag and the row marker
  const now = reading.status === 'caution' || reading.status === 'alert' ? reading.status : null; // colours the latest value
  const value = formatValue(reading);
  const range = formatRange(reading);
  const normal = formatNormal(reading);
  const time = formatTimeUtc(reading.ts_utc);
  const note = recoveryNote(reading, t);
  const sensors = sensorsText(reading);
  const quality = reading.quality && reading.quality !== 'ok' ? reading.quality : null;
  const informative = reading.outside_normal && (reading.status === 'ok' || reading.status === 'unrated');
  const simulated = isGuiSimulated(reading);

  return (
    <div
      className={cx('base-row', status && `is-${status}`, now && `now-${now}`, simulated && 'is-simulated')}
      role="row"
      data-channel={reading.channel}
      data-status={status ?? 'unrated'}
      data-now={reading.status ?? 'unrated'}
    >
      <span className="base-cell base-cell-label" role="rowheader">
        <span className="base-label-text">{reading.label}</span>
        {simulated && <Badge kind="simulated" className="base-row-badge" />}
        {reading.from_zone && (
          <Badge tone="info" className="base-row-badge">{t('base.fromMother', { zone: t(`base.zone_${reading.from_zone}`) })}</Badge>
        )}
      </span>
      <span className="base-cell base-cell-value" role="cell">
        {value != null ? value : '—'}
        {value != null && reading.unit ? <span className="base-unit"> {reading.unit}</span> : null}
      </span>
      <span className="base-cell base-cell-range" role="cell" data-col={t('base.colRange')}>{range ?? '—'}</span>
      <span className="base-cell base-cell-normal" role="cell" data-col={t('base.colNormal')}>{normal ?? '—'}</span>
      <span className="base-cell base-cell-status" role="cell">
        {status
          ? <StatusTag status={status} />
          : <span className="base-unrated" title={t('base.unratedHint')}>{t('base.unrated')}</span>}
      </span>
      <span className="base-cell base-cell-time" role="cell">{time ?? '—'}</span>
      {(note || sensors || quality || informative) && (
        <span className="base-cell base-cell-extra" role="cell">
          {note && <span className={cx('base-note', `is-${status}`)}>{note}</span>}
          {quality && <span className="base-quality">{t(QUALITY_KEYS[quality] || 'base.qualityOther', { quality })}</span>}
          {informative && <span className="base-info-note">{t('base.outsideNormal')}</span>}
          {sensors && <span className="base-sensors">{t('base.sensors', { values: sensors })}</span>}
        </span>
      )}
    </div>
  );
}

/**
 * Readings of one zone, grouped (PRESSURE, AIR COMPOSITION, ...), one row per channel:
 * label · latest value + unit · sol min – max · normal range · status · time (UTC).
 * props: readings (API shape), label (accessible name of the table), empty (text when no readings).
 */
export default function ReadingsTable({ readings, label, empty }) {
  const t = useT();
  const groups = groupReadings(readings);
  if (groups.length === 0) return <p className="base-empty">{empty ?? t('base.noReadings')}</p>;
  return (
    <div className="base-table" role="table" aria-label={label}>
      <div className="base-row base-row-head" role="row">
        <span className="base-cell base-cell-label" role="columnheader">{t('base.colChannel')}</span>
        <span className="base-cell base-cell-value" role="columnheader">{t('base.colValue')}</span>
        <span className="base-cell base-cell-range" role="columnheader">{t('base.colRange')}</span>
        <span className="base-cell base-cell-normal" role="columnheader">{t('base.colNormal')}</span>
        <span className="base-cell base-cell-status" role="columnheader">{t('base.colStatus')}</span>
        <span className="base-cell base-cell-time" role="columnheader">{t('base.colTime')}</span>
      </div>
      {groups.map(group => (
        <div key={group.id} className="base-group" role="rowgroup" data-group={group.id}>
          <div className="base-group-title" role="row">
            <span role="columnheader">{t(`base.group_${group.id}`)}</span>
          </div>
          {group.readings.map(reading => <ReadingRow key={reading.channel} reading={reading} />)}
        </div>
      ))}
    </div>
  );
}

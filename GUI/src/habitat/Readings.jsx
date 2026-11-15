import React, { useEffect, useRef, useState } from 'react';
import { StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { Pager } from '../home/DataDialog.jsx';
import {
  formatNormal, formatNumber, formatRange, formatTimeUtc, formatValue, groupOf, groupReadings, hasRecovered, peakValue,
} from './model.js';
import { isGuiSimulated } from './simulatedRooms.js';
import { RangeBar, Sparkline, TrendChart } from './charts.jsx';
import { HISTORY_SOLS, channelSeries, useSolHistory } from './useSolHistory.js';

const NOW_KEYS = { ok: 'base.nowOk', caution: 'base.nowCaution', alert: 'base.nowAlert' };
const QUALITY_KEYS = { suspect: 'base.qualitySuspect', sensor_fault: 'base.qualityFault' };

/** NavIcon per reading group (closest existing glyph). */
const GROUP_ICONS = {
  pressure: 'gauge',
  air: 'lungs',
  temperature: 'thermometer',
  humidity: 'water',
  contamination: 'airfilter',
  radiation: 'radiation',
  integrity: 'base',
  water: 'water',
  lightNoise: 'lightbulb',
  structure: 'base',
  power: 'flash',
  systems: 'settings',
  reactor: 'radiation',
  stores: 'box',
  exterior: 'wind',
  other: 'report',
};
export const groupIcon = id => GROUP_ICONS[id] || 'report';

const TILE_ROW_PX = 170;
const TILE_COL_PX = 250;
const MAX_ROWS = 3;
const MAX_COLS = 4;

/** Tile grid that fits the element: { cols, rows }; 4 × 2 where it cannot be measured (tests). */
function useTileGrid(ref) {
  const [grid, setGrid] = useState({ cols: MAX_COLS, rows: 2 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (width <= 0 || height <= 0) return;
      const cols = Math.max(2, Math.min(MAX_COLS, Math.floor(width / TILE_COL_PX)));
      const rows = Math.max(1, Math.min(MAX_ROWS, Math.floor(height / TILE_ROW_PX)));
      setGrid(prev => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return grid;
}

/** Status shown on a reading: the worst of the sol; null for channels without a threshold. */
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

/** Categorical values ("NOT DETECTED") get a smaller, wrapping font. */
const isTextValue = value => value != null && !/^[-+−]?\.?\d/.test(String(value));

const qualityOf = reading => (reading.quality && reading.quality !== 'ok' ? reading.quality : null);
const nowOf = reading => (reading.status === 'caution' || reading.status === 'alert' ? reading.status : null);

function StatusOrInfo({ status }) {
  const t = useT();
  return status
    ? <StatusTag status={status} />
    : <span className="base-unrated" title={t('base.unratedHint')}>{t('base.unrated')}</span>;
}

/** One reading as a big tile: icon + label, big value + unit, status, one short second line. */
function ReadingTile({ reading, spark, onOpen }) {
  const t = useT();
  const status = rowStatus(reading);
  const now = nowOf(reading);
  const value = formatValue(reading);
  const quality = qualityOf(reading);
  const second = recoveryNote(reading, t)
    ?? (quality ? t(QUALITY_KEYS[quality] || 'base.qualityOther', { quality }) : null);
  return (
    <button
      type="button"
      className={cx('base-tile', status && `is-${status}`, now && `now-${now}`, isGuiSimulated(reading) && 'is-simulated')}
      data-channel={reading.channel}
      data-status={status ?? 'unrated'}
      data-now={reading.status ?? 'unrated'}
      onClick={() => onOpen(reading.channel)}
    >
      <span className="base-tile-head">
        <NavIcon name={groupIcon(groupOf(reading))} className="base-tile-icon" />
        <span className="base-tile-label">{reading.label}</span>
      </span>
      <span className="base-tile-value">
        <span className={cx('base-tile-number', isTextValue(value) && 'is-text')}>{value != null ? value : '—'}</span>
        {value != null && reading.unit ? <span className="base-tile-unit">{reading.unit}</span> : null}
        {spark ? <span className="base-tile-spark"><Sparkline points={spark} /></span> : null}
      </span>
      <RangeBar reading={reading} className="base-tile-range" />
      <span className="base-tile-foot">
        <StatusOrInfo status={status} />
        {second && <span className={cx('base-tile-note', status && `is-${status}`)}>{second}</span>}
      </span>
    </button>
  );
}

/** Trend of the reading over the last sols, fetched only while this view is open. */
function ReadingTrend({ reading, source }) {
  const t = useT();
  const numeric = reading.value != null && Number.isFinite(Number(reading.value));
  const { state, bySol } = useSolHistory({ ...source, enabled: numeric && Boolean(source?.locator) });
  if (!numeric) return <p className="base-trend-note">{t('base.noTrend')}</p>;
  if (state === 'offline') return <p className="base-trend-note" data-trend="offline">{t('base.noHistory')}</p>;
  const points = channelSeries(bySol, source.locator, reading.channel);
  return (
    <>
      <p className="base-trend-title">
        <span>{t('base.trendTitle', { n: HISTORY_SOLS })}</span>
        {state === 'loading' && <span className="base-trend-loading" role="status">{t('base.historyLoading')}</span>}
      </p>
      <div className="base-trend-chart">
        <TrendChart
          points={points}
          normalMin={reading.normal_min}
          normalMax={reading.normal_max}
          unit={reading.unit}
          status={reading.status}
          label={t('base.trendOf', { name: reading.label })}
        />
      </div>
    </>
  );
}

/** Full detail of one reading, inside the dialog, with a big BACK button and its trend. */
function ReadingDetail({ reading, source, onBack }) {
  const t = useT();
  const status = rowStatus(reading);
  const now = nowOf(reading);
  const value = formatValue(reading);
  const quality = qualityOf(reading);
  const note = recoveryNote(reading, t);
  const sensors = sensorsText(reading);
  const informative = reading.outside_normal && (reading.status === 'ok' || reading.status === 'unrated');
  const facts = [
    ['group', t('base.colGroup'), t(`base.group_${groupOf(reading)}`)],
    ['range', t('base.colRange'), formatRange(reading)],
    ['normal', t('base.colNormal'), formatNormal(reading)],
    ['time', t('base.colTime'), formatTimeUtc(reading.ts_utc)],
    sensors ? ['sensors', t('base.colSensors'), sensors] : null,
    quality ? ['quality', t('base.colQuality'), t(QUALITY_KEYS[quality] || 'base.qualityOther', { quality })] : null,
  ].filter(Boolean);
  return (
    <div className={cx('base-detail', status && `is-${status}`, now && `now-${now}`)} data-detail={reading.channel}>
      <div className="base-detail-head">
        <button type="button" className="base-back" onClick={onBack}>
          <NavIcon name="prev" /> {t('base.back')}
        </button>
        <NavIcon name={groupIcon(groupOf(reading))} className="base-detail-icon" />
        <h3 className="base-detail-label">{reading.label}</h3>
        <StatusOrInfo status={status} />
      </div>
      <div className="base-detail-main">
        <div className="base-detail-side">
          <p className="base-detail-value">
            <span className={cx('base-tile-number', isTextValue(value) && 'is-text')}>{value != null ? value : '—'}</span>
            {value != null && reading.unit ? <span className="base-tile-unit">{reading.unit}</span> : null}
          </p>
          <RangeBar reading={reading} className="base-detail-range" />
          <dl className="base-detail-facts">
            {facts.map(([id, key, text]) => (
              <div key={id} className="base-detail-fact" data-fact={id}>
                <dt>{key}</dt>
                <dd>{text ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {(note || informative) && (
            <p className="base-detail-notes">
              {note && <span className={cx('base-note', status && `is-${status}`)}>{note}</span>}
              {informative && <span>{t('base.outsideNormal')}</span>}
            </p>
          )}
        </div>
        <div className="base-trend">
          <ReadingTrend reading={reading} source={source} />
        </div>
      </div>
    </div>
  );
}

/**
 * Readings of one zone as big tiles, in group order (PRESSURE, AIR COMPOSITION, ...), paged
 * instead of scrolled. A tap on a tile opens its details (sol min – max, normal range, time,
 * sensors) in place of the grid.
 * props: readings (API shape), label (accessible name), empty (text when no readings),
 *        grouped (default true; false keeps the given order),
 *        source { sol, data, offline, locator } for the trend of a reading (see useSolHistory),
 *        sparks (channel -> [{ sol, value }]) optional sparklines on the tiles.
 */
export default function ReadingTiles({ readings, label, empty, grouped = true, source = null, sparks = null }) {
  const t = useT();
  const gridRef = useRef(null);
  const { cols, rows } = useTileGrid(gridRef);
  const perPage = cols * rows;
  const [page, setPage] = useState(0);
  const [openChannel, setOpenChannel] = useState(null);

  const list = grouped ? groupReadings(readings).flatMap(group => group.readings) : (readings || []);
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(page, pages - 1);

  const open = openChannel ? list.find(reading => reading.channel === openChannel) : null;
  const shown = list.slice(current * perPage, (current + 1) * perPage);
  let body;
  if (list.length === 0) body = <p className="base-empty">{empty ?? t('base.noReadings')}</p>;
  else if (open) body = <ReadingDetail reading={open} source={source} onBack={() => setOpenChannel(null)} />;
  else {
    body = (
      <div
        className="base-tiles"
        role="list"
        aria-label={label}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {shown.map(reading => (
          <div key={reading.channel} role="listitem" className="base-tile-cell">
            <ReadingTile reading={reading} spark={sparks?.[reading.channel]} onOpen={setOpenChannel} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="base-tiles-wrap">
      <div ref={gridRef} className="base-tiles-area">{body}</div>
      {!open && <Pager page={current} pages={pages} onPage={setPage} />}
    </div>
  );
}

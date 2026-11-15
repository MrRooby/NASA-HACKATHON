import React, { useCallback, useMemo, useRef, useState } from 'react';
import AstronautViewer from '../AstronautViewer.jsx';
import { Avatar, SegBar, StatusTag, cx } from '../components/index.js';
import { getCrewPhoto } from '../data/crewPhotos.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { getDemoHabitat } from '../habitat/demoHabitat.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { segmentStatusFromReport } from '../organSegments.js';
import DataDialog, { Pager } from '../home/DataDialog.jsx';
import { LIMB_LABEL_KEYS } from '../home/LimbCard.jsx';
import OrganCard from '../home/OrganCard.jsx';
import TelemetryNotice from '../home/TelemetryNotice.jsx';
import { setPendingFocus } from '../home/focus.js';
import { formatValue, words } from '../home/format.js';
import { limbsFromReport } from '../home/limbData.js';
import useFitCount from '../home/useFitCount.js';
import useVitalsHistory from '../home/useVitalsHistory.js';
import { vitalsFromReport } from '../home/vitals.js';
import { useCrewReport } from '../home/useCrewReport.js';
import { buildNotifications } from '../notifications/buildNotifications.js';
import './home.css';

const VITAL_ICONS = { hr: 'heart', spo2: 'lungs', map: 'gauge', glucose: 'glucose', sleep: 'sleep', dose: 'radiation' };
const VITAL_IDS = Object.keys(VITAL_ICONS);
const DEVICE_LABEL_KEYS = {
  left_arm: 'home.bandLeftArm',
  right_arm: 'home.bandRightArm',
  left_leg: 'home.bandLeftLeg',
  right_leg: 'home.bandRightLeg',
  head_eeg: 'home.bandHead',
};
const SEVERITY = { alert: 0, caution: 1, ok: 2, no_data: 3 };
const NOTIF_ROW_PX = 64;
const ORGANS_PER_PAGE = 6;

// ── acknowledged notifications (ticked boxes): this terminal only, per person and sol ──
export const ACK_KEY = 'awernasa.notifAck.v1';
function readAck() {
  try { return JSON.parse(window.localStorage.getItem(ACK_KEY) || '{}') || {}; } catch { return {}; }
}
function writeAck(map) {
  try { window.localStorage.setItem(ACK_KEY, JSON.stringify(map)); } catch { /* storage blocked: keep in memory */ }
}

function usePaged(items, perPage) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const safe = Math.min(page, pages - 1);
  return { page: safe, pages, setPage, slice: items.slice(safe * perPage, safe * perPage + perPage) };
}

/** Left column: one reading per row — icon, short label, value. */
function VitalRow({ row }) {
  const t = useT();
  const note = row.note ? t(row.note, row.noteParams?.limb ? { ...row.noteParams, limb: t(LIMB_LABEL_KEYS[row.noteParams.limb]) } : row.noteParams) : null;
  return (
    <li className={cx('home-vital', `home-vital-${row.status}`)} data-vital={row.id} data-status={row.status} title={note || undefined}>
      <span className="home-vital-head">
        <NavIcon name={VITAL_ICONS[row.id]} className="home-vital-icon" />
        <span className="home-vital-label">{t(`home.vitalShort_${row.id}`)}</span>
      </span>
      <span className="home-vital-value">
        {row.value != null ? formatValue(row.value) : '—'}
        {row.value != null ? <span className="home-vital-unit">{row.unit}</span> : null}
      </span>
      <span className="visually-hidden"><StatusTag status={row.status} />{note ? ` ${note}` : ''}</span>
    </li>
  );
}

/** Right top: notifications as a checklist; the box ticks it off, the text opens its source. */
function NotificationsPanel({ items, ackKey, onOpen, note }) {
  const t = useT();
  const listRef = useRef(null);
  const perPage = useFitCount(listRef, NOTIF_ROW_PX, 4);
  const [ack, setAck] = useState(readAck);
  const sorted = useMemo(() => {
    const done = item => (ack[`${ackKey}|${item.id}`] ? 1 : 0);
    return [...items].sort((a, b) => done(a) - done(b));
  }, [items, ack, ackKey]);
  const { page, pages, setPage, slice } = usePaged(sorted, perPage);
  const isAck = item => Boolean(ack[`${ackKey}|${item.id}`]);
  const open = sorted.filter(item => !isAck(item)).length;
  const toggle = item => {
    const key = `${ackKey}|${item.id}`;
    const next = { ...readAck() };
    if (next[key]) delete next[key]; else next[key] = true;
    writeAck(next);
    setAck(next);
  };

  return (
    <section className="home-panel home-notifs" aria-label={t('home.notifPanel')}>
      <header className="home-panel-head">
        <NavIcon name="bell" className="home-panel-icon" />
        <h2>{t('home.notifPanel')}</h2>
        <span className={cx('home-panel-count', open === 0 && 'is-zero')} data-testid="notif-open">{open}</span>
        {note ? <span className="home-panel-note" data-testid="notif-note">{note}</span> : null}
        <span className="spacer" />
        <Pager page={page} pages={pages} onPage={setPage} />
      </header>
      <ol className="home-notif-list" ref={listRef} aria-label={t('home.notifListLabel')}>
        {sorted.length === 0 ? <li className="home-notif-empty" role="status">{t('home.notifEmpty')}</li> : null}
        {slice.map(item => {
          const done = isAck(item);
          return (
            <li key={item.id} className={cx('home-notif', `home-notif-${item.severity}`, done && 'is-done')} data-id={item.id} data-severity={item.severity}>
              <button
                type="button"
                className="home-notif-box"
                role="checkbox"
                aria-checked={done}
                aria-label={t('home.notifAck', { title: item.title })}
                onClick={() => toggle(item)}
              >
                <NavIcon name={done ? 'boxChecked' : 'box'} />
              </button>
              <button
                type="button"
                className="home-notif-text"
                disabled={!item.target}
                aria-label={`${t('common.open')}: ${item.title}`}
                onClick={() => onOpen(item.target, item)}
              >
                <span className="home-notif-title">
                  {item.severity === 'info' ? null : <StatusTag status={item.severity} />}
                  <span>{item.title}</span>
                </span>
                <span className="home-notif-detail">{item.detail}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Right bottom left: the wearable bands, one line each. */
function BandsPanel({ devices }) {
  const t = useT();
  return (
    <section className="home-panel home-bands" aria-label={t('home.bandsPanel')}>
      <header className="home-panel-head">
        <NavIcon name="bands" className="home-panel-icon" />
        <h2>{t('home.bandsPanel')}</h2>
      </header>
      {devices.length === 0 ? <p className="home-notif-empty">{t('home.bandNone')}</p> : (
        <ul className="home-band-list">
          {devices.map(device => {
            const status = device.status ?? 'no_data';
            const battery = device.battery_pct != null ? Math.round(device.battery_pct) : null;
            const name = t(DEVICE_LABEL_KEYS[device.limb] || 'home.band');
            return (
              <li key={device.limb} className={cx('home-band', `home-band-${status}`)} data-device={device.limb} data-status={status} title={device.message || undefined}>
                <span className="home-band-name">{name}</span>
                <span className="home-band-state">{words(device.state) || '—'}</span>
                <SegBar value={battery} max={100} status={status} segments={8} label={`${t('home.battery')}: ${name}`} />
                <span className="home-band-pct">{battery != null ? `${battery}%` : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OrgansBody({ organs }) {
  const t = useT();
  const sorted = useMemo(() => [...organs].sort((a, b) => (SEVERITY[a.status] ?? 3) - (SEVERITY[b.status] ?? 3)), [organs]);
  const { page, pages, setPage, slice } = usePaged(sorted, ORGANS_PER_PAGE);
  if (!organs.length) return <p className="dim upper">{t('common.noData')}</p>;
  return (
    <div className="dlg-stack">
      <div className="home-organ-grid">
        {slice.map(card => <OrganCard key={card.organ} card={card} compact />)}
      </div>
      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  );
}

function HistoryBody({ code, sol, online }) {
  const t = useT();
  const history = useVitalsHistory(code, sol, online);
  if (!online) return <p className="home-dlg-note">{t('home.historyOffline')}</p>;
  if (history.loading) return <p className="dim upper">{t('common.loading')}</p>;
  if (history.error) return <p className="home-dlg-note">{t('home.historyError')}</p>;
  return (
    <table className="home-hist" data-testid="history-table">
      <thead>
        <tr>
          <th>{t('common.sol')}</th>
          {VITAL_IDS.map(id => (
            <th key={id} title={t(`home.vital_${id}`)}>
              <NavIcon name={VITAL_ICONS[id]} />
              <span>{t(`home.vitalShort_${id}`)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {history.rows.map(row => (
          <tr key={row.sol} className={row.sol === sol ? 'is-current' : undefined}>
            <th>{row.sol}</th>
            {VITAL_IDS.map(id => {
              const cell = row.vitals?.find(item => item.id === id);
              return (
                <td key={id} className={cx(cell && `home-hist-${cell.status}`)} data-status={cell?.status ?? 'no_data'}>
                  {cell?.value != null ? formatValue(cell.value) : '—'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Home for a touch tablet, one screen, no scrolling (team sketch):
 *   left  — name, the 3D figure and a narrow column of basic readings (averaged over the bands);
 *   right — notifications as a checklist on top; below, the wearable bands and big tiles
 *           (scan, history, organs, tests, check-in, report to Earth).
 * Props (shared by every screen): { mother, session, viewedCode, setViewedCode, navigate, profile }.
 */
export default function HomeScreen({ mother, session, viewedCode, navigate, profile }) {
  const t = useT();
  const source = useCrewReport(mother, viewedCode);
  const { report, kind, asOf } = source;
  const [dialog, setDialog] = useState(null); // null | 'organs' | 'history'
  const close = useCallback(() => setDialog(null), []);

  const segmentStatus = useMemo(() => (report ? segmentStatusFromReport(report) : undefined), [report]);
  const vitals = useMemo(() => vitalsFromReport(report), [report]);
  const { limbs, headEeg } = useMemo(() => limbsFromReport(report), [report]);
  const devices = useMemo(
    () => [...limbs.map(item => item.device && { ...item.device, limb: item.limb }), headEeg && { ...headEeg, limb: 'head_eeg' }].filter(Boolean),
    [limbs, headEeg],
  );
  const organs = useMemo(() => (Array.isArray(report?.organs) ? report.organs : []), [report]);

  // Habitat of the same sol as the organ report (habitat crew only). Without a link to
  // MOTHER the built-in demo habitat is used directly: there is nothing to ask.
  const linked = source.mode === 'online';
  const habitatSol = kind === 'sol' ? (source.state === 'live' ? mother?.period?.sol ?? asOf : asOf) : null;
  const habitat = useHabitat({ sol: habitatSol ?? null, enabled: kind === 'sol' && linked && source.state !== 'awaiting' });
  const demoHabitat = useMemo(() => (kind === 'sol' && !linked ? getDemoHabitat() : null), [kind, linked]);
  const habitatData = linked ? habitat?.data ?? null : demoHabitat;
  const notifications = useMemo(() => buildNotifications({ report, habitat: habitatData }), [report, habitatData]);
  // Say so when the person's data is real but the habitat part is not (or not there yet).
  const habitatNote = kind !== 'sol' || source.demo ? null
    : habitatData?.demo ? t('home.notifHabitatDemo')
      : linked && habitat?.loading && !habitatData ? t('home.notifHabitatLoading')
        : null;

  const openTarget = useCallback(target => {
    if (!target?.screen) return;
    if (target.screen === 'wearables') setPendingFocus(target);
    navigate?.(target.screen, target);
  }, [navigate]);
  const openScan = useCallback(() => navigate?.('wearables'), [navigate]);

  const subject = report?.subject;
  const fullName = profile?.name || subject?.label || viewedCode || '—';
  const [firstName, ...lastNames] = fullName.split(' ');
  const photo = getCrewPhoto(viewedCode);
  const own = viewedCode === session;

  const tiles = [
    { id: 'scan', icon: 'body', label: t('home.tileScan'), onClick: openScan },
    { id: 'history', icon: 'history', label: t('home.tileHistory'), onClick: () => setDialog('history'), disabled: kind !== 'sol' },
    { id: 'organs', icon: 'organs', label: t('home.tileOrgans'), onClick: () => setDialog('organs') },
    { id: 'tests', icon: 'tests', label: t('home.tileTests'), onClick: () => navigate?.('tests') },
    { id: 'checkin', icon: 'checkin', label: t('home.tileCheckin'), onClick: () => navigate?.('profile', { viewedCode }), disabled: !own },
    { id: 'report', icon: 'report', label: t('home.tileReport'), onClick: () => navigate?.('profile', { viewedCode }), disabled: !own },
  ];

  return (
    <div className="home-screen">
      <TelemetryNotice source={source} code={viewedCode} />

      <div className="home-stage">
        {/* ── left: person ── */}
        <section className="home-person" aria-label={fullName}>
          <header className="home-head">
            <span className="home-name">
              <span className="home-name-first">{firstName}</span>
              <span className="home-name-last">{lastNames.join(' ')}</span>
              {profile?.heightCm ? (
                <span className="home-body-size" data-testid="home-body-size">
                  {t('home.bodySize', { h: profile.heightCm, m: profile.massKg })}
                </span>
              ) : null}
            </span>
            <span className="home-photo" data-testid="home-photo">
              {photo
                ? <img src={photo} alt={fullName} draggable="false" />
                : <Avatar code={viewedCode} size={96} title={fullName} />}
            </span>
          </header>
          <div className="home-body">
            <div
              className="home-figure"
              role="button"
              tabIndex={0}
              aria-label={t('home.openScan')}
              title={t('home.figureHint')}
              onClick={openScan}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openScan();
                }
              }}
            >
              <AstronautViewer model={profile?.model} frontView segmentStatus={segmentStatus} />
            </div>
            <ul className="home-vitals" aria-label={t('home.vitalsLabel')}>
              {vitals.map(row => <VitalRow key={row.id} row={row} />)}
            </ul>
          </div>
        </section>

        {/* ── right: notifications, bands, tiles ── */}
        <div className="home-right">
          <NotificationsPanel items={notifications} ackKey={`${viewedCode}|${asOf ?? '-'}`} onOpen={openTarget} note={habitatNote} />
          <div className="home-bottom">
            <BandsPanel devices={devices} />
            <nav className="home-tiles" aria-label={t('home.tilesLabel')}>
              {tiles.map(tile => (
                <button key={tile.id} type="button" className="home-tile" data-open={tile.id} disabled={tile.disabled} onClick={tile.onClick}>
                  <NavIcon name={tile.icon} className="home-tile-icon" />
                  <span className="home-tile-label">{tile.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {dialog === 'organs' ? (
        <DataDialog title={t('home.tileOrgans')} icon="organs" onClose={close}>
          <OrgansBody organs={organs} />
        </DataDialog>
      ) : null}
      {dialog === 'history' ? (
        <DataDialog title={t('home.historyTitle', { name: fullName })} icon="history" onClose={close}>
          <HistoryBody code={viewedCode} sol={asOf} online={linked && !source.demo} />
        </DataDialog>
      ) : null}
    </div>
  );
}

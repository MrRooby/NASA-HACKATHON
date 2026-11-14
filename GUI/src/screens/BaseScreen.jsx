import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { MISSION, getProfile, localize } from '../data/crewProfiles.js';
import { PixelAvatar, PixelIcon } from '../pixel/index.js';
import { Badge, PagerControls, StatusMark, StatusShape, useFitCount, usePager } from '../ui/index.js';
import HabitatMap from '../habitat/HabitatMap.jsx';
import { GaugeTile, tileStatus, useGridFit } from '../habitat/GaugeTile.jsx';
import { ROOM_ICON, ZONE_ICON, eventIcon } from '../habitat/icons.js';
import { getRoom, roomForZone } from '../habitat/layout.js';
import { STATUS_RANK, deriveHabitat, formatNumber, formatTimeUtc, groupOf, GROUPS, pickDefaultRoom, severityStatus, splitEvents } from '../habitat/model.js';
import { useSharedHabitat } from '../habitat/sharedHabitat.js';
import './base.css';

/** Exterior gauges (zone `surface`), in this order. */
export const SURFACE_CHANNELS = [
  'ext_temperature', 'ext_pressure', 'dust_opacity_tau', 'wind_speed', 'uv_flux', 'dose_rate', 'solar_proton_flux_10MeV',
];
/** Channels never drawn as a tile (shown otherwise: occupancy = avatars). */
const HIDDEN_CHANNELS = new Set(['zone_occupancy']);

const TILE = { minWidth: 168, height: 112, gap: 8 };
const TILE_SHORT = { minWidth: 150, height: 84, gap: 6 }; // short screens (phone landscape)
const EXT_TILE = { minWidth: 120, height: 84, gap: 6 };
const EVENT_ROW_H = 46;

const crewCode = code => {
  const match = String(code ?? '').toUpperCase().match(/C([1-4])$/);
  return match ? `HAB-C${match[1]}` : code;
};

/** True while the viewport is short (phone landscape): smaller gauge tiles. */
function useShortScreen(limit = 500) {
  const query = `(max-height: ${limit}px)`;
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [short, setShort] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setShort(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [query]);
  return short;
}

/** Worst first (alert, caution), then the reading groups in display order. */
export function sortReadings(readings) {
  const groupRank = reading => GROUPS.indexOf(groupOf(reading));
  return (readings || [])
    .filter(reading => !HIDDEN_CHANNELS.has(reading.channel))
    .map((reading, index) => ({ reading, index }))
    .sort((a, b) => (STATUS_RANK[tileStatus(b.reading)] ?? 0) - (STATUS_RANK[tileStatus(a.reading)] ?? 0)
      || groupRank(a.reading) - groupRank(b.reading)
      || a.index - b.index)
    .map(entry => entry.reading);
}

/** Name of a database zone: its room, else base.zone_<code>, else the code. */
function zoneName(code, t) {
  if (!code) return '—';
  const room = roomForZone(code);
  if (room && room.zone === code) return t(room.labelKey);
  const key = `base.zone_${code}`;
  const text = t(key);
  return text === key ? code : text;
}

/** Tiles in a box that fits them: as many as fit, the rest on pages. */
function TileGrid({ readings, tile, compact, label, emptyText }) {
  const ref = useRef(null);
  const fit = useGridFit(ref, tile);
  const pager = usePager(readings, fit.size);
  return (
    <div className="base-tilebox">
      <div
        className="base-tiles"
        ref={ref}
        role="list"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${fit.rows}, minmax(${tile.height}px, 1fr))` }}
      >
        {readings.length === 0 && <p className="base-empty">{emptyText}</p>}
        {pager.pageItems.map(reading => (
          <div role="listitem" key={reading.channel} className="base-tile-cell"><GaugeTile reading={reading} compact={compact} /></div>
        ))}
      </div>
      <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={label} className="base-pager" />
    </div>
  );
}

function RoomPanel({ room, navigate, t, hidden }) {
  const short = useShortScreen();
  const [view, setView] = useState(null); // null = the room's own zone, else a sub-zone code
  const sub = view ? room.subZones.find(item => item.code === view) : null;
  const readings = useMemo(() => sortReadings(sub ? sub.readings : room.readings), [sub, room.readings]);
  const name = t(room.def.labelKey);
  const status = sub ? sub.status : room.status;
  const occupants = (sub ? sub.occupants : room.occupants).map(crewCode);

  return (
    <section
      className={`base-room is-${status}`}
      data-room={room.id}
      data-status={status}
      aria-label={name}
      hidden={hidden || undefined}
    >
      <header className="room-head">
        <PixelIcon name={ROOM_ICON[room.id] || 'base'} size={32} />
        <h2 className="room-name">{name}</h2>
        {room.simulated && <Badge kind="simulated" />}
        <StatusMark status={status} size="sm" />
        {room.subZones.length > 0 && (
          <span className="room-subs" role="group" aria-label={t('base.subZones')}>
            <button type="button" className={`room-sub${view == null ? ' is-active' : ''}`} aria-pressed={view == null} onClick={() => setView(null)}>
              <StatusShape status={room.status} size={12} />
              {t('base.zoneMain')}
            </button>
            {room.subZones.map(item => (
              <button
                key={item.code}
                type="button"
                data-subzone={item.code}
                data-status={item.status}
                className={`room-sub is-${item.status}${view === item.code ? ' is-active' : ''}`}
                aria-pressed={view === item.code}
                onClick={() => setView(item.code)}
              >
                <PixelIcon name={ZONE_ICON[item.code] || 'base'} size={20} />
                {t(`base.zone_${item.code}`)}
                <StatusShape status={item.status} size={12} />
              </button>
            ))}
          </span>
        )}
        <span className="room-crew" aria-label={t('base.crewPresent')}>
          {occupants.map(code => {
            const person = getProfile(code);
            return (
              <button
                key={code}
                type="button"
                className="room-avatar"
                data-crew={code}
                title={person ? `${person.callsign} · ${person.name}` : code}
                aria-label={t('base.openProfile', { name: person?.name ?? code })}
                onClick={() => navigate?.({ screen: 'person', code })}
              >
                <PixelAvatar code={code} size={32} />
              </button>
            );
          })}
        </span>
      </header>
      <TileGrid
        key={`${room.id}:${view ?? ''}`}
        readings={readings}
        tile={short ? TILE_SHORT : TILE}
        compact={short}
        label={t('base.readingsOf', { name })}
        emptyText={status === 'no_data' ? t('base.noZoneData') : t('base.noReadings')}
      />
    </section>
  );
}

function CupolaTile({ zones, t }) {
  const cupolas = zones.filter(zone => zone.type === 'cupola' || /^cupola_/.test(zone.code));
  if (!cupolas.length) return null;
  const worst = cupolas.reduce((acc, zone) => ((STATUS_RANK[zone.status] ?? 0) > (STATUS_RANK[acc] ?? 0) ? zone.status : acc), 'ok');
  return (
    <div className={`gt gt--compact gt--${worst === 'caution' || worst === 'alert' ? worst : 'quiet'} gt-cupolas`} data-channel="cupolas" data-status={worst}>
      <div className="gt-head">
        <PixelIcon name="light" size={20} />
        <span className="gt-label">{t('base.cupolas')}</span>
        {worst !== 'ok' && <StatusShape status={worst} size={14} />}
      </div>
      <div className="gt-cupola-row">
        {cupolas.map((zone, index) => (
          <span key={zone.code} className={`gt-cupola is-${zone.status}`} data-zone={zone.code} title={`${zoneName(zone.code, t)} · ${zone.status}`}>
            <StatusShape status={zone.status} size={12} />{index + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExteriorPanel({ exterior, t, hidden }) {
  const surface = exterior.find(zone => zone.code === 'surface');
  const readings = SURFACE_CHANNELS.map(channel => surface?.readings?.find(reading => reading.channel === channel)).filter(Boolean);
  const ref = useRef(null);
  const fit = useGridFit(ref, EXT_TILE);
  const cells = [...readings.map(reading => ({ key: reading.channel, reading })), { key: 'cupolas' }];
  const pager = usePager(cells, fit.size);
  return (
    <section className="base-ext" aria-label={t('base.exterior')} hidden={hidden || undefined}>
      <header className="panel-head">
        <PixelIcon name="sun" size={24} />
        <h2 className="panel-title">{t('base.exterior')}</h2>
        <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={t('base.exterior')} className="base-pager" />
      </header>
      <div
        className="base-tiles"
        ref={ref}
        role="list"
        aria-label={t('base.exterior')}
        style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${fit.rows}, minmax(${EXT_TILE.height}px, 1fr))` }}
      >
        {pager.pageItems.map(cell => (
          <div role="listitem" key={cell.key} className="base-tile-cell">
            {cell.reading ? <GaugeTile reading={cell.reading} compact /> : <CupolaTile zones={exterior} t={t} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function EventsPanel({ events, sol, navigate, t, hidden }) {
  const { notable, evaStarts, evaEnds } = splitEvents(events);
  const rows = useMemo(() => {
    const list = notable.map(event => ({ key: event.code, event }));
    if (evaStarts + evaEnds > 0) list.push({ key: 'eva', eva: evaStarts + evaEnds });
    return list;
  }, [notable, evaStarts, evaEnds]);
  const ref = useRef(null);
  const fit = useFitCount(ref, EVENT_ROW_H, { fallback: 4 });
  const pager = usePager(rows, fit);
  return (
    <section className="base-events" aria-label={t('base.eventLog')} hidden={hidden || undefined}>
      <header className="panel-head">
        <PixelIcon name="clock" size={24} />
        <h2 className="panel-title">{t('base.eventLog')}</h2>
        <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={t('base.eventLog')} className="base-pager" />
      </header>
      <ul className="base-event-list" ref={ref}>
        {rows.length === 0 && <li className="base-empty">{t('base.noEvents')}</li>}
        {pager.pageItems.map(row => {
          if (row.eva) {
            return (
              <li key="eva" className="base-event is-routine" data-event="eva">
                <span className="ev-main">
                  <StatusShape status="ok" size={12} />
                  <PixelIcon name="airlock" size={24} />
                  <span className="ev-type">{t('base.evaN', { n: row.eva })}</span>
                </span>
              </li>
            );
          }
          const { event } = row;
          const status = severityStatus(event.severity);
          const room = roomForZone(event.zone);
          const start = formatTimeUtc(event.start_utc);
          const end = event.end_utc ? formatTimeUtc(event.end_utc) : null;
          const when = event.sol != null && event.sol !== sol ? `${t('base.solShort', { n: event.sol })}` : [start, end].filter(Boolean).join('–');
          return (
            <li key={row.key} className={`base-event is-${status}`} data-event={event.type} data-severity={event.severity}>
              <button
                type="button"
                className="ev-main"
                disabled={!room}
                onClick={() => room && navigate?.({ screen: 'base', room: room.id })}
                title={`${event.type} · ${zoneName(event.zone, t)} · ${event.severity}`}
              >
                <StatusShape status={status} size={12} />
                <PixelIcon name={eventIcon(event.type)} size={24} />
                <span className="ev-type">{String(event.type).replace(/_/g, ' ').toUpperCase()}</span>
                <span className="ev-where">{zoneName(event.zone, t)}</span>
                <span className="ev-time">{when}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TABS = ['map', 'room', 'exterior', 'events'];

/**
 * BASE (DESIGN.md §4.3): habitat map on top; under it the selected room as gauge tiles,
 * EXTERIOR tiles and the EVENTS log beside it. Nothing scrolls: tiles and events are paged,
 * narrow screens switch ROOM / EXTERIOR / EVENTS with tabs.
 *
 * Props { mother, route, navigate }: the sol is mother.period (shared, set in the top bar);
 * the selected room is route.room (default: the worst real room of the sol).
 */
export default function BaseScreen({ mother, route, navigate }) {
  const { t, lang } = useI18n();
  const sol = mother?.period?.sol ?? null;
  const { data } = useSharedHabitat({ sol });
  const model = useMemo(() => deriveHabitat(data), [data]);
  const [tab, setTab] = useState('room');

  const requested = route?.room && getRoom(route.room) ? route.room : null;
  const selectedId = requested ?? (data ? pickDefaultRoom(model.rooms) : null);
  const selected = model.rooms.find(room => room.id === selectedId) || null;
  const select = id => {
    setTab('room');
    navigate?.({ screen: 'base', room: id });
  };

  const habitat = data?.habitat;
  const habitatName = habitat && habitat.code !== MISSION.habitatCode ? habitat.name : localize(MISSION.habitat, lang);
  const overall = data?.overall_status ?? 'no_data';
  const shownSol = data?.as_of?.sol ?? null;

  return (
    <div className="base" data-tab={tab}>
      <header className="base-head">
        <PixelIcon name="base" size={32} />
        <h1 className="base-name" title={habitatName}>{habitatName}</h1>
        {habitat && (
          <span className="base-atm" data-testid="base-atm">
            <span className="base-atm-item"><PixelIcon name="pressure" size={20} /><b>{formatNumber(habitat.atm_pressure_kpa)}</b> kPa</span>
            <span className="base-atm-item"><PixelIcon name="o2" size={20} /><b>{formatNumber(habitat.atm_o2_fraction_pct)}</b> % O2</span>
          </span>
        )}
        {data?.demo && <Badge kind="demo" />}
        {data && !data.demo && habitat?.data_kind === 'synthetic' && <Badge kind="synthetic" />}
        <StatusMark status={overall} />
      </header>

      <div className="base-body">
        <div className="base-map">
          <HabitatMap rooms={model.rooms} selectedId={selectedId} onSelect={select} />
        </div>

        <div className="base-details">
          <div className="base-tabs" role="tablist" aria-label={t('base.title')}>
            {TABS.map(id => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`base-tab base-tab--${id}${tab === id ? ' is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                {t(`base.tab_${id}`)}
              </button>
            ))}
          </div>
          {!data && <p className="base-empty base-loading" role="status">{t('base.loading')}</p>}
          {data && selected && <RoomPanel key={selected.id} room={selected} navigate={navigate} t={t} hidden={false} />}
          {data && <ExteriorPanel exterior={model.exterior} t={t} />}
          {data && <EventsPanel events={data.events} sol={shownSol} navigate={navigate} t={t} />}
        </div>
      </div>
    </div>
  );
}

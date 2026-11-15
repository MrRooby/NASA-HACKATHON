import React, { useCallback, useMemo, useRef, useState } from 'react';
import { SolControl, StatusTag, cx } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { MISSION, getProfile, localize } from '../data/crewProfiles.js';
import DataDialog, { Pager } from '../home/DataDialog.jsx';
import useFitCount from '../home/useFitCount.js';
import HabitatMap from '../habitat/HabitatMap.jsx';
import ReadingTiles from '../habitat/Readings.jsx';
import { channelSeries, useSolHistory } from '../habitat/useSolHistory.js';
import { getRoom, roomForZone } from '../habitat/layout.js';
import {
  STATUS_RANK, deriveHabitat, eventTypeText, formatDayTimeUtc, formatNumber, formatTimeUtc, pickDefaultRoom,
  severityStatus, splitEvents, worstStatus,
} from '../habitat/model.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { useSharedSol } from '../habitat/useSharedSol.js';
import './base.css';

/** Channels shown for an exterior zone, per zone type, in this order. */
const SURFACE_CHANNELS = [
  'ext_temperature', 'ext_pressure', 'dust_opacity_tau', 'wind_speed', 'uv_flux', 'dose_rate', 'solar_proton_flux_10MeV',
];
const CUPOLA_CHANNELS = ['leak_detector', 'pressure_decay_rate', 'temperature_air', 'dose_rate'];

const EVENT_ROW_PX = 84;
const isFlagged = status => status === 'caution' || status === 'alert';

/** Name of a database zone for people: its room on the map, else the exterior zone name, else the code. */
function zoneName(code, t) {
  if (!code) return '—';
  const room = roomForZone(code);
  if (room && room.zone === code) return t(room.labelKey);
  const key = `base.zone_${code}`;
  const text = t(key);
  return text === key ? code : text;
}

/** Worst zone first (alert, then caution), else the first one. */
const worstFirst = items => items.reduce(
  (best, item) => ((STATUS_RANK[item.status] ?? 0) > (STATUS_RANK[best?.status] ?? 0) ? item : best),
  items[0] ?? null,
);

function CrewList({ occupants, navigate }) {
  const { t } = useI18n();
  if (!occupants.length) return <span className="base-dim">{t('base.crewNone')}</span>;
  return (
    <span className="base-crew-list">
      {occupants.map(code => {
        const person = getProfile(code);
        const text = person ? person.name : code;
        return person && navigate ? (
          <button
            key={code}
            type="button"
            className="base-crew is-link"
            data-crew={code}
            title={t('base.openProfile', { name: person.name })}
            onClick={() => navigate('crew', { open: person.code })}
          >
            {text}
          </button>
        ) : (
          <span key={code} className="base-crew" data-crew={code}>{text}</span>
        );
      })}
    </span>
  );
}

/** A row of big buttons that switch between parts (room / sub-zones, exterior zones). */
function Segments({ items, value, onChange, attr }) {
  return (
    <div className="base-segs" role="tablist">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={cx('base-seg', `is-${item.status}`, item.id === value && 'is-on')}
          data-status={item.status}
          {...{ [attr]: item.id }}
          onClick={() => onChange(item.id)}
        >
          <span className="base-seg-name">{item.name}</span>
          <StatusTag status={item.status} />
        </button>
      ))}
    </div>
  );
}

/** Popup with one room: facts on one line, sub-zone switch, readings as paged tiles. */
function RoomDialog({ room, history, navigate, onClose }) {
  const { t } = useI18n();
  const name = t(room.def.labelKey);
  const [part, setPart] = useState(() => {
    if (isFlagged(room.status) || !room.subZones.length) return room.id;
    return room.subZones.find(sub => isFlagged(sub.status))?.code ?? room.id;
  });
  const sub = room.subZones.find(item => item.code === part) || null;
  const ownOccupants = room.subZones.length
    ? room.occupants.filter(code => !room.subZones.some(item => item.occupants.includes(code)))
    : room.occupants;
  const partName = sub ? t(`base.zone_${sub.code}`) : name;
  const readings = sub ? sub.readings : room.readings;
  // the title bar / selected segment already shows the sol status: NOW only when it differs
  const partStatus = sub ? sub.status : room.status;
  const nowStatus = sub ? sub.nowStatus : room.nowStatus;

  return (
    <DataDialog title={name} status={worstStatus([room.status, ...room.subZones.map(item => item.status)])} icon="base" onClose={onClose}>
      <div className="base-dlg" data-room={room.id} data-status={room.status}>
        <div className="base-facts">
          <p className="base-fact">
            <span className="base-fact-key">{t('base.zone')}</span>
            {room.simulated && !room.zone
              ? <span>{t('base.simulatedZone')}</span>
              : <span className="base-fact-text">{sub ? `${sub.code} · ${sub.label}` : `${room.zone}${room.zoneLabel ? ` · ${room.zoneLabel}` : ''}`}</span>}
          </p>
          {(!room.simulated || room.occupants.length > 0) && (
            <p className="base-fact">
              <span className="base-fact-key">{t('base.crewPresent')}</span>
              <CrewList occupants={sub ? sub.occupants : ownOccupants} navigate={navigate} />
            </p>
          )}
          {nowStatus !== partStatus && (
            <p className="base-fact" data-fact="now">
              <span className="base-fact-key">{t('base.statusNow')}</span>
              <StatusTag status={nowStatus} />
            </p>
          )}
        </div>
        {room.subZones.length > 0 && (
          <Segments
            attr="data-subzone"
            value={part}
            onChange={setPart}
            items={[
              { id: room.id, name, status: room.status },
              ...room.subZones.map(item => ({ id: item.code, name: t(`base.zone_${item.code}`), status: item.status })),
            ]}
          />
        )}
        <ReadingTiles
          key={part}
          readings={readings}
          label={t('base.readingsOf', { name: partName })}
          empty={!sub && room.status === 'no_data' ? t('base.noZoneData') : undefined}
          source={{ ...history, locator: { room: room.id, sub: sub ? sub.code : null } }}
        />
      </div>
    </DataDialog>
  );
}

/** Popup with the exterior zones (surface, cupolas): one zone at a time, key channels as tiles. */
function ExteriorDialog({ zones, history, onClose }) {
  const { t } = useI18n();
  const [code, setCode] = useState(() => worstFirst(zones)?.code ?? null);
  const zone = zones.find(item => item.code === code) || null;
  const channels = zone?.type === 'surface' ? SURFACE_CHANNELS : CUPOLA_CHANNELS;
  const readings = useMemo(
    () => (zone ? channels.map(channel => zone.readings.find(r => r.channel === channel)).filter(Boolean) : []),
    [zone, channels],
  );
  // sparklines: the same channels over the last sols, fetched while this popup is open
  const { bySol } = useSolHistory({ ...history, enabled: true });
  const sparks = zone
    ? Object.fromEntries(readings.map(reading => [reading.channel, channelSeries(bySol, { zone: zone.code }, reading.channel)]))
    : null;
  return (
    <DataDialog title={t('base.exterior')} status={worstStatus(zones.map(item => item.status))} icon="gauge" onClose={onClose}>
      <div className="base-dlg base-exterior">
        {zones.length === 0 && <p className="base-empty">{t('base.noReadings')}</p>}
        {zones.length > 0 && (
          <Segments
            attr="data-zone"
            value={code}
            onChange={setCode}
            items={zones.map(item => ({ id: item.code, name: zoneName(item.code, t), status: item.status }))}
          />
        )}
        {zone && (
          <ReadingTiles
            key={zone.code}
            readings={readings}
            grouped={false}
            source={{ ...history, locator: { zone: zone.code } }}
            sparks={sparks}
            label={t('base.readingsOf', { name: zoneName(zone.code, t) })}
          />
        )}
      </div>
    </DataDialog>
  );
}

function eventWindow(event, sol, t) {
  const sameSol = event.sol == null || event.sol === sol;
  const start = sameSol ? formatTimeUtc(event.start_utc) : formatDayTimeUtc(event.start_utc);
  const end = event.end_utc ? formatTimeUtc(event.end_utc) : t('base.eventOpen');
  const text = `${start ?? '—'} – ${end} UTC`;
  return sameSol ? text : `${t('common.solN', { n: event.sol })} · ${text}`;
}

/** Popup with the non-routine events of the sol, paged; the zone of an event opens its room. */
function EventsDialog({ events, sol, onOpenRoom, onClose }) {
  const { t } = useI18n();
  const { notable, evaStarts, evaEnds } = splitEvents(events);
  const listRef = useRef(null);
  const perPage = useFitCount(listRef, EVENT_ROW_PX, 5);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(notable.length / perPage));
  const current = Math.min(page, pages - 1);
  const shown = notable.slice(current * perPage, (current + 1) * perPage);
  const worst = worstStatus(notable.map(event => severityStatus(event.severity)));
  return (
    <DataDialog title={t('base.eventLog')} status={notable.length ? worst : undefined} icon="history" onClose={onClose}>
      <div className="base-dlg base-events">
        <div ref={listRef} className="base-event-area">
          {notable.length === 0 && <p className="base-empty">{t('base.noEvents')}</p>}
          <ul className="base-event-list">
            {shown.map(event => {
              const status = severityStatus(event.severity);
              const room = roomForZone(event.zone);
              return (
                <li key={event.code} className={cx('base-event', `is-${status}`)} data-event={event.type}>
                  <StatusTag status={status} />
                  <span className="base-event-main">
                    <span className="base-event-type">{eventTypeText(event.type)}</span>
                    <span className="base-event-sub">
                      {String(event.severity ?? '').toUpperCase()}{event.crew ? ` · ${event.crew}` : ''}
                      {' · '}{eventWindow(event, sol, t)}
                    </span>
                  </span>
                  {room ? (
                    <button type="button" className="base-event-zone is-link" onClick={() => onOpenRoom(room.id)}>
                      {zoneName(event.zone, t)}
                    </button>
                  ) : (
                    <span className="base-event-zone">{zoneName(event.zone, t)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="base-event-foot">
          {(evaStarts > 0 || evaEnds > 0) && (
            <p className="base-eva">{t('base.evaRoutine', { starts: evaStarts, ends: evaEnds })}</p>
          )}
          <Pager page={current} pages={pages} onPage={setPage} />
        </div>
      </div>
    </DataDialog>
  );
}

/**
 * BASE: interactive plan of the habitat on one screen. A slim header (habitat, sol control,
 * overall status), the map filling the rest, and two big buttons for the exterior zones and the
 * event log. A tap on a room opens its readings in a popup (big tiles, paged).
 *
 * Data: GET /api/habitat?sol=N through useHabitat (built-in demo data when MOTHER is
 * unreachable). The sol is the one useMother() keeps (mother.period), so every screen
 * shows the same sol; see useSharedSol.
 *
 * Screen props: { mother, session, viewedCode, setViewedCode, navigate, profile }.
 */
export default function BaseScreen({ mother, navigate }) {
  const { t, lang } = useI18n();
  const { sol, setSol } = useSharedSol(mother);
  const { data, loading, error, offline } = useHabitat({ sol });
  const model = useMemo(() => deriveHabitat(data), [data]);
  const [picked, setPicked] = useState(null); // null = automatic (worst room)
  const [dialog, setDialog] = useState(null); // null | 'room' | 'exterior' | 'events'

  const selectedId = picked ?? (data ? pickDefaultRoom(model.rooms) : null);
  const selected = model.rooms.find(room => room.id === selectedId) || null;

  const habitat = data?.habitat;
  const habitatName = habitat
    ? (habitat.code === MISSION.habitatCode ? localize(MISSION.habitat, lang) : habitat.name)
    : localize(MISSION.habitat, lang);
  const shownSol = data?.as_of?.sol ?? null;
  const latestSol = data?.as_of?.latest_sol ?? habitat?.mission_sols ?? MISSION.missionSols;
  const overall = data?.overall_status ?? 'no_data';

  const notable = data ? splitEvents(data.events).notable : [];
  const eventsStatus = !data ? 'no_data' : worstStatus(notable.map(event => severityStatus(event.severity)));
  const exteriorStatus = model.exterior.length ? worstStatus(model.exterior.map(zone => zone.status)) : 'no_data';
  const exteriorFlagged = model.exterior.filter(zone => isFlagged(zone.status)).length;

  const openRoom = useCallback(id => {
    if (!getRoom(id)) return;
    setPicked(id);
    setDialog('room');
  }, []);
  const close = useCallback(() => setDialog(null), []);
  const history = { sol: shownSol, data, offline };

  const current = sol ?? shownSol ?? latestSol;
  const step = delta => setSol(Math.min(latestSol, Math.max(1, Number(current) + delta)));

  return (
    <div className="base-screen">
      <header className="base-head">
        <div className="base-head-id">
          <h1 className="base-head-name" title={habitatName}>{habitatName}</h1>
          <div className="base-head-facts" data-testid="base-head-facts">
            <span className="base-head-sol">
              {shownSol != null ? t('common.solN', { n: shownSol }) : t('common.solUnknown')}
            </span>
            {habitat && (
              <span className="base-head-atm">
                {formatNumber(habitat.atm_pressure_kpa)} kPa · {formatNumber(habitat.atm_o2_fraction_pct)}% O2
              </span>
            )}
            <span className="base-head-overall">
              <span className="base-fact-key">{t('base.overall')}</span>
              <StatusTag status={overall} />
            </span>
          </div>
        </div>
        <div className="base-sol">
          <button type="button" className="base-sol-step" aria-label={t('base.solPrev')} disabled={Number(current) <= 1} onClick={() => step(-1)}><NavIcon name="minus" /></button>
          <SolControl value={sol} max={latestSol} latest={shownSol ?? undefined} onChange={setSol} />
          <button type="button" className="base-sol-step" aria-label={t('base.solNext')} disabled={Number(current) >= latestSol} onClick={() => step(1)}><NavIcon name="plus" /></button>
        </div>
      </header>

      {offline && (
        <p className="base-banner is-caution" role="status">
          <StatusTag status="caution" /> {t('base.offlineNote', { n: shownSol ?? '—' })}
        </p>
      )}
      {error && !offline && (
        <p className="base-banner is-alert" role="alert">
          <StatusTag status="alert" /> {t('base.loadError', { message: error.message })}
        </p>
      )}

      <section className="base-map" aria-label={t('base.mapTitle')}>
        <HabitatMap rooms={model.rooms} selectedId={selectedId} onSelect={openRoom} onCrewOpen={navigate ? code => navigate('crew', { open: code }) : undefined} />
        {!data && (
          <p className="base-map-status" role="status">{loading ? t('common.loading') : t('common.noData')}</p>
        )}
      </section>

      <footer className="base-foot">
        <div className="base-legend">
          <span className="base-legend-hint">{loading && data ? t('base.refreshing') : t('base.mapHint')}</span>
          <span className="base-legend-crew">{t('base.legendCrew')}</span>
          <span className="base-disclaimer">{t('base.disclaimer')}</span>
        </div>
        <button
          type="button"
          className={cx('base-big', `is-${exteriorStatus}`)}
          data-open="exterior"
          disabled={!data}
          onClick={() => setDialog('exterior')}
        >
          <NavIcon name="wind" className="base-big-icon" />
          <span className="base-big-text">
            <span className="base-big-label">{t('base.exterior')}</span>
            <span className="base-big-sub">{t('base.exteriorCount', { n: model.exterior.length, flagged: exteriorFlagged })}</span>
          </span>
          <StatusTag status={exteriorStatus} />
        </button>
        <button
          type="button"
          className={cx('base-big', `is-${eventsStatus}`)}
          data-open="events"
          disabled={!data}
          onClick={() => setDialog('events')}
        >
          <NavIcon name="list" className="base-big-icon" />
          <span className="base-big-text">
            <span className="base-big-label">{t('base.events')}</span>
            <span className="base-big-sub">{t('base.eventCount', { n: notable.length })}</span>
          </span>
          <StatusTag status={eventsStatus} />
        </button>
      </footer>

      {dialog === 'room' && selected && (
        <RoomDialog key={selected.id} room={selected} history={history} navigate={navigate} onClose={close} />
      )}
      {dialog === 'exterior' && data && <ExteriorDialog zones={model.exterior} history={history} onClose={close} />}
      {dialog === 'events' && data && (
        <EventsDialog events={data.events} sol={shownSol} onOpenRoom={openRoom} onClose={close} />
      )}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { Badge, Button, DataRow, Panel, SolControl, StatusTag, cx } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import { MISSION, getProfile, localize } from '../data/crewProfiles.js';
import HabitatMap from '../habitat/HabitatMap.jsx';
import ReadingsTable, { recoveryNote, rowStatus } from '../habitat/Readings.jsx';
import { getRoom, roomForZone } from '../habitat/layout.js';
import {
  deriveHabitat, eventTypeText, formatDayTimeUtc, formatNumber, formatTimeUtc, formatValue, pickDefaultRoom,
  severityStatus, splitEvents,
} from '../habitat/model.js';
import { useHabitat } from '../habitat/useHabitat.js';
import { useSharedSol } from '../habitat/useSharedSol.js';
import './base.css';

/** Channels listed in the [ EXTERIOR ] panel, per zone type, in this order. */
const SURFACE_CHANNELS = [
  'ext_temperature', 'ext_pressure', 'dust_opacity_tau', 'wind_speed', 'uv_flux', 'dose_rate', 'solar_proton_flux_10MeV',
];
const CUPOLA_CHANNELS = ['leak_detector', 'pressure_decay_rate', 'temperature_air', 'dose_rate'];

const panelTone = status => (status === 'alert' || status === 'caution' ? status : 'default');

/** Name of a database zone for people: its room on the map, else the exterior zone name, else the code. */
function zoneName(code, t) {
  if (!code) return '—';
  const room = roomForZone(code);
  if (room && room.zone === code) return t(room.labelKey);
  const key = `base.zone_${code}`;
  const text = t(key);
  return text === key ? code : text;
}

function CrewList({ occupants, navigate }) {
  const { t } = useI18n();
  if (!occupants.length) return <span className="base-dim">{t('base.crewNone')}</span>;
  return (
    <span className="base-crew-list">
      {occupants.map(code => {
        const person = getProfile(code);
        const text = person ? `${code} ${person.name}` : code;
        return person && navigate ? (
          <Button
            key={code}
            small
            variant="ghost"
            className="base-crew"
            data-crew={code}
            title={t('base.openProfile', { name: person.name })}
            onClick={() => navigate('profile', { viewedCode: person.code })}
          >
            {text}
          </Button>
        ) : (
          <span key={code} className="base-crew" data-crew={code}>{text}</span>
        );
      })}
    </span>
  );
}

function SubZone({ sub, navigate }) {
  const { t } = useI18n();
  const flagged = sub.status === 'caution' || sub.status === 'alert';
  const [open, setOpen] = useState(null); // null = automatic: open when the sub-zone needs attention
  const isOpen = open ?? flagged;
  const name = t(`base.zone_${sub.code}`);
  return (
    <section className={cx('base-sub', `is-${sub.status}`)} data-subzone={sub.code} data-status={sub.status}>
      <button
        type="button"
        className="base-sub-head"
        aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}
      >
        <span className="base-sub-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
        <span className="base-sub-name">{name}</span>
        <span className="base-sub-label">{sub.label}</span>
        <StatusTag status={sub.status} />
      </button>
      {isOpen && (
        <div className="base-sub-body">
          <p className="base-fact">
            <span className="base-fact-key">{t('base.crewPresent')}</span>
            <CrewList occupants={sub.occupants} navigate={navigate} />
          </p>
          <ReadingsTable readings={sub.readings} label={t('base.readingsOf', { name })} />
        </div>
      )}
    </section>
  );
}

function RoomPanel({ room, navigate }) {
  const { t } = useI18n();
  const name = t(room.def.labelKey);
  const ownOccupants = room.subZones.length
    ? room.occupants.filter(code => !room.subZones.some(sub => sub.occupants.includes(code)))
    : room.occupants;
  return (
    <Panel
      className="base-room"
      title={name}
      tone={panelTone(room.status)}
      data-room={room.id}
      meta={(
        <span className="base-meta">
          {room.simulated && <Badge kind="simulated" />}
          <StatusTag status={room.status} />
        </span>
      )}
    >
      <div className="base-facts">
        <p className="base-fact">
          <span className="base-fact-key">{t('base.zone')}</span>
          {room.simulated
            ? <span>{t('base.simulatedZone')}</span>
            : <span>{room.zone}{room.zoneLabel ? ` · ${room.zoneLabel}` : ''}</span>}
        </p>
        <p className="base-fact">
          <span className="base-fact-key">{t('base.statusSol')}</span>
          <StatusTag status={room.status} />
          <span className="base-fact-key base-fact-key-inline">{t('base.statusNow')}</span>
          <StatusTag status={room.nowStatus} />
        </p>
        {!room.simulated && (
          <p className="base-fact">
            <span className="base-fact-key">{t('base.crewPresent')}</span>
            <CrewList occupants={ownOccupants} navigate={navigate} />
          </p>
        )}
        {room.simulated && <p className="base-sim-note">{t('base.simulatedNote')}</p>}
      </div>

      <ReadingsTable
        readings={room.readings}
        label={t('base.readingsOf', { name })}
        empty={room.status === 'no_data' ? t('base.noZoneData') : undefined}
      />

      {room.subZones.length > 0 && (
        <div className="base-subs">
          <h3 className="base-subs-title">{t('base.subZones')}</h3>
          {room.subZones.map(sub => <SubZone key={sub.code} sub={sub} navigate={navigate} />)}
        </div>
      )}
    </Panel>
  );
}

function KeyReadings({ zone, channels }) {
  const { t } = useI18n();
  const rows = channels.map(channel => zone.readings.find(reading => reading.channel === channel)).filter(Boolean);
  if (rows.length === 0) return <p className="base-empty">{t('base.noReadings')}</p>;
  return rows.map(reading => (
    <DataRow
      key={reading.channel}
      data-channel={reading.channel}
      label={reading.label}
      value={formatValue(reading)}
      unit={reading.unit}
      status={rowStatus(reading) ?? undefined}
      note={recoveryNote(reading, t) ?? undefined}
    />
  ));
}

function ExteriorPanel({ zones }) {
  const { t } = useI18n();
  const worst = zones.some(zone => zone.status === 'alert') ? 'alert'
    : zones.some(zone => zone.status === 'caution') ? 'caution' : 'default';
  return (
    <Panel className="base-exterior" title={t('base.exterior')} tone={worst} meta={t('base.exteriorMeta')}>
      {zones.length === 0 && <p className="base-empty">{t('base.noReadings')}</p>}
      {zones.map(zone => (
        <section key={zone.code} className={cx('base-ext-zone', `is-${zone.status}`)} data-zone={zone.code}>
          <h3 className="base-ext-head">
            <span>{zoneName(zone.code, t)}</span>
            <StatusTag status={zone.status} />
          </h3>
          <KeyReadings zone={zone} channels={zone.type === 'surface' ? SURFACE_CHANNELS : CUPOLA_CHANNELS} />
        </section>
      ))}
    </Panel>
  );
}

function eventWindow(event, sol, t) {
  const sameSol = event.sol == null || event.sol === sol;
  const start = sameSol ? formatTimeUtc(event.start_utc) : formatDayTimeUtc(event.start_utc);
  const end = event.end_utc ? formatTimeUtc(event.end_utc) : t('base.eventOpen');
  const text = `${start ?? '—'} – ${end} UTC`;
  return sameSol ? text : `${t('common.solN', { n: event.sol })} · ${text}`;
}

function EventLog({ events, sol, onSelectRoom }) {
  const { t } = useI18n();
  const { notable, evaStarts, evaEnds } = splitEvents(events);
  return (
    <Panel className="base-events" title={t('base.eventLog')} meta={t('base.eventCount', { n: notable.length })}>
      {notable.length === 0 && <p className="base-empty">{t('base.noEvents')}</p>}
      <ul className="base-event-list">
        {notable.map(event => {
          const status = severityStatus(event.severity);
          const room = roomForZone(event.zone);
          return (
            <li key={event.code} className={cx('base-event', `is-${status}`)} data-event={event.type}>
              <StatusTag status={status} />
              <span className="base-event-type">{eventTypeText(event.type)}</span>
              {room ? (
                <Button small variant="ghost" className="base-event-zone" onClick={() => onSelectRoom(room.id)}>
                  {zoneName(event.zone, t)}
                </Button>
              ) : (
                <span className="base-event-zone">{zoneName(event.zone, t)}</span>
              )}
              <span className="base-event-severity">{String(event.severity ?? '').toUpperCase()}{event.crew ? ` · ${event.crew}` : ''}</span>
              <span className="base-event-time">{eventWindow(event, sol, t)}</span>
            </li>
          );
        })}
      </ul>
      {(evaStarts > 0 || evaEnds > 0) && (
        <p className="base-eva">{t('base.evaRoutine', { starts: evaStarts, ends: evaEnds })}</p>
      )}
    </Panel>
  );
}

/**
 * BASE: interactive plan of the habitat. The map on top; below it the selected room with
 * its readings, the exterior zones (surface, cupolas) and the sol's event log.
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

  const selectedId = picked ?? (data ? pickDefaultRoom(model.rooms) : null);
  const selected = model.rooms.find(room => room.id === selectedId) || null;

  const habitat = data?.habitat;
  const habitatName = habitat
    ? (habitat.code === MISSION.habitatCode ? localize(MISSION.habitat, lang) : habitat.name)
    : localize(MISSION.habitat, lang);
  const shownSol = data?.as_of?.sol ?? null;
  const latestSol = data?.as_of?.latest_sol ?? habitat?.mission_sols ?? MISSION.missionSols;
  const overall = data?.overall_status ?? 'no_data';

  return (
    <div className="base-screen">
      <header className="base-head">
        <div className="base-head-id">
          <h1 className="base-head-name">{habitatName}</h1>
          <span className="base-head-code">{habitat?.code ?? MISSION.habitatCode}</span>
        </div>
        <div className="base-head-facts" data-testid="base-head-facts">
          {habitat && (
            <span className="base-head-atm">
              {formatNumber(habitat.atm_pressure_kpa)} kPa · {formatNumber(habitat.atm_o2_fraction_pct)}% O2
            </span>
          )}
          <span className="base-head-sol">
            {shownSol != null ? t('common.solN', { n: shownSol }) : t('common.solUnknown')}
          </span>
          {data?.demo && <Badge kind="demo" />}
          {data && !data.demo && habitat?.data_kind === 'synthetic' && <Badge kind="synthetic" />}
          {data && !data.demo && habitat?.data_kind && habitat.data_kind !== 'synthetic' && (
            <Badge>{String(habitat.data_kind).toUpperCase()}</Badge>
          )}
          <span className="base-head-overall">
            <span className="base-fact-key">{t('base.overall')}</span>
            <StatusTag status={overall} />
          </span>
        </div>
        <SolControl
          className="base-sol"
          value={sol}
          max={latestSol}
          latest={shownSol ?? undefined}
          onChange={setSol}
        />
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

      <Panel
        className="base-map"
        title={t('base.mapTitle')}
        meta={loading && data ? t('base.refreshing') : t('base.mapHint')}
      >
        <div className="base-map-scroll">
          <HabitatMap rooms={model.rooms} selectedId={selectedId} onSelect={setPicked} />
        </div>
        <p className="base-legend" aria-hidden="true">
          <StatusTag status="ok" /> <StatusTag status="caution" /> <StatusTag status="alert" /> <StatusTag status="no_data" />
          <span className="base-legend-sim">{t('base.legendSimulated')}</span>
          <span className="base-legend-crew">{t('base.legendCrew')}</span>
        </p>
      </Panel>

      {!data && (
        <Panel className="base-loading" title={t('base.title')}>
          <p className="base-empty" role="status">{loading ? t('common.loading') : t('common.noData')}</p>
        </Panel>
      )}

      {data && (
        <div className="base-columns">
          {selected && <RoomPanel key={selected.id} room={selected} navigate={navigate} />}
          <div className="base-side">
            <EventLog events={data.events} sol={shownSol} onSelectRoom={id => getRoom(id) && setPicked(id)} />
            <ExteriorPanel zones={model.exterior} />
          </div>
        </div>
      )}

      <p className="base-disclaimer">{t('base.disclaimer')}</p>
    </div>
  );
}

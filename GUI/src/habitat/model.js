// Turns a GET /api/habitat response into what the base screen draws: one state per map
// room, the exterior zones, grouped readings and the event log. Pure functions, no React.

import { DEFAULT_ROOM_ID, EXTERIOR_ZONES, ROOMS, locateZone } from './layout.js';
import { isGuiSimulated, realReadingsFor, simulatedRoomReadings } from './simulatedRooms.js';
import { scenarioRoomReadings } from '../data/scenario.js';

/** Higher = worse. `unrated` (no threshold) never raises a status. */
export const STATUS_RANK = { ok: 0, unrated: 0, no_data: 1, caution: 2, alert: 3 };

const rank = status => STATUS_RANK[status] ?? 0;

/** Worst of several statuses; 'ok' for an empty list. */
export function worstStatus(statuses) {
  let worst = 'ok';
  for (const status of statuses) if (rank(status) > rank(worst)) worst = status;
  return worst === 'unrated' ? 'ok' : worst;
}

const zoneStatus = zone => (zone ? zone.status || 'no_data' : 'no_data');
const zoneNowStatus = zone => (zone ? zone.now_status || zone.status || 'no_data' : 'no_data');

/**
 * deriveHabitat(data) -> {
 *   sol, latestSol,
 *   rooms: [{ id, def, zone, zoneLabel, status, nowStatus, occupants, simulated, readings,
 *             subZones: [{ code, label, status, nowStatus, occupants, readings }] }],
 *   exterior: [zone, ...]   surface + cupolas (+ any zone the layout does not know)
 * }
 * Room status = status of its own zone only; sub-zones keep their own status.
 */
export function deriveHabitat(data) {
  const zones = Array.isArray(data?.zones) ? data.zones : [];
  const byCode = Object.fromEntries(zones.map(zone => [zone.code, zone]));
  const sol = data?.as_of?.sol ?? null;
  const tsUtc = data?.as_of?.last_reading_utc ?? null;

  const rooms = ROOMS.map(def => {
    if (def.simulated) {
      const readings = data
        ? [...scenarioRoomReadings(def.id, simulatedRoomReadings(def.id, sol, { tsUtc }), sol), ...realReadingsFor(def.id, byCode.surface)]
        : [];
      // The room colour comes from the simulated readings only: real surface channels
      // shown here are already counted in the exterior status.
      const own = readings.filter(isGuiSimulated);
      return {
        id: def.id, def, zone: null, zoneLabel: null, simulated: true,
        status: data ? worstStatus(own.map(reading => reading.worst_status)) : 'no_data',
        nowStatus: data ? worstStatus(own.map(reading => reading.status)) : 'no_data',
        occupants: byCode[def.id]?.occupants || [], readings, subZones: [],
      };
    }
    const zone = byCode[def.zone] || null;
    const subZones = def.subZones.map(code => {
      const sub = byCode[code] || null;
      return {
        code,
        label: sub?.label ?? code,
        status: zoneStatus(sub),
        nowStatus: zoneNowStatus(sub),
        occupants: sub?.occupants || [],
        readings: sub?.readings || [],
      };
    });
    const occupants = [...new Set([...(zone?.occupants || []), ...subZones.flatMap(sub => sub.occupants)])].sort();
    return {
      id: def.id, def, zone: def.zone, zoneLabel: zone?.label ?? null, simulated: false,
      status: zoneStatus(zone), nowStatus: zoneNowStatus(zone),
      occupants, readings: zone?.readings || [], subZones,
    };
  });

  const exterior = [
    ...EXTERIOR_ZONES.map(code => byCode[code]).filter(Boolean),
    ...zones.filter(zone => !locateZone(zone.code)),
  ];

  return { sol, latestSol: data?.as_of?.latest_sol ?? null, rooms, exterior };
}

/**
 * Room to open first: the worst real room (alert before caution; map order breaks ties),
 * else the recreation zone. Simulated rooms never win: they are placeholders.
 */
export function pickDefaultRoom(rooms) {
  let best = null;
  for (const room of rooms || []) {
    if (room.simulated) continue;
    const score = rank(room.status);
    if (score >= STATUS_RANK.caution && (!best || score > rank(best.status))) best = room;
  }
  return best ? best.id : DEFAULT_ROOM_ID;
}

// --- Reading groups (the team's sketch) -------------------------------------------------

/** Display order of the groups; labels are i18n keys `base.group<Id>`. */
export const GROUPS = [
  'pressure', 'air', 'temperature', 'humidity', 'contamination', 'radiation', 'integrity',
  'water', 'lightNoise', 'structure', 'power', 'systems', 'reactor', 'stores', 'exterior', 'other',
];

const BY_CHANNEL = {
  pressure_total: 'pressure',
  o2_fraction: 'air',
  ppo2_inspired: 'air',
  ppco2: 'air',
  temperature_air: 'temperature',
  rh: 'humidity',
};

const BY_CATEGORY = {
  air: 'contamination', // every other air channel: PM, ultrafine, VOC, NH3, CO ...
  radiation: 'radiation',
  integrity: 'integrity',
  water: 'water',
  noise_light: 'lightNoise',
  structure_thermal: 'structure',
  power: 'power',
  systems: 'systems',
  reactor: 'reactor',
  stores: 'stores',
  exterior: 'exterior',
};

/** Group id of one reading. */
export const groupOf = reading => BY_CHANNEL[reading.channel] || BY_CATEGORY[reading.category] || 'other';

/** [{ id, readings }] in display order, only groups that have readings. */
export function groupReadings(readings) {
  const buckets = new Map();
  for (const reading of readings || []) {
    const id = groupOf(reading);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(reading);
  }
  return GROUPS.filter(id => buckets.has(id)).map(id => ({ id, readings: buckets.get(id) }));
}

// --- Formatting -------------------------------------------------------------------------

/** 56.5075 -> '56.51', 0.0078 -> '0.0078', 1821.87 -> '1822' (4 significant digits). */
export function formatNumber(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
  const number = Number(value);
  if (number === 0) return '0';
  return String(Number(number.toPrecision(4)));
}

/** Latest value of a reading as text: number, or the categorical text in upper case; null when absent. */
export function formatValue(reading) {
  const number = formatNumber(reading?.value);
  if (number != null) return number;
  if (reading?.text != null && reading.text !== '') return String(reading.text).replace(/_/g, ' ').toUpperCase();
  return null;
}

/** 'min – max' of the sol, or null. */
export function formatRange(reading) {
  const lo = formatNumber(reading?.min);
  const hi = formatNumber(reading?.max);
  if (lo == null && hi == null) return null;
  return `${lo ?? '…'} – ${hi ?? '…'}`;
}

/** Normal range: '1.5 – 2.5', '≤ 34', '≥ 127', or null when the channel has none. */
export function formatNormal(reading) {
  const lo = formatNumber(reading?.normal_min);
  const hi = formatNumber(reading?.normal_max);
  if (lo != null && hi != null) return `${lo} – ${hi}`;
  if (hi != null) return `≤ ${hi}`;
  if (lo != null) return `≥ ${lo}`;
  return null;
}

/** '2039-05-26T21:41:00Z' -> '21:41' (UTC, as sent by MOTHER); null when missing. */
export function formatTimeUtc(ts) {
  const match = /T(\d{2}:\d{2})/.exec(String(ts ?? ''));
  return match ? match[1] : null;
}

/** '2039-05-26T21:41:00Z' -> '05-26 21:41'. */
export function formatDayTimeUtc(ts) {
  const match = /^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(ts ?? ''));
  return match ? `${match[1]} ${match[2]}` : null;
}

/**
 * The extreme of the sol that explains a worst_status worse than the latest status:
 * the side that left the normal range (max above, else min below), else the maximum.
 */
export function peakValue(reading) {
  const { min, max, normal_min: lo, normal_max: hi } = reading || {};
  if (hi != null && max != null && max > hi) return max;
  if (lo != null && min != null && min < lo) return min;
  return max ?? min ?? null;
}

/** True when the sol's worst status is worse than the latest reading (the fault has passed). */
export const hasRecovered = reading => rank(reading?.worst_status) > rank(reading?.status);

// --- Events -----------------------------------------------------------------------------

const ROUTINE_TYPES = new Set(['eva_start', 'eva_end']);

/** Routine = an ordinary EVA start / end (severity info). Everything else goes to the log. */
export const isRoutineEvent = event => ROUTINE_TYPES.has(event?.type) && (event?.severity ?? 'info') === 'info';

const SEVERITY_RANK = { critical: 4, major: 3, moderate: 2, minor: 1, info: 0 };

/** Event severity -> status colour: major / critical = alert, minor / moderate = caution, info = ok. */
export function severityStatus(severity) {
  const score = SEVERITY_RANK[severity] ?? 0;
  if (score >= 3) return 'alert';
  if (score >= 1) return 'caution';
  return 'ok';
}

/**
 * splitEvents(events) -> { notable: [...], evaStarts, evaEnds }
 * notable: non-routine events, most severe first, then by start time.
 */
export function splitEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const notable = list.filter(event => !isRoutineEvent(event)).sort((a, b) =>
    (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    || String(a.start_utc).localeCompare(String(b.start_utc)));
  return {
    notable,
    evaStarts: list.filter(event => event.type === 'eva_start' && isRoutineEvent(event)).length,
    evaEnds: list.filter(event => event.type === 'eva_end' && isRoutineEvent(event)).length,
  };
}

/** 'scrubber_fault' -> 'SCRUBBER FAULT' */
export const eventTypeText = type => String(type ?? '').replace(/_/g, ' ').toUpperCase();

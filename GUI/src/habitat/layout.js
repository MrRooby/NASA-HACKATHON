// Single source of truth: rooms drawn on the habitat map -> zones of the MOTHER database
// (GET /api/habitat, astro_habitat.zone). The map follows the team's reference plan.
//
// Three rooms of the plan (service / storage, technical zone, reactor) have no zone in the
// database: their readings are generated in the GUI (see simulatedRooms.js) and are always
// labelled SIMULATED.

import { ROOM_PATHS } from './geometry.js';

/**
 * Room fields:
 *   id         stable id used by the map and the screen
 *   zone       database zone code, or null for a GUI-simulated room
 *   subZones   database zones shown inside this room (own status chips, not the room colour)
 *   simulated  true when the room has no database zone
 *   labelKey   i18n key of the full room name (panel title, aria-label)
 *   mapLabelKey i18n key of the text drawn on the map (defaults to labelKey)
 *   path       SVG path of the room interior (viewBox 0 0 2048 599)
 *   label      anchor of the map label: { x, y, rotate?, wrap?, align? }
 *   crew       top-left of the first crew marker: { x, y, cols? } (cols = markers per row)
 *   marks      top-left of the first sub-zone marker: { x, y } (rooms with sub-zones)
 */
export const ROOMS = [
  {
    id: 'airlock_1', zone: 'airlock_A', subZones: [], simulated: false,
    labelKey: 'base.roomAirlock1',
    path: ROOM_PATHS.airlock_1,
    label: { x: 112, y: 303, rotate: 81, small: true }, // along the slanted airlock walls
    crew: { x: 119, y: 283, cols: 1 },
  },
  {
    id: 'airlock_2', zone: 'airlock_B', subZones: [], simulated: false,
    labelKey: 'base.roomAirlock2',
    path: ROOM_PATHS.airlock_2,
    label: { x: 193, y: 305, rotate: 79, small: true },
    crew: { x: 198, y: 264, cols: 1 },
  },
  {
    id: 'service', zone: null, subZones: [], simulated: true,
    labelKey: 'base.roomService',
    path: ROOM_PATHS.service,
    label: { x: 421, y: 178 },
    crew: { x: 330, y: 210 },
  },
  {
    id: 'medbay', zone: 'ambulatory', subZones: [], simulated: false,
    labelKey: 'base.roomMedbay',
    path: ROOM_PATHS.medbay,
    label: { x: 300, y: 311 },
    crew: { x: 262, y: 338 },
  },
  {
    id: 'recreation', zone: 'tunnel_common', subZones: ['gym', 'farm'], simulated: false,
    labelKey: 'base.roomRecreation',
    path: ROOM_PATHS.recreation,
    label: { x: 850, y: 178 },
    crew: { x: 742, y: 262 },
    marks: { x: 742, y: 310 },
  },
  {
    id: 'lab', zone: 'lab', subZones: [], simulated: false,
    labelKey: 'base.roomLab',
    path: ROOM_PATHS.lab,
    label: { x: 1112, y: 181 },
    crew: { x: 1066, y: 216 },
  },
  {
    id: 'quarters_north', zone: 'module_M1', subZones: [], simulated: false,
    labelKey: 'base.roomQuartersNorth', mapLabelKey: 'base.mapQuartersNorth',
    path: ROOM_PATHS.quarters_north,
    label: { x: 1392, y: 233 },
    crew: { x: 1300, y: 256 },
  },
  {
    id: 'quarters_south', zone: 'module_M2', subZones: [], simulated: false,
    labelKey: 'base.roomQuartersSouth', mapLabelKey: 'base.mapQuartersSouth',
    path: ROOM_PATHS.quarters_south,
    label: { x: 1392, y: 366 },
    crew: { x: 1300, y: 392 },
  },
  {
    id: 'technical', zone: null, subZones: [], simulated: true,
    labelKey: 'base.roomTechnical',
    path: ROOM_PATHS.technical,
    label: { x: 1602, y: 278, wrap: true, align: 'start', lineHeight: 43 },
    crew: { x: 1614, y: 370 },
  },
  {
    id: 'reactor', zone: null, subZones: [], simulated: true,
    labelKey: 'base.roomReactor',
    path: ROOM_PATHS.reactor,
    label: { x: 1893, y: 270 },
    crew: { x: 1858, y: 310 },
  },
];

/** Database zones that are outside the pressurised tube and therefore not on the map. */
export const EXTERIOR_ZONES = ['surface', 'cupola_1', 'cupola_2', 'cupola_3', 'cupola_4'];

export const ROOM_IDS = ROOMS.map(room => room.id);
export const SIMULATED_ROOM_IDS = ROOMS.filter(room => room.simulated).map(room => room.id);
export const DEFAULT_ROOM_ID = 'recreation';

const byId = Object.fromEntries(ROOMS.map(room => [room.id, room]));

/** Room definition by id, or null. */
export const getRoom = id => byId[id] ?? null;

/** Where a database zone is shown: { kind: 'room' | 'subzone' | 'exterior', roomId } or null. */
export function locateZone(zoneCode) {
  for (const room of ROOMS) {
    if (room.zone === zoneCode) return { kind: 'room', roomId: room.id };
    if (room.subZones.includes(zoneCode)) return { kind: 'subzone', roomId: room.id };
  }
  if (EXTERIOR_ZONES.includes(zoneCode)) return { kind: 'exterior', roomId: null };
  return null;
}

/** Room that shows a database zone (as its own zone or as a sub-zone), or null. */
export const roomForZone = zoneCode => {
  const place = locateZone(zoneCode);
  return place && place.roomId ? byId[place.roomId] : null;
};

/** Every database zone the GUI knows how to place (rooms, sub-zones, exterior). */
export const MAPPED_ZONES = [
  ...ROOMS.flatMap(room => [room.zone, ...room.subZones]).filter(Boolean),
  ...EXTERIOR_ZONES,
];

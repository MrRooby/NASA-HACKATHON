// Base screen (interactive habitat map). Keep the same keys in pl/base.js.
// Channel labels and zone descriptions come from MOTHER in English and are not translated.
export default {
  title: 'Base',

  // Header
  overall: 'HABITAT',
  offlineNote: 'MOTHER unreachable · built-in habitat, sol {n}',
  loadError: 'Habitat data not loaded: {message}',
  refreshing: 'REFRESHING…',
  disclaimer: 'Thresholds are demonstrative, not operational limits.',

  // Map
  mapTitle: 'HABITAT MAP',
  mapAria: 'Habitat map: select a room',
  mapHint: 'TAP A ROOM',
  simulated: 'SIMULATED',
  crewHere: 'crew: {codes}',
  legendCrew: '● = CREW MEMBER, TAP TO OPEN',

  // Rooms (full names) and the shorter texts drawn on the map
  roomAirlock1: 'AIRLOCK 1',
  roomAirlock2: 'AIRLOCK 2',
  roomService: 'SERVICE / STORAGE',
  roomMedbay: 'MEDBAY',
  roomRecreation: 'RECREATION ZONE',
  roomLab: 'LAB',
  roomQuartersNorth: 'CREW QUARTERS N',
  roomQuartersSouth: 'CREW QUARTERS S',
  roomTechnical: 'TECHNICAL ZONE',
  roomReactor: 'REACTOR',
  mapQuartersNorth: 'CREW QUARTERS N',
  mapQuartersSouth: 'CREW QUARTERS S',

  // Database zones that are not a room of their own
  zone_gym: 'GYM',
  zone_farm: 'FARM',
  zone_surface: 'SURFACE',
  zone_cupola_1: 'CUPOLA 1',
  zone_cupola_2: 'CUPOLA 2',
  zone_cupola_3: 'CUPOLA 3',
  zone_cupola_4: 'CUPOLA 4',

  // Selected room
  zone: 'ZONE',
  statusNow: 'NOW',
  crewPresent: 'CREW PRESENT',
  crewNone: 'NOBODY',
  openProfile: 'Open the profile of {name}',
  readingsOf: 'Readings: {name}',
  noReadings: 'No readings in this sol.',
  noZoneData: 'This zone sent no data in this sol.',
  simulatedZone: 'none in the database',

  // Readings table
  colRange: 'SOL MIN – MAX',
  colNormal: 'NORMAL',
  colTime: 'TIME (UTC)',
  unrated: 'INFO',
  unratedHint: 'Informative channel: no threshold, not rated',
  peakNow: 'PEAK {peak} · {now}',
  faultEarlier: 'FAULT EARLIER THIS SOL · {now}',
  nowOk: 'NOW OK',
  nowCaution: 'NOW CAUTION',
  nowAlert: 'NOW ALERT',
  outsideNormal: 'OUTSIDE NORMAL RANGE (INFORMATIVE)',
  qualitySuspect: 'SENSOR SUSPECT',
  qualityFault: 'SENSOR FAULT',
  qualityOther: 'QUALITY: {quality}',

  // Reading groups
  group_pressure: 'PRESSURE',
  group_air: 'AIR COMPOSITION',
  group_temperature: 'TEMPERATURE',
  group_humidity: 'HUMIDITY',
  group_contamination: 'AIR CONTAMINATION',
  group_radiation: 'RADIATION',
  group_integrity: 'AIRLOCK / INTEGRITY',
  group_water: 'WATER',
  group_lightNoise: 'LIGHT & NOISE',
  group_structure: 'STRUCTURE',
  group_power: 'POWER',
  group_systems: 'LIFE SUPPORT (ECLSS)',
  group_reactor: 'REACTOR',
  group_stores: 'STORES',
  group_exterior: 'WEATHER',
  group_other: 'OTHER',

  // Exterior and events
  exterior: 'EXTERIOR',
  eventLog: 'EVENT LOG',
  eventCount: 'NON-ROUTINE: {n}',
  noEvents: 'No non-routine events in this sol.',
  eventOpen: 'OPEN',
  evaRoutine: 'ROUTINE, NOT LISTED: {starts} EVA STARTS · {ends} EVA ENDS',

  // Touch layout
  solPrev: 'Previous sol',
  solNext: 'Next sol',
  events: 'EVENTS',
  exteriorCount: '{n} ZONES · {flagged} FLAGGED',
  back: 'BACK',
  colGroup: 'GROUP',
  colSensors: 'SENSORS',
  colQuality: 'QUALITY',
  trendTitle: 'LAST {n} SOLS',
  trendOf: 'Trend: {name}',
  noHistory: 'No history: MOTHER is offline.',
  noTrend: 'No trend for a text value.',
  historyLoading: 'LOADING…',
};

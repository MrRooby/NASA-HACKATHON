// Readings for the three rooms of the plan that have no zone in the MOTHER database:
// service / storage, technical zone and reactor.
//
// They are generated HERE, in the GUI, from a fixed seed and the sol number: the same sol
// always gives the same numbers. They are plausible placeholders, not measurements, and
// every reading carries source_flag 'gui_simulated' so the UI can badge it SIMULATED.
// The shape is the same as a reading of GET /api/habitat.

export const SIM_SOURCE_FLAG = 'gui_simulated';
export const SIM_SEED = 20261114;

// kind 'steady': base level with a slow drift over the mission and a small spread per sol.
// kind 'stock':  a store that is used up linearly from `start` (sol 1) to `end` (sol 600).
// kind 'cycle':  saw-tooth between `low` and `high` every `period` sols (bed changed out).
const SPECS = {
  service: [
    { channel: 'pressure_total', label: 'Total pressure', category: 'air', unit: 'kPa',
      kind: 'steady', base: 56.5, drift: 0.04, spread: 0.16, normal_min: 56, normal_max: 57, digits: 3 },
    { channel: 'temperature_air', label: 'Air temperature', category: 'air', unit: '°C',
      kind: 'steady', base: 21.3, drift: 0.3, spread: 0.5, normal_min: 20, normal_max: 25, digits: 2 },
    { channel: 'rh', label: 'Relative humidity', category: 'air', unit: '%RH',
      kind: 'steady', base: 38, drift: 2, spread: 3.5, normal_min: 30, normal_max: 60, digits: 2 },
    { channel: 'pm10', label: 'Particulate matter PM10', category: 'air', unit: 'mg/m3',
      kind: 'steady', base: 0.014, drift: 0.002, spread: 0.004, normal_min: null, normal_max: 0.05, digits: 4 },
    { channel: 'spare_parts_level', label: 'Spare parts stock', category: 'stores', unit: '%',
      kind: 'stock', start: 100, end: 52, spread: 0.2, normal_min: 30, normal_max: null, digits: 1 },
    { channel: 'consumables_level', label: 'Consumables stock (food, filters, medical)', category: 'stores', unit: '%',
      kind: 'stock', start: 100, end: 36, spread: 0.3, normal_min: 25, normal_max: null, digits: 1 },
  ],
  technical: [
    { channel: 'eclss_loop_pressure', label: 'ECLSS coolant loop pressure', category: 'systems', unit: 'kPa',
      kind: 'steady', base: 310, drift: 4, spread: 6, normal_min: 280, normal_max: 340, digits: 1 },
    { channel: 'coolant_temp', label: 'Coolant loop temperature', category: 'systems', unit: '°C',
      kind: 'steady', base: 17.5, drift: 0.6, spread: 0.9, normal_min: 10, normal_max: 25, digits: 2 },
    { channel: 'scrubber_bed_saturation', label: 'CO2 scrubber bed saturation', category: 'systems', unit: '%',
      kind: 'cycle', low: 12, high: 74, period: 9, spread: 3, normal_min: null, normal_max: 85, digits: 1 },
    { channel: 'water_buffer_level', label: 'Process water buffer tank level', category: 'water', unit: 'L',
      kind: 'steady', base: 640, drift: 12, spread: 9, normal_min: 400, normal_max: null, digits: 1 },
  ],
  reactor: [
    { channel: 'core_outlet_temp', label: 'Core outlet temperature', category: 'reactor', unit: '°C',
      kind: 'steady', base: 802, drift: 3, spread: 5, normal_min: 760, normal_max: 840, digits: 1 },
    { channel: 'coolant_flow', label: 'Primary coolant flow', category: 'reactor', unit: 'kg/s',
      kind: 'steady', base: 1.9, drift: 0.03, spread: 0.05, normal_min: 1.6, normal_max: 2.2, digits: 3 },
    { channel: 'shield_dose_rate', label: 'Dose rate at shield boundary', category: 'radiation', unit: 'µGy/h',
      kind: 'steady', base: 14, drift: 0.8, spread: 1.6, normal_min: null, normal_max: 25, digits: 2 },
    { channel: 'electrical_output_gross', label: 'Electrical output (gross)', category: 'power', unit: 'kW',
      kind: 'steady', base: 42.4, drift: 0.2, spread: 0.4, normal_min: 40, normal_max: 45, digits: 2 },
  ],
};

export const SIMULATED_ROOM_IDS = Object.keys(SPECS);
export const MISSION_SOLS = 600;

/** FNV-1a hash of a string -> uint32. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic PRNG, returns () -> [0, 1). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value, digits) => Number(value.toFixed(digits));

function centre(spec, sol) {
  if (spec.kind === 'stock') {
    const used = Math.min(1, Math.max(0, (sol - 1) / (MISSION_SOLS - 1)));
    return spec.start + (spec.end - spec.start) * used;
  }
  if (spec.kind === 'cycle') {
    const phase = (((sol - 1) % spec.period) + spec.period) % spec.period;
    return spec.low + (spec.high - spec.low) * (phase / (spec.period - 1));
  }
  // steady: slow seasonal drift over the mission
  return spec.base + spec.drift * Math.sin((2 * Math.PI * sol) / 170 + (hash(spec.channel) % 628) / 100);
}

const outside = (value, spec) =>
  (spec.normal_min != null && value < spec.normal_min) || (spec.normal_max != null && value > spec.normal_max);

/** Same rule as MOTHER for channels without limits: outside the normal range -> caution. */
const rate = (value, spec) => (outside(value, spec) ? 'caution' : 'ok');

function simulate(roomId, spec, sol, tsUtc) {
  const random = prng(SIM_SEED ^ hash(`${roomId}/${spec.channel}/${sol}`));
  const mid = centre(spec, sol);
  const low = mid - spec.spread * (0.35 + 0.65 * random());
  const high = mid + spec.spread * (0.35 + 0.65 * random());
  const value = round(low + (high - low) * random(), spec.digits);
  const min = Math.min(round(low, spec.digits), value);
  const max = Math.max(round(high, spec.digits), value);
  const status = rate(value, spec);
  const worst = status === 'caution' || outside(min, spec) || outside(max, spec) ? 'caution' : 'ok';
  return {
    channel: spec.channel,
    label: spec.label,
    category: spec.category,
    unit: spec.unit,
    value,
    text: null,
    ts_utc: tsUtc ?? null,
    min,
    max,
    normal_min: spec.normal_min,
    normal_max: spec.normal_max,
    outside_normal: outside(value, spec),
    status,
    worst_status: worst,
    quality: 'ok',
    source_flag: SIM_SOURCE_FLAG,
    sensors: null,
  };
}

/**
 * Simulated readings of one room for one sol.
 * roomId: 'service' | 'technical' | 'reactor' (anything else -> []).
 * sol: mission sol (number); tsUtc: timestamp to stamp the readings with (optional).
 */
export function simulatedRoomReadings(roomId, sol, { tsUtc = null } = {}) {
  const specs = SPECS[roomId];
  if (!specs) return [];
  const day = Number.isFinite(Number(sol)) ? Math.round(Number(sol)) : 0;
  return specs.map(spec => simulate(roomId, spec, day, tsUtc));
}

/** True for a reading generated by the GUI (not from MOTHER). */
export const isGuiSimulated = reading => reading?.source_flag === SIM_SOURCE_FLAG;

/**
 * Real channels of the database zone `surface` that physically belong to a simulated
 * room; they are shown there next to the simulated readings, marked as coming from MOTHER.
 */
export const REAL_CHANNELS = {
  service: [],
  technical: ['power_eclss', 'power_hvac', 'power_lighting', 'moxie_o2_rate'],
  reactor: ['power_fission', 'power_solar'],
};

/** Real readings (from the API's surface zone) to show in a simulated room. */
export function realReadingsFor(roomId, surfaceZone) {
  const wanted = REAL_CHANNELS[roomId] || [];
  const readings = surfaceZone?.readings || [];
  return wanted
    .map(channel => readings.find(reading => reading.channel === channel))
    .filter(Boolean)
    .map(reading => ({ ...reading, from_zone: surfaceZone.code }));
}

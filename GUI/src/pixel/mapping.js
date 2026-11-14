// Domain → icon name lookups shared by every screen.

/** Organ id (src/organs) → icon name. */
export const ORGAN_ICON = Object.freeze({
  brain: 'brain',
  eyes: 'eye',
  heart: 'heart',
  lungs: 'lungs',
  blood: 'blood',
  kidneys: 'kidneys',
  gut: 'stomach',
  musculoskeletal: 'bone',
  limbs: 'limb',
  exposure: 'radiation',
});

const MEASUREMENT_ICON = {
  bp: 'bp', blood_pressure: 'bp', systolic: 'bp', diastolic: 'bp',
  hr: 'hr', heart_rate: 'hr', pulse: 'hr', hrv: 'hr',
  spo2: 'spo2', oxygen: 'spo2',
  glucose: 'glucose',
  temp: 'thermometer', temperature: 'thermometer', body_temp: 'thermometer',
  sleep: 'sleep', sleep_hours: 'sleep',
  mood: 'mood_3',
  water: 'water_cup', water_intake: 'water_cup', fluid: 'water_cup',
  urine: 'urine', urine_sample: 'dipstick', urine_volume: 'urine', dipstick: 'dipstick',
  weight: 'scale', mass: 'scale', body_mass: 'scale',
  blood_draw: 'syringe', blood: 'syringe', blood_sample: 'test_tube',
  meal: 'stomach', calories: 'stomach', bristol: 'stomach',
  exercise: 'dumbbell', ared: 'dumbbell', treadmill: 'treadmill', training: 'dumbbell',
  grip: 'grip', grip_strength: 'grip',
  visual_acuity: 'eye_chart', acuity: 'eye_chart', fundus: 'camera', fundus_photo: 'camera',
  iop: 'eye', eye_pressure: 'eye',
  dose: 'radiation', radiation: 'radiation', radiation_dose: 'radiation',
  medication: 'pill', pill: 'pill',
  pvt: 'pvt', gonogo: 'gonogo', go_nogo: 'gonogo', dsst: 'dsst',
  questionnaire: 'questionnaire', survey: 'questionnaire',
  ppc: 'chat', psych: 'chat', chat: 'chat',
  report: 'satellite',
  wearable: 'limb', band: 'limb',
};

/** Measurement kind ('bp', 'hr', 'mood' …) → icon name; unknown kinds get 'questionnaire'. */
export function iconForMeasurement(kind) {
  if (!kind) return 'questionnaire';
  const key = String(kind).toLowerCase();
  if (MEASUREMENT_ICON[key]) return MEASUREMENT_ICON[key];
  const mood = key.match(/^mood_?([1-5])$/);
  if (mood) return `mood_${mood[1]}`;
  return 'questionnaire';
}

const CHANNEL_ICON = {
  pressure_total: 'pressure', pressure_decay_rate: 'airlock', ext_pressure: 'pressure',
  o2_fraction: 'o2', ppo2_inspired: 'o2', moxie_o2_rate: 'o2',
  ppco2: 'co2',
  temperature_air: 'thermometer_room', wall_temperature: 'thermometer_room',
  ext_temperature: 'thermometer_room', heating_power: 'thermometer_room',
  rh: 'humidity',
  pm10: 'dust', pm2_5: 'dust', ultrafine_count: 'dust', dust_opacity_tau: 'dust',
  voc_benzene: 'dust', voc_formaldehyde: 'dust',
  dose_rate: 'radiation_sensor', uv_flux: 'sun',
  leak_detector: 'airlock',
  water_tank_level: 'water_tank', water_recovery: 'water_tank', water_coliform: 'test_tube',
  illuminance: 'light', cct: 'light', noise_leq: 'noise',
  strain: 'structure', wall_convergence: 'structure',
  power_fission: 'reactor', power_solar: 'sun', power_farm: 'plant',
  power_eclss: 'power', power_hvac: 'wind', power_lighting: 'light',
  wind_speed: 'wind',
  zone_occupancy: 'crew',
  subsystem_status: 'gear',
  fecal_canister_fill: 'stomach', waste_dump_event: 'stomach',
};

const CATEGORY_ICON = {
  pressure: 'pressure',
  air: 'dust', atmosphere: 'o2', contamination: 'dust',
  temperature: 'thermometer_room', humidity: 'humidity',
  radiation: 'radiation_sensor',
  integrity: 'airlock', airlock: 'airlock',
  water: 'water_tank',
  noise_light: 'light', lightNoise: 'light', light: 'light', noise: 'noise',
  structure_thermal: 'structure', structure: 'structure',
  power: 'power', reactor: 'reactor', systems: 'gear', stores: 'water_tank',
  exterior: 'sun', presence: 'crew', feces: 'stomach',
};

/**
 * Habitat reading → icon name. The channel is more specific than the category
 * (category 'air' holds O₂, CO₂ and dust alike), so it wins when known.
 */
export function iconForReadingCategory(category, channel) {
  if (channel && CHANNEL_ICON[channel]) return CHANNEL_ICON[channel];
  if (category && CATEGORY_ICON[category]) return CATEGORY_ICON[category];
  return 'gear';
}

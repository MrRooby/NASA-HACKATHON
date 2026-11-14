// Pixel icons of habitat things (names from src/pixel, DESIGN.md §5).

/** Map room id -> icon. */
export const ROOM_ICON = {
  airlock_1: 'airlock',
  airlock_2: 'airlock',
  service: 'gear',
  medbay: 'syringe',
  recreation: 'plant',
  lab: 'test_tube',
  quarters_north: 'crew',
  quarters_south: 'crew',
  technical: 'power',
  reactor: 'reactor',
};

/** Database zone -> icon (sub-zones and exterior zones). */
export const ZONE_ICON = {
  gym: 'dumbbell',
  farm: 'plant',
  surface: 'sun',
  cupola_1: 'light',
  cupola_2: 'light',
  cupola_3: 'light',
  cupola_4: 'light',
};

/** Habitat event type -> icon. */
export const EVENT_ICON = {
  scrubber_fault: 'co2', co2_spike: 'co2',
  leak: 'airlock', pressure_leak: 'airlock', depressurization: 'airlock',
  eva_start: 'airlock', eva_end: 'airlock',
  dust_storm: 'wind', solar_particle_event: 'radiation', spe: 'radiation',
  power_fault: 'power', power_loss: 'power',
  maintenance: 'gear', waste_dump: 'stomach', water_fault: 'water_tank',
  fire: 'alert', medical: 'heart',
};

export const eventIcon = type => EVENT_ICON[type] || 'alert';

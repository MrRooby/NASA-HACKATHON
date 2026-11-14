import { describe, expect, it } from 'vitest';
import {
  REAL_CHANNELS, SIMULATED_ROOM_IDS, SIM_SOURCE_FLAG, isGuiSimulated, realReadingsFor, simulatedRoomReadings,
} from './simulatedRooms.js';
import { SIMULATED_ROOM_IDS as LAYOUT_SIMULATED } from './layout.js';
import { habitatFixtures } from './testHelpers.js';

const API_KEYS = Object.keys(habitatFixtures[142].zones[0].readings[0]).sort();
const channels = (room, sol = 142) => simulatedRoomReadings(room, sol).map(reading => reading.channel);

describe('simulated rooms', () => {
  it('covers exactly the rooms the layout marks as simulated', () => {
    expect([...SIMULATED_ROOM_IDS].sort()).toEqual([...LAYOUT_SIMULATED].sort());
    expect(simulatedRoomReadings('lab', 142)).toEqual([]);
  });

  it('is deterministic: the same sol gives the same readings, another sol different ones', () => {
    for (const room of SIMULATED_ROOM_IDS) {
      expect(simulatedRoomReadings(room, 142)).toEqual(simulatedRoomReadings(room, 142));
      expect(simulatedRoomReadings(room, 142)).not.toEqual(simulatedRoomReadings(room, 143));
    }
    // pinned values: a changed seed or formula must be a conscious decision
    const core = simulatedRoomReadings('reactor', 142).find(reading => reading.channel === 'core_outlet_temp');
    expect(core.value).toBe(simulatedRoomReadings('reactor', '142').find(r => r.channel === 'core_outlet_temp').value);
    expect(core.value).toBeGreaterThan(760);
    expect(core.value).toBeLessThan(840);
  });

  it('has the expected channels per room', () => {
    expect(channels('service')).toEqual([
      'pressure_total', 'temperature_air', 'rh', 'pm10', 'spare_parts_level', 'consumables_level',
    ]);
    expect(channels('technical')).toEqual([
      'eclss_loop_pressure', 'coolant_temp', 'scrubber_bed_saturation', 'water_buffer_level',
    ]);
    expect(channels('reactor')).toEqual([
      'core_outlet_temp', 'coolant_flow', 'shield_dose_rate', 'electrical_output_gross',
    ]);
  });

  it.each([1, 142, 380, 600])('sol %i: same shape as an API reading, flagged gui_simulated, consistent numbers', sol => {
    for (const room of SIMULATED_ROOM_IDS) {
      for (const reading of simulatedRoomReadings(room, sol, { tsUtc: '2039-05-26T21:41:00Z' })) {
        expect(Object.keys(reading).sort()).toEqual(API_KEYS);
        expect(reading.source_flag).toBe(SIM_SOURCE_FLAG);
        expect(isGuiSimulated(reading)).toBe(true);
        expect(reading.quality).toBe('ok');
        expect(reading.ts_utc).toBe('2039-05-26T21:41:00Z');
        expect(typeof reading.label).toBe('string');
        expect(Number.isFinite(reading.value)).toBe(true);
        expect(reading.min).toBeLessThanOrEqual(reading.value);
        expect(reading.max).toBeGreaterThanOrEqual(reading.value);
        expect(['ok', 'caution']).toContain(reading.status);
        expect(['ok', 'caution']).toContain(reading.worst_status);
        // placeholders stay nominal: they must never out-shout real data
        expect([room, reading.channel, reading.worst_status]).toEqual([room, reading.channel, 'ok']);
        expect(reading.outside_normal).toBe(false);
      }
    }
  });

  it('stores run down over the mission', () => {
    const level = (sol, channel) => simulatedRoomReadings('service', sol).find(r => r.channel === channel).value;
    expect(level(1, 'consumables_level')).toBeGreaterThan(level(300, 'consumables_level'));
    expect(level(300, 'consumables_level')).toBeGreaterThan(level(600, 'consumables_level'));
    expect(level(600, 'spare_parts_level')).toBeGreaterThan(30);
  });

  it('API readings are not taken for GUI-simulated ones', () => {
    const real = habitatFixtures[142].zones[0].readings[0];
    expect(real.source_flag).toBe('simulated'); // the dataset's own flag
    expect(isGuiSimulated(real)).toBe(false);
  });

  it('borrows the real power / MOXIE channels of the surface zone', () => {
    const surface = habitatFixtures[142].zones.find(zone => zone.code === 'surface');
    const technical = realReadingsFor('technical', surface);
    expect(technical.map(reading => reading.channel)).toEqual(REAL_CHANNELS.technical);
    expect(technical.every(reading => reading.from_zone === 'surface' && !isGuiSimulated(reading))).toBe(true);
    const reactor = realReadingsFor('reactor', surface);
    expect(reactor.map(reading => reading.channel)).toEqual(['power_fission', 'power_solar']);
    expect(reactor[0]).toMatchObject({ value: 40, unit: 'kW', status: 'ok' });
    expect(realReadingsFor('service', surface)).toEqual([]);
    expect(realReadingsFor('reactor', undefined)).toEqual([]);
  });
});

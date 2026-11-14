import { describe, expect, it } from 'vitest';
import {
  deriveHabitat, eventTypeText, formatDayTimeUtc, formatNormal, formatNumber, formatRange, formatTimeUtc, formatValue,
  groupOf, groupReadings, hasRecovered, isRoutineEvent, peakValue, pickDefaultRoom, severityStatus, splitEvents, worstStatus,
} from './model.js';
import { isGuiSimulated } from './simulatedRooms.js';
import { habitatFixtures } from './testHelpers.js';

const room = (model, id) => model.rooms.find(item => item.id === id);
const reading = (list, channel) => list.find(item => item.channel === channel);

describe('habitat model', () => {
  it('derives one state per room at sol 142 (scrubber fault in module_M1)', () => {
    const model = deriveHabitat(habitatFixtures[142]);
    expect(model.sol).toBe(142);
    expect(model.latestSol).toBe(600);
    expect(model.rooms.map(item => [item.id, item.status])).toEqual([
      ['airlock_1', 'ok'], ['airlock_2', 'ok'], ['service', 'ok'], ['medbay', 'ok'], ['recreation', 'ok'],
      ['lab', 'ok'], ['quarters_north', 'alert'], ['quarters_south', 'ok'], ['technical', 'ok'], ['reactor', 'ok'],
    ]);
    const north = room(model, 'quarters_north');
    expect(north).toMatchObject({ zone: 'module_M1', nowStatus: 'caution', occupants: ['C1', 'C2'], simulated: false });
    expect(north.readings).toHaveLength(19);
    expect(room(model, 'quarters_south').occupants).toEqual(['C3', 'C4']);
    expect(pickDefaultRoom(model.rooms)).toBe('quarters_north');
  });

  it('colours the recreation zone by tunnel_common only; farm and gym keep their own status', () => {
    const model = deriveHabitat(habitatFixtures[600]);
    const recreation = room(model, 'recreation');
    expect(recreation.status).toBe('ok');
    expect(recreation.subZones.map(sub => [sub.code, sub.status])).toEqual([['gym', 'ok'], ['farm', 'alert']]);
    expect(recreation.subZones[1].readings).toHaveLength(8);
    expect(recreation.readings).toHaveLength(19);
    // nothing worse than ok among the real rooms -> the recreation zone opens first
    expect(pickDefaultRoom(model.rooms)).toBe('recreation');
  });

  it('keeps exterior zones off the map (cupola leak at sol 380 does not select a room)', () => {
    const model = deriveHabitat(habitatFixtures[380]);
    expect(model.exterior.map(zone => zone.code)).toEqual(['surface', 'cupola_1', 'cupola_2', 'cupola_3', 'cupola_4']);
    expect(model.exterior.find(zone => zone.code === 'cupola_2').status).toBe('alert');
    expect(pickDefaultRoom(model.rooms)).toBe('recreation');
  });

  it('fills simulated rooms with GUI readings plus the real surface power channels', () => {
    const model = deriveHabitat(habitatFixtures[142]);
    const reactor = room(model, 'reactor');
    expect(reactor).toMatchObject({ simulated: true, zone: null, status: 'ok', occupants: [] });
    expect(reactor.readings.filter(isGuiSimulated)).toHaveLength(4);
    expect(reading(reactor.readings, 'power_fission')).toMatchObject({ value: 40, from_zone: 'surface' });
    expect(reading(reactor.readings, 'core_outlet_temp').ts_utc).toBe('2039-05-26T21:41:00Z');
    const technical = room(model, 'technical');
    expect(technical.readings.filter(item => item.from_zone === 'surface').map(item => item.channel))
      .toEqual(['power_eclss', 'power_hvac', 'power_lighting', 'moxie_o2_rate']);
    expect(room(model, 'service').readings.every(isGuiSimulated)).toBe(true);
  });

  it('never picks a simulated room by default, and prefers alert over caution', () => {
    const rooms = [
      { id: 'service', simulated: true, status: 'alert' },
      { id: 'lab', simulated: false, status: 'caution' },
      { id: 'medbay', simulated: false, status: 'alert' },
      { id: 'quarters_south', simulated: false, status: 'alert' },
    ];
    expect(pickDefaultRoom(rooms)).toBe('medbay');
    expect(pickDefaultRoom(rooms.slice(0, 2))).toBe('lab');
    expect(pickDefaultRoom(rooms.slice(0, 1))).toBe('recreation');
    expect(pickDefaultRoom([])).toBe('recreation');
  });

  it('handles missing data and missing zones', () => {
    const empty = deriveHabitat(null);
    expect(empty.rooms).toHaveLength(10);
    expect(empty.rooms.every(item => item.status === 'no_data')).toBe(true);
    expect(empty.exterior).toEqual([]);

    const partial = deriveHabitat({ as_of: { sol: 5, latest_sol: 5 }, zones: [{ code: 'lab', status: 'caution', now_status: 'ok', occupants: ['C3'], readings: [] }, { code: 'new_zone', status: 'ok', readings: [] }] });
    expect(room(partial, 'lab')).toMatchObject({ status: 'caution', nowStatus: 'ok', occupants: ['C3'] });
    expect(room(partial, 'medbay').status).toBe('no_data');
    expect(partial.exterior.map(zone => zone.code)).toEqual(['new_zone']); // unknown zones are not dropped
  });

  it('merges sub-zone occupants into the room', () => {
    const data = { as_of: { sol: 1 }, zones: [
      { code: 'tunnel_common', status: 'ok', occupants: ['C2'], readings: [] },
      { code: 'gym', status: 'ok', occupants: ['C4'], readings: [] },
      { code: 'farm', status: 'ok', occupants: ['C1', 'C2'], readings: [] },
    ] };
    expect(room(deriveHabitat(data), 'recreation').occupants).toEqual(['C1', 'C2', 'C4']);
  });

  it('worstStatus ranks alert > caution > no_data > ok / unrated', () => {
    expect(worstStatus([])).toBe('ok');
    expect(worstStatus(['ok', 'unrated'])).toBe('ok');
    expect(worstStatus(['ok', 'no_data'])).toBe('no_data');
    expect(worstStatus(['caution', 'no_data', 'ok'])).toBe('caution');
    expect(worstStatus(['caution', 'alert', 'ok'])).toBe('alert');
  });

  it('groups readings like the sketch, in a fixed order, only non-empty groups', () => {
    const north = room(deriveHabitat(habitatFixtures[142]), 'quarters_north');
    const groups = groupReadings(north.readings);
    expect(groups.map(group => group.id)).toEqual([
      'pressure', 'air', 'temperature', 'humidity', 'contamination', 'radiation', 'water', 'lightNoise', 'structure', 'power', 'other',
    ]);
    const byId = Object.fromEntries(groups.map(group => [group.id, group.readings.map(item => item.channel)]));
    expect(byId.pressure).toEqual(['pressure_total']);
    expect(byId.air).toEqual(['o2_fraction', 'ppco2', 'ppo2_inspired']);
    expect(byId.contamination).toEqual(['pm2_5', 'voc_benzene', 'voc_formaldehyde']);
    expect(byId.water).toEqual(['water_recovery', 'water_tank_level']);
    expect(byId.other).toEqual(['fecal_canister_fill', 'zone_occupancy']);
    expect(groupOf({ channel: 'leak_detector', category: 'integrity' })).toBe('integrity');
    expect(groupOf({ channel: 'nh3', category: 'air' })).toBe('contamination');
    expect(groupOf({ channel: 'ext_temperature', category: 'exterior' })).toBe('exterior');
    expect(groupOf({ channel: 'core_outlet_temp', category: 'reactor' })).toBe('reactor');
    expect(groupReadings([])).toEqual([]);
  });

  it('formats values, ranges, normal ranges and times', () => {
    expect(formatNumber(56.5075)).toBe('56.51');
    expect(formatNumber(0.0078)).toBe('0.0078');
    expect(formatNumber(1821.87)).toBe('1822');
    expect(formatNumber(-70.08)).toBe('-70.08');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBeNull();
    expect(formatValue({ value: 2.279, text: null })).toBe('2.279');
    expect(formatValue({ value: null, text: 'not_detected' })).toBe('NOT DETECTED');
    expect(formatValue({ value: null, text: null })).toBeNull();
    expect(formatRange({ min: 1.826, max: 7.737 })).toBe('1.826 – 7.737');
    expect(formatRange({ min: null, max: null })).toBeNull();
    expect(formatNormal({ normal_min: 1.5, normal_max: 2.5 })).toBe('1.5 – 2.5');
    expect(formatNormal({ normal_min: null, normal_max: 34 })).toBe('≤ 34');
    expect(formatNormal({ normal_min: 127, normal_max: null })).toBe('≥ 127');
    expect(formatNormal({ normal_min: null, normal_max: null })).toBeNull();
    expect(formatTimeUtc('2039-05-26T21:41:00Z')).toBe('21:41');
    expect(formatTimeUtc(null)).toBeNull();
    expect(formatDayTimeUtc('2039-04-07T03:20:03Z')).toBe('04-07 03:20');
  });

  it('finds the peak behind a fault that has passed', () => {
    const north = room(deriveHabitat(habitatFixtures[142]), 'quarters_north');
    const co2 = reading(north.readings, 'ppco2');
    expect(co2).toMatchObject({ status: 'ok', worst_status: 'alert' });
    expect(hasRecovered(co2)).toBe(true);
    expect(peakValue(co2)).toBe(7.737);
    expect(hasRecovered(reading(north.readings, 'water_recovery'))).toBe(false); // still caution
    expect(peakValue({ min: 97.2, max: 98.9, normal_min: 98, normal_max: null })).toBe(97.2);
    expect(peakValue({ min: 1, max: 2, normal_min: null, normal_max: null })).toBe(2);
  });

  it('splits the event log: routine EVA starts / ends are only counted', () => {
    const { notable, evaStarts, evaEnds } = splitEvents(habitatFixtures[142].events);
    expect(notable.map(event => [event.type, event.zone, event.severity])).toEqual([
      ['scrubber_fault', 'module_M1', 'major'],
      ['eva_end', 'airlock_A', 'minor'],
    ]);
    expect([evaStarts, evaEnds]).toEqual([28, 30]);
    expect(notable.length + evaStarts + evaEnds).toBe(habitatFixtures[142].events.length);

    const sol380 = splitEvents(habitatFixtures[380].events);
    expect(sol380.notable.map(event => event.type)).toEqual(['leak', 'waste_dump', 'maintenance']);
    expect(splitEvents(undefined)).toEqual({ notable: [], evaStarts: 0, evaEnds: 0 });

    expect(isRoutineEvent({ type: 'eva_start', severity: 'info' })).toBe(true);
    expect(isRoutineEvent({ type: 'eva_end', severity: 'major' })).toBe(false);
    expect(isRoutineEvent({ type: 'leak', severity: 'info' })).toBe(false);
    expect(severityStatus('major')).toBe('alert');
    expect(severityStatus('minor')).toBe('caution');
    expect(severityStatus('info')).toBe('ok');
    expect(eventTypeText('scrubber_fault')).toBe('SCRUBBER FAULT');
  });
});

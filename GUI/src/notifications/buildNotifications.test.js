import { describe, expect, it } from 'vitest';
import habC1 from '../test/fixtures/organs_HAB-C1.json';
import habC3 from '../test/fixtures/organs_HAB-C3.json';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import habitat142 from '../test/fixtures/habitat_sol142.json';
import habitat380 from '../test/fixtures/habitat_sol380.json';
import habitat600 from '../test/fixtures/habitat_sol600.json';
import { buildNotifications, countBySeverity, formatNumber, readingDetail, worstReading } from './buildNotifications.js';

const clone = value => JSON.parse(JSON.stringify(value));
const ids = items => items.map(item => item.id);
const byId = (items, id) => items.find(item => item.id === id);

describe('buildNotifications: HAB-C4 sol 142 + habitat sol 142', () => {
  const items = buildNotifications({ report: habC4Sol142, habitat: habitat142 });

  it('puts the left-leg perfusion alert first', () => {
    expect(items[0]).toEqual({
      id: 'organ:limbs',
      severity: 'alert',
      source: 'organ',
      organ: 'limbs',
      title: 'Limbs (circulation)',
      detail: 'Left leg: blood flow (perfusion) 25% of the other limbs - check this limb now.',
      action: 'Inspect the limb (pressure, swelling, colour, cold); free it; if compressed >1 h start IV fluids BEFORE release.',
      target: { screen: 'person', code: 'HAB-C4', organ: 'limbs', limb: 'left_leg' },
    });
  });

  it('lists the kidneys caution with its action', () => {
    expect(byId(items, 'organ:kidneys')).toMatchObject({
      severity: 'caution',
      source: 'organ',
      title: 'Kidneys & urine',
      detail: 'Stone risk: urine volume 1.73 L/d (< 2.5).',
      target: { screen: 'person', code: 'HAB-C4', organ: 'kidneys' },
    });
    expect(byId(items, 'organ:kidneys').action).toMatch(/^Drink to/);
  });

  it('reports the CO2 alert of module M1 with the peak of the sol', () => {
    const m1 = byId(items, 'habitat:module_M1');
    expect(m1).toMatchObject({
      severity: 'alert',
      source: 'habitat',
      title: 'Habitation module M1 (C1, C2)',
      detail: 'CO2 partial pressure: peak 7.74 mmHg (normal 1.5–2.5), now 2.28 mmHg',
      action: null,
      target: { screen: 'base', room: 'quarters_north', zone: 'module_M1', channel: 'ppco2', sol: 142 },
    });
  });

  it('reports the farm O2 alert', () => {
    expect(byId(items, 'habitat:farm')).toMatchObject({ severity: 'alert', target: { screen: 'base', zone: 'farm', channel: 'o2_fraction' } });
    expect(byId(items, 'habitat:farm').detail).toBe('O2 fraction: peak 34.26 % (normal ≤ 34), now 33.81 %');
  });

  it('includes the scrubber fault and none of the routine or old events', () => {
    const events = items.filter(item => item.source === 'event');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'event:evt-000483',
      severity: 'caution',
      title: 'Scrubber fault',
      detail: 'Habitation module M1 (C1, C2) · from 02:10 UTC to 14:10 UTC · sol 142',
      target: { screen: 'base', room: 'quarters_north', zone: 'module_M1', event: 'evt-000483', sol: 142 },
    });
  });

  it('merges the four cupolas with the same cold-air caution into one item', () => {
    const cupolas = items.filter(item => item.id.includes('cupola'));
    expect(cupolas).toHaveLength(1);
    expect(cupolas[0]).toMatchObject({
      id: 'habitat:cupola_1+cupola_2+cupola_3+cupola_4',
      severity: 'caution',
      source: 'habitat',
    });
    expect(cupolas[0].title).toMatch(/^4 zones: Skylight cupola 1, /);
    expect(cupolas[0].detail).toMatch(/^Air temperature: low 19\.15 °C \(normal 20–25\), now 19\.5 °C$/);
    expect(cupolas[0].target.zones).toEqual(['cupola_1', 'cupola_2', 'cupola_3', 'cupola_4']);
  });

  it('is sorted alert -> caution, organs before habitat, and has no duplicates', () => {
    expect(ids(items)).toEqual([
      'organ:limbs',
      'habitat:module_M1',
      'habitat:farm',
      'organ:kidneys',
      'habitat:cupola_1+cupola_2+cupola_3+cupola_4',
      'event:evt-000483',
    ]);
    expect(new Set(ids(items)).size).toBe(items.length);
    // top_message repeats the limbs headline: it must appear exactly once.
    expect(items.filter(item => item.detail === habC4Sol142.top_message)).toHaveLength(1);
    expect(countBySeverity(items)).toEqual({ alert: 3, caution: 3, info: 0 });
  });

  it('does not mutate its inputs', () => {
    const report = clone(habC4Sol142);
    const habitat = clone(habitat142);
    buildNotifications({ report, habitat });
    expect(report).toEqual(habC4Sol142);
    expect(habitat).toEqual(habitat142);
  });
});

describe('buildNotifications: other inputs', () => {
  it('returns an empty list for nothing', () => {
    expect(buildNotifications()).toEqual([]);
    expect(buildNotifications({ report: null, habitat: null })).toEqual([]);
    expect(buildNotifications({ report: {}, habitat: {} })).toEqual([]);
  });

  it('report only: one item per caution organ card, in card order', () => {
    expect(ids(buildNotifications({ report: habC3 }))).toEqual(['organ:blood', 'organ:kidneys', 'organ:gut']);
    expect(ids(buildNotifications({ report: habC1 }))).toEqual(['organ:kidneys']);
  });

  it('adds wearables whose status is not ok', () => {
    const report = clone(habC1);
    Object.assign(report.devices.find(device => device.limb === 'left_arm'), {
      status: 'alert', state: 'disconnected', battery_pct: 0, message: 'Left arm band lost contact.',
    });
    Object.assign(report.devices.find(device => device.limb === 'head_eeg'), { status: 'caution', state: 'low_battery', battery_pct: 12.4, message: null });
    const items = buildNotifications({ report });
    expect(ids(items)).toEqual(['device:left_arm', 'organ:kidneys', 'device:head_eeg']);
    expect(items[0]).toMatchObject({
      severity: 'alert',
      source: 'device',
      title: 'Left arm band',
      detail: 'Left arm band lost contact. · State: disconnected · battery 0%',
      target: { screen: 'person', organ: 'limbs', device: 'left_arm' },
    });
    expect(byId(items, 'device:head_eeg')).toMatchObject({ title: 'EEG headband', detail: 'State: low battery · battery 12%' });
  });

  it('a limbs alert that names no limb has no limb target', () => {
    const report = clone(habC4Sol142);
    const limbs = report.organs.find(card => card.organ === 'limbs');
    limbs.headline = 'Circulation problem.';
    limbs.metrics = [];
    limbs.checks = [];
    expect(buildNotifications({ report })[0].target).toEqual({ screen: 'person', code: 'HAB-C4', organ: 'limbs' });
  });

  it('sol 380: leak in cupola 2 (zone alert on a text channel + major event)', () => {
    const items = buildNotifications({ habitat: habitat380 });
    expect(byId(items, 'habitat:cupola_2')).toMatchObject({
      severity: 'alert',
      detail: 'Leak detector (joint): alert during this sol, now ok',
      target: { screen: 'base', room: null, zone: 'cupola_2', channel: 'leak_detector', sol: 380 },
    });
    expect(byId(items, 'event:evt-000491')).toMatchObject({ severity: 'caution', title: 'Leak' });
    // The three other cupolas keep their shared caution; cupola 2 is not repeated there.
    expect(byId(items, 'habitat:cupola_1+cupola_3+cupola_4')).toBeTruthy();
    expect(items.filter(item => item.source === 'event')).toHaveLength(1);
  });

  it('sol 600: major EVA events of sol 470 are history, not notifications', () => {
    const items = buildNotifications({ habitat: habitat600 });
    expect(items.filter(item => item.source === 'event')).toEqual([]);
    expect(ids(items)).toEqual(['habitat:farm', 'habitat:cupola_1+cupola_2+cupola_3+cupola_4']);
  });

  it('a critical event is an alert; a zone that is only caution earlier in the sol is skipped', () => {
    const habitat = {
      as_of: { sol: 10 },
      zones: [
        { code: 'lab', label: 'Laboratory', type: 'lab', status: 'caution', now_status: 'ok', readings: [
          { channel: 'rh', label: 'Relative humidity', unit: '%RH', value: 50, min: 40, max: 65, normal_min: 30, normal_max: 60, status: 'ok', worst_status: 'caution' },
        ] },
        { code: 'gym', label: 'Gym', type: 'gym', status: 'caution', now_status: 'caution', readings: [
          { channel: 'rh', label: 'Relative humidity', unit: '%RH', value: 66, min: 40, max: 66, normal_min: 30, normal_max: 60, status: 'caution', worst_status: 'caution' },
        ] },
      ],
      events: [
        { code: 'e1', type: 'fire', severity: 'critical', sol: 10, zone: 'lab', crew: 'C2', start_utc: '2039-01-01T05:00:00Z', end_utc: null },
        { code: 'e2', type: 'eva_start', severity: 'info', sol: 10, zone: 'surface', start_utc: '2039-01-01T06:00:00Z', end_utc: null },
        { code: 'e3', type: 'leak', severity: 'minor', sol: 10, zone: 'lab', start_utc: '2039-01-01T07:00:00Z', end_utc: null },
      ],
    };
    const items = buildNotifications({ habitat });
    expect(ids(items)).toEqual(['event:e1', 'habitat:gym']);
    expect(items[0]).toMatchObject({ severity: 'alert', title: 'Fire', detail: 'Laboratory · crew C2 · from 05:00 UTC · sol 10' });
    expect(items[1].detail).toBe('Relative humidity: 66 %RH (normal 30–60)');
  });
});

describe('helpers', () => {
  it('formatNumber', () => {
    expect(formatNumber(7.737)).toBe('7.74');
    expect(formatNumber(34)).toBe('34');
    expect(formatNumber(0.0078)).toBe('0.0078');
    expect(formatNumber(null)).toBeNull();
    expect(formatNumber('x')).toBeNull();
  });

  it('worstReading prefers the numeric alert with the largest excursion', () => {
    const m1 = habitat142.zones.find(zone => zone.code === 'module_M1');
    expect(worstReading(m1).channel).toBe('ppco2');
    expect(worstReading(m1, 'status').channel).toBe('water_recovery');
    expect(worstReading({ readings: [] })).toBeNull();
    expect(worstReading(null)).toBeNull();
    expect(readingDetail(null)).toBeNull();
  });
});

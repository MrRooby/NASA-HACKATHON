import { describe, expect, it } from 'vitest';
import habitat142 from '../test/fixtures/habitat_sol142.json';
import { buildTasks, countTasks, measuredBetween } from './buildTasks.js';
import { dueSols, missionDayToSol, occurrences, routineDefinitions } from './routine.js';

const def = id => routineDefinitions().find(item => item.id === id);
const kinds = items => items.map(item => item.kind);

describe('routine schedule (config/inflight_measurements.json -> sols)', () => {
  it('reads the confirmed, research and app items that have a GUI presentation', () => {
    const ids = routineDefinitions().map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      'private_medical_conference', 'private_psychological_conference', 'exercise_countermeasures',
      'ocular_sans_exam', 'sm_actigraphy_sleep_log', 'sm_blood_biochemistry', 'mother_quick_pvt', 'mother_full_battery',
      'team_vitals', 'team_mood', 'team_water',
    ]));
    // Continuous items without a daily log (dosimeter, cabin monitors) are not tasks.
    expect(ids).not.toContain('personal_dosimetry');
    expect(def('team_vitals').basis).toBe('team_assumption');
    expect(def('mother_quick_pvt').basis).toBe('source');
  });

  it('maps mission days to sols (FD n = sol n, R-x = last sol - x)', () => {
    expect(missionDayToSol('FD30')).toBe(30);
    expect(missionDayToSol('R-30')).toBe(570);
    expect(missionDayToSol('~FD30 (near a vehicle undock)')).toBe(30);
    expect(missionDayToSol('own return undock')).toBeNull();
    expect(dueSols(def('ocular_sans_exam'), 1, 600)).toEqual([30, 90, 570]);
  });

  it('every_n_days uses sol % n (from start_fd), weekly uses the item offset', () => {
    expect(dueSols(def('private_psychological_conference'), 1, 60)).toEqual([14, 28, 42, 56]);
    expect(dueSols(def('periodic_fitness_evaluation'), 1, 80)).toEqual([15, 45, 75]);
    expect(dueSols(def('mother_quick_pvt'), 130, 150)).toEqual([135, 142, 149]); // offset 2
    // Exercise: 6 days a week, every 7th sol is a rest day.
    expect(dueSols(def('exercise_countermeasures'), 140, 141)).toEqual([141]);
  });

  it('interval items: today, overdue for 2 sols, upcoming 2 sols ahead', () => {
    const pmc = def('private_medical_conference'); // weekly, sol % 7 === 6
    expect(occurrences(pmc, 139)).toEqual([{ dueSol: 139, due: 'today' }]);
    expect(occurrences(pmc, 140)).toEqual([{ dueSol: 139, due: 'now', overdue: true }]);
    expect(occurrences(pmc, 142)).toEqual([]);
    expect(occurrences(pmc, 144)).toEqual([{ dueSol: 146, due: 'sol 146', upcoming: true }]);
  });
});

describe('buildTasks', () => {
  const organs = {
    'HAB-C1': [
      { organ: 'kidneys', label: 'Kidneys & urine', status: 'caution', action: 'Drink to ≥2.5 L urine/day.' },
      { organ: 'exposure', label: 'Radiation & air', status: 'alert', action: 'Ventilate the zone; check the scrubber.' },
      { organ: 'heart', label: 'Heart', status: 'ok', action: null },
    ],
  };

  it('person scope at sol 142: organ actions first (alert, caution), then the daily routine', () => {
    const items = buildTasks({ sol: 142, codes: ['HAB-C1', 'HAB-C2'], organs, scopeCode: 'HAB-C1' });
    expect(items.every(item => item.code === 'HAB-C1')).toBe(true);
    expect(items[0]).toMatchObject({
      source: 'organ', kind: 'organ_exposure', icon: 'radiation', title: 'Radiation & air', priority: 'alert', due: 'now',
      detail: 'Ventilate the zone; check the scrubber.', target: { screen: 'person', code: 'HAB-C1', organ: 'exposure' },
    });
    expect(items[1]).toMatchObject({ kind: 'organ_kidneys', priority: 'caution', title: 'Kidneys' });
    expect(kinds(items)).toEqual(expect.arrayContaining(['vitals', 'sleep', 'mood', 'water', 'exercise', 'pvt']));
    expect(items.find(item => item.kind === 'pvt')).toMatchObject({ due: 'today', target: { screen: 'test', code: 'HAB-C1', test: 'quick' } });
    expect(items.find(item => item.kind === 'vitals').id).toBe('routine:vitals:HAB-C1:142');
    expect(items.every(item => item.title.split(' ').length <= 4)).toBe(true);
  });

  it('crew scope: everybody, each item carries its code; habitat alerts become "Check <room>"', () => {
    const items = buildTasks({ sol: 142, codes: ['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4'], organs, habitat: habitat142 });
    expect(new Set(items.filter(item => item.code).map(item => item.code))).toEqual(new Set(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4']));
    const m1 = items.find(item => item.kind === 'habitat_module_M1');
    expect(m1).toMatchObject({ title: 'Check CREW QUARTERS N', icon: 'co2', priority: 'alert', target: { screen: 'base', room: 'quarters_north' } });
    expect(items.find(item => item.kind === 'habitat_farm').target).toEqual({ screen: 'base', room: 'recreation' });
  });

  it('person scope keeps only the habitat alerts of their home zone', () => {
    const c1 = buildTasks({ sol: 142, organs, habitat: habitat142, scopeCode: 'HAB-C1' });
    expect(kinds(c1).filter(kind => kind.startsWith('habitat_'))).toEqual(['habitat_module_M1']);
    const c3 = buildTasks({ sol: 142, organs, habitat: habitat142, scopeCode: 'HAB-C3' });
    expect(kinds(c3).filter(kind => kind.startsWith('habitat_'))).toEqual([]);
  });

  it('a measurement of the person for that sol ticks the task off and moves it to the end', () => {
    const measurements = [
      { code: 'HAB-C1', kind: 'bp', sol: 142, values: {}, at: '2026-11-14T08:00:00Z' },
      { code: 'HAB-C2', kind: 'water', sol: 142, values: {}, at: '2026-11-14T08:00:00Z' }, // somebody else
      { code: 'HAB-C1', kind: 'mood', sol: 141, values: {}, at: '2026-11-13T08:00:00Z' }, // another sol
    ];
    const items = buildTasks({ sol: 142, organs, measurements, scopeCode: 'HAB-C1' });
    const vitals = items.find(item => item.kind === 'vitals');
    expect(vitals).toMatchObject({ done: true, doneBy: 'measurement' });
    expect(items[items.length - 1]).toBe(vitals);
    expect(items.find(item => item.kind === 'mood').done).toBe(false);
    expect(items.find(item => item.kind === 'water').done).toBe(false);
    // Water also counts as acting on the kidneys finding... only for that person.
    expect(items.find(item => item.kind === 'organ_kidneys').done).toBe(false);
  });

  it('manual ticks are read per sol from the done map', () => {
    const doneMap = { 142: ['routine:mood:HAB-C1:142'], 141: ['routine:water:HAB-C1:141'] };
    const items = buildTasks({ sol: 142, organs, doneMap, scopeCode: 'HAB-C1' });
    expect(items.find(item => item.kind === 'mood')).toMatchObject({ done: true, doneBy: 'manual' });
    expect(items.find(item => item.kind === 'water').done).toBe(false);
    // caution: the kidneys finding + psych talk and test battery of sol 140, now overdue
    expect(items.find(item => item.kind === 'ppc')).toMatchObject({ due: 'now', dueSol: 140, priority: 'caution' });
    expect(countTasks(items)).toMatchObject({ done: 1, alert: 1, caution: 3 });
  });

  it('cognitive report: a PVT out of range becomes a retest and replaces the weekly PVT', () => {
    const cognitive = { 'HAB-C4': { tests: [
      { test_id: 'pvt', status: 'caution', headline: 'Reaction time +12% vs your baseline.', baseline: { n: 5, needed: 3, ready: true } },
      { test_id: 'gonogo', status: 'ok', baseline: { n: 4, needed: 3, ready: true } },
      { test_id: 'dsst', status: 'no_data', baseline: { n: 1, needed: 3, ready: false } },
    ] } };
    const items = buildTasks({ sol: 142, cognitive, scopeCode: 'HAB-C4' });
    expect(items.find(item => item.kind === 'retest_pvt')).toMatchObject({
      title: 'Retest PVT', priority: 'caution', due: 'now', icon: 'pvt', target: { screen: 'test', code: 'HAB-C4', test: 'quick' },
    });
    expect(kinds(items)).not.toContain('pvt');
  });

  it('measurement without a sol counts for the current sol when recorded today', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const list = [{ code: 'HAB-C2', kind: 'sleep', sol: null, at: '2026-11-14T07:00:00Z' }];
    expect(measuredBetween(list, 'HAB-C2', ['sleep'], 142, 142, 142, now)).toBe(true);
    expect(measuredBetween(list, 'HAB-C2', ['sleep'], 139, 139, 142, now)).toBe(false);
  });

  it('no sol, no tasks', () => {
    expect(buildTasks({ sol: null, codes: ['HAB-C1'] })).toEqual([]);
  });
});

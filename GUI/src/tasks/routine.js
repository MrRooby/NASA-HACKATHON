// Mission routine: which scheduled activities a crew member has on a given sol.
//
// Source of truth for the NASA items is config/inflight_measurements.json (`confirmed`,
// `confirmed_research_standard_measures.items` and `app_additions.items`). This file only adds
// how each item is shown (icon, short title key, which self-measurement ticks it off, where the
// task leads) and a few daily self-checks the team added (`basis: 'team_assumption'`: the
// challenge's own indicators — blood pressure, mood, water — have no confirmed ISS schedule).
//
// Schedules are mapped to mission sols (flight day N = sol N, R-x = last sol − x):
//   daily         every sol (exercise: rest every 7th sol, `days_per_week: 6`)
//   weekly        sol % 7 === offset (offset per item, spreads the week)
//   every_n_days  sol % n === start % n, from `start_fd` on
//   mission_days  listed sols only (FD30, R-30 …)
//   continuous    worn / logged all the time: only items with a daily log become a task
import inflight from '../../../config/inflight_measurements.json';

export const MISSION_LAST_SOL = 600;

/** Days a missed interval task stays on the list as overdue, and how far ahead upcoming tasks show. */
export const OVERDUE_SOLS = 2;
export const UPCOMING_SOLS = 2;

const person = organ => code => ({ screen: 'person', code, organ });
const test = kind => code => ({ screen: 'test', code, test: kind });

/**
 * Presentation of config items, by config id. `kind` groups the same task across the crew,
 * `measures` = measurement kinds (src/shared/measurements.js) that tick it off.
 */
export const ROUTINE_META = {
  // config: confirmed
  private_medical_conference: { kind: 'pmc', icon: 'satellite', titleKey: 'tasks.t_pmc', target: person(null), offset: 6 },
  private_psychological_conference: { kind: 'ppc', icon: 'chat', titleKey: 'tasks.t_ppc', target: person('brain') },
  winscat: { kind: 'winscat', icon: 'dsst', titleKey: 'tasks.t_winscat', measures: ['cognitive_full'], target: test('full') },
  periodic_fitness_evaluation: { kind: 'pfe', icon: 'treadmill', titleKey: 'tasks.t_pfe', target: person('musculoskeletal') },
  exercise_countermeasures: { kind: 'exercise', icon: 'dumbbell', titleKey: 'tasks.t_exercise', measures: ['exercise'], target: person('musculoskeletal') },
  ocular_sans_exam: { kind: 'eye_exam', icon: 'eye_chart', titleKey: 'tasks.t_eyeExam', measures: ['eye_check'], target: person('eyes') },
  // config: research standard measures
  sm_actigraphy_sleep_log: { kind: 'sleep', icon: 'sleep', titleKey: 'tasks.t_sleep', measures: ['sleep'], target: person('brain'), dailyLog: true },
  sm_sleep_team_questionnaire: { kind: 'sleep_survey', icon: 'questionnaire', titleKey: 'tasks.t_sleepSurvey', target: person('brain') },
  sm_cognition: { kind: 'cognition', icon: 'dsst', titleKey: 'tasks.t_cognition', measures: ['cognitive_full'], target: test('full') },
  sm_blood_biochemistry: { kind: 'blood_draw', icon: 'syringe', titleKey: 'tasks.t_bloodDraw', target: person('blood') },
  sm_microbiome: { kind: 'microbiome', icon: 'test_tube', titleKey: 'tasks.t_microbiome', target: person('gut') },
  // config: app additions
  mother_quick_pvt: { kind: 'pvt', icon: 'pvt', titleKey: 'tasks.t_pvt', measures: ['cognitive_pvt'], target: test('quick'), offset: 2 },
  mother_full_battery: { kind: 'battery', icon: 'gonogo', titleKey: 'tasks.t_battery', measures: ['cognitive_full'], target: test('full') },
};

/** Daily self-checks added by the team (not NASA schedules). */
export const TEAM_ROUTINE = [
  { id: 'team_vitals', kind: 'vitals', icon: 'bp', titleKey: 'tasks.t_vitals', measures: ['bp', 'hr'], target: person('heart'), schedule: { type: 'daily' } },
  { id: 'team_mood', kind: 'mood', icon: 'mood_3', titleKey: 'tasks.t_mood', measures: ['mood'], target: person('brain'), schedule: { type: 'daily' } },
  { id: 'team_water', kind: 'water', icon: 'water_cup', titleKey: 'tasks.t_water', measures: ['water'], target: person('kidneys'), schedule: { type: 'daily' } },
  { id: 'team_urine', kind: 'urine', icon: 'dipstick', titleKey: 'tasks.t_urine', measures: ['urine_sample', 'urine_volume'], target: person('kidneys'), schedule: { type: 'weekly' }, offset: 3 },
].map(item => ({ ...item, basis: 'team_assumption' }));

/** Order of routine kinds in the list (most hands-on first). */
const ROUTINE_ORDER = ['vitals', 'sleep', 'mood', 'water', 'exercise', 'pvt', 'battery', 'urine', 'pmc', 'ppc',
  'winscat', 'cognition', 'pfe', 'eye_exam', 'blood_draw', 'sleep_survey', 'microbiome'];
export const routineRank = kind => {
  const index = ROUTINE_ORDER.indexOf(kind);
  return index === -1 ? ROUTINE_ORDER.length : index;
};

/** 'FD30' -> 30, 'R-30' -> 570, '~FD30 (near …)' -> 30; null when unparseable. */
export function missionDayToSol(text, lastSol = MISSION_LAST_SOL) {
  const value = String(text ?? '');
  const ret = /R-(\d+)/.exec(value);
  if (ret) return lastSol - Number(ret[1]);
  const fd = /FD(\d+)/.exec(value);
  return fd ? Number(fd[1]) : null;
}

/** Every config item the GUI schedules: [{ id, schedule, basis, ...ROUTINE_META[id] }]. */
export function routineDefinitions(config = inflight) {
  const fromConfig = [
    ...(config?.confirmed || []),
    ...(config?.confirmed_research_standard_measures?.items || []),
    ...(config?.app_additions?.items || []),
  ]
    .filter(item => item?.id && ROUTINE_META[item.id] && item.schedule?.type)
    .map(item => ({ id: item.id, name: item.name, schedule: item.schedule, basis: 'source', ...ROUTINE_META[item.id] }));
  return [...TEAM_ROUTINE, ...fromConfig];
}

/** Sols (ascending) on which an interval item is due, between `from` and `to` inclusive. */
export function dueSols(def, from, to, lastSol = MISSION_LAST_SOL) {
  const { schedule } = def;
  const out = [];
  const lo = Math.max(1, from);
  switch (schedule?.type) {
    case 'daily':
    case 'continuous':
      if (schedule.type === 'continuous' && !def.dailyLog) return out;
      for (let sol = lo; sol <= to; sol += 1) {
        // 6 training days a week: every 7th sol is a rest day.
        if (schedule.days_per_week && schedule.days_per_week < 7 && sol % 7 === 0) continue;
        out.push(sol);
      }
      return out;
    case 'weekly': {
      const offset = (def.offset ?? 0) % 7;
      for (let sol = lo; sol <= to; sol += 1) if (sol % 7 === offset) out.push(sol);
      return out;
    }
    case 'every_n_days': {
      const n = Number(schedule.every_days) || 0;
      if (n <= 0) return out;
      const start = Number(schedule.start_fd) || 0;
      for (let sol = Math.max(lo, start || 1); sol <= to; sol += 1) if (sol % n === start % n) out.push(sol);
      return out;
    }
    case 'mission_days':
      return (schedule.days || [])
        .map(day => missionDayToSol(day, lastSol))
        .filter(sol => sol != null && sol >= lo && sol <= to)
        .sort((a, b) => a - b);
    default:
      return out;
  }
}

/**
 * Routine occurrences relevant on `sol` for one definition:
 *   [{ dueSol, due: 'today' | 'now' (overdue) | 'sol N' (upcoming) }]
 * Daily items only for today. Interval items: today, the last missed one (≤ OVERDUE_SOLS ago),
 * or the next one (≤ UPCOMING_SOLS ahead).
 */
export function occurrences(def, sol, lastSol = MISSION_LAST_SOL) {
  if (sol == null) return [];
  const daily = def.schedule?.type === 'daily' || def.schedule?.type === 'continuous';
  if (daily) return dueSols(def, sol, sol, lastSol).map(dueSol => ({ dueSol, due: 'today' }));
  const out = [];
  const past = dueSols(def, sol - OVERDUE_SOLS, sol, lastSol);
  const latest = past[past.length - 1];
  if (latest === sol) out.push({ dueSol: sol, due: 'today' });
  else if (latest != null) out.push({ dueSol: latest, due: 'now', overdue: true });
  if (latest !== sol) {
    const next = dueSols(def, sol + 1, sol + UPCOMING_SOLS, lastSol)[0];
    if (next != null) out.push({ dueSol: next, due: `sol ${next}`, upcoming: true });
  }
  return out;
}

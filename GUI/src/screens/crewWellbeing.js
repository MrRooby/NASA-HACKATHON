import { CREW_PROFILES } from '../data/crewProfiles.js';
import { isoDate } from './calendar.js';

/**
 * Per-person crew wellbeing for one calendar day (the "Crew wellbeing check" event).
 * The calendar has no live per-day source yet (MOTHER has no /api/calendar and no date -> sol
 * mapping), so the values are deterministic: the same date always gives the same crew.
 * Today is the scripted demo day: mostly fine, two cautions and one alert with a clear reason.
 *
 * Entry: { code, name, status: 'ok'|'caution'|'alert', mood 1-5, sleep h, stress 1-5, noteKey }
 */

/** Limits per value: caution / alert. Mood is "higher is better", the rest as noted. */
export const LIMITS = {
  mood: { caution: 2, alert: 1 }, // <= caution / <= alert (score 1-5)
  sleep: { caution: 6.5, alert: 5 }, // < caution / < alert (hours)
  stress: { caution: 4, alert: 5 }, // >= caution / >= alert (score 1-5)
};

const RANK = { ok: 0, caution: 1, alert: 2 };

/** Status of one value: 'ok' | 'caution' | 'alert'. */
export function valueStatus(metric, value) {
  const limit = LIMITS[metric];
  if (metric === 'mood') return value <= limit.alert ? 'alert' : value <= limit.caution ? 'caution' : 'ok';
  if (metric === 'sleep') return value < limit.alert ? 'alert' : value < limit.caution ? 'caution' : 'ok';
  return value >= limit.alert ? 'alert' : value >= limit.caution ? 'caution' : 'ok';
}

/** Worst status of the person's three values. */
export function personStatus({ mood, sleep, stress }) {
  return [valueStatus('mood', mood), valueStatus('sleep', sleep), valueStatus('stress', stress)]
    .reduce((worst, item) => (RANK[item] > RANK[worst] ? item : worst), 'ok');
}

// Scripted demo day (today): [code, mood, sleep, stress, note].
const SCRIPTED = [
  ['HAB-C1', 4, 7.1, 3, 'noteBriefing'],
  ['HAB-C2', 3, 5.8, 4, 'noteScrubberNight'],
  ['HAB-C3', 4, 7.4, 2, 'noteSortie'],
  ['HAB-C4', 4, 6.9, 2, 'noteMedRound'],
  ['HAB-C5', 5, 7.8, 1, 'noteBestSleep'],
  ['HAB-C6', 2, 6.6, 3, 'noteMissedCall'],
  ['HAB-C7', 2, 3.9, 5, 'noteEvaInsomnia'],
  ['HAB-C8', 4, 7.2, 2, 'noteHarvest'],
  ['HAB-C9', 4, 7.0, 2, 'noteDebrief'],
  ['HAB-C10', 3, 6.8, 3, 'noteRoverArm'],
];

/** Small deterministic generator (mulberry32) seeded from a string. */
function seeded(text) {
  let seed = 0;
  for (const char of text) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const OK_NOTES = ['noteRested', 'noteRoutine', 'noteWorkout', 'noteTeamMeal'];
const ISSUE_NOTES = { mood: 'noteMoodLow', sleep: 'noteSleepShort', stress: 'noteStressHigh' };

function generated(dateKey) {
  const random = seeded(dateKey);
  return CREW_PROFILES.map(profile => {
    const mood = Math.min(5, Math.max(2, Math.round(3.2 + random() * 1.9)));
    const sleep = Math.round((6.4 + random() * 1.6) * 10) / 10;
    const stress = Math.min(4, Math.max(1, Math.round(1 + random() * 2.8)));
    const entry = { mood, sleep, stress };
    const worst = ['sleep', 'mood', 'stress'].find(metric => valueStatus(metric, entry[metric]) !== 'ok');
    const noteKey = worst ? ISSUE_NOTES[worst] : OK_NOTES[Math.floor(random() * OK_NOTES.length)];
    return { code: profile.code, ...entry, noteKey };
  });
}

/** True when this date is the scripted demo day (today). */
export const isScriptedDay = (date, today = new Date()) => isoDate(date) === isoDate(today);

/** Wellbeing of all 10 crew members on this date, in roster order. */
export function getCrewWellbeing(date, today = new Date()) {
  const rows = isScriptedDay(date, today)
    ? SCRIPTED.map(([code, mood, sleep, stress, noteKey]) => ({ code, mood, sleep, stress, noteKey }))
    : generated(isoDate(date));
  return rows.map(row => ({
    ...row,
    name: CREW_PROFILES.find(profile => profile.code === row.code)?.name ?? row.code,
    status: personStatus(row),
  }));
}

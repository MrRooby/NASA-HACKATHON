// Task list of one sol, as a pure function of what the app already knows. No React here.
//
// Sources (merged, then sorted: alert → caution → routine; now → today → upcoming; done last):
//   routine    the in-flight schedule (routine.js, from config/inflight_measurements.json)
//   organ      MOTHER organ cards in caution / alert: the card's `action` is the task
//   cognitive  cognitive tests out of range or still building the baseline (GET /api/cognitive)
//   habitat    habitat zones in alert this sol: "Check <room>"
//
// item = { id, source, kind, icon, title, detail, code, who, due, dueSol, priority, done, doneBy,
//          measures, target, basis }
//   id        stable for one sol (manual ticks are stored by id)
//   due       'now' (overdue / act now) | 'today' | 'sol N' (upcoming)
//   priority  'alert' | 'caution' | 'routine'
//   target    route the task leads to ({ screen: 'person', code, organ } | { screen: 'test', … } | { screen: 'base', room })
import { translate } from '../i18n/index.js';
import { getProfile } from '../data/crewProfiles.js';
import { ORGAN_ICON, iconForReadingCategory } from '../pixel/mapping.js';
import { roomForZone } from '../habitat/layout.js';
import { worstReading } from '../notifications/buildNotifications.js';
import { isDone } from './doneStore.js';
import { MISSION_LAST_SOL, occurrences, routineDefinitions, routineRank } from './routine.js';

const PRIORITY_RANK = { alert: 0, caution: 1, routine: 2 };
const SOURCE_RANK = { organ: 0, habitat: 1, cognitive: 2, routine: 3 };
const isProblem = status => status === 'caution' || status === 'alert';

/** Self-measurements that count as "acted on" an organ finding this sol. */
export const ORGAN_MEASURES = {
  brain: ['cognitive_pvt', 'cognitive_full', 'sleep', 'mood'],
  eyes: ['eye_check'],
  heart: ['bp', 'hr'],
  lungs: ['spo2'],
  blood: ['glucose'],
  kidneys: ['water', 'urine_sample', 'urine_volume'],
  gut: ['meal', 'bristol', 'glucose'],
  musculoskeletal: ['exercise', 'grip'],
  limbs: [],
  exposure: [],
};

const COG_TEST_ICON = { pvt: 'pvt', gonogo: 'gonogo', dsst: 'dsst' };
const COG_TEST_LABEL = { pvt: 'PVT', gonogo: 'Go/No-Go', dsst: 'DSST' };

/** 'C1' / 'HAB-C1' -> 'HAB-C1'. */
export const crewCode = code => {
  const match = String(code ?? '').toUpperCase().match(/C([1-4])$/);
  return match ? `HAB-C${match[1]}` : String(code ?? '');
};

const enT = (key, params) => translate('en', key, params);

const sameUtcDay = (iso, now) => typeof iso === 'string' && iso.slice(0, 10) === now.toISOString().slice(0, 10);

/** Did `code` record one of `kinds` between sols lo..hi (inclusive)? */
export function measuredBetween(measurements, code, kinds, lo, hi, currentSol, now = new Date()) {
  if (!kinds?.length) return false;
  return (measurements || []).some(entry => {
    if (!entry || crewCode(entry.code) !== code || !kinds.includes(entry.kind)) return false;
    if (entry.sol == null || entry.sol === '') return currentSol >= lo && currentSol <= hi && sameUtcDay(entry.at, now);
    const sol = Number(entry.sol);
    return sol >= lo && sol <= hi;
  });
}

function routineTasks({ code, sol, lastSol, t }) {
  const out = [];
  for (const def of routineDefinitions()) {
    for (const occ of occurrences(def, sol, lastSol)) {
      out.push({
        id: `routine:${def.kind}:${code}:${occ.dueSol}`,
        source: 'routine',
        kind: def.kind,
        icon: def.icon,
        title: t(def.titleKey),
        detail: null,
        code,
        due: occ.due,
        dueSol: occ.dueSol,
        priority: occ.overdue ? 'caution' : 'routine',
        measures: def.measures || [],
        target: def.target(code),
        basis: def.basis,
        configId: def.id,
      });
    }
  }
  return out;
}

function organTasks({ code, cards, sol, t }) {
  return (cards || [])
    .filter(card => card?.organ && isProblem(card.status))
    .map(card => ({
      id: `organ:${card.organ}:${code}:${sol}`,
      source: 'organ',
      kind: `organ_${card.organ}`,
      icon: ORGAN_ICON[card.organ] || 'questionnaire',
      title: t(`tasks.organ_${card.organ}`),
      detail: card.action || card.headline || null,
      code,
      due: 'now',
      dueSol: sol,
      priority: card.status,
      measures: ORGAN_MEASURES[card.organ] || [],
      target: { screen: 'person', code, organ: card.organ },
      basis: 'mother',
    }));
}

function cognitiveTasks({ code, report, sol, t }) {
  const out = [];
  for (const test of report?.tests || []) {
    const id = test?.test_id;
    if (!COG_TEST_ICON[id]) continue;
    const route = { screen: 'test', code, test: id === 'pvt' ? 'quick' : 'full' };
    const measures = id === 'pvt' ? ['cognitive_pvt', 'cognitive_full'] : ['cognitive_full'];
    if (isProblem(test.status)) {
      out.push({
        id: `cognitive:retest_${id}:${code}:${sol}`, source: 'cognitive', kind: `retest_${id}`,
        icon: COG_TEST_ICON[id], title: t('tasks.t_retest', { test: COG_TEST_LABEL[id] }),
        detail: test.headline || null, code, due: 'now', dueSol: sol, priority: test.status,
        measures, target: route, basis: 'mother',
      });
    } else if (id === 'pvt' && test.baseline && test.baseline.ready === false) {
      out.push({
        id: `cognitive:baseline:${code}:${sol}`, source: 'cognitive', kind: 'baseline',
        icon: 'pvt', title: t('tasks.t_baseline', { n: test.baseline.n ?? 0, needed: test.baseline.needed ?? 3 }),
        detail: test.headline || null, code, due: 'today', dueSol: sol, priority: 'routine',
        measures, target: route, basis: 'mother',
      });
    }
  }
  return out;
}

/** Zone code -> { label, roomId } for a habitat task ("Check CREW QUARTERS N"). */
function zonePlace(zoneCode, t) {
  const room = roomForZone(zoneCode);
  if (room && room.zone === zoneCode) return { label: t(room.labelKey), roomId: room.id };
  const key = `base.zone_${zoneCode}`;
  const text = t(key);
  return { label: text === key ? zoneCode : text, roomId: room?.id ?? null };
}

function habitatTasks({ habitat, sol, t }) {
  const out = [];
  for (const zone of habitat?.zones || []) {
    if (zone?.status !== 'alert') continue;
    const reading = worstReading(zone, 'worst_status');
    const place = zonePlace(zone.code, t);
    out.push({
      id: `habitat:${zone.code}:${sol}`,
      source: 'habitat',
      kind: `habitat_${zone.code}`,
      icon: reading ? iconForReadingCategory(reading.category, reading.channel) : 'base',
      title: t('tasks.t_checkRoom', { room: place.label }),
      detail: reading?.label ?? null,
      code: null,
      zone: zone.code,
      occupants: (zone.occupants || []).map(crewCode),
      due: 'now',
      dueSol: sol,
      priority: 'alert',
      measures: [],
      target: { screen: 'base', room: place.roomId },
      basis: 'mother',
    });
  }
  return out;
}

const dueRank = item => (item.due === 'now' ? 0 : item.due === 'today' ? 1 : 2 + (item.dueSol ?? 0));

export function compareTasks(a, b) {
  return (Number(a.done) - Number(b.done))
    || (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    || (dueRank(a) - dueRank(b))
    || (SOURCE_RANK[a.source] - SOURCE_RANK[b.source])
    || (a.source === 'routine' ? routineRank(a.kind) - routineRank(b.kind) : 0)
    || String(a.code ?? '').localeCompare(String(b.code ?? ''))
    || a.id.localeCompare(b.id);
}

/**
 * buildTasks({ sol, codes, organs, cognitive, habitat, measurements, doneMap, scopeCode, t, lastSol, now })
 *   codes      crew codes in scope (HAB-C1 …)
 *   organs     { [code]: organ cards [{ organ, label, status, action, headline }] }
 *   cognitive  { [code]: GET /api/cognitive/{code} body }
 *   habitat    GET /api/habitat body (or null)
 *   scopeCode  one person (person screen) or null (whole crew)
 * -> sorted items
 */
export function buildTasks({
  sol, codes = [], organs = {}, cognitive = {}, habitat = null, measurements = [], doneMap = {},
  scopeCode = null, t = enT, lastSol = MISSION_LAST_SOL, now = new Date(),
}) {
  if (sol == null) return [];
  const people = scopeCode ? [scopeCode] : codes;
  const items = [];
  for (const code of people) {
    const cog = cognitiveTasks({ code, report: cognitive[code], sol, t });
    const routine = routineTasks({ code, sol, lastSol, t })
      // A PVT asked for by the cognitive report replaces the weekly one.
      .filter(item => !(item.kind === 'pvt' && cog.some(task => task.icon === 'pvt')));
    items.push(...organTasks({ code, cards: organs[code], sol, t }), ...cog, ...routine);
  }
  for (const task of habitatTasks({ habitat, sol, t })) {
    if (!scopeCode) { items.push(task); continue; }
    const home = getProfile(scopeCode)?.homeZone;
    if (task.zone === home || task.occupants.includes(scopeCode)) items.push({ ...task, id: `${task.id}:${scopeCode}`, code: scopeCode });
  }

  const solOf = item => item.dueSol ?? sol;
  return items.map(item => {
    const manual = isDone(doneMap, solOf(item), item.id);
    const lo = Math.min(solOf(item), sol);
    const hi = Math.max(solOf(item), sol);
    const measured = !manual && item.code && measuredBetween(measurements, item.code, item.measures, lo, hi, sol, now);
    const profile = item.code ? getProfile(item.code) : null;
    return {
      ...item,
      who: profile?.callsign ?? item.code ?? null,
      done: Boolean(manual || measured),
      doneBy: manual ? 'manual' : measured ? 'measurement' : null,
    };
  }).sort(compareTasks);
}

/** { total, done, open, alert, caution } */
export function countTasks(items) {
  const counts = { total: 0, done: 0, open: 0, alert: 0, caution: 0 };
  for (const item of items || []) {
    counts.total += 1;
    if (item.done) { counts.done += 1; continue; }
    counts.open += 1;
    if (item.priority === 'alert') counts.alert += 1;
    if (item.priority === 'caution') counts.caution += 1;
  }
  return counts;
}

// Self-measurements entered by the crew in the GUI (blood pressure, glucose, water, mood, ...).
// The database has no table for them yet (GUI/TODO.md), so they live in this browser only.
// Shared by the organ screens (writers) and the task list (reader: a measurement done this sol
// ticks off its task). Subscribers are notified on every change, in this tab and in others.

export const MEASUREMENTS_KEY = 'awernasa.measurements.v1';
const MAX_ENTRIES = 2000;
const listeners = new Set();

function read() {
  try {
    const list = JSON.parse(window.localStorage.getItem(MEASUREMENTS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    window.localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    /* storage full or blocked: keep working in memory for this call */
  }
  listeners.forEach(fn => fn());
}

/**
 * Record one measurement.
 *   code: crew code 'HAB-C1'..'HAB-C4'
 *   kind: measurement id, e.g. 'bp', 'hr', 'glucose', 'temp', 'sleep', 'mood', 'water', 'urine_sample',
 *         'weight', 'symptoms', 'cognitive_pvt' (free string; task list matches on it)
 *   values: plain object, e.g. { systolic: 128, diastolic: 82 }
 *   sol: mission sol the entry belongs to (number or null)
 */
export function recordMeasurement(code, kind, values, sol = null) {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, code, kind, values, sol, at: new Date().toISOString() };
  write([...read(), entry]);
  return entry;
}

/** Entries, newest last; optional filters { code, kind, sol }. */
export function listMeasurements({ code, kind, sol } = {}) {
  return read().filter(e => (code == null || e.code === code) && (kind == null || e.kind === kind) && (sol == null || e.sol === sol));
}

/** Latest entry of one kind for one person, or null. */
export function latestMeasurement(code, kind) {
  const list = listMeasurements({ code, kind });
  return list.length ? list[list.length - 1] : null;
}

export function clearMeasurements() {
  write([]);
}

/** subscribe(fn) -> unsubscribe. Fires on changes in this tab and (via 'storage') in other tabs. */
export function subscribeMeasurements(fn) {
  listeners.add(fn);
  const onStorage = e => { if (e.key === MEASUREMENTS_KEY) fn(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

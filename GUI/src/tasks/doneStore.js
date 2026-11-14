// Tasks ticked off by hand. Stored per sol under one localStorage key:
//   { "142": ["routine:pmc:HAB-C1:142", ...], "141": [...] }
// Only the last KEEP_SOLS sols are kept. Measurements tick tasks off on their own (useTasks).

export const DONE_KEY = 'awernasa.tasks.done.v1';
const KEEP_SOLS = 30;
const listeners = new Set();

export function readDone() {
  try {
    const value = JSON.parse(window.localStorage.getItem(DONE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function write(map) {
  const sols = Object.keys(map).map(Number).filter(Number.isFinite).sort((a, b) => b - a).slice(0, KEEP_SOLS);
  const kept = Object.fromEntries(sols.map(sol => [String(sol), map[String(sol)]]).filter(([, ids]) => ids?.length));
  try {
    window.localStorage.setItem(DONE_KEY, JSON.stringify(kept));
  } catch {
    /* storage blocked: the toggle lasts until reload */
  }
  listeners.forEach(fn => fn());
}

/** True when `id` was ticked off by hand for `sol`. */
export const isDone = (map, sol, id) => Boolean(map?.[String(sol)]?.includes(id));

/** Toggle one task id for one sol; `value` forces the state. Returns the new state. */
export function setDone(sol, id, value) {
  const map = readDone();
  const key = String(sol);
  const ids = new Set(map[key] || []);
  const next = value ?? !ids.has(id);
  if (next) ids.add(id); else ids.delete(id);
  map[key] = [...ids];
  write(map);
  return next;
}

/** subscribe(fn) -> unsubscribe; also fires on changes from other tabs. */
export function subscribeDone(fn) {
  listeners.add(fn);
  const onStorage = event => { if (event.key === DONE_KEY) fn(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

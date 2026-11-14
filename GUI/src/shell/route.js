// App route (DESIGN.md §3): { screen, code, organ, room, test }, mirrored in the URL query
// (?screen=person&code=HAB-C4&organ=limbs) so the browser / phone back button and a reload work.

export const SCREEN_IDS = ['crew', 'person', 'base', 'test'];
export const TEST_KINDS = ['quick', 'full'];
const FIELDS = ['code', 'organ', 'room', 'test'];

export const DEFAULT_ROUTE = Object.freeze({ screen: 'crew', code: null, organ: null, room: null, test: null });

const clean = value => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** Any partial / foreign object -> a valid route (unknown screen or a person without code -> crew). */
export function normalizeRoute(input) {
  const raw = typeof input === 'string' ? { screen: input } : (input || {});
  const screen = SCREEN_IDS.includes(raw.screen) ? raw.screen : 'crew';
  const route = { ...DEFAULT_ROUTE, screen };
  for (const field of FIELDS) route[field] = clean(raw[field]);
  if (route.code) route.code = route.code.toUpperCase();
  if ((screen === 'person' || screen === 'test') && !route.code) return { ...DEFAULT_ROUTE };
  if (screen === 'test' && !TEST_KINDS.includes(route.test)) route.test = 'quick';
  if (screen !== 'test') route.test = null;
  if (screen !== 'person') route.organ = null;
  if (screen !== 'base') route.room = null;
  if (screen === 'crew') route.code = null;
  return route;
}

/**
 * Next route after navigate(patch). Same screen (and same person) -> merge into the current
 * route, e.g. navigate({ organ: 'heart' }) keeps the person; another screen or another person
 * starts from a clean route, so an old organ / room does not leak into it.
 */
export function mergeRoute(current, patch) {
  const next = typeof patch === 'string' ? { screen: patch } : (patch || {});
  const sameScreen = next.screen == null || next.screen === current.screen;
  const samePerson = !('code' in next) || clean(next.code)?.toUpperCase() === current.code;
  let base = current;
  if (!sameScreen) {
    // The person carries over into person / test screens unless another one is given.
    const carry = (next.screen === 'person' || next.screen === 'test') ? current.code : null;
    base = { ...DEFAULT_ROUTE, code: carry };
  } else if (!samePerson) {
    base = { ...DEFAULT_ROUTE, screen: current.screen };
  }
  return normalizeRoute({ ...base, ...next });
}

export const sameRoute = (a, b) => ['screen', ...FIELDS].every(key => (a?.[key] ?? null) === (b?.[key] ?? null));

export function routeFromSearch(search) {
  const params = new URLSearchParams(search || '');
  return normalizeRoute(Object.fromEntries(['screen', ...FIELDS].map(key => [key, params.get(key)])));
}

export function routeToSearch(route) {
  const params = new URLSearchParams();
  for (const key of ['screen', ...FIELDS]) if (route[key]) params.set(key, route[key]);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Where the on-screen back button goes when there is no browser history of ours. */
export function parentRoute(route) {
  if (route.screen === 'person' && route.organ) return { ...route, organ: null };
  if (route.screen === 'base' && route.room) return { ...route, room: null };
  if (route.screen === 'test') return normalizeRoute({ screen: 'person', code: route.code, organ: 'brain' });
  return { ...DEFAULT_ROUTE };
}

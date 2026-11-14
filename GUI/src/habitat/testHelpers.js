// Test helpers of the base screen: a fetch stub that answers GET /api/habitat from the
// recorded responses (and everything else like src/test/mother.js). Not used at runtime.
import { vi } from 'vitest';
import { jsonResponse, motherRoute, requestedPaths } from '../test/mother.js';
import sol142 from '../test/fixtures/habitat_sol142.json';
import sol380 from '../test/fixtures/habitat_sol380.json';
import sol600 from '../test/fixtures/habitat_sol600.json';

/** Recorded GET /api/habitat responses of the real MOTHER backend, by sol. 600 is the latest sol. */
export const habitatFixtures = { 142: sol142, 380: sol380, 600: sol600 };
export const LATEST_SOL = 600;

export { jsonResponse, requestedPaths };

/** Answer /api/habitat[?sol=N] from the fixtures; undefined for any other URL. */
export function habitatRoute(url) {
  const { pathname, searchParams } = new URL(url, 'http://gui.test');
  if (pathname !== '/api/habitat') return undefined;
  const sol = searchParams.get('sol') ?? String(LATEST_SOL);
  if (habitatFixtures[sol]) return jsonResponse(habitatFixtures[sol]);
  return jsonResponse({ error: `no habitat data for sol ${sol}` }, { status: 404 });
}

/**
 * Install a fetch stub: /api/habitat from the habitat fixtures, the rest from the MOTHER
 * fixtures. `override(url)` may return a Response (or a promise / rejection) for single
 * answers; return undefined to fall through.
 */
export function stubHabitat(override) {
  const fetchMock = vi.fn(async url => {
    const custom = override?.(String(url));
    if (custom !== undefined) return custom;
    return habitatRoute(String(url)) ?? motherRoute(String(url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Only the /api/habitat requests made so far, e.g. ['/api/habitat', '/api/habitat?sol=142']. */
export const habitatRequests = fetchMock => requestedPaths(fetchMock).filter(path => path.startsWith('/api/habitat'));

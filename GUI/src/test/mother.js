import { vi } from 'vitest';
import status from './fixtures/status.json';
import subjects from './fixtures/subjects.json';
import overview from './fixtures/organs_overview.json';
import habC1 from './fixtures/organs_HAB-C1.json';
import habC2 from './fixtures/organs_HAB-C2.json';
import habC3 from './fixtures/organs_HAB-C3.json';
import habC4 from './fixtures/organs_HAB-C4.json';
import habC4Sol142 from './fixtures/organs_HAB-C4_sol142.json';

// Recorded responses of the real MOTHER backend (computed on the team database).
export const fixtures = { status, subjects, overview, habC1, habC2, habC3, habC4, habC4Sol142 };

const reports = { 'HAB-C1': habC1, 'HAB-C2': habC2, 'HAB-C3': habC3, 'HAB-C4': habC4 };

export const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

/** Answer a MOTHER URL from the fixtures, like the real backend would. */
export function motherRoute(url) {
  const { pathname, searchParams } = new URL(url, 'http://gui.test');
  if (pathname === '/api/status') return jsonResponse(status);
  if (pathname === '/api/subjects') return jsonResponse(subjects);
  if (pathname === '/api/organs') return jsonResponse(overview);
  const match = pathname.match(/^\/api\/organs\/([^/]+)$/);
  if (match) {
    const code = decodeURIComponent(match[1]);
    if (code === 'HAB-C4' && searchParams.get('sol') === '142') return jsonResponse(habC4Sol142);
    if (reports[code]) return jsonResponse(reports[code]);
    return jsonResponse({ error: `unknown person: ${code}`, hint: 'see /api/subjects' }, { status: 404 });
  }
  return jsonResponse({ error: 'not found' }, { status: 404 });
}

/**
 * Install a fetch stub backed by the fixtures. `override(url)` may return a Response
 * (or a promise / rejection) to change single answers; return undefined to fall through.
 */
export function stubMother(override) {
  const fetchMock = vi.fn(async (url) => {
    const custom = override?.(String(url));
    if (custom !== undefined) return custom;
    return motherRoute(String(url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Paths (with query) requested so far, e.g. ['/api/status', '/api/organs/HAB-C1']. */
export const requestedPaths = fetchMock => fetchMock.mock.calls.map(([url]) => {
  const parsed = new URL(String(url), 'http://gui.test');
  return parsed.pathname + parsed.search;
});

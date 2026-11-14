import { describe, expect, it } from 'vitest';
import { ApiError, getHabitat, isOfflineError } from '../api.js';
import { habitatFixtures, jsonResponse, requestedPaths, stubHabitat } from './testHelpers.js';

describe('getHabitat', () => {
  it('requests /api/habitat without a query for the latest sol', async () => {
    const fetchMock = stubHabitat();
    const body = await getHabitat();
    expect(body).toEqual(habitatFixtures[600]);
    expect(body).toMatchObject({ schema_version: '1.0', as_of: { sol: 600, latest_sol: 600 } });
    expect(requestedPaths(fetchMock)).toEqual(['/api/habitat']);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/habitat');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('adds ?sol=N and ignores an empty sol', async () => {
    const fetchMock = stubHabitat();
    expect((await getHabitat({ sol: 142 })).as_of.sol).toBe(142);
    await getHabitat({ sol: '380' });
    await getHabitat({ sol: null });
    await getHabitat({ sol: '' });
    expect(requestedPaths(fetchMock)).toEqual(['/api/habitat?sol=142', '/api/habitat?sol=380', '/api/habitat', '/api/habitat']);
  });

  it('turns 503 into an offline ApiError carrying the hint', async () => {
    stubHabitat(() => jsonResponse({ error: 'database unreachable', hint: 'start the VPN' }, { status: 503 }));
    const error = await getHabitat({ sol: 142 }).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 503, message: 'database unreachable', hint: 'start the VPN', url: '/api/habitat?sol=142' });
    expect(isOfflineError(error)).toBe(true);
  });

  it('reports a 404 without treating MOTHER as offline', async () => {
    stubHabitat();
    const error = await getHabitat({ sol: 9999 }).catch(e => e);
    expect(error).toMatchObject({ kind: 'http', status: 404, message: 'no habitat data for sol 9999' });
    expect(isOfflineError(error)).toBe(false);
  });

  it('maps a network failure and a non-JSON answer to offline errors', async () => {
    stubHabitat(() => Promise.reject(new TypeError('fetch failed')));
    const network = await getHabitat().catch(e => e);
    expect(network).toMatchObject({ kind: 'network' });
    expect(isOfflineError(network)).toBe(true);

    stubHabitat(() => new Response('<html>bad gateway</html>', { status: 200 }));
    const parse = await getHabitat().catch(e => e);
    expect(parse).toMatchObject({ kind: 'parse' });
    expect(isOfflineError(parse)).toBe(true);
  });

  it('passes an abort signal through: a cancelled request is "aborted", not offline', async () => {
    const controller = new AbortController();
    // emulate the browser: the pending fetch rejects once the caller aborts
    stubHabitat(() => new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = getHabitat({ sol: 142 }, { signal: controller.signal }).catch(e => e);
    controller.abort();
    const error = await pending;
    expect(error).toMatchObject({ kind: 'aborted' });
    expect(isOfflineError(error)).toBe(false);
  });
});

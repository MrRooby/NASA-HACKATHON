import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, DEFAULT_TIMEOUT_MS, getOrganReport, getOverview, getStatus, getSubjects, isOfflineError } from './api.js';
import { fixtures, jsonResponse, requestedPaths, stubMother } from './test/mother.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('MOTHER api client', () => {
  it('uses relative /api URLs and parses the recorded backend responses', async () => {
    const fetchMock = stubMother();
    expect(await getStatus()).toEqual(fixtures.status);
    expect(await getSubjects()).toEqual(fixtures.subjects);
    expect(await getOverview()).toHaveLength(18);
    expect(await getOrganReport('HAB-C1')).toMatchObject({ schema_version: '1.1', as_of: { sol: 600 } });
    expect(requestedPaths(fetchMock)).toEqual(['/api/status', '/api/subjects', '/api/organs', '/api/organs/HAB-C1']);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/status');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('adds ?sol= or ?day= and encodes the person code', async () => {
    const fetchMock = stubMother();
    const report = await getOrganReport('HAB-C4', { sol: 142 });
    expect(report.as_of).toEqual({ sol: 142 });
    await getOrganReport('SYN-01', { day: 51 }).catch(() => {});
    await getOrganReport('A B/C').catch(() => {});
    expect(requestedPaths(fetchMock)).toEqual(['/api/organs/HAB-C4?sol=142', '/api/organs/SYN-01?day=51', '/api/organs/A%20B%2FC']);
  });

  it('turns 503 "database unreachable" into an offline ApiError with the hint', async () => {
    stubMother(() => jsonResponse({ error: 'database unreachable', hint: 'start the VPN' }, { status: 503 }));
    const error = await getOrganReport('HAB-C1').catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 503, message: 'database unreachable', hint: 'start the VPN' });
    expect(isOfflineError(error)).toBe(true);
  });

  it('reports 404 unknown person without treating MOTHER as offline', async () => {
    stubMother();
    const error = await getOrganReport('NOBODY').catch(e => e);
    expect(error).toMatchObject({ kind: 'http', status: 404, message: 'unknown person: NOBODY' });
    expect(isOfflineError(error)).toBe(false);
  });

  it('treats a non-JSON proxy error (nginx 502) as offline', async () => {
    stubMother(() => new Response('<html>Bad Gateway</html>', { status: 502 }));
    const error = await getStatus().catch(e => e);
    expect(error).toMatchObject({ kind: 'http', status: 502, message: 'HTTP 502' });
    expect(isOfflineError(error)).toBe(true);
  });

  it('rejects a 200 answer that is not JSON', async () => {
    stubMother(() => new Response('<!doctype html><title>GUI</title>', { status: 200 }));
    await expect(getSubjects()).rejects.toMatchObject({ kind: 'parse' });
  });

  it('maps a failed fetch to a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await getStatus().catch(e => e);
    expect(error).toMatchObject({ kind: 'network' });
    expect(error.message).toMatch(/cannot reach mother/i);
    expect(isOfflineError(error)).toBe(true);
  });

  it('aborts a hanging request after the timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = getStatus().catch(e => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(error).toMatchObject({ kind: 'timeout' });
    expect(isOfflineError(error)).toBe(true);
  });

  it('honours a custom timeout and a caller abort signal', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const quick = getStatus({ timeoutMs: 50 }).catch(e => e);
    await vi.advanceTimersByTimeAsync(50);
    expect(await quick).toMatchObject({ kind: 'timeout' });

    const controller = new AbortController();
    const cancelled = getOrganReport('HAB-C1', {}, { signal: controller.signal }).catch(e => e);
    controller.abort();
    const error = await cancelled;
    expect(error).toMatchObject({ kind: 'aborted' });
    expect(isOfflineError(error)).toBe(false);
  });
});

describe('POST helper', () => {
  it('sends JSON with the X-Requested-With header MOTHER requires', async () => {
    const fetchMock = stubMother(() => jsonResponse({ session_id: 1 }, { status: 201 }));
    const { postSession } = await import('./cognitive/engine/api.js');
    expect(await postSession({ a: 1 })).toEqual({ session_id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/cognitive/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Requested-With']).toBe('awernasa');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });
  it('422 surfaces as an http ApiError', async () => {
    stubMother(() => jsonResponse({ error: 'bad trial' }, { status: 422 }));
    const { postSession } = await import('./cognitive/engine/api.js');
    expect(await postSession({}).catch(e => e)).toMatchObject({ kind: 'http', status: 422, message: 'bad trial' });
  });
});

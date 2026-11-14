// Small client for the MOTHER backend (contract: ../MOTHER/UI_CONTRACT.md, schema 1.1).
//
// In production the GUI is served by nginx with /api/ proxied to MOTHER on the same
// origin, so every URL is relative ('/api/...'). For other setups set VITE_API_BASE
// at build time (e.g. VITE_API_BASE=http://127.0.0.1:8000).

export const API_BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

export const DEFAULT_TIMEOUT_MS = 10000;
// /api/organs assesses every person in the database; give it more room.
export const OVERVIEW_TIMEOUT_MS = 20000;

/**
 * Error thrown by every API call.
 * kind: 'timeout' | 'network' | 'http' | 'parse' | 'aborted'
 * status: HTTP status for kind 'http' (503 = database unreachable, 404 = unknown person).
 * hint: the backend's `hint` field, when it sent one.
 */
export class ApiError extends Error {
  constructor(message, { kind, status = null, hint = null, url = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.hint = hint;
    this.url = url;
  }
}

/**
 * True when the error means "MOTHER is not usable right now" and the GUI should fall
 * back to the built-in demo data: no connection, timeout, a non-JSON answer, the
 * database being down (503) or the nginx proxy failing to reach MOTHER (502/504).
 */
export function isOfflineError(error) {
  if (!(error instanceof ApiError)) return true;
  if (error.kind === 'aborted') return false;
  if (error.kind === 'http') return error.status === 502 || error.status === 503 || error.status === 504;
  return true;
}

/**
 * `method` / `body` (a JSON-serialisable value) are for the few write endpoints. Every write carries
 * `X-Requested-With: awernasa`, which MOTHER requires (403 without it).
 */
export async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, method = 'GET', body } = {}) {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  let response;
  try {
    const init = { headers: { Accept: 'application/json' }, signal: controller.signal };
    if (method !== 'GET') {
      init.method = method;
      init.headers = { ...init.headers, 'Content-Type': 'application/json', 'X-Requested-With': 'awernasa' };
      if (body !== undefined) init.body = JSON.stringify(body);
    }
    response = await fetch(url, init);
  } catch (cause) {
    if (timedOut) throw new ApiError(`MOTHER did not answer within ${Math.round(timeoutMs / 1000)} s`, { kind: 'timeout', url });
    if (controller.signal.aborted) throw new ApiError('Request cancelled', { kind: 'aborted', url });
    throw new ApiError(`Cannot reach MOTHER (${cause?.message || 'network error'})`, { kind: 'network', url });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  let data = null;
  let parseFailed = false;
  try {
    data = await response.json();
  } catch {
    parseFailed = true;
  }

  if (!response.ok) {
    const message = (data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`;
    throw new ApiError(message, { kind: 'http', status: response.status, hint: data?.hint ?? null, url });
  }
  if (parseFailed) throw new ApiError('MOTHER sent a response that is not JSON', { kind: 'parse', url });
  return data;
}

/** GET /api/status -> { database: {reachable, version, error, hint}, dashboard: {...} } */
export const getStatus = options => request('/api/status', options);

/** GET /api/subjects -> [{ code, label, kind, sex, age_band, mission, synthetic, data_kind }] */
export const getSubjects = options => request('/api/subjects', options);

/** GET /api/organs -> crew overview: [{ subject, overall_status, top_message, organs: {brain: 'ok', ...} }] */
export const getOverview = options => request('/api/organs', { timeoutMs: OVERVIEW_TIMEOUT_MS, ...options });

/**
 * GET /api/organs/{code}[?sol=N | ?day=N] -> one person's 10 organ cards.
 * `sol` is for habitat crew (Mars), `day` for ISS crew; omit both for the latest.
 */
export function getOrganReport(code, { sol, day } = {}, options) {
  const params = new URLSearchParams();
  if (sol != null && sol !== '') params.set('sol', String(sol));
  else if (day != null && day !== '') params.set('day', String(day));
  const query = params.toString();
  return request(`/api/organs/${encodeURIComponent(code)}${query ? `?${query}` : ''}`, options);
}

/**
 * GET /api/habitat[?sol=N] -> every habitat zone with the readings of one sol
 * (contract "habitat 1.0" in ../MOTHER/UI_CONTRACT.md). Omit `sol` for the latest sol.
 */
export function getHabitat({ sol } = {}, options) {
  const params = new URLSearchParams();
  if (sol != null && sol !== '') params.set('sol', String(sol));
  const query = params.toString();
  return request(`/api/habitat${query ? `?${query}` : ''}`, options);
}

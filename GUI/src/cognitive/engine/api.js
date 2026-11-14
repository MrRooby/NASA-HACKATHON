import { request } from '../../api.js';
import { PROTOCOLS } from './protocols.js';
import { isOfflineError } from '../../api.js';

/** POST /api/cognitive/sessions. Resolves with the body for 201 (new) and 200 (duplicate). */
export const postSession = (payload, options) =>
  request('/api/cognitive/sessions', { method: 'POST', body: payload, ...options });

/** GET /api/cognitive/{subject} -> tiles for the three tests. */
export const getCognitive = (subject, options) => request(`/api/cognitive/${encodeURIComponent(subject)}`, options);

/** GET /api/cognitive/protocols, falling back to the built-in table when MOTHER is unreachable. */
export async function getProtocols(options) {
  try {
    return await request('/api/cognitive/protocols', options);
  } catch (error) {
    if (isOfflineError(error)) return { protocols: Object.values(PROTOCOLS), offline: true };
    throw error;
  }
}

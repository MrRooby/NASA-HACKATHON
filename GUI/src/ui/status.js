// Status vocabulary shared by every cockpit primitive.

export const STATUSES = ['ok', 'caution', 'alert', 'no_data'];

const SYNONYMS = {
  ok: 'ok', normal: 'ok', nominal: 'ok', green: 'ok',
  caution: 'caution', warning: 'caution', warn: 'caution', yellow: 'caution', amber: 'caution',
  alert: 'alert', critical: 'alert', danger: 'alert', red: 'alert', alarm: 'alert',
  no_data: 'no_data', nodata: 'no_data', unknown: 'no_data', none: 'no_data', missing: 'no_data',
};

/** Any status-ish string → 'ok' | 'caution' | 'alert' | 'no_data'. */
export function normalizeStatus(status) {
  if (status == null) return 'no_data';
  return SYNONYMS[String(status).toLowerCase()] || 'no_data';
}

/** i18n key of the status word. */
export const STATUS_KEY = { ok: 'ui.statusOk', caution: 'ui.statusCaution', alert: 'ui.statusAlert', no_data: 'ui.statusNoData' };

/** Theme colour of a status. */
export const STATUS_COLOUR = { ok: 'var(--ok)', caution: 'var(--caution)', alert: 'var(--alert)', no_data: 'var(--dim)' };

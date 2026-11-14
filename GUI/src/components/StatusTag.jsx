import React from 'react';
import { useT } from '../i18n/index.js';
import { cx } from './cx.js';

/** Four-character status codes shown between brackets. */
export const STATUS_CODES = { ok: 'OK', caution: 'CAUT', alert: 'ALRT', no_data: '----' };

const STATUS_WORD_KEYS = {
  ok: 'common.statusOk',
  caution: 'common.statusCaution',
  alert: 'common.statusAlert',
  no_data: 'common.statusNoData',
};

/** Any unknown / missing status is shown as no_data. */
export const normalizeStatus = status => (status in STATUS_CODES ? status : 'no_data');

/** statusText('caution') -> '[ CAUT ]' */
export const statusText = status => `[ ${STATUS_CODES[normalizeStatus(status)]} ]`;

/**
 * Status as text, never colour alone: [ OK ] / [ CAUT ] / [ ALRT ] / [ ---- ].
 * props: status 'ok'|'caution'|'alert'|'no_data' (anything else -> no_data), className.
 */
export default function StatusTag({ status, className, ...rest }) {
  const t = useT();
  const safe = normalizeStatus(status);
  return (
    <span className={cx('stag', `stag-${safe}`, className)} data-status={safe} title={t(STATUS_WORD_KEYS[safe])} {...rest}>
      {statusText(safe)}
    </span>
  );
}

import React from 'react';
import { cx } from './cx.js';
import StatusTag, { normalizeStatus } from './StatusTag.jsx';

/**
 * One aligned reading: LABEL ........ value unit [ OK ]  note
 * props: label (node), value (node; null/'' -> —), unit, status (optional, adds a StatusTag
 *        and colours the value), note (node), className.
 */
export default function DataRow({ label, value, unit, status, note, className, ...rest }) {
  const empty = value == null || value === '';
  return (
    <div className={cx('datarow', status && `datarow-${normalizeStatus(status)}`, className)} {...rest}>
      <span className="datarow-label">{label}</span>
      <span className="datarow-leader" aria-hidden="true" />
      <span className="datarow-value">
        {empty ? '—' : value}
        {!empty && unit ? <span className="datarow-unit"> {unit}</span> : null}
      </span>
      {status ? <StatusTag status={status} /> : null}
      {note != null && note !== '' ? <span className="datarow-note">{note}</span> : null}
    </div>
  );
}

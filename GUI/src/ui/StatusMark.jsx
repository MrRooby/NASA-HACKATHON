import { useT } from '../i18n/index.js';
import { STATUS_KEY, normalizeStatus } from './status.js';
import './ui.css';

/** Shape of each status on a 10×10 box: ■ ok, ▲ caution, ◆ alert, ○ no data. */
export function StatusShape({ status, size = 14 }) {
  const s = normalizeStatus(status);
  return (
    <svg className="ui-shape" data-shape={SHAPE[s]} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
      {s === 'ok' && <rect x="1" y="1" width="8" height="8" />}
      {s === 'caution' && <polygon points="5,0.5 9.7,9.3 0.3,9.3" shapeRendering="geometricPrecision" />}
      {s === 'alert' && <polygon points="5,0 10,5 5,10 0,5" shapeRendering="geometricPrecision" />}
      {s === 'no_data' && <circle cx="5" cy="5" r="3.8" fill="none" strokeWidth="1.6" shapeRendering="geometricPrecision" />}
    </svg>
  );
}

export const SHAPE = { ok: 'square', caution: 'triangle', alert: 'diamond', no_data: 'circle' };

const SIZE = { sm: 11, md: 14, lg: 20 };

/**
 * <StatusMark status size? label? />: redundant status coding (colour + shape + word).
 * label=false shows the shape only; the word stays as the accessible name.
 */
export function StatusMark({ status, size = 'md', label = true, className = '' }) {
  const t = useT();
  const s = normalizeStatus(status);
  const word = t(STATUS_KEY[s]);
  const a11y = label ? {} : { role: 'img', 'aria-label': word, title: word };
  return (
    <span className={`ui-status ui-status--${s} ui-status--${size} ${className}`.trim()} data-status={s} {...a11y}>
      <StatusShape status={s} size={SIZE[size] || SIZE.md} />
      {label && <span className="ui-status__word">{word}</span>}
    </span>
  );
}

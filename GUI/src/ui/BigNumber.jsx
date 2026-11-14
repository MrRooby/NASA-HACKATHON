import { PixelIcon } from '../pixel/index.js';
import { useT } from '../i18n/index.js';
import { normalizeStatus } from './status.js';
import './ui.css';

const format = (value, digits) => {
  if (value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return null;
  if (typeof value !== 'number') return String(value);
  return digits != null ? value.toFixed(digits) : String(+value.toFixed(2));
};

/** <BigNumber value unit? status? label? icon? size? digits? />: a reading in big tabular digits. */
export function BigNumber({ value, unit, status, label, icon, size = 'md', digits, className = '' }) {
  const t = useT();
  const text = format(value, digits);
  const s = status != null ? normalizeStatus(status) : null;
  const tone = s === 'caution' || s === 'alert' ? s : 'quiet';
  return (
    <div className={`ui-big ui-big--${size} ui-big--${tone} ${className}`.trim()} data-status={s || undefined}>
      {(icon || label) && (
        <div className="ui-big__head">
          {icon && <PixelIcon name={icon} size={size === 'lg' ? 32 : 24} />}
          {label && <span className="ui-big__label">{label}</span>}
        </div>
      )}
      <div className="ui-big__value">
        <span className="ui-big__num">{text ?? t('ui.noValue')}</span>
        {unit && text != null && <span className="ui-big__unit">{unit}</span>}
      </div>
    </div>
  );
}

import { PixelIcon } from '../pixel/index.js';
import { StatusMark } from './StatusMark.jsx';
import { normalizeStatus } from './status.js';
import './ui.css';

/**
 * <PixelFrame title? icon? status? actions? as? className?>: panel with stepped pixel corners.
 * Quiet display: the frame takes the status colour only for caution / alert.
 */
export function PixelFrame({ title, icon, status, actions, children, className = '', as: Tag = 'section', bodyClassName = '', ...rest }) {
  const s = status != null ? normalizeStatus(status) : null;
  const tone = s === 'caution' || s === 'alert' ? s : 'quiet';
  const hasHeader = title || icon || actions || (s && s !== 'ok');
  return (
    <Tag className={`ui-frame ui-frame--${tone} ${className}`.trim()} data-status={s || undefined} {...rest}>
      <div className="ui-frame__inner">
        {hasHeader && (
          <header className="ui-frame__head">
            {icon && <PixelIcon name={icon} size={24} />}
            {title && <h2 className="ui-frame__title">{title}</h2>}
            {s && s !== 'ok' && <StatusMark status={s} size="sm" />}
            {actions && <div className="ui-frame__actions">{actions}</div>}
          </header>
        )}
        <div className={`ui-frame__body ${bodyClassName}`.trim()}>{children}</div>
      </div>
    </Tag>
  );
}

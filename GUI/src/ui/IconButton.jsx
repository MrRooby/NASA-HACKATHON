import { PixelIcon } from '../pixel/index.js';
import './ui.css';

const ICON_SIZE = { sm: 24, md: 32, lg: 48 };

/**
 * <IconButton icon label onClick? active? status? size? layout? disabled? title? />:
 * touch-friendly tile (icon over label; layout="row" puts the label beside it).
 */
export function IconButton({
  icon, label, onClick, active, status, size = 'md', layout = 'tile', disabled = false, title, type = 'button', className = '', children, ...rest
}) {
  return (
    <button
      type={type}
      className={`ui-iconbtn ui-iconbtn--${size} ui-iconbtn--${layout} ${active ? 'is-active' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      onClick={onClick}
      disabled={disabled}
      title={title || (typeof label === 'string' ? label : undefined)}
      aria-pressed={active == null ? undefined : !!active}
      data-status={status || undefined}
      {...rest}
    >
      {icon && <PixelIcon name={icon} size={ICON_SIZE[size] || ICON_SIZE.md} status={status} />}
      {label != null && <span className="ui-iconbtn__label">{label}</span>}
      {children}
    </button>
  );
}

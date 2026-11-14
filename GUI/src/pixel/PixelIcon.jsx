import { ALIASES, ICON_GROUPS, SPRITES } from './sprites.js';
import { GridRects } from './grid.jsx';
import './pixel.css';

/** Every sprite name in display order (aliases not included). */
export const PIXEL_ICONS = Object.values(ICON_GROUPS).flat();

/** Sprite for a name or alias; null when unknown. */
export function getSprite(name) {
  if (!name) return null;
  return SPRITES[name] || SPRITES[ALIASES[name]] || null;
}

/** Which CSS animation a sprite plays with animate=true. */
const ANIMATION = {
  heart: 'beat', hr: 'beat', alert: 'blink', radiation: 'spin', radiation_sensor: 'blink',
};

// Status corner marks, drawn on a 16-px grid and scaled to the sprite: the same shapes
// as StatusMark (■ ok, ▲ caution, ◆ alert, ○ no data), outlined in the background colour.
const MARKS = {
  ok: ['kkkkkk', 'kffffk', 'kffffk', 'kffffk', 'kffffk', 'kkkkkk'],
  caution: ['...k...', '..kfk..', '..kfk..', '.kfffk.', '.kfffk.', 'kfffffk', 'kkkkkkk'],
  alert: ['...k...', '..kfk..', '.kfffk.', 'kfffffk', '.kfffk.', '..kfk..', '...k...'],
  no_data: ['.kkkk.', 'kffffk', 'fkkkkf', 'fk..kf', 'fkkkkf', 'kffffk', '.kkkk.'],
};
const MARK_COLOUR = { ok: 'var(--ok)', caution: 'var(--caution)', alert: 'var(--alert)', no_data: 'var(--dim)' };
const MARK_STATUS = { ok: 'ok', caution: 'caution', warning: 'caution', alert: 'alert', critical: 'alert', no_data: 'no_data', unknown: 'no_data' };

function CornerMark({ status, width, height }) {
  const key = MARK_STATUS[status];
  if (!key) return null;
  const rows = MARKS[key];
  const scale = width / 16;
  const markW = rows[0].length;
  const pal = key === 'no_data'
    ? { k: 'var(--bg)', f: MARK_COLOUR.no_data }
    : { k: 'var(--bg)', f: MARK_COLOUR[key] };
  return (
    <g className="px-mark" data-mark={key}
      transform={`translate(${width - markW * scale} ${height - rows.length * scale}) scale(${scale})`}>
      <GridRects rows={rows} pal={pal} />
    </g>
  );
}

/**
 * <PixelIcon name size title? status? animate? className? />: a pixel-art sprite as inline SVG.
 * Unknown names draw a neutral "?" tile and never throw. `status` adds a small shape-coded
 * corner mark without changing the sprite colours.
 */
export function PixelIcon({ name, size = 32, title, status, animate = false, className = '', style }) {
  const sprite = getSprite(name) || SPRITES.unknown;
  const height = sprite.rows.length;
  const width = sprite.rows[0].length;
  const animation = animate ? ANIMATION[name] || ANIMATION[ALIASES[name]] || 'bob' : null;
  const classes = ['px-icon', animation && `px-anim-${animation}`, className].filter(Boolean).join(' ');
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg
      className={classes}
      data-icon={getSprite(name) ? name : 'unknown'}
      width={size}
      height={(size * height) / width}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      style={style}
      {...a11y}
    >
      {title && <title>{title}</title>}
      <g className="px-sprite"><GridRects rows={sprite.rows} pal={sprite.pal} /></g>
      {status && <CornerMark status={status} width={width} height={height} />}
    </svg>
  );
}

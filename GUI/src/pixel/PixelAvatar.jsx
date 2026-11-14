import { AVATARS } from './avatars.js';
import { GridRects } from './grid.jsx';
import { SPRITES } from './sprites.js';
import './pixel.css';

/** 'HAB-C3', 'hab-c3', 'C3' → 'C3'; anything else → null. */
export function avatarKey(code) {
  const match = String(code ?? '').toUpperCase().match(/C([1-4])$/);
  return match ? `C${match[1]}` : null;
}

/** <PixelAvatar code size? title? />: pixel portrait of a crew member (HAB-C1..C4 or C1..C4). */
export function PixelAvatar({ code, size = 48, title, className = '' }) {
  const key = avatarKey(code);
  const art = (key && AVATARS[key]) || AVATARS.unknown || SPRITES.unknown;
  const height = art.rows.length;
  const width = art.rows[0].length;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg
      className={`px-avatar ${className}`.trim()}
      data-avatar={key || 'unknown'}
      width={size}
      height={(size * height) / width}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      {...a11y}
    >
      {title && <title>{title}</title>}
      <GridRects rows={art.rows} pal={art.pal} />
    </svg>
  );
}

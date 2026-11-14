import React from 'react';
import { cx } from './cx.js';

// 16 x 16 pixel silhouettes ('#' = lit pixel), drawn in currentColor. One accessory per
// crew member: C1 commander's cap, C2 engineer's goggles, C3 geologist's helmet lamp,
// C4 physician's cross. No photos: the crew is fictional.
const BASE = [
  '................',
  '................',
  '.....######.....',
  '....########....',
  '....########....',
  '....##.##.##....',
  '....########....',
  '.....######.....',
  '......####......',
  '......####......',
  '...##########...',
  '..############..',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
];

const SPRITES = {
  C1: [
    '................',
    '....###..###....',
    '....########....',
    '..############..',
    '....########....',
    '....##.##.##....',
    '....########....',
    '.....######.....',
    '......####......',
    '......####......',
    '.####.####.####.',
    '..############..',
    '.##############.',
    '.###.##########.',
    '.###.##########.',
    '.##############.',
  ],
  C2: [
    '............#...',
    '............#...',
    '.....######.#...',
    '....########....',
    '...##########...',
    '...#..####..#...',
    '...##########...',
    '.....######.....',
    '......####......',
    '......####......',
    '...##########...',
    '..############..',
    '.##############.',
    '.######..######.',
    '.#####....#####.',
    '.######..######.',
  ],
  C3: [
    '.......##.......',
    '.....######.....',
    '....###..###....',
    '...##########...',
    '....########....',
    '....##.##.##....',
    '....########....',
    '.....######.....',
    '......####......',
    '......####......',
    '...##########...',
    '..############..',
    '.##############.',
    '.##.###########.',
    '.#.#.##########.',
    '.##############.',
  ],
  C4: [
    '......####......',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '...###.##.###...',
    '...##########...',
    '...#.######.#...',
    '...#..####..#...',
    '......####......',
    '...##########...',
    '..############..',
    '.#########.####.',
    '.########...###.',
    '.#########.####.',
    '.##############.',
  ],
};

/** Horizontal runs of lit pixels -> [{ x, y, width }]. */
function runs(rows) {
  const out = [];
  rows.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x += 1) {
      const lit = row[x] === '#';
      if (lit && start < 0) start = x;
      if (!lit && start >= 0) {
        out.push({ x: start, y, width: x - start });
        start = -1;
      }
    }
  });
  return out;
}

const shortCode = code => String(code ?? '').replace(/^HAB-/, '');

/**
 * Pixel silhouette of a crew member (inline SVG, currentColor).
 * props: code ('HAB-C1' or 'C1'; unknown codes get the plain silhouette), size (px, 48), title (accessible name).
 */
export default function Avatar({ code, size = 48, title, className, ...rest }) {
  const key = shortCode(code);
  const rows = SPRITES[key] || BASE;
  return (
    <svg
      className={cx('avatar', className)}
      data-code={key || undefined}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      fill="currentColor"
      role="img"
      aria-label={title ?? `Crew avatar ${key}`.trim()}
      {...rest}
    >
      {runs(rows).map(run => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} />
      ))}
    </svg>
  );
}

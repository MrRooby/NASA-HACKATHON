// Sprite grid → SVG rectangles (horizontal runs of one colour merged into one rect).

/** [{ x, y, w, c }] runs of one palette char; '.' and chars without a colour are skipped. */
export function gridRuns(rows, pal) {
  const runs = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end += 1;
      if (c !== '.' && pal[c]) runs.push({ x, y, w: end - x, c });
      x = end;
    }
  });
  return runs;
}

/** <rect>s of one grid; theme colours (var(--x)) go through style so every browser resolves them. */
export function GridRects({ rows, pal, dx = 0, dy = 0 }) {
  return gridRuns(rows, pal).map(r => {
    const colour = pal[r.c];
    const paint = colour.startsWith('var(') ? { style: { fill: colour } } : { fill: colour };
    return <rect key={`${r.x}-${r.y}`} x={r.x + dx} y={r.y + dy} width={r.w} height={1} {...paint} />;
  });
}

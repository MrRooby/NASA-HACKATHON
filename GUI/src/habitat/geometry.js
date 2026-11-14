// Geometry of the habitat plan, traced from the team's reference drawing (2048 x 599).
// Everything is in reference pixels, so the SVG uses viewBox "0 0 2048 599".
//
// The lava tube is two wavy walls (top and bottom). Each wall is described by its outer
// and inner edge as control points; `edgeY` interpolates them smoothly, and rooms reuse
// stretches of the same edges, so room outlines always sit exactly on the walls.

export const VIEW_W = 2048;
export const VIEW_H = 599;
export const VIEW_BOX = `0 0 ${VIEW_W} ${VIEW_H}`;

const TOP_OUTER = [
  [68, 195], [100, 188], [150, 171], [200, 156], [230, 148], [250, 139], [275, 123], [300, 110], [350, 100],
  [400, 91], [450, 84], [480, 82], [512, 84], [560, 95], [600, 105], [650, 112], [700, 100], [750, 77],
  [800, 58], [815, 56], [850, 61], [900, 79], [950, 97], [1000, 105], [1050, 101], [1100, 92], [1150, 82],
  [1200, 80], [1250, 90], [1300, 118], [1350, 145], [1400, 161], [1450, 165], [1500, 162], [1550, 158],
  [1600, 168], [1650, 179], [1700, 181], [1750, 186], [1800, 191], [1850, 189], [1900, 188], [1965, 188],
];

const TOP_INNER = [
  [68, 233], [100, 224], [132, 214], [142, 210], [200, 196], [212, 190], [240, 182], [270, 165], [300, 148],
  [350, 140], [400, 130], [450, 122], [480, 120], [512, 123], [550, 130], [600, 143], [632, 149], [650, 150],
  [700, 138], [750, 115], [800, 97], [815, 95], [850, 98], [900, 117], [950, 135], [1000, 144], [1036, 142],
  [1100, 130], [1150, 120], [1200, 118], [1230, 123], [1258, 133], [1300, 155], [1350, 180], [1400, 197],
  [1450, 206], [1500, 200], [1538, 197], [1570, 198], [1600, 203], [1650, 216], [1700, 218], [1750, 225],
  [1784, 229], [1830, 228], [1965, 226],
];

// Inner edge of the bottom wall, west of the reactor bulkhead ...
const BOTTOM_INNER = [
  [106, 360], [125, 364], [157, 359], [167, 358], [200, 355], [243, 349], [260, 348], [280, 350], [300, 356],
  [330, 364], [350, 367], [400, 372], [450, 380], [500, 383], [550, 374], [600, 366], [624, 364], [642, 363],
  [670, 366], [700, 376], [750, 396], [800, 412], [820, 415], [850, 412], [900, 395], [950, 372], [980, 360],
  [1000, 357], [1024, 360], [1050, 372], [1100, 398], [1130, 410], [1150, 415], [1200, 416], [1255, 411],
  [1264, 409], [1300, 408], [1350, 416], [1400, 432], [1450, 447], [1500, 460], [1524, 466], [1534, 467],
  [1560, 467], [1600, 462], [1650, 449], [1700, 434], [1750, 422], [1796, 403],
];

// ... and inside the reactor room.
const BOTTOM_INNER_REACTOR = [[1830, 389], [1900, 376], [1950, 365], [1977, 361]];

const BOTTOM_OUTER = [
  [106, 399], [123, 402], [150, 398], [200, 393], [250, 387], [270, 388], [300, 395], [330, 404], [350, 407],
  [400, 412], [450, 418], [500, 421], [550, 413], [600, 404], [640, 401], [670, 405], [700, 414], [750, 435],
  [800, 450], [820, 453], [850, 451], [900, 433], [950, 410], [980, 398], [1000, 395], [1024, 399],
  [1050, 410], [1100, 438], [1130, 450], [1150, 455], [1200, 456], [1250, 450], [1300, 446], [1350, 455],
  [1400, 470], [1450, 485], [1500, 498], [1550, 506], [1600, 500], [1650, 487], [1700, 472], [1750, 460],
  [1800, 438], [1830, 428], [1850, 424], [1900, 414], [1950, 404], [1977, 400],
];

// Thin partition walls of the lab and the two crew quarters (both faces).
const LAB_FLOOR_INNER = [[1036, 239], [1258, 251]];
const LAB_FLOOR_OUTER = [[1030, 249], [1258, 261]];
const NORTH_FLOOR_INNER = [[1267, 268], [1350, 273], [1400, 280], [1450, 290], [1500, 300], [1528, 304]];
const NORTH_FLOOR_OUTER = [[1262, 277], [1350, 283], [1400, 290], [1450, 300], [1500, 310], [1530, 316]];
const SOUTH_ROOF_OUTER = [[1260, 296], [1272, 298], [1350, 310], [1400, 318], [1450, 326], [1500, 333], [1535, 336]];
const SOUTH_ROOF_INNER = [[1270, 306], [1350, 320], [1400, 328], [1450, 335], [1500, 342], [1525, 344]];

// Corridor between service/storage (above) and the medbay (below).
const CORRIDOR_UPPER = [[225, 255], [300, 243], [445, 220], [613, 218]];
const CORRIDOR_LOWER = [[229, 278], [307, 273], [400, 258], [450, 249], [510, 241], [613, 240]];

// Open (dashed) ends of the tube: the outer airlock hatch and the reactor end.
const AIRLOCK_HATCH = [[73, 234], [80, 275], [88, 330], [93, 360], [98, 390]];
const REACTOR_END = [[1968, 228], [1975, 352]];

const SAMPLE_STEP = 8;

/** Smooth y(x) through control points sorted by x (cubic Hermite, Catmull-Rom tangents). */
export function edgeY(points, x) {
  const last = points.length - 1;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[last][0]) return points[last][1];
  let i = 0;
  while (i < last - 1 && points[i + 1][0] <= x) i += 1;
  const [x0, y0] = points[i];
  const [x1, y1] = points[i + 1];
  const slope = k => {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(last, k + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope(i)
    + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope(i + 1);
}

/** Points along an edge from x = from to x = to (either direction), ends included. */
export function sampleEdge(points, from, to, step = SAMPLE_STEP) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const xs = [lo];
  for (let x = Math.ceil((lo + 0.001) / step) * step; x < hi; x += step) xs.push(x);
  xs.push(hi);
  const out = xs.map(x => [x, edgeY(points, x)]);
  return from <= to ? out : out.reverse();
}

const whole = (points, reverse = false) => {
  const first = points[0][0];
  const last = points[points.length - 1][0];
  return reverse ? sampleEdge(points, last, first) : sampleEdge(points, first, last);
};

const fmt = n => String(Math.round(n * 10) / 10);

/** 'M x y L x y ...' through the points; closed with Z unless open. */
export function toPath(points, { closed = true } = {}) {
  const body = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ');
  return closed ? `${body} Z` : body;
}

const top = x => edgeY(TOP_INNER, x);
const bottom = x => edgeY(BOTTOM_INNER, x);

// --- Room interiors -------------------------------------------------------------------

const airlock1 = [
  ...sampleEdge(TOP_INNER, 73, 132),
  [142, 272], [145, 293],
  ...sampleEdge(BOTTOM_INNER, 157, 106),
  [93, 360], [88, 330], [80, 275],
];

const airlock2 = [
  ...sampleEdge(TOP_INNER, 142, 212),
  ...sampleEdge(BOTTOM_INNER, 243, 167),
  [155, 291], [151, 270],
];

const service = [
  ...sampleEdge(TOP_INNER, 212, 613),
  ...[...CORRIDOR_UPPER].reverse(),
];

const medbay = [
  ...CORRIDOR_LOWER,
  ...sampleEdge(BOTTOM_INNER, 624, 243),
];

const lab = [
  ...sampleEdge(TOP_INNER, 1036, 1258),
  ...[...LAB_FLOOR_INNER].reverse(),
];

const quartersNorth = [
  ...sampleEdge(TOP_INNER, 1267, 1528),
  ...whole(NORTH_FLOOR_INNER, true),
];

const quartersSouth = [
  ...whole(SOUTH_ROOF_INNER),
  ...sampleEdge(BOTTOM_INNER, 1524, 1264),
];

// The common tunnel: the big hall plus the passage between the two crew quarters.
const recreation = [
  ...sampleEdge(TOP_INNER, 632, 1026),
  [1026, 245], [1030, 249], [1258, 261], [1258, 272],
  ...whole(NORTH_FLOOR_OUTER),
  ...whole(SOUTH_ROOF_OUTER, true),
  ...sampleEdge(BOTTOM_INNER, 1255, 642),
  [632, 240], [632, 223],
];

// Technical zone and reactor meet in the middle of the bulkhead doorway (x = 1807).
const technical = [
  ...sampleEdge(TOP_INNER, 1538, 1784),
  [1784, 291], [1807, 291], [1807, 321], [1784, 321], [1784, 402],
  ...sampleEdge(BOTTOM_INNER, 1796, 1534),
  [1535, 336], [1530, 316], [1538, 312],
];

const reactor = [
  ...sampleEdge(TOP_INNER, 1830, 1965),
  ...REACTOR_END,
  ...whole(BOTTOM_INNER_REACTOR, true),
  [1830, 321], [1807, 321], [1807, 291], [1830, 291],
];

/** Closed outline of each room interior, keyed by room id (see layout.js). */
export const ROOM_PATHS = {
  airlock_1: toPath(airlock1),
  airlock_2: toPath(airlock2),
  service: toPath(service),
  medbay: toPath(medbay),
  recreation: toPath(recreation),
  lab: toPath(lab),
  quarters_north: toPath(quartersNorth),
  quarters_south: toPath(quartersSouth),
  technical: toPath(technical),
  reactor: toPath(reactor),
};

// --- Walls (hatched) ------------------------------------------------------------------
// One compound path per wall; room interiors enclosed by partitions are holes (evenodd).

const topWall = [
  ...whole(TOP_OUTER),
  ...sampleEdge(TOP_INNER, 1965, 1830),
  [1830, 291], [1784, 291],                       // reactor bulkhead, upper stub
  ...sampleEdge(TOP_INNER, 1784, 1538),
  [1538, 312],                                    // east wall of the north quarters
  ...whole(NORTH_FLOOR_OUTER, true),
  [1258, 272],
  ...[...LAB_FLOOR_OUTER].reverse(),
  [1026, 245],                                    // west wall of the lab
  ...sampleEdge(TOP_INNER, 1026, 632),
  [632, 223], [613, 223],                         // service / recreation stub
  ...sampleEdge(TOP_INNER, 613, 142),
  [151, 270], [142, 272],                         // airlock partition, upper part
  ...sampleEdge(TOP_INNER, 132, 68),
];

const bottomWall = [
  ...sampleEdge(BOTTOM_INNER, 106, 157),
  [145, 293], [155, 291],                         // airlock partition, lower part
  ...sampleEdge(BOTTOM_INNER, 167, 624),
  [613, 240], [632, 240],                         // medbay / recreation wall
  ...sampleEdge(BOTTOM_INNER, 642, 1255),
  ...whole(SOUTH_ROOF_OUTER),                     // south quarters
  ...sampleEdge(BOTTOM_INNER, 1534, 1796),
  [1784, 402], [1784, 321], [1830, 321],          // reactor bulkhead, lower stub
  ...whole(BOTTOM_INNER_REACTOR),
  ...whole(BOTTOM_OUTER, true),
];

/** Hatched wall shapes; draw with fill-rule="evenodd". */
export const WALL_PATHS = [
  [toPath(topWall), ROOM_PATHS.lab, ROOM_PATHS.quarters_north].join(' '),
  [toPath(bottomWall), ROOM_PATHS.quarters_south].join(' '),
];

// --- Line work that is not a room -----------------------------------------------------

/** Thick single-line wall between airlock 2 and the service / medbay side. */
export const INNER_WALL_PATH = toPath([[212, top(212)], [243, bottom(243)]], { closed: false });

/** Thin lines of the corridor between service / storage and the medbay. */
export const CORRIDOR_PATHS = [
  toPath(CORRIDOR_UPPER, { closed: false }),
  toPath(CORRIDOR_LOWER, { closed: false }),
];

/** Dashed open ends: the outer airlock hatch (west) and the reactor end (east). */
export const DASHED_PATHS = [
  toPath(AIRLOCK_HATCH, { closed: false }),
  toPath(REACTOR_END, { closed: false }),
];

/** Corner brackets of the drawing frame: [x, y, dx, dy] with arm length ARM. */
const ARM = 37;
const FRAME = { left: 14, right: 2034, top: 15, bottom: 585 };
export const FRAME_RECT = FRAME;
export const BRACKET_PATHS = [
  [FRAME.left, FRAME.top, 1, 1], [FRAME.right, FRAME.top, -1, 1],
  [FRAME.left, FRAME.bottom, 1, -1], [FRAME.right, FRAME.bottom, -1, -1],
].map(([x, y, dx, dy]) => `M${x + dx * ARM} ${y} L${x} ${y} L${x} ${y + dy * ARM}`);

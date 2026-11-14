import { GridRects } from '../pixel/grid.jsx';
import { getSprite } from '../pixel/index.js';
import { ECG_ROWS, dropletSprite } from './sprites.js';
import './art.css';

// Big pixel illustration of an organ (DESIGN.md §4.2): the organ sprite in natural colours,
// composed with small animated pixels that show what it does (urine drops falling from the
// kidneys, an ECG trace under the heart, sparks around the brain ...). One SVG on a 64 × 48
// pixel grid, so every part scales crisply. Animations stop with prefers-reduced-motion.

const W = 64;
const H = 48;

/** One sprite of src/pixel at (x, y) in grid pixels, `scale` grid pixels per sprite pixel. */
function Sprite({ name, x, y, scale = 1, className }) {
  const sprite = getSprite(name);
  if (!sprite) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={className}><GridRects rows={sprite.rows} pal={sprite.pal} /></g>
    </g>
  );
}

const Px = ({ x, y, w = 1, h = 1, fill, className, style }) => (
  <rect x={x} y={y} width={w} height={h} fill={fill} className={className} style={style} />
);

/** Four-point spark (plus shape) for the brain scene. */
const Spark = ({ x, y, delay, fill = '#ffe066' }) => (
  <g className="hero-blink" style={{ animationDelay: `${delay}s` }}>
    <Px x={x} y={y - 1} fill={fill} /><Px x={x - 1} y={y} w={3} fill={fill} /><Px x={x} y={y + 1} fill={fill} />
  </g>
);

function Droplets({ x, top, colour, count = 3 }) {
  const drop = dropletSprite(colour);
  return Array.from({ length: count }, (_, i) => (
    <g key={i} className="hero-fall" style={{ animationDelay: `${i * 0.55}s` }}>
      <g transform={`translate(${x + (i - 1) * 6} ${top}) scale(0.5)`}><GridRects rows={drop.rows} pal={drop.pal} /></g>
    </g>
  ));
}

const SCENES = {
  brain: () => (
    <>
      <Sprite name="brain" x={16} y={6} scale={2} className="hero-pulse" />
      <Spark x={12} y={10} delay={0} />
      <Spark x={52} y={8} delay={0.4} />
      <Spark x={10} y={34} delay={0.8} fill="#9ad8ff" />
      <Spark x={54} y={32} delay={1.2} fill="#9ad8ff" />
      <Spark x={32} y={4} delay={0.6} />
    </>
  ),
  eyes: () => (
    <>
      <Sprite name="eye" x={8} y={8} scale={2} />
      <Sprite name="eye_chart" x={44} y={14} scale={1} />
      <g className="hero-scan"><Px x={6} y={8} w={36} h={1} fill="#5ad1ff" /></g>
    </>
  ),
  heart: () => (
    <>
      <Sprite name="heart" x={16} y={0} scale={2} className="hero-beat" />
      <g transform="translate(8 34)">
        <GridRects rows={ECG_ROWS} pal={{ g: '#5cff8a' }} />
        <g className="hero-sweep"><Px x={0} y={0} w={4} h={12} fill="var(--panel)" /><Px x={4} y={0} w={1} h={12} fill="#c8ffd8" /></g>
      </g>
    </>
  ),
  lungs: () => (
    <>
      <Sprite name="lungs" x={16} y={6} scale={2} className="hero-breathe" />
      {[10, 50, 14, 54].map((x, i) => (
        <g key={x} className="hero-rise" style={{ animationDelay: `${i * 0.7}s` }}>
          <Px x={x} y={40} w={2} h={2} fill="#7cc8ff" />
        </g>
      ))}
    </>
  ),
  blood: () => (
    <>
      <Sprite name="blood" x={10} y={6} scale={2} className="hero-pulse" />
      <Sprite name="test_tube" x={44} y={22} scale={1} />
      <Droplets x={52} top={6} colour="#d0283c" count={2} />
    </>
  ),
  kidneys: () => (
    <>
      <Sprite name="kidneys" x={16} y={-4} scale={2} />
      <Sprite name="urine" x={24} y={32} scale={1} />
      <Droplets x={30} top={18} colour="#f2d43c" count={3} />
    </>
  ),
  gut: () => (
    <>
      <Sprite name="stomach" x={16} y={8} scale={2} />
      {[['#e05a3a', 0], ['#7bc043', 0.6], ['#f2c14e', 1.2]].map(([fill, delay]) => (
        <g key={fill} className="hero-fall-short" style={{ animationDelay: `${delay}s` }}>
          <Px x={30} y={0} w={3} h={3} fill={fill} />
        </g>
      ))}
    </>
  ),
  musculoskeletal: () => (
    <>
      <Sprite name="bone" x={4} y={8} scale={2} />
      <Sprite name="muscle" x={30} y={8} scale={2} />
      <g className="hero-lift"><Sprite name="dumbbell" x={46} y={30} scale={1} /></g>
    </>
  ),
  limbs: () => (
    <>
      <Sprite name="arm" x={4} y={8} scale={2} />
      <Sprite name="leg" x={30} y={8} scale={2} />
      <g className="hero-blink"><Px x={58} y={12} w={2} h={2} fill="#5cff8a" /></g>
      <g className="hero-blink" style={{ animationDelay: '0.7s' }}><Px x={58} y={30} w={2} h={2} fill="#5cff8a" /></g>
    </>
  ),
  exposure: () => (
    <>
      <Sprite name="radiation" x={4} y={8} scale={2} className="hero-spin" />
      <Sprite name="structure" x={44} y={16} scale={1} />
      {[0, 0.5, 1].map((delay, i) => (
        <g key={delay} className="hero-streak" style={{ animationDelay: `${delay}s` }}>
          <Px x={34} y={10 + i * 8} w={2} h={1} fill="#c6ff3a" />
        </g>
      ))}
    </>
  ),
};

/** <HeroArt organ size? />: animated pixel scene of an organ (decorative; the name is next to it). */
export function HeroArt({ organ, size = 128, className = '' }) {
  const Scene = SCENES[organ];
  if (!Scene) return null;
  return (
    <svg
      className={`hero-art ${className}`.trim()}
      data-hero={organ}
      width={size}
      height={(size * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <Scene />
    </svg>
  );
}

export default HeroArt;

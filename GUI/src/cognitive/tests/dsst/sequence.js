import { mulberry32, shuffle } from '../../engine/prng.js';

export const DSST_DURATION_S = 90;
export const SETS = ['A', 'B', 'C', 'D'];

// 9 own geometric shapes (drawn in symbols.jsx); a set maps digit d (1-9) to SHAPE_OF[set][d - 1].
// Sets A-D are different permutations of the shapes, so a learned key does not carry over.
export const SHAPE_OF = {
  A: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  B: [4, 7, 0, 5, 2, 8, 1, 6, 3],
  C: [8, 2, 6, 1, 7, 3, 5, 0, 4],
  D: [3, 6, 8, 0, 5, 1, 7, 4, 2],
};

export const shapeFor = (set, digit) => SHAPE_OF[set][digit - 1];
/** stimulus id as stored in the trial: set letter + digit, e.g. "A3". */
export const stimulusId = (set, digit) => `${set}${digit}`;

/** Endless stream of digits in blocks of 9 (each block a permutation), never the same twice in a row. */
export function createDsstStream(rng) {
  let queue = [];
  let last = null;
  const refill = () => {
    let block = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      if (candidate[0] !== last) { block = candidate; break; }
    }
    if (!block) { // deterministic fallback: rotate so the first digit differs
      block = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      if (block[0] === last) block = [...block.slice(1), block[0]];
    }
    queue = block;
  };
  return {
    next() {
      if (queue.length === 0) refill();
      last = queue.shift();
      return last;
    },
  };
}

export function dsstSequence(seed, blocks = 30) {
  const stream = createDsstStream(mulberry32(seed));
  return Array.from({ length: blocks * 9 }, () => stream.next());
}

/** Practice: every digit once (one permutation). */
export const dsstPractice = seed => shuffle(mulberry32(seed ^ 0x85ebca6b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);

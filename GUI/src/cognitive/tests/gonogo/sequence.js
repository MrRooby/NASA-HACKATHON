import { mulberry32, randInt, shuffle } from '../../engine/prng.js';

export const GONOGO_TOTAL = 120;
export const GONOGO_NOGO = 30;
export const GONOGO_QUARTER_NOGO = [8, 8, 7, 7];
export const MAX_NOGO_RUN = 2;
export const MAX_ATTEMPTS = 200;

export const itiDraw = rng => randInt(rng, 750, 1250);

// Check a block (array of booleans, true = NO-GO) given the NO-GO run carried in from before.
function blockOk(block, carryRun, forbidFirst) {
  let run = carryRun;
  for (let i = 0; i < block.length; i += 1) {
    if (block[i]) {
      if (i < forbidFirst) return false;
      run += 1;
      if (run > MAX_NOGO_RUN) return false;
    } else run = 0;
  }
  return true;
}

// Deterministic fallback: evenly spread NO-GO positions after the forbidden head.
function spread(size, k, forbidFirst) {
  const block = new Array(size).fill(false);
  const span = size - forbidFirst;
  for (let i = 0; i < k; i += 1) block[forbidFirst + Math.floor(((i + 0.5) * span) / k)] = true;
  return block;
}

function makeBlock(rng, size, k, carryRun, forbidFirst) {
  const base = [...new Array(k).fill(true), ...new Array(size - k).fill(false)];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const block = shuffle(rng, base);
    if (blockOk(block, carryRun, forbidFirst)) return block;
  }
  return spread(size, k, forbidFirst);
}

function tailRun(block, carry) {
  let run = 0;
  for (let i = block.length - 1; i >= 0 && block[i]; i -= 1) run += 1;
  return run === block.length ? carry + run : run;
}

/**
 * Main sequence: 4 quarters of 30 trials with 8/8/7/7 NO-GO (order shuffled per seed), first 3 trials
 * GO, never more than 2 NO-GO in a row (also across quarter borders).
 * Returns [{ stimulus: 'go'|'nogo', iti_ms }]. Bounded work, deterministic for a seed.
 */
export function goNoGoSequence(seed) {
  const rng = mulberry32(seed);
  const counts = shuffle(rng, GONOGO_QUARTER_NOGO);
  const size = GONOGO_TOTAL / 4;
  let carry = 0;
  const flags = [];
  counts.forEach((k, q) => {
    const block = makeBlock(rng, size, k, carry, q === 0 ? 3 : 0);
    carry = tailRun(block, carry);
    flags.push(...block);
  });
  return flags.map(f => ({ stimulus: f ? 'nogo' : 'go', iti_ms: itiDraw(rng) }));
}

/** Practice: 10 trials (3 NO-GO), same rules. */
export function goNoGoPractice(seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const block = makeBlock(rng, 10, 3, 0, 3);
  return block.map(f => ({ stimulus: f ? 'nogo' : 'go', iti_ms: itiDraw(rng) }));
}

/** Short demo sequence: `total` trials with `nogo` NO-GO (first 3 GO, never more than 2 NO-GO in a row). */
export function goNoGoShort(seed, total = 30, nogo = 8) {
  const rng = mulberry32(seed);
  const block = makeBlock(rng, total, nogo, 0, 3);
  return block.map(f => ({ stimulus: f ? 'nogo' : 'go', iti_ms: itiDraw(rng) }));
}

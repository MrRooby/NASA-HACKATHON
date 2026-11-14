// Deterministic randomness: the same subject/test/set/session always yields the same sequence.

/** FNV-1a 32 bit over the UTF-8 bytes of `str`. */
export function fnv1a32(str) {
  const bytes = new TextEncoder().encode(String(str));
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const seedFrom = (subject, test, set, sessionNo) => fnv1a32(`${subject}|${test}|${set}|${sessionNo}`);

/** mulberry32: returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [lo, hi] inclusive. */
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/** Fisher-Yates, returns a new array. */
export function shuffle(rng, items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const STIMULUS_SETS = 'ABCD';
export const stimulusSetFor = sessionNo => STIMULUS_SETS[(((sessionNo || 1) - 1) % 4 + 4) % 4];

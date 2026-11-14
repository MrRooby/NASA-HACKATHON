import { mulberry32, randInt } from '../../engine/prng.js';

export const PVT_ISI_MIN_MS = 1000;
export const PVT_ISI_MAX_MS = 4000;

/**
 * One inter-stimulus interval, uniform 1000-4000 ms in 1 ms steps, measured from the previous response.
 * It INCLUDES the 1000 ms RT feedback (Basner, Mollicone & Dinges 2011, PVT-B), so the blank wait after the feedback
 * is 0-3000 ms. The first trial of a run has no feedback and waits the whole ISI.
 */
export const drawIsi = rng => randInt(rng, PVT_ISI_MIN_MS, PVT_ISI_MAX_MS);

/** The first n ISIs for a seed (used by tests; the task draws from the same stream). */
export function isiSequence(seed, n) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => drawIsi(rng));
}

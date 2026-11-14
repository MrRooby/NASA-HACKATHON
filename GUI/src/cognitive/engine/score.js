import { scorePvt } from '../tests/pvt/scoring.js';
import { scoreGonogo } from '../tests/gonogo/scoring.js';
import { scoreDsst } from '../tests/dsst/scoring.js';

/** Same dispatch as cognitive_scoring.score(test_id, trials, duration_s). */
export function score(testId, trials, durationS = null) {
  if (testId === 'pvt') return scorePvt(trials);
  if (testId === 'gonogo') return scoreGonogo(trials);
  if (testId === 'dsst') return scoreDsst(trials, durationS == null ? 90.0 : durationS);
  throw new Error(`unknown test_id ${JSON.stringify(testId)}`);
}

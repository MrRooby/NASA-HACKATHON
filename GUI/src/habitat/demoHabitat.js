// Built-in habitat data used when MOTHER is unreachable: a recorded /api/habitat
// response (sol 142, CO2 scrubber fault in module_M1) from the team's synthetic
// dataset. Marked `demo: true` so the UI can label it.
import recorded from './demo/habitat_demo.json';

export const DEMO_SOL = recorded.as_of.sol;

/** Demo habitat. The recorded sol is always returned, whatever sol was asked for. */
export function getDemoHabitat() {
  return { ...recorded, demo: true };
}

export default getDemoHabitat;

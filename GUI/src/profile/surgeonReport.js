import { buildSurgeonReport } from '../checkin/thresholdLogic.js';
import { MISSION } from '../data/crewProfiles.js';

/**
 * Report for the flight surgeon, built from the profile screen:
 * the legacy check-in report (indicators with status / message / action / escalation, and the
 * MOTHER organ summary when MOTHER is online) plus who sent it and on which sol.
 * The MOTHER summary is attached only when the loaded organ report belongs to that person.
 */
export function buildProfileReport({ profile, biometrics, mother, sol = null, symptoms = null, createdAt = new Date() }) {
  const ownReport = mother?.online && mother.report?.subject?.code === profile.code;
  return {
    ...buildSurgeonReport({
      biometrics,
      mission: MISSION.habitatCode,
      flightDay: sol,
      mother: ownReport ? mother : null,
      createdAt,
    }),
    sol,
    crew: { code: profile.code, name: profile.name, role: profile.role?.en ?? null, fictional: profile.fictional === true },
    ...(symptoms ? { symptoms } : {}),
  };
}

// Roster of the CREW screen: the habitat crew of src/data/crewProfiles.js (ten FICTIONAL members).
import { CREW_PROFILES, getProfile } from '../data/crewProfiles.js';

export const ROSTER = CREW_PROFILES;

/** rosterProfile('HAB-C5') -> profile, or null. */
export const rosterProfile = getProfile;

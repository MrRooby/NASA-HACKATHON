// Pure helpers shared by the Crew and Profile screens: who is where, and how they are,
// read from the MOTHER responses the app already has (useMother + useHabitat).

/** The ten organ cards of MOTHER, in display order, with their three-letter codes. */
export const ORGANS = [
  { organ: 'brain', code: 'BRN' },
  { organ: 'eyes', code: 'EYE' },
  { organ: 'heart', code: 'HRT' },
  { organ: 'lungs', code: 'LNG' },
  { organ: 'blood', code: 'BLD' },
  { organ: 'kidneys', code: 'KID' },
  { organ: 'gut', code: 'GUT' },
  { organ: 'musculoskeletal', code: 'MSK' },
  { organ: 'limbs', code: 'LMB' },
  { organ: 'exposure', code: 'EXP' },
];

/** Two-character status shown under each organ code. */
export const ORGAN_STATUS_CODES = { ok: 'OK', caution: 'CA', alert: 'AL', no_data: '--' };

const KNOWN = ['ok', 'caution', 'alert', 'no_data'];
const known = status => (KNOWN.includes(status) ? status : 'no_data');

/** { en, pl } -> text for the language (English when the translation is missing). */
export const localized = (value, lang) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang] ?? value.en ?? '';
};

/** Entry of GET /api/organs for a subject code, or null. */
export function overviewEntry(overview, code) {
  if (!Array.isArray(overview) || !code) return null;
  return overview.find(entry => entry?.subject?.code === code) || null;
}

/**
 * Health summary of one crew member:
 *   { status, message, organs: { brain: 'ok', ... }, sol, synthetic, demo, source: 'report' | 'overview' | 'none' }
 * `report` (GET /api/organs/{code}) is used only when it belongs to that person; otherwise
 * the crew overview; with neither (still loading) everything is 'no_data'. `demo` is true for
 * the built-in demo records (src/data/demoReports.js) shown while MOTHER is unreachable.
 */
export function crewHealth({ code, report = null, overview = null }) {
  if (report && report.subject?.code === code) {
    return {
      status: known(report.overall_status),
      message: report.top_message ?? null,
      organs: Object.fromEntries((report.organs || []).map(card => [card.organ, known(card.status)])),
      sol: report.as_of?.sol ?? null,
      synthetic: report.subject?.data_kind === 'synthetic',
      demo: report.demo === true,
      source: 'report',
    };
  }
  const entry = overviewEntry(overview, code);
  if (entry) {
    return {
      status: known(entry.overall_status),
      message: entry.top_message ?? null,
      organs: Object.fromEntries(Object.entries(entry.organs || {}).map(([organ, status]) => [organ, known(status)])),
      sol: null,
      synthetic: entry.subject?.synthetic === true || entry.subject?.data_kind === 'synthetic',
      demo: entry.demo === true,
      source: 'overview',
    };
  }
  return { status: 'no_data', message: null, organs: {}, sol: null, synthetic: false, demo: false, source: 'none' };
}

/** Zone of GET /api/habitat a crew member ('C1') is in right now, or null when unknown. */
export function findLocation(habitat, crewCode) {
  if (!crewCode || !Array.isArray(habitat?.zones)) return null;
  return habitat.zones.find(zone => Array.isArray(zone?.occupants) && zone.occupants.includes(crewCode)) || null;
}

/** 'Habitation module M1 (C1, C2)' -> 'Habitation module M1': the crew list is shown elsewhere. */
const withoutCrewList = label => String(label).replace(/\s*\((?:C\d+(?:,\s*)?)+\)\s*$/, '');

/** Display name of a zone code: the habitat label when known, else the code ('module_M1' -> 'MODULE M1'). */
export function zoneName(habitat, zoneCode) {
  if (!zoneCode) return null;
  const zone = habitat?.zones?.find(candidate => candidate?.code === zoneCode);
  if (zone?.label) return withoutCrewList(zone.label);
  return String(zoneCode).replace(/_/g, ' ').toUpperCase();
}

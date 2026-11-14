// Single data-access layer for crew data the habitat database does not hold yet:
// notes / diary, psychological tests and the flight-surgeon report queue.
//
// Every function is async and returns a stable shape, so a screen written against this
// file keeps working when the body is replaced by a call to MOTHER (see GUI/TODO.md for
// the proposed tables and endpoints). Until then:
//   - notes and psychological test results: empty lists with `connected: false`;
//     writes REJECT with a NOT_CONNECTED error. Diary text is never stored anywhere
//     (not in localStorage, not in memory): it is personal data without a home yet.
//   - flight-surgeon report: kept in localStorage under `orbit-health-report`
//     (the behaviour of the previous GUI): the latest queued report, not sent anywhere.

export const NOT_CONNECTED = 'NOT_CONNECTED';
export const STORAGE_UNAVAILABLE = 'STORAGE_UNAVAILABLE';
export const SURGEON_REPORT_KEY = 'orbit-health-report';

/** Planned backend routes (not implemented in MOTHER yet). */
export const PLANNED_ENDPOINTS = {
  notes: 'GET|POST /api/crew/{code}/notes',
  psychTests: 'GET /api/psych/tests',
  psychResults: 'GET|POST /api/crew/{code}/psych/results',
  surgeonReports: 'GET|POST /api/crew/{code}/surgeon-reports',
};

export class CrewStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CrewStoreError';
    this.code = code;
  }
}

const notConnected = what =>
  Promise.reject(new CrewStoreError(NOT_CONNECTED, `${what} is not connected to the base database yet.`));

const disconnectedList = (endpoint, items = []) => ({ items, connected: false, source: 'none', endpoint });

// ── Notes / diary ───────────────────────────────────────────────────────────

/**
 * listNotes('HAB-C1') -> { items: Note[], connected, source, endpoint }
 * Note (planned, table crew_note): { id, crewCode, sol, createdUtc, text, visibility }
 */
export async function listNotes(crewCode) {
  void crewCode;
  return disconnectedList(PLANNED_ENDPOINTS.notes);
}

/** addNote('HAB-C1', { text, sol }) -> Note. Rejects with NOT_CONNECTED until the backend exists. */
export async function addNote(crewCode, note) {
  void crewCode;
  void note;
  return notConnected('Notes / diary');
}

// ── Psychological tests ─────────────────────────────────────────────────────

// Static catalogue of the instruments the screen lists. They mirror what isolation
// analogs (Mars-500, HERA, Antarctic stations) and NASA behavioural-health monitoring
// use. Cadence and duration are TEAM ASSUMPTIONS for the demo (basis: 'team_assumption'),
// not a NASA protocol. No questionnaire items are bundled: several of these instruments
// are licensed, so the content has to come from the database / the medical team.
/** The cognitive battery that already runs on the TESTS screen (not a questionnaire, not part of the planned tables). */
export const COGNITIVE_BATTERY = { id: 'cognitive_battery', runner: 'cognitive', tests: ['pvt', 'gonogo', 'dsst'], available: true };

export const PSYCH_TEST_CATALOG = [
  {
    id: 'mood_state',
    name: { en: 'Mood state questionnaire (POMS-style)', pl: 'Kwestionariusz stanu nastroju (typu POMS)' },
    purpose: {
      en: 'Tracks tension, depressed mood, anger, vigour, fatigue and confusion to catch a slow drift during isolation.',
      pl: 'Śledzi napięcie, obniżony nastrój, gniew, wigor, zmęczenie i dezorientację, żeby wychwycić powolne pogarszanie się nastroju w izolacji.',
    },
    cadence: { everySols: 7, label: { en: 'Weekly', pl: 'Co tydzień' } },
    durationMin: 5,
    reference: 'Profile of Mood States (McNair, Lorr & Droppleman, 1971); short form used weekly in Mars-500 (Basner et al., 2014)',
    basis: 'team_assumption',
    available: false,
  },
  {
    id: 'symptom_checklist',
    name: { en: 'Symptom checklist (SCL-90-style)', pl: 'Lista objawów (typu SCL-90)' },
    purpose: {
      en: 'Broad screen of psychological symptoms (anxiety, depression, somatic complaints, irritability) for the flight surgeon.',
      pl: 'Szeroki przesiew objawów psychicznych (lęk, depresja, dolegliwości somatyczne, drażliwość) dla lekarza misji.',
    },
    cadence: { everySols: 30, label: { en: 'Every 30 sols', pl: 'Co 30 soli' } },
    durationMin: 15,
    reference: 'Symptom Checklist-90-Revised (Derogatis, 1994)',
    basis: 'team_assumption',
    available: false,
  },
  {
    id: 'pvt',
    name: { en: 'Psychomotor vigilance test (PVT, reaction time)', pl: 'Test czujności psychomotorycznej (PVT, czas reakcji)' },
    purpose: {
      en: 'Objective reaction-time test: slower responses and lapses show fatigue and sleep loss before the person feels it.',
      pl: 'Obiektywny test czasu reakcji: wolniejsze odpowiedzi i przeoczenia pokazują zmęczenie i niedobór snu, zanim człowiek je poczuje.',
    },
    cadence: { everySols: 7, label: { en: 'Weekly', pl: 'Co tydzień' } },
    durationMin: 3,
    reference: '3-minute PVT-B (Basner, Mollicone & Dinges, 2011); Reaction Self-Test on the ISS; part of the NASA Cognition battery (Basner et al., 2015)',
    basis: 'team_assumption',
    // Real: runs on the TESTS screen (src/cognitive, backend /api/cognitive/*), together with Go/No-Go and DSST.
    available: true,
    runner: 'cognitive',
  },
  {
    id: 'sleep_quality',
    name: { en: 'Sleep quality questionnaire', pl: 'Kwestionariusz jakości snu' },
    purpose: {
      en: 'Subjective sleep quality, time to fall asleep and daytime sleepiness, to compare with the wearable sleep data.',
      pl: 'Subiektywna jakość snu, czas zasypiania i senność w ciągu dnia, do porównania z danymi snu z urządzeń noszonych.',
    },
    cadence: { everySols: 30, label: { en: 'Every 30 sols', pl: 'Co 30 soli' } },
    durationMin: 5,
    reference: 'Pittsburgh Sleep Quality Index (Buysse et al., 1989); sleep logs alongside actigraphy on ISS missions',
    basis: 'team_assumption',
    available: false,
  },
  {
    id: 'team_cohesion',
    name: { en: 'Team cohesion / conflict survey', pl: 'Ankieta spójności zespołu i konfliktów' },
    purpose: {
      en: 'How the crew works together: cohesion, conflicts with crewmates and with Mission Control, perceived support.',
      pl: 'Jak załoga współpracuje: spójność, konflikty w załodze i z kontrolą misji, odczuwane wsparcie.',
    },
    cadence: { everySols: 7, label: { en: 'Weekly', pl: 'Co tydzień' } },
    durationMin: 5,
    reference: 'Weekly conflict questionnaire in Mars-500 (Basner et al., 2014); group-dynamics questionnaires in isolation analogs',
    basis: 'team_assumption',
    available: false,
  },
];

/** listPsychTests() -> { items: PSYCH_TEST_CATALOG, connected: false, source: 'static-catalog', endpoint } */
export async function listPsychTests() {
  return { ...disconnectedList(PLANNED_ENDPOINTS.psychTests, PSYCH_TEST_CATALOG), source: 'static-catalog' };
}

/**
 * listPsychResults('HAB-C1') -> { items: Result[], connected, source, endpoint }
 * Result (planned, table psych_test_result): { id, testId, crewCode, sol, createdUtc, score, subscales, status }
 */
export async function listPsychResults(crewCode) {
  void crewCode;
  return disconnectedList(PLANNED_ENDPOINTS.psychResults);
}

/** submitPsychResult('HAB-C1', 'pvt', { sol, answers }) -> Result. Rejects with NOT_CONNECTED for now. */
export async function submitPsychResult(crewCode, testId, payload) {
  void crewCode;
  void testId;
  void payload;
  return notConnected('Psychological tests');
}

// ── Flight-surgeon report queue ─────────────────────────────────────────────

function readStoredReport() {
  try {
    const raw = window.localStorage.getItem(SURGEON_REPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * queueSurgeonReport('HAB-C1', report) -> { report, queuedAt, transport: 'localStorage', connected: false }
 * Stores the report (stamped with crewCode and createdAt) under `orbit-health-report`. Only
 * the latest report is kept, and nothing is transmitted: the delayed link to Earth is a TODO.
 */
export async function queueSurgeonReport(crewCode, report) {
  if (!crewCode) throw new CrewStoreError('INVALID', 'queueSurgeonReport needs a crew code.');
  const stored = {
    ...report,
    crewCode,
    createdAt: report?.createdAt || new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(SURGEON_REPORT_KEY, JSON.stringify(stored));
  } catch (error) {
    throw new CrewStoreError(STORAGE_UNAVAILABLE, `The report could not be saved locally: ${error?.message || 'storage unavailable'}`);
  }
  return { report: stored, queuedAt: stored.createdAt, transport: 'localStorage', connected: false };
}

/**
 * listSurgeonReports('HAB-C1') -> { items: Report[], connected: false, source: 'localStorage', endpoint }
 * Reports queued by that person (at most one for now). Without a crew code: whatever is stored.
 */
export async function listSurgeonReports(crewCode) {
  const stored = readStoredReport();
  const items = stored && (!crewCode || stored.crewCode === crewCode) ? [stored] : [];
  return { ...disconnectedList(PLANNED_ENDPOINTS.surgeonReports, items), source: 'localStorage' };
}

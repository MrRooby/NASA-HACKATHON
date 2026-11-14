import thresholdConfig from '../../../config/thresholds.json';

// Rules engine of the daily check-in: value -> band of config/thresholds.json -> status,
// message, action, escalation. Moved here unchanged from the first version of main.jsx so
// the screens can reuse it. All thresholds are demonstrational (see config/sources.json).

export { thresholdConfig };

/** Demo readings of the logged-in crew member (deterministic; shown as SIMULATED). */
export const initialBiometrics = [
  { id: 'sbp', label: 'Blood pressure', full: 'Systolic blood pressure', configId: 'bp_systolic', value: 128, unit: 'mmHg', delta: +6, trend: [118,121,119,124,122,128] },
  { id: 'dbp', label: 'Diastolic pressure', full: 'Diastolic blood pressure', configId: 'bp_diastolic', value: 82, unit: 'mmHg', delta: +2, trend: [78,80,79,81,80,82] },
  { id: 'hr', label: 'Heart rate', full: 'Resting heart rate', configId: 'heart_rate_resting', value: 68, unit: 'bpm', delta: -1, trend: [70,68,71,69,67,68] },
  { id: 'glucose', label: 'Glucose', full: 'Fasting blood glucose', configId: 'glucose_fasting', value: 92, unit: 'mg/dL', delta: +2, trend: [88,90,89,93,90,92] },
  { id: 'temperature', label: 'Temperature', full: 'Body temperature (oral)', configId: 'body_temperature', value: 36.8, unit: '°C', delta: 0.1, trend: [36.6,36.7,36.7,36.8,36.7,36.8] },
  { id: 'sleep', label: 'Sleep', full: 'Sleep duration', configId: 'sleep_hours', value: 6.2, unit: 'h', delta: -0.6, trend: [7.4,6.8,6.5,6.1,5.9,6.2] },
  { id: 'mood', label: 'Mood', full: 'Mood self-rating', configId: 'mood', value: 4, unit: '/5', delta: 0, trend: [4,4,3,4,4,4] },
  { id: 'rad', label: 'Radiation', full: 'Cumulative career effective dose', configId: 'radiation_career_mSv', value: 252, unit: 'mSv', delta: +1, trend: [239,242,244,247,250,252] },
];

export const thresholdById = Object.fromEntries(thresholdConfig.indicators.map(indicator => [indicator.id, indicator]));

/**
 * evaluateValue('bp_systolic', 128) -> the matching band of the config
 * ({ status, message, action, escalate, basis, min, max, ... }). Band upper bounds are exclusive.
 * Unknown indicator or empty value -> ok; a value outside every band -> caution.
 */
export function evaluateValue(configId, value) {
  const indicator = thresholdById[configId];
  if (!indicator || value === '' || value == null) return { status: 'ok', message: '', action: '' };
  const numericValue = Number(value);
  const band = indicator.bands?.find(candidate =>
    (candidate.min == null || numericValue >= candidate.min) &&
    (candidate.max == null || numericValue < candidate.max)
  );
  return band || { status: 'caution', message: 'Outside configured range.', action: 'Re-measure and review with the flight surgeon.' };
}

/** Adds status / message / action / ref range / escalation / spaceflight context and a 30-point trend. */
export function enrichBiometric(biometric) {
  const assessment = evaluateValue(biometric.configId, biometric.value);
  const indicator = thresholdById[biometric.configId];
  const trend = biometric.trend.length >= 30
    ? biometric.trend
    : Array.from({ length: 30 }, (_, index) => {
      const sourceIndex = Math.floor(index * (biometric.trend.length - 1) / 29);
      const wave = ((index * 17 + biometric.id.length) % 5 - 2) * 0.08;
      return Number((biometric.trend[sourceIndex] + wave).toFixed(2));
    });
  return {
    ...biometric,
    trend,
    status: assessment.status,
    message: assessment.message,
    action: assessment.action,
    ref: indicator?.bands?.find(band => band.status === 'ok')?.min != null
      ? `${indicator.bands.find(band => band.status === 'ok').min}–${indicator.bands.find(band => band.status === 'ok').max ?? '∞'}`
      : 'See guidance',
    escalate: assessment.escalate === true,
    basis: assessment.basis,
    context: indicator?.spaceflight_context,
  };
}

/** Initial state of the check-in: the demo readings, assessed. */
export const createBiometrics = () => initialBiometrics.map(enrichBiometric);

/** New list with one reading replaced by `value` (string or number; '' = cleared) and re-assessed. */
export function updateBiometric(biometrics, id, value) {
  return biometrics.map(biometric => (biometric.id === id
    ? enrichBiometric({ ...biometric, value: value === '' ? '' : Number(value) })
    : biometric));
}

export const systemProtocols = [
  { id: 'CVS', label: 'CARDIOVASCULAR',  status: 'caution', note: 'SBP +6 mmHg above personal baseline. Recheck required.' },
  { id: 'SLP', label: 'SLEEP/RECOVERY', status: 'caution', note: 'Sleep avg below 8 h target × 3 consecutive days.' },
  { id: 'PSY', label: 'BEHAVIORAL',     status: 'ok',      note: 'Self-assessment scores within nominal range.' },
  { id: 'RAD', label: 'RADIATION',      status: 'ok',      note: 'Career dose at 42 % TLD. ALARA compliance active.' },
  { id: 'GI',  label: 'GI / NUTRITION', status: 'ok',      note: 'No symptoms logged. Caloric target met.' },
];

/** Worst status of the given readings. */
export function protocolStatus(biometrics, ids) {
  const statuses = biometrics.filter(item => ids.includes(item.id)).map(item => item.status);
  if (statuses.includes('alert')) return 'alert';
  if (statuses.includes('caution')) return 'caution';
  return 'ok';
}

/** Body-system rows (cardiovascular, sleep, behavioural, radiation, GI) with the current statuses. */
export function buildProtocols(biometrics) {
  const statuses = {
    CVS: protocolStatus(biometrics, ['sbp', 'dbp', 'hr']),
    SLP: protocolStatus(biometrics, ['sleep']),
    PSY: protocolStatus(biometrics, ['mood']),
    RAD: protocolStatus(biometrics, ['rad']),
    GI: protocolStatus(biometrics, ['glucose']),
  };
  return systemProtocols.map(protocol => ({ ...protocol, status: statuses[protocol.id] }));
}

/** The five HRP spaceflight hazards (education / guidance view). */
export const hazards = [
  { id: 'RAD', name: 'RADIATION',               ref: 'NASA-STD-3001 §6.1' },
  { id: 'ISL', name: 'ISOLATION & CONFINEMENT', ref: 'NASA-STD-3001 §6.6' },
  { id: 'DST', name: 'DISTANCE FROM EARTH',     ref: 'NASA-STD-3001 §6.4' },
  { id: 'GRV', name: 'ALTERED GRAVITY',         ref: 'NASA-STD-3001 §6.2' },
  { id: 'ENV', name: 'CLOSED ENVIRONMENT',      ref: 'NASA-STD-3001 §6.5' },
];

export const REPORT_STORAGE_KEY = 'orbit-health-report';

/**
 * Asynchronous summary for the flight surgeon on Earth.
 * `mother` is the useMother() state; when it is online its organ report is attached.
 */
export function buildSurgeonReport({ biometrics, mission, flightDay = 142, mother, createdAt = new Date() }) {
  const report = {
    createdAt: createdAt.toISOString(),
    mission,
    flightDay,
    indicators: biometrics.map(({ id, value, status, message, action, escalate }) => ({
      id, value, status, message, action, escalate,
    })),
    disclaimer: 'Demonstration data only. Not for clinical use.',
  };
  if (mother?.online && mother.report) {
    const { subject, as_of, overall_status, top_message, organs, devices } = mother.report;
    report.mother = {
      subject: subject?.code,
      data_kind: subject?.data_kind,
      as_of,
      overall_status,
      top_message,
      organs: (organs || []).map(({ organ, status, headline, action }) => ({ organ, status, headline, action })),
      devices: (devices || []).filter(device => device.status !== 'ok'),
    };
  }
  return report;
}

/** Store the report locally until the next transmission window; returns false when storage fails. */
export function queueSurgeonReport(report) {
  try {
    window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(report));
    return true;
  } catch {
    return false;
  }
}

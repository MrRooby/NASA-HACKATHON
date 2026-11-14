// Three crew-tile vitals (heart rate, SpO2, sleep) read from one MOTHER organ report
// (GET /api/organs/{code}, contract 1.1). Missing values are null; never throws.

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const cardOf = (report, organ) => (report?.organs || []).find(card => card?.organ === organ) || null;
const checksOf = card => (Array.isArray(card?.checks) ? card.checks : []);
const metricsOf = card => (Array.isArray(card?.metrics) ? card.metrics : []);

const median = values => {
  const list = values.filter(value => value != null).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};

/**
 * crewVitals(report) -> { hr: { value, status }, spo2: { value, status }, sleep: { value, status } }
 *   hr    bpm: heart check inputs.hr (shock index), else the median limb-band HR (limbs checks);
 *         no own threshold in the report -> status null
 *   spo2  %:   lungs check 'spo2' (or a lungs metric naming SpO2), else the median limb-band SpO2
 *   sleep h:   brain check 'sleep_eeg' inputs.hours; status of that check
 */
export function crewVitals(report) {
  const heart = cardOf(report, 'heart');
  const lungs = cardOf(report, 'lungs');
  const brain = cardOf(report, 'brain');
  const limbs = cardOf(report, 'limbs');
  const limbInputs = checksOf(limbs).filter(check => /^perfusion_/.test(check?.code || '')).map(check => check?.inputs?.limb || {});

  const hrCheck = checksOf(heart).find(check => num(check?.inputs?.hr) != null);
  const hr = num(hrCheck?.inputs?.hr) ?? median(limbInputs.map(input => num(input.hr)));

  const spo2Check = checksOf(lungs).find(check => check?.code === 'spo2')
    || metricsOf(lungs).find(metric => /spo2/i.test(metric?.name || ''));
  const spo2 = num(spo2Check?.value) ?? median(limbInputs.map(input => num(input.spo2)));

  const sleepCheck = checksOf(brain).find(check => check?.code === 'sleep_eeg' || num(check?.inputs?.hours) != null);
  const sleep = num(sleepCheck?.inputs?.hours);

  return {
    hr: { value: hr == null ? null : Math.round(hr), status: null },
    spo2: { value: spo2 == null ? null : Math.round(spo2 * 10) / 10, status: spo2Check?.status ?? null },
    sleep: { value: sleep == null ? null : Math.round(sleep * 10) / 10, status: sleepCheck?.status ?? null },
  };
}

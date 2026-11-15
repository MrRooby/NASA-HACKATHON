// Basic health readout for the home screen: a handful of numbers, averaged over the
// wearable bands where there are several sensors, instead of every sensor on its own.
import { evaluateValue } from '../checkin/thresholdLogic.js';
import { limbsCard } from './limbData.js';

const LIMBS = ['left_arm', 'right_arm', 'left_leg', 'right_leg'];

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const mean = values => {
  const list = values.filter(value => value != null);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
};
const round = (value, digits = 0) => (value == null ? null : Number(value.toFixed(digits)));

function findCheck(report, organ, code) {
  const card = (report?.organs || []).find(item => item?.organ === organ);
  return (card?.checks || []).find(item => item?.code === code) || null;
}

/**
 * vitalsFromReport(report) -> [{ id, value, unit, status, note?, noteParams? }] in display order:
 *   hr          mean heart rate of the limb bands (status from config/thresholds.json, resting HR)
 *   spo2        blood oxygen (lungs card; else the mean of the bands)
 *   map         mean arterial pressure (heart card)
 *   glucose     blood glucose (gut card)
 *   sleep       sleep efficiency (brain card, EEG headband)
 *   dose        career radiation dose (exposure card)
 * Missing data gives value null and status 'no_data'; a null report gives all rows empty.
 * Limb circulation is not a row: a cold limb shows up as a notification (limbs card).
 */
export function vitalsFromReport(report) {
  const card = limbsCard(report);
  const checks = Array.isArray(card?.checks) ? card.checks : [];
  const bands = LIMBS.map(limb => checks.find(item => item?.code === `perfusion_${limb}`)).filter(Boolean);
  const inputs = bands.map(check => check.inputs?.limb || {});

  const rows = [];

  const hr = round(mean(inputs.map(item => num(item.hr))));
  rows.push({ id: 'hr', value: hr, unit: 'bpm', status: hr == null ? 'no_data' : evaluateValue('heart_rate_resting', hr).status, note: hr == null ? null : 'home.vitalAvgBands', noteParams: { n: inputs.filter(item => num(item.hr) != null).length } });

  const spo2Check = findCheck(report, 'lungs', 'spo2');
  const spo2Bands = round(mean(inputs.map(item => num(item.spo2))), 1);
  const spo2 = num(spo2Check?.value) != null ? round(spo2Check.value, 1) : spo2Bands;
  rows.push({ id: 'spo2', value: spo2, unit: '%', status: spo2 == null ? 'no_data' : spo2Check?.status ?? evaluateValue('spo2', spo2).status });

  const map = findCheck(report, 'heart', 'map');
  rows.push({ id: 'map', value: round(num(map?.value)), unit: 'mmHg', status: map?.status ?? 'no_data' });

  const glucose = findCheck(report, 'gut', 'glucose');
  rows.push({ id: 'glucose', value: round(num(glucose?.value)), unit: 'mg/dL', status: glucose?.status ?? 'no_data' });

  const sleep = findCheck(report, 'brain', 'sleep_eeg');
  rows.push({ id: 'sleep', value: round(num(sleep?.value)), unit: '%', status: sleep?.status ?? 'no_data' });

  const dose = findCheck(report, 'exposure', 'dose_career');
  const doseValue = num(dose?.value);
  // Three digits are enough for a narrow column: 67.8 mSv, but 123 mSv.
  rows.push({ id: 'dose', value: round(doseValue, doseValue != null && doseValue >= 100 ? 0 : 1), unit: 'mSv', status: dose?.status ?? 'no_data' });

  return rows;
}

export default vitalsFromReport;

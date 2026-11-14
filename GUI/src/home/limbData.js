// Per-limb wearable data for the home screen, derived from one MOTHER organ report
// (GET /api/organs/{code}, contract 1.1): the `limbs` organ card and `devices[]`.
//
// Limb names are the astronaut's own (anatomical) left / right, as in MOTHER.
import { limbSegmentStatus, limbsInText } from '../organSegments.js';

export const LIMB_KEYS = ['left_arm', 'right_arm', 'left_leg', 'right_leg'];
export const HEAD_DEVICE = 'head_eeg';

const toNumber = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const deviceInfo = device => (device
  ? {
    state: device.state ?? null,
    battery_pct: toNumber(device.battery_pct),
    status: device.status ?? 'no_data',
    message: device.message ?? null,
  }
  : null);

const findDevice = (devices, limb) => (Array.isArray(devices) ? devices.find(device => device?.limb === limb) : null) || null;

/** The `limbs` organ card of a report, or null. */
export function limbsCard(report) {
  return (report?.organs || []).find(card => card?.organ === 'limbs') || null;
}

/**
 * limbsFromReport(report) -> { limbs: [left_arm, right_arm, left_leg, right_leg], headEeg }
 *
 * limbs[i] = {
 *   limb, status ('ok' | 'caution' | 'alert' | 'no_data'),
 *   circulationPct (perfusion as % of the other limbs), hr (bpm), spo2 (%),
 *   perfusionIndex, skinTemp (°C), message, action,
 *   device: { state, battery_pct, status, message } | null,
 * }
 * headEeg = { state, battery_pct, status, message } | null   (devices[].limb === 'head_eeg')
 *
 * Source per limb, best first:
 *   1. checks[] entry `perfusion_<limb>` of the limbs card (value, status, message, action, inputs.limb);
 *   2. a limbs-card metric that names the limb ("Circulation: left leg") -> value + status;
 *   3. limbSegmentStatus() (headline / devices), else the card status; 'no_data' without a card.
 * Missing numbers are null; nothing here throws on a null or partial report.
 */
export function limbsFromReport(report) {
  const card = limbsCard(report);
  const devices = report?.devices;
  const checks = Array.isArray(card?.checks) ? card.checks : [];
  const metrics = Array.isArray(card?.metrics) ? card.metrics : [];
  const derived = card ? limbSegmentStatus(card, devices) : null;

  const limbs = LIMB_KEYS.map(limb => {
    const check = checks.find(item => item?.code === `perfusion_${limb}`) || null;
    const metric = metrics.find(item => limbsInText(item?.name).includes(limb)) || null;
    const status = check?.status ?? metric?.status ?? derived?.[limb] ?? 'no_data';
    const problem = status === 'caution' || status === 'alert';
    const inputs = check?.inputs?.limb || {};
    return {
      limb,
      status,
      circulationPct: toNumber(check?.value) ?? toNumber(metric?.value),
      hr: toNumber(inputs.hr),
      spo2: toNumber(inputs.spo2),
      perfusionIndex: toNumber(inputs.pi),
      skinTemp: toNumber(inputs.skin),
      message: check?.message ?? (problem ? card?.headline ?? null : null),
      action: check ? check.action ?? null : (problem ? card?.action ?? null : null),
      device: deviceInfo(findDevice(devices, limb)),
    };
  });

  return { limbs, headEeg: deviceInfo(findDevice(devices, HEAD_DEVICE)) };
}

export default limbsFromReport;

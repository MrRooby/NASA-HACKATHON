import { describe, expect, it } from 'vitest';
import habC1 from '../test/fixtures/organs_HAB-C1.json';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import { LIMB_KEYS, limbsCard, limbsFromReport } from './limbData.js';

const byLimb = result => Object.fromEntries(result.limbs.map(item => [item.limb, item]));
const clone = value => JSON.parse(JSON.stringify(value));

describe('limbsFromReport', () => {
  it('returns the four limbs in a fixed order', () => {
    expect(limbsFromReport(habC1).limbs.map(item => item.limb)).toEqual(LIMB_KEYS);
    expect(LIMB_KEYS).toEqual(['left_arm', 'right_arm', 'left_leg', 'right_leg']);
  });

  it('HAB-C4 sol 142: left leg alert at 25 %, the other limbs ok at 100 %', () => {
    const limbs = byLimb(limbsFromReport(habC4Sol142));
    expect(limbs.left_leg).toMatchObject({
      status: 'alert',
      circulationPct: 25,
      hr: 62,
      spo2: 97,
      perfusionIndex: 0.25,
      skinTemp: 33,
    });
    expect(limbs.left_leg.message).toMatch(/^Left leg: blood flow \(perfusion\) 25%/);
    expect(limbs.left_leg.action).toMatch(/^Inspect the limb/);
    for (const limb of ['left_arm', 'right_arm', 'right_leg']) {
      expect(limbs[limb]).toMatchObject({ status: 'ok', circulationPct: 100, perfusionIndex: 1, action: null });
    }
  });

  it('attaches the band on each limb and reports the EEG headband separately', () => {
    const result = limbsFromReport(habC4Sol142);
    for (const item of result.limbs) {
      expect(item.device).toEqual({ state: 'connected', battery_pct: 93.74, status: 'ok', message: null });
    }
    expect(result.headEeg).toEqual({ state: 'connected', battery_pct: 93.74, status: 'ok', message: null });
  });

  it('HAB-C1 (latest sol): every limb ok', () => {
    const result = limbsFromReport(habC1);
    expect(result.limbs.every(item => item.status === 'ok' && item.circulationPct === 100)).toBe(true);
    expect(result.limbs.every(item => item.device.battery_pct === 80)).toBe(true);
  });

  it('falls back to the card metrics when checks[] is missing', () => {
    const report = clone(habC4Sol142);
    delete limbsCard(report).checks;
    const limbs = byLimb(limbsFromReport(report));
    expect(limbs.left_leg).toMatchObject({ status: 'alert', circulationPct: 25, hr: null, spo2: null, perfusionIndex: null, skinTemp: null });
    expect(limbs.left_leg.message).toMatch(/^Left leg/);
    expect(limbs.left_leg.action).toMatch(/^Inspect the limb/);
    expect(limbs.left_arm).toMatchObject({ status: 'ok', circulationPct: 100, message: null, action: null });
    // Not named by any metric: the headline only names the left leg, so this limb stays ok.
    expect(limbs.right_leg).toMatchObject({ status: 'ok', circulationPct: null });
  });

  it('works without devices', () => {
    const report = clone(habC4Sol142);
    delete report.devices;
    const result = limbsFromReport(report);
    expect(result.limbs.every(item => item.device === null)).toBe(true);
    expect(result.headEeg).toBeNull();
    expect(byLimb(result).left_leg.status).toBe('alert');
  });

  it('keeps a non-ok band on its limb without changing the limb status', () => {
    const report = clone(habC1);
    report.devices.find(device => device.limb === 'right_arm').status = 'caution';
    report.devices.find(device => device.limb === 'right_arm').state = 'low_battery';
    report.devices.find(device => device.limb === 'right_arm').battery_pct = 9;
    const limbs = byLimb(limbsFromReport(report));
    expect(limbs.right_arm.status).toBe('ok');
    expect(limbs.right_arm.device).toMatchObject({ status: 'caution', state: 'low_battery', battery_pct: 9 });
  });

  it('is safe on a null, empty or limb-less report', () => {
    for (const report of [null, undefined, {}, { organs: [] }, { organs: [{ organ: 'heart', status: 'ok' }], devices: null }]) {
      const result = limbsFromReport(report);
      expect(result.limbs).toHaveLength(4);
      expect(result.limbs.every(item => item.status === 'no_data' && item.circulationPct === null && item.device === null)).toBe(true);
      expect(result.headEeg).toBeNull();
    }
  });
});

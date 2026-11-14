import { describe, expect, it } from 'vitest';
import {
  REPORT_STORAGE_KEY, buildProtocols, buildSurgeonReport, createBiometrics, enrichBiometric, evaluateValue,
  initialBiometrics, queueSurgeonReport, thresholdConfig, updateBiometric,
} from './thresholdLogic.js';
import { fixtures } from '../test/mother.js';

// Same cases as the former end-to-end test (type a value in the check-in, read the
// status of the dashboard row), now straight on the rules engine. Values arrive as
// strings, exactly as the form sends them.
const metricIds = {
  bp_systolic: 'sbp',
  bp_diastolic: 'dbp',
  heart_rate_resting: 'hr',
  glucose_fasting: 'glucose',
  body_temperature: 'temperature',
  sleep_hours: 'sleep',
  mood: 'mood',
};

const assessed = (configId, value) =>
  updateBiometric(createBiometrics(), metricIds[configId], String(value)).find(item => item.configId === configId);
const statusFor = (configId, value) => assessed(configId, value).status;

describe('threshold status logic (hand-checked clinical cases)', () => {
  it.each([
    ['bp_systolic', 119, 'ok'],
    ['bp_systolic', 120, 'caution'], // upper bound is exclusive
    ['bp_systolic', 139, 'caution'],
    ['bp_systolic', 140, 'alert'],
    ['bp_systolic', 85, 'caution'],
    ['bp_diastolic', 79, 'ok'],
    ['bp_diastolic', 95, 'alert'],
    ['heart_rate_resting', 45, 'ok'],
    ['heart_rate_resting', 110, 'caution'],
    ['heart_rate_resting', 130, 'alert'],
    ['glucose_fasting', 65, 'alert'],
    ['glucose_fasting', 110, 'caution'],
    ['glucose_fasting', 130, 'alert'],
    ['body_temperature', 37.5, 'ok'],
    ['body_temperature', 37.6, 'caution'],
    ['body_temperature', 39, 'alert'],
    ['body_temperature', 34.5, 'alert'],
    ['sleep_hours', 4.5, 'alert'],
    ['sleep_hours', 7, 'ok'],
  ])('%s = %s -> %s', (configId, value, expected) => {
    expect(statusFor(configId, value)).toBe(expected);
    expect(evaluateValue(configId, value).status).toBe(expected);
  });
});

describe('threshold status logic follows every configured band', () => {
  const cases = Object.keys(metricIds).filter(configId => configId !== 'mood').flatMap(configId => {
    const indicator = thresholdConfig.indicators.find(i => i.id === configId);
    return indicator.bands.map(band => {
      const value = band.min == null ? band.max - 1
        : band.max == null ? band.min + 1
        : Number(((band.min + band.max) / 2).toFixed(1));
      return [configId, value, band];
    });
  });

  it.each(cases)('%s = %s', (configId, value, band) => {
    const reading = assessed(configId, value);
    expect(reading.status).toBe(band.status);
    expect(reading.message).toBe(band.message);
    expect(reading.action).toBe(band.action);
    expect(reading.escalate).toBe(band.escalate === true);
  });
});

describe('mood self-score', () => {
  it.each([[1, 'caution'], [2, 'caution'], [3, 'ok'], [5, 'ok']])('score %s -> %s', (score, expected) => {
    expect(statusFor('mood', score)).toBe(expected);
  });
});

describe('rules engine helpers', () => {
  it('treats an empty value or an unknown indicator as ok, and a value outside every band as caution', () => {
    expect(evaluateValue('bp_systolic', '').status).toBe('ok');
    expect(evaluateValue('bp_systolic', null).status).toBe('ok');
    expect(evaluateValue('no_such_indicator', 5).status).toBe('ok');
    expect(evaluateValue('bp_systolic', Number.NaN).status).toBe('caution');
  });

  it('enriches the demo readings: status, reference range and a 30-point trend', () => {
    const biometrics = createBiometrics();
    expect(biometrics.map(item => item.id)).toEqual(initialBiometrics.map(item => item.id));
    for (const item of biometrics) {
      expect(['ok', 'caution', 'alert']).toContain(item.status);
      expect(item.trend).toHaveLength(30);
    }
    expect(enrichBiometric(initialBiometrics[0])).toEqual(biometrics[0]); // deterministic
    expect(biometrics.find(item => item.id === 'sbp')).toMatchObject({ value: 128, status: 'caution' });
  });

  it('keeps a cleared field empty and leaves the other readings untouched', () => {
    const before = createBiometrics();
    const after = updateBiometric(before, 'hr', '');
    expect(after.find(item => item.id === 'hr')).toMatchObject({ value: '', status: 'ok' });
    expect(after.find(item => item.id === 'sbp')).toBe(before.find(item => item.id === 'sbp'));
  });

  it('derives the body-system statuses from the readings', () => {
    const status = (biometrics, id) => buildProtocols(biometrics).find(protocol => protocol.id === id).status;
    const base = createBiometrics();
    expect(status(base, 'CVS')).toBe('caution'); // systolic 128
    expect(status(updateBiometric(base, 'sbp', 150), 'CVS')).toBe('alert');
    expect(status(updateBiometric(base, 'sbp', 110), 'CVS')).toBe('caution'); // diastolic 82 is still elevated
    expect(status(updateBiometric(updateBiometric(base, 'sbp', 110), 'dbp', 75), 'CVS')).toBe('ok');
    expect(status(updateBiometric(base, 'mood', 1), 'PSY')).toBe('caution');
  });
});

describe('flight-surgeon report', () => {
  const createdAt = new Date('2026-11-14T10:00:00Z');

  it('lists every indicator with status and action; offline it has no MOTHER section', () => {
    const report = buildSurgeonReport({ biometrics: createBiometrics(), mission: 'MARS-LT-ELYSIUM', createdAt, mother: { online: false } });
    expect(report).toMatchObject({ createdAt: '2026-11-14T10:00:00.000Z', mission: 'MARS-LT-ELYSIUM', flightDay: 142 });
    expect(report.indicators).toHaveLength(initialBiometrics.length);
    expect(report.indicators.find(item => item.id === 'sbp')).toMatchObject({ value: 128, status: 'caution' });
    expect(report.disclaimer).toMatch(/not for clinical use/i);
    expect(report.mother).toBeUndefined();
  });

  it('attaches the MOTHER organ report when online and stores the report locally', () => {
    const report = buildSurgeonReport({
      biometrics: createBiometrics(), mission: 'MARS-LT-ELYSIUM', createdAt,
      mother: { online: true, report: fixtures.habC1 },
    });
    expect(report.mother).toMatchObject({
      subject: 'HAB-C1',
      data_kind: 'synthetic',
      as_of: fixtures.habC1.as_of,
      overall_status: fixtures.habC1.overall_status,
    });
    expect(report.mother.organs).toHaveLength(fixtures.habC1.organs.length);
    expect(report.mother.devices.every(device => device.status !== 'ok')).toBe(true);

    expect(queueSurgeonReport(report)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(REPORT_STORAGE_KEY))).toEqual(report);
  });
});

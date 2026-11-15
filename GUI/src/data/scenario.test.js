import { afterEach, describe, expect, it } from 'vitest';
import { SCENARIO, scenarioHabitat, scenarioOverview, scenarioReport, scenarioRoomReadings, setScenarioEnabled } from './scenario.js';

const report = sol => ({
  subject: { code: 'HAB-C1' },
  as_of: { sol },
  overall_status: 'caution',
  organs: [{
    organ: 'exposure', status: 'ok', headline: 'All 2 checks normal.',
    metrics: [{ name: 'Radiation dose (personal dosimeter)', value: 89.2, unit: 'mSv', status: 'ok' }],
    checks: [{ code: 'dose_career', value: 89.2, unit: 'mSv', status: 'ok' }],
  }],
});

const habitat = sol => ({
  as_of: { sol, occupants_at: '2040-09-08T05:42:32Z' },
  zones: [{ code: 'lab', occupants: ['C1', 'C4'] }],
  events: [],
});

describe('demo scenario: the commander irradiated in the reactor bay', () => {
  afterEach(() => setScenarioEnabled(false));

  it('is off in tests unless turned on', () => {
    expect(scenarioReport(report(600))).toEqual(report(600));
  });

  it('turns the commander exposure card red on the last sol only', () => {
    setScenarioEnabled(true);
    const out = scenarioReport(report(600));
    const exposure = out.organs[0];
    expect(out.overall_status).toBe('alert');
    expect(exposure.status).toBe('alert');
    expect(exposure.checks.find(check => check.code === 'dose_career').value).toBe(SCENARIO.doseCareerMsv);
    expect(exposure.checks.find(check => check.code === 'dose_acute').status).toBe('alert');
    expect(scenarioReport(report(599))).toEqual(report(599));
    expect(scenarioReport({ ...report(600), subject: { code: 'HAB-C2' } }).overall_status).toBe('caution');
  });

  it('moves the commander to the reactor and adds the radiation event', () => {
    setScenarioEnabled(true);
    const out = scenarioHabitat(habitat(600));
    expect(out.zones.find(zone => zone.code === 'lab').occupants).toEqual(['C4']);
    expect(out.zones.find(zone => zone.code === 'reactor').occupants).toEqual(['C1']);
    expect(out.events[0]).toMatchObject({ type: 'radiation_exposure', zone: 'reactor', crew: 'C1', severity: 'critical' });
    expect(scenarioHabitat(habitat(500))).toEqual(habitat(500));
  });

  it('marks the overview row and the reactor shield dose rate', () => {
    setScenarioEnabled(true);
    const [row] = scenarioOverview([{ subject: { code: 'HAB-C1' }, overall_status: 'ok', organs: { exposure: 'ok' } }]);
    expect(row.overall_status).toBe('alert');
    expect(row.organs.exposure).toBe('alert');
    const [reading] = scenarioRoomReadings('reactor', [{ channel: 'shield_dose_rate', value: 14, status: 'ok' }], 600);
    expect(reading).toMatchObject({ value: SCENARIO.shieldDoseRate, status: 'alert', worst_status: 'alert' });
  });
});

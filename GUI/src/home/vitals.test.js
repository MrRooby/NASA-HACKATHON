import { describe, expect, it } from 'vitest';
import habC1 from '../test/fixtures/organs_HAB-C1.json';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import { vitalsFromReport } from './vitals.js';

const byId = rows => Object.fromEntries(rows.map(row => [row.id, row]));

describe('vitalsFromReport', () => {
  it('averages the bands; limb circulation is not a reading', () => {
    const rows = byId(vitalsFromReport(habC4Sol142));
    expect(rows.hr).toMatchObject({ value: 62, unit: 'bpm', status: 'ok', noteParams: { n: 4 } });
    expect(rows.spo2).toMatchObject({ value: 97.2, status: 'ok' });
    expect(rows.map).toMatchObject({ value: 86, unit: 'mmHg', status: 'ok' });
    expect(rows.circulation).toBeUndefined();
    expect(rows.glucose).toMatchObject({ value: 86, status: 'ok' });
    expect(rows.sleep).toMatchObject({ value: 87, status: 'ok' });
    expect(rows.dose).toMatchObject({ value: 67.8, unit: 'mSv', status: 'ok' });
  });

  it('a healthy report gives ok readings', () => {
    expect(vitalsFromReport(habC1).filter(row => row.value != null).every(row => row.status === 'ok')).toBe(true);
  });

  it('a null report gives six empty rows', () => {
    const rows = vitalsFromReport(null);
    expect(rows).toHaveLength(6);
    expect(rows.every(row => row.value == null && row.status === 'no_data')).toBe(true);
  });
});

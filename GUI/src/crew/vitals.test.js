import { describe, expect, it } from 'vitest';
import { crewVitals } from './vitals.js';
import { fixtures } from '../test/mother.js';

describe('crewVitals', () => {
  it('reads HR, SpO2 and sleep from an organ report', () => {
    const vitals = crewVitals(fixtures.habC4Sol142);
    expect(vitals.hr.value).toBe(62);
    expect(vitals.spo2).toEqual({ value: 97.2, status: 'ok' });
    expect(vitals.sleep).toEqual({ value: 8, status: 'ok' });
  });

  it('gives nulls for a missing or empty report', () => {
    expect(crewVitals(null)).toEqual({ hr: { value: null, status: null }, spo2: { value: null, status: null }, sleep: { value: null, status: null } });
    expect(crewVitals({ organs: [] }).hr.value).toBeNull();
  });
});

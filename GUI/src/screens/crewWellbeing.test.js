import { describe, expect, it } from 'vitest';
import { CREW_CODES } from '../data/crewProfiles.js';
import { getCrewWellbeing, isScriptedDay, personStatus, valueStatus } from './crewWellbeing.js';

const TODAY = new Date(2026, 10, 15, 12);

describe('crew wellbeing data', () => {
  it('rates each value against its limits', () => {
    expect(valueStatus('sleep', 7)).toBe('ok');
    expect(valueStatus('sleep', 6)).toBe('caution');
    expect(valueStatus('sleep', 4.5)).toBe('alert');
    expect(valueStatus('mood', 2)).toBe('caution');
    expect(valueStatus('mood', 1)).toBe('alert');
    expect(valueStatus('stress', 4)).toBe('caution');
    expect(valueStatus('stress', 5)).toBe('alert');
    expect(personStatus({ mood: 4, sleep: 3.9, stress: 2 })).toBe('alert');
  });

  it('scripts today: all 10 crew, two cautions and one alert', () => {
    expect(isScriptedDay(TODAY, TODAY)).toBe(true);
    const crew = getCrewWellbeing(TODAY, TODAY);
    expect(crew.map(person => person.code)).toEqual(CREW_CODES);
    const count = status => crew.filter(person => person.status === status).length;
    expect([count('ok'), count('caution'), count('alert')]).toEqual([7, 2, 1]);
    const alert = crew.find(person => person.status === 'alert');
    expect(alert).toMatchObject({ code: 'HAB-C7', name: 'Światosław Ryt', noteKey: 'noteEvaInsomnia' });
  });

  it('is deterministic for other days', () => {
    const day = new Date(2026, 10, 5, 12);
    expect(getCrewWellbeing(day, TODAY)).toEqual(getCrewWellbeing(new Date(2026, 10, 5, 8), TODAY));
    expect(getCrewWellbeing(day, TODAY)).toHaveLength(10);
    for (const person of getCrewWellbeing(day, TODAY)) {
      expect(person.mood).toBeGreaterThanOrEqual(1);
      expect(person.mood).toBeLessThanOrEqual(5);
      expect(person.noteKey).toMatch(/^note/);
    }
  });
});

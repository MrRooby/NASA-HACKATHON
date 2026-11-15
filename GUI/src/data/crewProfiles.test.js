import { describe, expect, it } from 'vitest';
import { CREW_CODES, CREW_PROFILES, MISSION, getProfile, localize } from './crewProfiles.js';
import { fixtures } from '../test/mother.js';

describe('fictional crew profiles', () => {
  it('has the ten habitat crew members, all flagged fictional', () => {
    expect(CREW_CODES).toEqual(Array.from({ length: 10 }, (_, i) => `HAB-C${i + 1}`));
    expect(CREW_PROFILES.map(profile => profile.name)).toEqual([
      'Aleksander Polkowski', 'Bogusława Grzegrzułkiewicz', 'Roman Czarny', 'Grażyna Brzęczyszczykiewicz',
      'Żytomira Będzisławska', 'Jędżej Podolski', 'Światosław Ryt', 'Andrzej Świętopełek', 'Kunekunda Krzeszowska',
      'Czesława Życińska',
    ]);
    expect(MISSION.fictional).toBe(true);
    for (const profile of CREW_PROFILES) {
      expect(profile.fictional).toBe(true);
      expect(profile.crewCode).toBe(profile.code.replace('HAB-', ''));
      expect(profile.nationality).toBe('PL');
      expect(profile.age).toBeGreaterThan(25);
      expect(profile.callsign).toMatch(/\S/);
      for (const field of ['role', 'education', 'bio']) {
        expect(profile[field].en).toMatch(/\S/);
        expect(profile[field].pl).toMatch(/\S/);
      }
    }
  });

  it('matches the habitat crew known to MOTHER (codes and home zones)', () => {
    // home modules as in DATABASE/schema/005_habitat_seed.sql (C1..C4) and 017_mars_crew_ext.sql (C5..C10)
    expect(CREW_PROFILES.map(profile => profile.homeZone)).toEqual([
      'module_M1', 'module_M1', 'module_M2', 'module_M2', 'module_M1', 'module_M2', 'module_M2', 'module_M1', 'module_M1', 'module_M2',
    ]);
    // the MOTHER fixture snapshot predates C5..C10: every crew member it knows has a profile
    const habitatCrew = fixtures.subjects.filter(subject => subject.kind === 'habitat_crew').map(subject => subject.code);
    expect(habitatCrew.every(code => CREW_CODES.includes(code))).toBe(true);
    expect(fixtures.habC1.subject.home_zone).toBe(getProfile('HAB-C1').homeZone);
  });

  it('getProfile accepts long and short codes; localize picks the language', () => {
    expect(getProfile('HAB-C4').role).toEqual({ en: 'Mission physician', pl: 'Lekarz misji' });
    expect(getProfile('C1').role.pl).toBe('Dowódca');
    expect(getProfile('SYN-01')).toBeNull();
    expect(getProfile(null)).toBeNull();
    expect(localize(getProfile('C3').role, 'pl')).toBe('Geolog');
    expect(localize(getProfile('C3').role, 'de')).toBe('Geologist');
    expect(localize('plain', 'pl')).toBe('plain');
  });
});

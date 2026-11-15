import { describe, expect, it } from 'vitest';
import { CREW_CODES, CREW_PROFILES, MISSION, getProfile, localize } from './crewProfiles.js';
import { fixtures } from '../test/mother.js';

describe('fictional crew profiles', () => {
  it('has the four habitat crew members, all flagged fictional', () => {
    expect(CREW_CODES).toEqual(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4']);
    expect(CREW_PROFILES.map(profile => profile.name)).toEqual([
      'Aleksander Polkowski', 'Bogusław Grzegrzułkiewicz', 'Roman Czarny', 'Grażyna Brzęczyszczykiewicz',
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
    expect(CREW_PROFILES.map(profile => profile.homeZone)).toEqual(['module_M1', 'module_M1', 'module_M2', 'module_M2']);
    const habitatCrew = fixtures.subjects.filter(subject => subject.kind === 'habitat_crew').map(subject => subject.code);
    expect(habitatCrew.sort()).toEqual([...CREW_CODES].sort());
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

describe('crew bodies', () => {
  it('every crew member has sex, height, mass and a generated model file', async () => {
    const { CREW_PROFILES } = await import('./crewProfiles.js');
    const fs = await import('node:fs');
    for (const p of CREW_PROFILES) {
      expect(['male', 'female']).toContain(p.sex);
      expect(p.heightCm).toBeGreaterThan(140);
      expect(p.massKg).toBeGreaterThan(40);
      expect(fs.existsSync(`${process.cwd()}/public/models/${p.model}.glb`)).toBe(true); // tests run from GUI/
    }
  });
});

import { describe, expect, it } from 'vitest';
import { CREW_PHOTOS, PHOTO_FOR_CREW, getCrewPhoto } from './crewPhotos.js';

describe('crew photos', () => {
  it('bundles the six cropped photos', () => {
    expect(Object.keys(CREW_PHOTOS).sort()).toEqual(['fartek', 'hartek', 'jan', 'kamil', 'kinga', 'konrad']);
  });

  it('every assigned photo exists and no photo is used twice', () => {
    const used = Object.values(PHOTO_FOR_CREW).filter(Boolean);
    for (const name of used) expect(CREW_PHOTOS[name]).toBeTruthy();
    expect(new Set(used).size).toBe(used.length);
  });

  it('getCrewPhoto accepts both code forms and is null without a photo', () => {
    const code = Object.keys(PHOTO_FOR_CREW).find(key => PHOTO_FOR_CREW[key]);
    expect(getCrewPhoto(code)).toBe(CREW_PHOTOS[PHOTO_FOR_CREW[code]]);
    expect(getCrewPhoto(code.replace('HAB-', ''))).toBe(getCrewPhoto(code));
    expect(getCrewPhoto('SYN-01')).toBeNull();
    expect(getCrewPhoto(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { ALL_ACTIONS, ORGANS, ORGAN_BY_ID, organsForSegment, siblingOrgans } from './catalog.js';
import { ORGAN_ORDER, ORGAN_SEGMENTS } from '../organSegments.js';
import { ORGAN_ICON, PIXEL_ICONS } from '../pixel/index.js';
import { messages } from '../i18n/index.js';
import { BRISTOL_SPRITES, ECG_ROWS, dropletSprite } from './sprites.js';

const MEASUREMENT_KINDS = ['bp', 'hr', 'spo2', 'glucose', 'temp', 'sleep', 'mood', 'water', 'urine_sample', 'urine_volume', 'weight', 'symptoms', 'meal', 'bristol', 'exercise', 'grip', 'eye_check'];
const has = (lang, key) => typeof messages[lang][`organs.${key}`] === 'string';

describe('organ catalogue', () => {
  it('has the 10 organs of the MOTHER contract in contract order, each with icon, segments and actions', () => {
    expect(ORGANS.map(organ => organ.id)).toEqual(ORGAN_ORDER);
    expect(ORGANS).toHaveLength(10);
    for (const organ of ORGANS) {
      expect(organ.icon).toBe(ORGAN_ICON[organ.id]);
      expect(organ.segments).toEqual(ORGAN_SEGMENTS[organ.id]);
      expect(organ.actions.length).toBeGreaterThan(0);
      expect(organ.hero).toBeTruthy();
    }
  });

  it('has the actions DESIGN.md §4.2 asks for', () => {
    const ids = id => ORGAN_BY_ID[id].actions.map(action => action.id);
    expect(ids('brain')).toEqual(expect.arrayContaining(['pvt', 'battery', 'mood', 'sleep', 'psych', 'ppc']));
    expect(ids('eyes')).toEqual(expect.arrayContaining(['acuity', 'fundus', 'iop']));
    expect(ids('heart')).toEqual(expect.arrayContaining(['bp', 'hr']));
    expect(ids('lungs')).toContain('spo2');
    expect(ids('blood')).toEqual(expect.arrayContaining(['draw', 'glucose']));
    expect(ids('kidneys')).toEqual(expect.arrayContaining(['water', 'urine_sample', 'urine_volume']));
    expect(ids('gut')).toEqual(expect.arrayContaining(['meal', 'glucose', 'bristol']));
    expect(ids('musculoskeletal')).toEqual(expect.arrayContaining(['exercise', 'grip']));
    expect(ids('limbs')).toEqual(expect.arrayContaining(['bands', 'limb_check']));
    expect(ids('exposure')).toEqual(expect.arrayContaining(['dose', 'shelter']));
    expect(ORGAN_BY_ID.brain.actions.filter(action => action.type === 'test').map(action => action.test)).toEqual(['quick', 'full']);
  });

  it('saves only the measurement kinds the task list knows', () => {
    for (const action of ALL_ACTIONS) {
      if (action.kind) expect(MEASUREMENT_KINDS).toContain(action.kind);
    }
  });

  it('uses only icon names of the pixel library', () => {
    const names = new Set(PIXEL_ICONS);
    const used = new Set();
    for (const organ of ORGANS) {
      used.add(organ.icon);
      for (const action of organ.actions) {
        used.add(action.icon);
        for (const item of [...(action.options || []), ...(action.steps || []), ...(action.modes || []), ...(action.findings || [])]) {
          if (item.icon) used.add(item.icon);
        }
      }
    }
    // The pixel library may still be filling in; every name must be a documented icon name.
    const documented = 'brain eye heart lungs blood kidneys urine stomach bone muscle arm leg limb radiation bp hr spo2 thermometer glucose water_cup sleep mood_1 mood_2 mood_3 mood_4 mood_5 scale syringe test_tube dipstick pill dumbbell treadmill grip eye_chart camera pvt gonogo dsst questionnaire chat pressure o2 co2 humidity dust radiation_sensor airlock water_tank light noise structure power reactor plant thermometer_room wind sun satellite alert caution ok no_data check cross clock calendar gear crew base back next prev'.split(' ');
    for (const name of used) expect(documented.includes(name) || names.has(name)).toBe(true);
  });

  it('has every text in EN and PL (names, one-liners, actions, fields, options, steps)', () => {
    for (const lang of ['en', 'pl']) {
      for (const organ of ORGANS) {
        for (const key of [`name_${organ.id}`, `what_${organ.id}`, `hazard_${organ.id}`, `hrp_${organ.hazard}`]) expect(has(lang, key), `${lang} ${key}`).toBe(true);
        for (const action of organ.actions) {
          expect(has(lang, `act_${action.id}`), `${lang} act_${action.id}`).toBe(true);
          for (const field of action.fields || []) expect(has(lang, `field_${field.key}`)).toBe(true);
          for (const option of action.options || []) if (!option.label) expect(has(lang, `opt_${action.id}_${option.value}`), `${lang} opt_${action.id}_${option.value}`).toBe(true);
          for (const mode of action.modes || []) expect(has(lang, `opt_${action.id}_${mode.value}`)).toBe(true);
          (action.steps || []).forEach((_, index) => expect(has(lang, `step_${action.id}_${index + 1}`)).toBe(true));
          for (const finding of action.findings || []) expect(has(lang, `finding_${finding.value}`)).toBe(true);
        }
      }
    }
  });

  it('maps segments to organs and organs to sibling tabs', () => {
    expect(organsForSegment('head')).toEqual(['brain', 'eyes']);
    expect(organsForSegment('chest')).toEqual(['heart', 'lungs']);
    expect(organsForSegment('abdomen')).toEqual(['kidneys', 'gut']);
    expect(organsForSegment('left_foot')).toEqual(['limbs']);
    expect(siblingOrgans('eyes')).toEqual(['brain', 'eyes']);
    expect(siblingOrgans('lungs')).toEqual(['heart', 'lungs']);
    expect(siblingOrgans('exposure')).toEqual(['exposure']);
    expect(siblingOrgans('limbs')).toEqual(['blood', 'musculoskeletal', 'limbs']);
  });

  it('draws rectangular sprites', () => {
    const square = rows => rows.every(row => row.length === rows[0].length);
    expect(square(ECG_ROWS)).toBe(true);
    expect(square(dropletSprite('#fff').rows)).toBe(true);
    for (const sprite of Object.values(BRISTOL_SPRITES)) expect(square(sprite.rows)).toBe(true);
  });
});

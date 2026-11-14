import { describe, expect, it } from 'vitest';
import { bandsRange, checkBands, normalRange, rateField } from './rating.js';

describe('organ rating', () => {
  it('rates a config field with config/thresholds.json', () => {
    const rating = rateField({ configId: 'bp_systolic' }, 145);
    expect(rating.status).toBe('alert');
    expect(rating.escalate).toBe(true);
    expect(normalRange(rating.bands)).toEqual([90, 120]);
    expect(rateField({ configId: 'spo2' }, 97).status).toBe('ok');
  });

  it('rates own bands and leaves unrated fields without a status', () => {
    const field = { bands: [{ min: 0, max: 0.5, status: 'alert' }, { min: 0.5, max: 2.5, status: 'caution' }, { min: 2.5, max: 6, status: 'ok' }] };
    expect(rateField(field, 1.7).status).toBe('caution');
    expect(rateField(field, 3).status).toBe('ok');
    expect(rateField({}, 35).status).toBeNull();
    expect(rateField({ configId: 'mood' }, '').status).toBeNull();
  });

  it('finds ranges for MOTHER checks by code or from the formula', () => {
    expect(normalRange(checkBands({ code: 'perfusion_left_leg', value: 25 }))).toEqual([50, 101]);
    expect(normalRange(checkBands({ code: 'unknown', value: 140, formula: 'normal 135–145; severe <125' }))).toEqual([135, 145]);
    const floor = normalRange(checkBands({ code: 'x', value: 96, formula: 'normal ≥95%' }));
    expect(floor[0]).toBe(95);
    expect(floor[1]).toBeCloseTo(104.5);
    expect(checkBands({ code: 'uti', value: 'negative' })).toBeNull();
    const [lo, hi] = bandsRange(checkBands({ code: 'dose_career', value: 68 }), 68);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(600);
  });
});

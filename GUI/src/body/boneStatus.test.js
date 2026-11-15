import { describe, expect, it } from 'vitest';
import { boneStatus, complianceOf, projectBmd } from './boneStatus.js';

describe('bone status (projected BMD)', () => {
  it('starts at the pre-flight value and goes down with the sols', () => {
    expect(projectBmd('HAB-C1', 0).hip).toBe(100);
    const early = projectBmd('HAB-C1', 100);
    const late = projectBmd('HAB-C1', 600);
    expect(late.hip).toBeLessThan(early.hip);
    expect(late.femoral).toBeLessThan(early.femoral);
  });

  it('is ok early in the mission and flags the hip and spine late', () => {
    expect(boneStatus('HAB-C4', 60).segments.pelvis).toBe('ok');
    const late = boneStatus('HAB-C4', 600);
    expect(['caution', 'alert']).toContain(late.segments.pelvis);
    expect(late.segments.head).toBe('ok');
  });

  it('gives every person a fixed exercise compliance between 70 and 95 %', () => {
    for (const code of ['HAB-C1', 'HAB-C2', 'HAB-C10']) {
      expect(complianceOf(code)).toBeGreaterThanOrEqual(0.7);
      expect(complianceOf(code)).toBeLessThanOrEqual(0.95);
      expect(complianceOf(code)).toBe(complianceOf(code));
    }
  });

  it('returns null without a sol', () => {
    expect(boneStatus('HAB-C1', null)).toBeNull();
  });
});

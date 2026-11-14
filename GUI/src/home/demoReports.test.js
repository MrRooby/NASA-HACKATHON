import { describe, expect, it } from 'vitest';
import { DEMO_CODES, demoOverview, demoReport } from '../data/demoReports.js';
import { ORGAN_ORDER } from '../organSegments.js';
import { limbsFromReport } from './limbData.js';

describe('demo reports (offline data)', () => {
  it('has one report per habitat crew member, marked as demo', () => {
    expect(DEMO_CODES).toEqual(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4']);
    for (const code of DEMO_CODES) {
      const report = demoReport(code);
      expect(report.demo).toBe(true);
      expect(report.subject.code).toBe(code);
      expect(report.organs.map(card => card.organ)).toEqual(ORGAN_ORDER);
      expect(report.devices).toHaveLength(5);
    }
  });

  it('HAB-C4 is the sol-142 record with the left-leg alert', () => {
    const report = demoReport('HAB-C4');
    expect(report.as_of.sol).toBe(142);
    expect(report.overall_status).toBe('alert');
    expect(limbsFromReport(report).limbs.find(item => item.limb === 'left_leg')).toMatchObject({ status: 'alert', circulationPct: 25 });
  });

  it('accepts the short crew code and returns null for anyone else', () => {
    expect(demoReport('C2').subject.code).toBe('HAB-C2');
    expect(demoReport('hab-c3').subject.code).toBe('HAB-C3');
    expect(demoReport('SYN-01')).toBeNull();
    expect(demoReport(null)).toBeNull();
    expect(demoReport(undefined)).toBeNull();
  });

  it('returns a fresh top-level object each time (the bundled data is never flagged in place)', () => {
    expect(demoReport('HAB-C1')).not.toBe(demoReport('HAB-C1'));
  });

  it('demoOverview has the shape of GET /api/organs', () => {
    const overview = demoOverview();
    expect(overview.map(row => row.subject.code)).toEqual(DEMO_CODES);
    const c4 = overview[3];
    expect(c4).toMatchObject({ overall_status: 'alert', demo: true });
    expect(c4.top_message).toMatch(/^Left leg/);
    expect(Object.keys(c4.organs)).toEqual(ORGAN_ORDER);
    expect(c4.organs.limbs).toBe('alert');
    expect(c4.organs.kidneys).toBe('caution');
  });
});

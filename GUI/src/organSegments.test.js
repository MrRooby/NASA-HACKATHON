import { describe, expect, it } from 'vitest';
import {
  BODY_SEGMENTS, LIMB_SEGMENTS, ORGAN_ORDER, limbSegmentStatus, limbsInText, organsForSegment,
  segmentStatusFromReport, worstStatus, segmentForMesh, meshForSegment,
} from './organSegments.js';
import { fixtures } from './test/mother.js';

const card = (organ, status, extra = {}) => ({ organ, label: organ, status, headline: '', metrics: [], ...extra });
const reportOf = (...cards) => ({ organs: cards, devices: [] });
const ARM_AND_LEG_SEGMENTS = Object.values(LIMB_SEGMENTS).flat();

describe('worstStatus', () => {
  it('orders alert > caution > ok > no_data', () => {
    expect(worstStatus(['ok', 'no_data'])).toBe('ok');
    expect(worstStatus(['no_data', 'caution', 'ok'])).toBe('caution');
    expect(worstStatus(['caution', 'alert', 'ok'])).toBe('alert');
    expect(worstStatus(['no_data'])).toBe('no_data');
    expect(worstStatus([])).toBeNull();
  });
});

describe('limbsInText', () => {
  it('finds limbs in headlines, metric names, check codes and device ids', () => {
    expect(limbsInText('Left leg: blood flow (perfusion) 25% of the other limbs')).toEqual(['left_leg']);
    expect(limbsInText('Circulation: right arm')).toEqual(['right_arm']);
    expect(limbsInText('perfusion_left_arm')).toEqual(['left_arm']);
    expect(limbsInText('right_leg')).toEqual(['right_leg']);
    expect(limbsInText('Possible muscle injury: limb circulation lost.')).toEqual([]);
    expect(limbsInText('leftover legacy')).toEqual([]);
  });
});

describe('segmentStatusFromReport on recorded MOTHER responses', () => {
  it('HAB-C4 sol 142: only the left leg is alert (W1 scenario)', () => {
    const segments = segmentStatusFromReport(fixtures.habC4Sol142);
    for (const segment of ['left_thigh', 'left_lower_leg', 'left_foot']) expect(segments[segment]).toBe('alert');
    for (const segment of ARM_AND_LEG_SEGMENTS.filter(s => !LIMB_SEGMENTS.left_leg.includes(s))) {
      expect(segments[segment]).not.toBe('alert');
      expect(segments[segment]).toBe('ok');
    }
    expect(segments.abdomen).toBe('caution'); // kidneys caution, gut ok
    expect(segments.pelvis).toBe('ok'); // gut ok
    expect(segments.chest).toBe('ok');
    expect(segments.head).toBe('ok'); // brain ok + eyes no_data
    expect(segments).not.toHaveProperty('neck');
  });

  it('HAB-C4 latest: limbs ok everywhere, gut caution colours abdomen and pelvis', () => {
    const segments = segmentStatusFromReport(fixtures.habC4);
    for (const segment of ARM_AND_LEG_SEGMENTS) expect(segments[segment]).toBe('ok');
    expect(segments.abdomen).toBe('caution');
    expect(segments.pelvis).toBe('caution');
  });

  it('covers every body segment except the neck for each fixture', () => {
    for (const report of [fixtures.habC1, fixtures.habC2, fixtures.habC3, fixtures.habC4, fixtures.habC4Sol142]) {
      expect(report.organs.map(c => c.organ)).toEqual(ORGAN_ORDER);
      const segments = segmentStatusFromReport(report);
      expect(Object.keys(segments).sort()).toEqual(BODY_SEGMENTS.filter(s => s !== 'neck').sort());
      Object.values(segments).forEach(status => expect(['ok', 'caution', 'alert', 'no_data']).toContain(status));
    }
  });

  it('lists the organ cards behind a segment', () => {
    expect(organsForSegment(fixtures.habC1, 'head').map(c => c.organ)).toEqual(['brain', 'eyes']);
    expect(organsForSegment(fixtures.habC1, 'left_upper_arm').map(c => c.organ)).toEqual(['blood', 'limbs']);
    expect(organsForSegment(fixtures.habC1, 'left_thigh').map(c => c.organ)).toEqual(['musculoskeletal', 'limbs']);
    expect(organsForSegment(fixtures.habC1, 'neck')).toEqual([]);
  });
});

describe('segmentStatusFromReport: overlapping organs use the worst status', () => {
  it('chest = worst of heart and lungs; head = worst of brain and eyes', () => {
    const segments = segmentStatusFromReport(reportOf(
      card('brain', 'no_data'), card('eyes', 'no_data'), card('heart', 'alert'), card('lungs', 'ok'),
    ));
    expect(segments.chest).toBe('alert');
    expect(segments.head).toBe('no_data');
    expect(segmentStatusFromReport(reportOf(card('brain', 'caution'), card('eyes', 'alert'))).head).toBe('alert');
    expect(segmentStatusFromReport(reportOf(card('brain', 'caution'), card('eyes', 'no_data'))).head).toBe('caution');
  });

  it('blood on the upper arms and musculoskeletal on the legs combine with limbs', () => {
    const segments = segmentStatusFromReport(reportOf(
      card('blood', 'caution'), card('musculoskeletal', 'alert'), card('limbs', 'ok'),
    ));
    expect(segments.left_upper_arm).toBe('caution');
    expect(segments.right_upper_arm).toBe('caution');
    expect(segments.left_forearm).toBe('ok');
    expect(segments.right_thigh).toBe('alert');
    expect(segments.left_lower_leg).toBe('alert');
    expect(segments.left_foot).toBe('ok');
  });

  it('exposure never colours the body', () => {
    const segments = segmentStatusFromReport(reportOf(card('exposure', 'alert')));
    expect(Object.values(segments)).not.toContain('alert');
  });
});

describe('limbSegmentStatus', () => {
  it('uses the limbs status for all limbs when the card is ok or no_data', () => {
    expect(limbSegmentStatus(card('limbs', 'no_data'))).toEqual({ left_arm: 'no_data', right_arm: 'no_data', left_leg: 'no_data', right_leg: 'no_data' });
  });

  it('colours every limb when a caution/alert card does not say which limb', () => {
    expect(limbSegmentStatus(card('limbs', 'caution', { headline: 'Crush syndrome signs.' })))
      .toEqual({ left_arm: 'caution', right_arm: 'caution', left_leg: 'caution', right_leg: 'caution' });
  });

  it('identifies a limb from the headline alone', () => {
    expect(limbSegmentStatus(card('limbs', 'caution', { headline: 'Right arm: SpO2 drop of 7 points.' })))
      .toEqual({ left_arm: 'ok', right_arm: 'caution', left_leg: 'ok', right_leg: 'ok' });
  });

  it('takes each limb\'s own metric status when several limbs are named', () => {
    const limbs = card('limbs', 'alert', {
      headline: 'Left leg: no pulse.',
      metrics: [
        { name: 'Circulation: left leg', value: 0, unit: '%', status: 'alert' },
        { name: 'Circulation: right arm', value: 45, unit: '%', status: 'caution' },
        { name: 'Circulation: left arm', value: 100, unit: '%', status: 'ok' },
      ],
    });
    expect(limbSegmentStatus(limbs)).toEqual({ left_arm: 'ok', right_arm: 'caution', left_leg: 'alert', right_leg: 'ok' });
  });

  it('falls back to a failing wearable to locate the limb (devices[].limb)', () => {
    const limbs = card('limbs', 'caution', { headline: 'One limb sensor is not reporting.' });
    const devices = [
      { limb: 'left_arm', status: 'ok' },
      { limb: 'right_leg', state: 'disconnected', status: 'alert' },
      { limb: 'head_eeg', status: 'alert' },
    ];
    expect(limbSegmentStatus(limbs, devices)).toEqual({ left_arm: 'ok', right_arm: 'ok', left_leg: 'ok', right_leg: 'caution' });
  });

  it('a failing wearable alone never colours a limb when the limbs card is ok', () => {
    const report = { organs: [card('limbs', 'ok')], devices: [{ limb: 'right_arm', state: 'disconnected', status: 'alert' }] };
    expect(segmentStatusFromReport(report).right_hand).toBe('ok');
  });
});

describe('GLB mesh names', () => {
  it('translates the swapped torso meshes and leaves every other mesh name as is', () => {
    expect(segmentForMesh('abdomen')).toBe('chest');
    expect(segmentForMesh('chest')).toBe('abdomen');
    expect(meshForSegment('chest')).toBe('abdomen');
    expect(segmentForMesh('left_thigh')).toBe('left_thigh');
    expect(meshForSegment('head')).toBe('head');
  });
});

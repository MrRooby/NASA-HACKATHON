import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROOM_ID, EXTERIOR_ZONES, MAPPED_ZONES, ROOMS, ROOM_IDS, SIMULATED_ROOM_IDS, getRoom, locateZone, roomForZone,
} from './layout.js';
import { ROOM_PATHS, VIEW_H, VIEW_W, edgeY, sampleEdge } from './geometry.js';
import { locales } from '../i18n/index.js';
import { habitatFixtures } from './testHelpers.js';

describe('habitat layout', () => {
  it('has the ten rooms of the reference plan, three of them simulated', () => {
    expect(ROOM_IDS).toEqual([
      'airlock_1', 'airlock_2', 'service', 'medbay', 'recreation', 'lab',
      'quarters_north', 'quarters_south', 'technical', 'reactor',
    ]);
    expect(SIMULATED_ROOM_IDS).toEqual(['service', 'technical', 'reactor']);
    for (const room of ROOMS) {
      expect(room.simulated).toBe(room.zone === null);
      expect(Array.isArray(room.subZones)).toBe(true);
    }
    expect(getRoom(DEFAULT_ROOM_ID).zone).toBe('tunnel_common');
    expect(getRoom('nope')).toBeNull();
  });

  it('maps rooms to database zones as agreed', () => {
    const zones = Object.fromEntries(ROOMS.map(room => [room.id, room.zone]));
    expect(zones).toEqual({
      airlock_1: 'airlock_A', airlock_2: 'airlock_B', service: null, medbay: 'ambulatory',
      recreation: 'tunnel_common', lab: 'lab', quarters_north: 'module_M1', quarters_south: 'module_M2',
      technical: null, reactor: null,
    });
    expect(getRoom('recreation').subZones).toEqual(['gym', 'farm']);
    expect(EXTERIOR_ZONES).toEqual(['surface', 'cupola_1', 'cupola_2', 'cupola_3', 'cupola_4']);
  });

  it.each([142, 380, 600])('places every database zone of sol %i exactly once', sol => {
    const codes = habitatFixtures[sol].zones.map(zone => zone.code);
    expect(codes).toHaveLength(14);
    for (const code of codes) {
      const asRoom = ROOMS.filter(room => room.zone === code).length;
      const asSubZone = ROOMS.filter(room => room.subZones.includes(code)).length;
      const asExterior = EXTERIOR_ZONES.filter(zone => zone === code).length;
      expect([code, asRoom + asSubZone + asExterior]).toEqual([code, 1]);
      expect(locateZone(code)).not.toBeNull();
    }
    // and the layout does not invent database zones
    expect([...MAPPED_ZONES].sort()).toEqual([...codes].sort());
    expect(new Set(MAPPED_ZONES).size).toBe(MAPPED_ZONES.length);
  });

  it('locates zones', () => {
    expect(locateZone('module_M1')).toEqual({ kind: 'room', roomId: 'quarters_north' });
    expect(locateZone('farm')).toEqual({ kind: 'subzone', roomId: 'recreation' });
    expect(locateZone('cupola_2')).toEqual({ kind: 'exterior', roomId: null });
    expect(locateZone('unknown_zone')).toBeNull();
    expect(roomForZone('airlock_B').id).toBe('airlock_2');
    expect(roomForZone('gym').id).toBe('recreation');
    expect(roomForZone('surface')).toBeNull();
  });

  it('gives every room a closed path inside the view box, anchors and translated labels', () => {
    for (const room of ROOMS) {
      expect(room.path).toBe(ROOM_PATHS[room.id]);
      expect(room.path).toMatch(/^M[\d. -]+( L[\d. -]+)+ Z$/);
      const numbers = room.path.match(/-?\d+(\.\d+)?/g).map(Number);
      const xs = numbers.filter((_, index) => index % 2 === 0);
      const ys = numbers.filter((_, index) => index % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(VIEW_W);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(VIEW_H);
      // label and crew anchors lie within the room's bounding box
      for (const anchor of [room.label, room.crew]) {
        expect(anchor.x).toBeGreaterThan(Math.min(...xs));
        expect(anchor.x).toBeLessThan(Math.max(...xs));
        expect(anchor.y).toBeGreaterThan(Math.min(...ys));
        expect(anchor.y).toBeLessThan(Math.max(...ys));
      }
      for (const key of [room.labelKey, room.mapLabelKey].filter(Boolean)) {
        const name = key.replace(/^base\./, '');
        expect(locales.en.base[name], key).toBeTruthy();
        expect(locales.pl.base[name], key).toBeTruthy();
      }
    }
  });

  it('rooms run west to east in the order of the plan', () => {
    const centre = id => {
      const numbers = getRoom(id).path.match(/-?\d+(\.\d+)?/g).map(Number);
      const xs = numbers.filter((_, index) => index % 2 === 0);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    expect(centre('airlock_1')).toBeLessThan(centre('airlock_2'));
    expect(centre('airlock_2')).toBeLessThan(centre('medbay'));
    expect(centre('service')).toBeLessThan(centre('recreation'));
    expect(centre('recreation')).toBeLessThan(centre('quarters_north'));
    expect(centre('lab')).toBeLessThan(centre('quarters_south'));
    expect(centre('quarters_north')).toBeLessThan(centre('technical'));
    expect(centre('technical')).toBeLessThan(centre('reactor'));
  });

  it('edge interpolation passes through its control points and samples both ways', () => {
    const points = [[0, 10], [10, 20], [30, 0]];
    expect(edgeY(points, 0)).toBe(10);
    expect(edgeY(points, 10)).toBeCloseTo(20);
    expect(edgeY(points, 30)).toBe(0);
    expect(edgeY(points, -5)).toBe(10);
    const forward = sampleEdge(points, 0, 30, 10);
    expect(forward.map(([x]) => x)).toEqual([0, 10, 20, 30]);
    expect(sampleEdge(points, 30, 0, 10)).toEqual([...forward].reverse());
  });
});

import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { HOVER_COLOR, STATUS_COLORS, paintSegments, segmentColor } from './segmentTint.js';
import { prepareBody } from './bodyShading.js';

// Two boxes touching at z = 0 stand in for two body segments of the GLB.
function model(names = ['left_thigh', 'left_lower_leg']) {
  const scene = new Group();
  names.forEach((name, i) => {
    const geometry = new BoxGeometry(0.2, 0.2, 0.5, 2, 2, 8).translate(0, 0, i === 0 ? 0.25 : -0.25);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: i === 0 ? '#7eb8ca' : '#5484a0' }));
    mesh.name = name;
    scene.add(mesh);
  });
  return scene;
}
const colorAt = (mesh, i) => new Color(...mesh.geometry.attributes.color.array.slice(i * 3, i * 3 + 3));
const vertexFarFromSeam = mesh => {
  const pos = mesh.geometry.attributes.position;
  let best = 0;
  for (let i = 0; i < pos.count; i += 1) if (Math.abs(pos.getZ(i)) > Math.abs(pos.getZ(best))) best = i;
  return best;
};
const vertexOnSeam = mesh => {
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) if (Math.abs(pos.getZ(i)) < 1e-6) return i;
  return -1;
};
const close = (a, b, eps = 0.02) => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;

describe('segment colours', () => {
  it('alert and caution get the full theme colour; ok is a quiet green; no status keeps the model colour', () => {
    const original = new Color('#7eb8ca');
    expect(segmentColor('left_thigh', { left_thigh: 'alert' }, original).getHexString()).toBe(new Color(STATUS_COLORS.alert).getHexString());
    expect(segmentColor('left_thigh', { left_thigh: 'caution' }, original).getHexString()).toBe(new Color(STATUS_COLORS.caution).getHexString());
    const ok = segmentColor('left_thigh', { left_thigh: 'ok' }, original);
    expect(ok.getHexString()).not.toBe(new Color(STATUS_COLORS.ok).getHexString());
    expect(ok.g).toBeGreaterThan(ok.r);
    expect(segmentColor('left_thigh', undefined, original).getHexString()).toBe(original.getHexString());
    expect(segmentColor('neck', { left_thigh: 'ok' }, original).getHexString()).toBe(new Color('#8b939b').getHexString());
    expect(segmentColor('left_thigh', { left_thigh: 'ok' }, original, 'left_thigh').getHexString()).toBe(new Color(HOVER_COLOR).getHexString());
  });
});

describe('body shading on the GLTF scene', () => {
  it('replaces the materials with vertex-coloured smooth ones, once', () => {
    const scene = model();
    const first = prepareBody(scene);
    expect(prepareBody(scene)).toBe(first);
    for (const mesh of first.meshes) {
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.geometry.attributes.normal.count).toBe(mesh.geometry.attributes.position.count);
    }
  });

  it('paints each segment its colour and blends the two colours at the seam (no hard zigzag border)', () => {
    const scene = model();
    paintSegments(scene, { left_thigh: 'alert', left_lower_leg: 'ok' });
    const [thigh, shin] = prepareBody(scene).meshes;
    const red = new Color(STATUS_COLORS.alert);
    const quietGreen = segmentColor('left_lower_leg', { left_lower_leg: 'ok' }, null);
    expect(close(colorAt(thigh, vertexFarFromSeam(thigh)), red)).toBe(true);
    expect(close(colorAt(shin, vertexFarFromSeam(shin)), quietGreen)).toBe(true);
    // On the seam both meshes show the same 50/50 mix, so the border is continuous.
    const a = colorAt(thigh, vertexOnSeam(thigh));
    const b = colorAt(shin, vertexOnSeam(shin));
    expect(close(a, b, 0.001)).toBe(true);
    expect(close(a, red)).toBe(false);
  });

  it('hover paints the hovered segment and returns to the status colour afterwards', () => {
    const scene = model();
    const status = { left_thigh: 'caution' };
    paintSegments(scene, status, 'left_thigh');
    const [thigh] = prepareBody(scene).meshes;
    const far = vertexFarFromSeam(thigh);
    expect(close(colorAt(thigh, far), new Color(HOVER_COLOR))).toBe(true);
    paintSegments(scene, status, null);
    expect(close(colorAt(thigh, far), new Color(STATUS_COLORS.caution))).toBe(true);
  });

  it('paints the upper-torso mesh (named "abdomen" in the GLB) with the anatomical chest status', () => {
    const scene = model(['chest', 'abdomen']);
    paintSegments(scene, { chest: 'alert', abdomen: 'caution' });
    const [lowerMesh, upperMesh] = prepareBody(scene).meshes; // GLB "chest" = belly, GLB "abdomen" = ribcage
    expect(close(colorAt(upperMesh, vertexFarFromSeam(upperMesh)), new Color(STATUS_COLORS.alert))).toBe(true);
    expect(close(colorAt(lowerMesh, vertexFarFromSeam(lowerMesh)), new Color(STATUS_COLORS.caution))).toBe(true);
  });
});

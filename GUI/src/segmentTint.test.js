import { describe, expect, it } from 'vitest';
import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { HOVER_COLOR, STATUS_COLORS, applySegmentTint, baseColors, clearSegmentTint, setColors, setHighlight } from './segmentTint.js';

function model() {
  const scene = new Group();
  for (const [name, color] of [['head', '#b8d6e0'], ['neck', '#aecdd8'], ['left_thigh', '#7eb8ca']]) {
    const mesh = new Mesh(undefined, new MeshStandardMaterial({ color }));
    mesh.name = name;
    scene.add(mesh);
  }
  return scene;
}
const byName = (scene, name) => scene.getObjectByName(name);
const hex = (scene, name) => byName(scene, name).material.color.getHexString();

describe('segment tint on the GLTF scene', () => {
  it('tints meshes towards their status colour and leaves others untouched', () => {
    const scene = model();
    const neckBefore = hex(scene, 'neck');
    applySegmentTint(scene, { head: 'ok', left_thigh: 'alert' });
    const alert = new Color(STATUS_COLORS.alert);
    const thigh = byName(scene, 'left_thigh').material.color;
    // Pulled most of the way to the alert red.
    expect(Math.abs(thigh.r - alert.r)).toBeLessThan(0.1);
    expect(Math.abs(thigh.g - alert.g)).toBeLessThan(0.1);
    expect(hex(scene, 'head')).not.toBe('b8d6e0');
    expect(hex(scene, 'neck')).toBe(neckBefore);
  });

  it('restores the status tint (not the original colour) after hover', () => {
    const scene = model();
    const status = { left_thigh: 'caution' };
    applySegmentTint(scene, status);
    const tinted = hex(scene, 'left_thigh');
    const thigh = byName(scene, 'left_thigh');
    setHighlight(thigh);
    expect(thigh.material.color.getHexString()).toBe(new Color(HOVER_COLOR).getHexString());
    setColors(thigh, baseColors(thigh, status));
    expect(hex(scene, 'left_thigh')).toBe(tinted);
  });

  it('without statuses (offline demo) keeps and restores the original colours', () => {
    const scene = model();
    applySegmentTint(scene, { head: 'alert' });
    applySegmentTint(scene, undefined);
    expect(hex(scene, 'head')).toBe('b8d6e0');
    applySegmentTint(scene, { head: 'alert' });
    clearSegmentTint(scene);
    expect(hex(scene, 'head')).toBe('b8d6e0');
  });
});

describe('swapped torso mesh names in the GLB', () => {
  it('paints the upper-torso mesh (named "abdomen" in the GLB) with the anatomical chest status', () => {
    const scene = new Group();
    for (const name of ['chest', 'abdomen']) {
      const mesh = new Mesh(undefined, new MeshStandardMaterial({ color: '#cccccc' }));
      mesh.name = name;
      scene.add(mesh);
    }
    applySegmentTint(scene, { chest: 'alert', abdomen: 'caution' });
    const red = new Color(STATUS_COLORS.alert);
    const amber = new Color(STATUS_COLORS.caution);
    const upper = byName(scene, 'abdomen').material.color;   // GLB "abdomen" = ribcage
    const lower = byName(scene, 'chest').material.color;     // GLB "chest" = belly
    expect(Math.abs(upper.r - red.r) + Math.abs(upper.g - red.g)).toBeLessThan(0.15);
    expect(Math.abs(lower.r - amber.r) + Math.abs(lower.g - amber.g)).toBeLessThan(0.15);
  });
});

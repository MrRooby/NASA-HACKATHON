import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { cloneBodyScene, fitDistance, normalizeBody, paintBody } from './bodyScene.js';
import { STATUS_COLORS } from '../segmentTint.js';

// A tiny stand-in for the GLB: Z-up, mesh names as in the file (chest/abdomen swapped there).
function fakeScene() {
  const scene = new Group();
  const add = (name, z) => {
    const mesh = new Mesh(new BoxGeometry(0.4, 0.2, 0.3), new MeshStandardMaterial({ color: '#808080' }));
    mesh.name = name;
    mesh.position.z = z;
    scene.add(mesh);
    return mesh;
  };
  add('head', 1.6);
  add('abdomen', 1.2); // anatomical chest
  add('chest', 0.9); // anatomical abdomen
  add('left_thigh', 0.4);
  return scene;
}

const mesh = (scene, name) => scene.getObjectByName(name);
const grey = new Color('#808080');

describe('cloneBodyScene', () => {
  it('copies objects and materials, so tinting a clone leaves the source and other clones alone', () => {
    const source = fakeScene();
    const a = cloneBodyScene(source);
    const b = cloneBodyScene(source);
    expect(mesh(a, 'head')).not.toBe(mesh(source, 'head'));
    expect(mesh(a, 'head').material).not.toBe(mesh(source, 'head').material);
    expect(mesh(a, 'head').material).not.toBe(mesh(b, 'head').material);
    expect(mesh(a, 'head').geometry).toBe(mesh(source, 'head').geometry); // geometry stays shared

    paintBody(a, { head: 'alert' });
    expect(mesh(a, 'head').material.color.equals(grey)).toBe(false);
    expect(mesh(b, 'head').material.color.equals(grey)).toBe(true);
    expect(mesh(source, 'head').material.color.equals(grey)).toBe(true);
  });

  it('starts from the original colours even when the shared source was tinted before', () => {
    const source = fakeScene();
    cloneBodyScene(source); // records the originals on the source
    mesh(source, 'head').material.color.set('#ff0000');
    const copy = cloneBodyScene(source);
    expect(mesh(copy, 'head').material.color.equals(grey)).toBe(true);
  });
});

describe('paintBody', () => {
  it('tints anatomical segments (chest -> mesh "abdomen") towards the status colour', () => {
    const scene = cloneBodyScene(fakeScene());
    paintBody(scene, { chest: 'alert', abdomen: 'ok' });
    const alert = new Color(STATUS_COLORS.alert);
    const chestMesh = mesh(scene, 'abdomen').material.color;
    expect(chestMesh.r).toBeGreaterThan(chestMesh.g);
    expect(Math.abs(chestMesh.r - alert.r)).toBeLessThan(0.2);
    // No status -> the model's own colour.
    expect(mesh(scene, 'left_thigh').material.color.equals(grey)).toBe(true);
  });

  it('glows the selected segments in the accent and the hovered one in the hover colour', () => {
    const scene = cloneBodyScene(fakeScene());
    paintBody(scene, {}, { selected: ['chest'], hovered: 'head', accent: '#00ff00', hover: '#0000ff' });
    expect(mesh(scene, 'abdomen').material.emissive.getHexString()).toBe('00ff00');
    expect(mesh(scene, 'head').material.emissive.getHexString()).toBe('0000ff');
    expect(mesh(scene, 'chest').material.emissive.getHexString()).toBe('000000');
    paintBody(scene, {}, { selected: [] });
    expect(mesh(scene, 'abdomen').material.emissive.getHexString()).toBe('000000');
  });
});

describe('framing', () => {
  it('normalizes the Z-up model to a fixed height centred at the origin', () => {
    const fit = normalizeBody(fakeScene(), 2);
    expect(fit.halfHeight).toBe(1);
    expect(fit.scale).toBeGreaterThan(0);
    expect(fit.radius).toBeGreaterThanOrEqual(fit.halfWidth);
    expect(fit.offset).toHaveLength(3);
  });

  it('moves the camera back for narrow boxes', () => {
    const size = { halfHeight: 1, halfWidth: 0.5 };
    expect(fitDistance(size, 0.3, 24)).toBeGreaterThan(fitDistance(size, 1, 24));
    expect(fitDistance(size, 1, 24, 1.2)).toBeGreaterThan(fitDistance(size, 1, 24, 1));
  });
});

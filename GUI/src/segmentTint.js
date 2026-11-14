import { Color } from 'three';
import { segmentForMesh } from './organSegments.js';

// Status colours of the body map; same values as .body-zone-* / .legend-* in styles.css.
export const STATUS_COLORS = {
  ok: '#4ea891',
  caution: '#d49542',
  alert: '#cf6c6c',
  no_data: '#a3b1b7',
};

export const HOVER_COLOR = '#ffd166';

// How far the model colour is pulled towards the status colour (1 = flat status colour).
const TINT_AMOUNT = 0.82;

const materialsOf = object => (Array.isArray(object.material) ? object.material : [object.material]);

/**
 * Original material colours, remembered once per mesh on the (cached, shared) GLTF
 * scene itself so a later viewer mount never mistakes a tint for the original.
 */
export function originalColors(object) {
  if (!object.userData.__originalColors) {
    object.userData.__originalColors = materialsOf(object).map(material => material?.color?.clone() ?? null);
  }
  return object.userData.__originalColors;
}

/** Colours a mesh should show when it is not hovered: status tint, or the original colour. */
export function baseColors(object, segmentStatus) {
  const originals = originalColors(object);
  const status = segmentStatus?.[segmentForMesh(object.name)];
  const target = status && STATUS_COLORS[status];
  if (!target) return originals;
  const tint = new Color(target);
  return originals.map(color => (color ? color.clone().lerp(tint, TINT_AMOUNT) : null));
}

export function setColors(object, colors) {
  materialsOf(object).forEach((material, index) => {
    if (material?.color && colors[index]) material.color.copy(colors[index]);
  });
}

export function setHighlight(object, color = HOVER_COLOR) {
  materialsOf(object).forEach(material => {
    if (material?.color) material.color.set(color);
  });
}

/** Paint every mesh of the scene with its base colour (status tint or original). */
export function applySegmentTint(scene, segmentStatus) {
  scene.traverse(object => {
    if (!object.isMesh || !object.material) return;
    setColors(object, baseColors(object, segmentStatus));
  });
}

/** Restore the model's own colours (on unmount). */
export function clearSegmentTint(scene) {
  scene.traverse(object => {
    if (!object.isMesh || !object.material) return;
    setColors(object, originalColors(object));
  });
}

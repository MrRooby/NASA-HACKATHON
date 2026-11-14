import { Box3, Color, Vector3 } from 'three';
import { segmentForMesh } from '../organSegments.js';
import { baseColors, originalColors, setColors } from '../segmentTint.js';
import { MODEL_HOVER_COLOR, getCurrentTheme } from '../theme/index.js';

// Helpers behind <BodyModel>. They only use three.js core (no WebGL), so they are unit-testable.

const materialsOf = object => (Array.isArray(object.material) ? object.material : [object.material]);

function meshesOf(root) {
  const list = [];
  root.traverse(object => { if (object.isMesh) list.push(object); });
  return list;
}

/**
 * Independent copy of the (cached, shared) GLTF scene: own Object3Ds AND own materials, so several
 * models on one page can be tinted / highlighted without touching each other. The GLB has no skins,
 * so Object3D.clone(true) is enough (no SkeletonUtils). Every cloned mesh remembers the ORIGINAL
 * colours of the source (never a tint some other viewer may have painted on the shared scene).
 */
export function cloneBodyScene(source) {
  const sourceMeshes = meshesOf(source);
  const originals = sourceMeshes.map(mesh => originalColors(mesh));
  const copy = source.clone(true);
  meshesOf(copy).forEach((mesh, index) => {
    const materials = materialsOf(mesh).map(material => material?.clone() ?? material);
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    mesh.userData.__originalColors = (originals[index] || []).map(color => color?.clone() ?? null);
    setColors(mesh, mesh.userData.__originalColors);
  });
  return copy;
}

/**
 * Paint every mesh: status tint (or the model's own colour), then an emissive glow for the
 * selected segments (theme accent) and the hovered one (hover colour). Returns the scene.
 */
export function paintBody(scene, segmentStatus, { selected = [], hovered = null, accent, hover = MODEL_HOVER_COLOR } = {}) {
  const accentColor = new Color(accent ?? getCurrentTheme().colors.accentBright);
  const hoverColor = new Color(hover);
  const selectedSet = new Set(selected);
  scene.traverse(object => {
    if (!object.isMesh || !object.material) return;
    setColors(object, baseColors(object, segmentStatus));
    const segment = segmentForMesh(object.name);
    let glow = null;
    let intensity = 0;
    if (segment === hovered) { glow = hoverColor; intensity = 0.55; }
    else if (selectedSet.has(segment)) { glow = accentColor; intensity = 0.7; }
    materialsOf(object).forEach(material => {
      if (!material?.emissive) return;
      if (glow) {
        material.emissive.copy(glow);
        material.emissiveIntensity = intensity;
      } else {
        material.emissive.setRGB(0, 0, 0);
        material.emissiveIntensity = 1;
      }
    });
  });
  return scene;
}

/**
 * Scale + offset that put the model (after its Z-up -> Y-up turn) centred at the origin with a
 * height of `height` units. `radius` is the largest horizontal distance from the vertical axis,
 * i.e. how wide the model can get while it spins.
 */
export function normalizeBody(scene, height = 2) {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  // The scene is Z-up; the wrapper turns it by -90 deg about X (z -> y, y -> -z).
  const tall = size.z || 1;
  const scale = height / tall;
  // While spinning, the widest horizontal reach is about the larger of the two half extents
  // (arm tips); the bbox diagonal would over-estimate it and shrink the model.
  const radius = Math.max(size.x, size.y) / 2;
  return {
    scale,
    offset: [-center.x, -center.y, -center.z],
    halfWidth: (size.x / 2) * scale,
    radius: radius * scale,
    halfHeight: height / 2,
  };
}

/**
 * Camera distance so a model of halfHeight x halfWidth fills a viewport of the given aspect
 * (vertical fov in degrees) with `margin` (> 1 leaves air around it).
 */
export function fitDistance({ halfHeight, halfWidth, depth = 0 }, aspect, fov, margin = 1.08) {
  const tan = Math.tan((fov * Math.PI) / 360);
  const byHeight = (halfHeight * margin) / tan;
  const byWidth = (halfWidth * margin) / (tan * Math.max(aspect, 0.01));
  return Math.max(byHeight, byWidth) + depth;
}

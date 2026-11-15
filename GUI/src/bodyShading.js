import { BufferAttribute, Color, MeshStandardMaterial, Vector3 } from 'three';
import { segmentForMesh } from './organSegments.js';

// Shading of the segmented body model (public/models/anny_astronaut_bone_segmented.glb).
//
// The GLB has one mesh per body segment, positions only (no normals) and fairly big triangles,
// so out of the box it renders faceted and every colour border follows the saw-tooth of the
// triangle edges. prepareBody() fixes both, once per loaded scene:
//   - smooth normals averaged over the WHOLE body (also across segment seams);
//   - per-vertex colour blending: a vertex closer than BLEND_RADIUS to another segment takes
//     part of that segment's colour, so borders become a short soft gradient instead of a zigzag.
// paintBody() then writes the vertex colours for a { segment -> Color } map.

const BLEND_FRACTION = 0.03; // blend radius as a fraction of the model height (~5 cm)
const KEY_DIGITS = 1e4; // positions closer than 0.1 mm are the same point (seams are duplicated)

const keyOf = (x, y, z) => `${Math.round(x * KEY_DIGITS)}|${Math.round(y * KEY_DIGITS)}|${Math.round(z * KEY_DIGITS)}`;

function meshesOf(scene) {
  const list = [];
  scene.traverse(object => { if (object.isMesh && object.geometry?.attributes?.position) list.push(object); });
  return list;
}

function smoothNormals(meshes) {
  const sums = new Map();
  const a = new Vector3(); const b = new Vector3(); const c = new Vector3();
  const ab = new Vector3(); const ac = new Vector3();
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
      const n = ab.subVectors(b, a).cross(ac.subVectors(c, a)); // area-weighted face normal
      for (const [p, v] of [[a, ia], [b, ib], [c, ic]]) {
        void v;
        const key = keyOf(p.x, p.y, p.z);
        const sum = sums.get(key);
        if (sum) sum.add(n); else sums.set(key, n.clone());
      }
    }
  }
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const normals = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const n = sums.get(keyOf(pos.getX(i), pos.getY(i), pos.getZ(i)));
      const v = n ? n.clone().normalize() : new Vector3(0, 0, 1);
      normals[i * 3] = v.x; normals[i * 3 + 1] = v.y; normals[i * 3 + 2] = v.z;
    }
    mesh.geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  }
}

/** For every vertex near another segment: [{ segment, weight }] (weight 1 at the seam, 0 at the radius). */
function blendWeights(meshes, radius) {
  const cell = radius;
  const grid = new Map();
  const cellKey = (x, y, z) => `${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`;
  meshes.forEach((mesh, meshIndex) => {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const key = cellKey(pos.getX(i), pos.getY(i), pos.getZ(i));
      let bucket = grid.get(key);
      if (!bucket) { bucket = []; grid.set(key, bucket); }
      bucket.push(meshIndex, pos.getX(i), pos.getY(i), pos.getZ(i));
    }
  });

  return meshes.map((mesh, meshIndex) => {
    const own = mesh.userData.__segment;
    const pos = mesh.geometry.attributes.position;
    const perVertex = new Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const cx = Math.floor(x / cell); const cy = Math.floor(y / cell); const cz = Math.floor(z / cell);
      const nearest = new Map(); // segment -> min distance
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = grid.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k += 4) {
          const other = meshes[bucket[k]].userData.__segment;
          if (bucket[k] === meshIndex || other === own) continue;
          const d = Math.hypot(bucket[k + 1] - x, bucket[k + 2] - y, bucket[k + 3] - z);
          if (d < radius && d < (nearest.get(other) ?? Infinity)) nearest.set(other, d);
        }
      }
      perVertex[i] = nearest.size
        ? [...nearest].map(([segment, d]) => ({ segment, weight: (1 - d / radius) ** 2 }))
        : null;
    }
    return perVertex;
  });
}

/** One-time preparation of a loaded GLTF scene (idempotent: the scene is cached by useGLTF). */
export function prepareBody(scene) {
  if (scene.userData.__bodyPrepared) return scene.userData.__bodyPrepared;
  const meshes = meshesOf(scene);
  let minZ = Infinity; let maxZ = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const mesh of meshes) {
    mesh.userData.__segment = segmentForMesh(mesh.name);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    mesh.userData.__originalColor = material?.color?.clone() ?? new Color('#9fb7c0');
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    minZ = Math.min(minZ, box.min.z); maxZ = Math.max(maxZ, box.max.z);
    minY = Math.min(minY, box.min.y); maxY = Math.max(maxY, box.max.y);
  }
  const height = Math.max(maxZ - minZ, maxY - minY, 1e-3);
  smoothNormals(meshes);
  const weights = blendWeights(meshes, height * BLEND_FRACTION);
  meshes.forEach((mesh, i) => {
    mesh.userData.__blend = weights[i];
    mesh.geometry.setAttribute('color', new BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 3), 3));
    mesh.material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
  });
  const prepared = { meshes, segments: [...new Set(meshes.map(mesh => mesh.userData.__segment))] };
  scene.userData.__bodyPrepared = prepared;
  return prepared;
}

/**
 * Write vertex colours: colorOf(segment, originalColor) -> Color for every segment;
 * borders between segments blend over the prepared radius.
 */
export function paintBody(scene, colorOf) {
  const { meshes, segments } = prepareBody(scene);
  const original = Object.fromEntries(meshes.map(mesh => [mesh.userData.__segment, mesh.userData.__originalColor]));
  const colors = Object.fromEntries(segments.map(segment => [segment, colorOf(segment, original[segment])]));
  const mixed = new Color();
  for (const mesh of meshes) {
    const own = colors[mesh.userData.__segment];
    const attr = mesh.geometry.attributes.color;
    const blend = mesh.userData.__blend;
    for (let i = 0; i < attr.count; i += 1) {
      const near = blend[i];
      if (!near) { attr.setXYZ(i, own.r, own.g, own.b); continue; }
      let total = 1;
      mixed.copy(own);
      for (const { segment, weight } of near) {
        const c = colors[segment];
        mixed.r += c.r * weight; mixed.g += c.g * weight; mixed.b += c.b * weight;
        total += weight;
      }
      attr.setXYZ(i, mixed.r / total, mixed.g / total, mixed.b / total);
    }
    attr.needsUpdate = true;
  }
}

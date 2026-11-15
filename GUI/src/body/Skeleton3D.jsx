import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CapsuleGeometry, Color, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { HOVER_COLOR, STATUS_COLORS } from '../segmentTint.js';
import { getCurrentTheme, subscribeTheme } from '../theme/index.js';

// Skeleton view of one crew member: capsules between the Anny joints of that person's body
// (public/models/<model>.skeleton.json, written by scripts/generate_crew_models.py), a skull and
// the rib cage. Each piece belongs to an anatomical segment and is coloured by bone status.

export const skeletonPath = model => `/models/${model}.skeleton.json`;
const BONE_IVORY = '#d9cfbd';
const UP = new Vector3(0, 1, 0);
const RIB_TILT = 0.55; // rad, rib cage slope in the model's Z-up frame
const RIB_TUBE = 0.0045; // m, rib thickness

/** Colour of a bone: ivory when fine (quiet display), the theme colour for caution / alert. */
export function boneColor(status, hovered) {
  if (hovered) return new Color(HOVER_COLOR);
  if (status === 'caution' || status === 'alert') return new Color(STATUS_COLORS[status]);
  if (status === 'no_data') return new Color(STATUS_COLORS.no_data).lerp(new Color(BONE_IVORY), 0.4);
  return new Color(BONE_IVORY);
}

export function useSkeleton(model) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!model) { setData(null); return undefined; }
    let alive = true;
    fetch(skeletonPath(model)).then(r => (r.ok ? r.json() : null)).then(json => { if (alive) setData(json); }).catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [model]);
  return data;
}

function Bone({ a, b, r, ...rest }) {
  const { position, quaternion, geometry } = useMemo(() => {
    const va = new Vector3(...a); const vb = new Vector3(...b);
    const dir = vb.clone().sub(va);
    const length = Math.max(0.001, dir.length() - r * 1.2);
    return {
      position: va.clone().add(vb).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, dir.normalize()),
      geometry: new CapsuleGeometry(r, length, 6, 14),
    };
  }, [a, b, r]);
  return <mesh position={position} quaternion={quaternion} geometry={geometry} {...rest} />;
}

/**
 * props: data (skeleton json), status ({ segment: status }), onSegmentHover(segment|null), onSegmentClick(segment).
 * Rendered in the model's Z-up frame (the caller rotates it like the body).
 */
export default function Skeleton3D({ data, status, onSegmentHover, onSegmentClick }) {
  const [hovered, setHovered] = useState(null);
  useSyncExternalStore(subscribeTheme, getCurrentTheme, getCurrentTheme); // repaint on theme change
  const skull = useMemo(() => new SphereGeometry(1, 28, 20), []);
  if (!data) return null;
  const handlers = seg => ({
    onPointerOver: e => { e.stopPropagation(); setHovered(seg); onSegmentHover?.(seg); },
    onPointerOut: e => { e.stopPropagation(); setHovered(null); onSegmentHover?.(null); },
    onClick: e => { e.stopPropagation(); onSegmentClick?.(seg); },
  });
  const material = seg => <meshStandardMaterial color={boneColor(status?.[seg] ?? 'ok', hovered === seg)} roughness={0.55} metalness={0.05} />;
  return (
    <group>
      {data.bones.map((bone, i) => (
        <Bone key={i} a={bone.a} b={bone.b} r={bone.r} {...handlers(bone.seg)}>{material(bone.seg)}</Bone>
      ))}
      {data.skull ? (
        <mesh geometry={skull} position={data.skull.c} scale={[data.skull.r * 0.82, data.skull.r * 0.95, data.skull.r]} {...handlers('head')}>
          {material('head')}
        </mesh>
      ) : null}
      {(data.ribs || []).map((rib, i) => (
        // ribs slope down towards the front, so from the front they read as arcs, not flat bars
        <mesh key={`rib${i}`} position={rib.c} rotation={[RIB_TILT, 0, 0]} scale={[rib.rx, rib.ry, 1]} {...handlers(rib.seg)}>
          <primitive object={new TorusGeometry(1, RIB_TUBE / Math.max(rib.rx, rib.ry), 6, 48)} attach="geometry" />
          {material(rib.seg)}
        </mesh>
      ))}
    </group>
  );
}

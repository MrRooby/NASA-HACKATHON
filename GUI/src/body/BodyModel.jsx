import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { segmentForMesh } from '../organSegments.js';
import { getCurrentTheme, subscribeTheme } from '../theme/index.js';
import { cloneBodyScene, fitDistance, normalizeBody, paintBody } from './bodyScene.js';
import './body.css';

export const BODY_MODEL_PATH = '/models/anny_astronaut_bone_segmented.glb';

// One download + parse for every instance (useGLTF caches by URL).
if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') useGLTF.preload(BODY_MODEL_PATH);

const FOV = 24;
const SPIN_SPEED = 0.45; // rad / s

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener?.('change', callback);
  return () => query.removeEventListener?.('change', callback);
}
const getReduced = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED_QUERY).matches : false);

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false);
}

function Body({ segmentStatus, spin, phase, interactive, selectedSegments, onSegmentClick, onSegmentHover, onHoverChange }) {
  const { scene: source } = useGLTF(BODY_MODEL_PATH);
  const scene = useMemo(() => cloneBodyScene(source), [source]);
  const fit = useMemo(() => normalizeBody(scene), [scene]);
  const spinner = useRef();
  const [hovered, setHovered] = useState(null);
  const theme = useSyncExternalStore(subscribeTheme, getCurrentTheme, getCurrentTheme);
  const camera = useThree(state => state.camera);
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);

  // Free the cloned materials (geometry is shared with the cache and stays).
  useEffect(() => () => {
    scene.traverse(object => {
      if (!object.isMesh) return;
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material?.dispose?.());
    });
  }, [scene]);

  const selectedKey = (selectedSegments || []).join('|');
  useLayoutEffect(() => {
    paintBody(scene, segmentStatus, { selected: selectedSegments || [], hovered: interactive ? hovered : null });
    invalidate();
  }, [scene, segmentStatus, selectedKey, hovered, interactive, theme, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fixed front camera that makes the model fill the box (with room to spin when it rotates).
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    // Finger tips may touch the edge: the arms are the widest part only in the front view.
    const halfWidth = (spin ? fit.radius : fit.halfWidth) * 0.94;
    const distance = fitDistance({ halfHeight: fit.halfHeight, halfWidth, depth: fit.radius * 0.2 }, aspect, FOV, 1.02);
    camera.position.set(0, 0, distance);
    camera.near = 0.05;
    camera.far = distance + 10;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, fit, spin, invalidate]);

  useEffect(() => {
    if (spinner.current) spinner.current.rotation.y = phase || 0;
  }, [phase]);

  useFrame((_, delta) => {
    if (spin && spinner.current) spinner.current.rotation.y += Math.min(delta, 0.1) * SPIN_SPEED;
  });

  const setHover = segment => {
    setHovered(current => {
      if (current === segment) return current;
      onSegmentHover?.(segment);
      return segment;
    });
    onHoverChange?.(segment != null);
  };

  const handlers = interactive ? {
    onPointerOver: event => { event.stopPropagation(); setHover(segmentForMesh(event.object.name)); },
    onPointerOut: event => { event.stopPropagation(); setHover(null); },
    onClick: event => { event.stopPropagation(); onSegmentClick?.(segmentForMesh(event.object.name)); },
  } : {};

  return (
    <group ref={spinner}>
      <group scale={fit.scale}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group position={fit.offset}>
            <primitive object={scene} {...handlers} />
          </group>
        </group>
      </group>
    </group>
  );
}

class ModelBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div className="body-model-fault" role="img" aria-label="3D model unavailable">MODEL N/A</div>;
    return this.props.children;
  }
}

/**
 * Pixel-cockpit 3D body: status-tinted segments, fixed front camera, transparent background.
 *
 * segmentStatus     { anatomicalSegment: 'ok'|'caution'|'alert'|'no_data' } (segmentStatusFromReport / organSegments.js)
 * autoRotate        slow spin about the vertical axis (paused on hover / `paused`, off under prefers-reduced-motion)
 * interactive       hover + click on segments (pointer cursor)
 * selectedSegments  anatomical segments drawn with the accent glow
 * onSegmentClick(segment) / onSegmentHover(segment|null)
 * paused            stop the spin (e.g. while the parent tile is hovered)
 * phase             start angle in radians (so several spinning models are not in lock-step)
 * label             accessible name of the model
 *
 * Every instance clones the cached GLTF scene and its materials, so many models can share a page.
 */
export default function BodyModel({
  segmentStatus,
  autoRotate = false,
  interactive = true,
  selectedSegments = [],
  onSegmentClick,
  onSegmentHover,
  className,
  cameraMode = 'front', // eslint-disable-line no-unused-vars -- only 'front' exists for now
  paused = false,
  phase = 0,
  label = 'Astronaut body model',
}) {
  const reduced = usePrefersReducedMotion();
  const [overModel, setOverModel] = useState(false);
  const [overSegment, setOverSegment] = useState(false);
  const spin = autoRotate && !reduced;
  const spinning = spin && !paused && !overModel;

  return (
    <div
      className={['body-model', interactive && 'body-model-interactive', overSegment && 'body-model-hot', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
      data-rotating={spinning ? 'true' : 'false'}
      onPointerEnter={autoRotate ? () => setOverModel(true) : undefined}
      onPointerLeave={autoRotate ? () => setOverModel(false) : undefined}
    >
      <ModelBoundary>
        <Canvas
          frameloop={spinning ? 'always' : 'demand'}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          camera={{ position: [0, 0, 8], fov: FOV }}
          style={{ background: 'transparent' }}
          aria-hidden="true"
        >
          <ambientLight intensity={1.1} />
          <hemisphereLight args={['#ffffff', '#6b5a4a', 1.6]} />
          <directionalLight position={[2, 3, 6]} intensity={1.6} />
          <directionalLight position={[-3, 1, -4]} intensity={0.6} />
          <Suspense fallback={null}>
            <Body
              segmentStatus={segmentStatus}
              spin={spinning}
              phase={phase}
              interactive={interactive}
              selectedSegments={selectedSegments}
              onSegmentClick={onSegmentClick}
              onSegmentHover={onSegmentHover}
              onHoverChange={setOverSegment}
            />
          </Suspense>
        </Canvas>
      </ModelBoundary>
    </div>
  );
}

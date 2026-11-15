import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Box3, MOUSE, Vector3 } from 'three';
import landmarks from '../models/anny_astronaut_landmarks.json';
import { paintSegments } from './segmentTint.js';
import { prepareBody } from './bodyShading.js';
import { segmentForMesh } from './organSegments.js';
import { getCurrentTheme, subscribeTheme } from './theme/index.js';
import Skeleton3D, { useSkeleton } from './body/Skeleton3D.jsx';
import { boneStatus } from './body/boneStatus.js';
import { useT } from './i18n/index.js';
import { StatusTag } from './components/index.js';

export const DEFAULT_MODEL = 'anny_astronaut_bone_segmented';
/** '/models/<name>.glb'; every crew member has a model generated for their body (crewProfiles.model). */
export const modelPath = name => `/models/${name || DEFAULT_MODEL}.glb`;

/**
 * segmentStatus: optional { anatomicalSegment: 'ok' | 'caution' | 'alert' | 'no_data' } (see organSegments.js;
 *   the GLB's swapped chest/abdomen mesh names are translated there).
 * Without it the model keeps its own colours (offline demo).
 */
function AstronautModel({ model, onModelFrame, segmentStatus, onSegmentHover, onSegmentClick }) {
  const { scene } = useGLTF(modelPath(model));
  const modelGroup = useRef();
  const hovered = useRef(null); // hovered anatomical segment
  const statusRef = useRef(segmentStatus);
  statusRef.current = segmentStatus;
  prepareBody(scene); // smooth normals + soft colour borders (once per loaded scene)

  // The status colours belong to the UI theme: a theme switch repaints the model.
  const theme = useSyncExternalStore(subscribeTheme, getCurrentTheme, getCurrentTheme);

  useEffect(() => {
    paintSegments(scene, segmentStatus, hovered.current);
  }, [scene, segmentStatus, theme]);

  useEffect(() => () => { hovered.current = null; }, [scene]);

  const setHoveredObject = (object) => {
    const segment = object ? segmentForMesh(object.name) : null;
    if (hovered.current === segment) return;
    hovered.current = segment;
    paintSegments(scene, statusRef.current, segment);
    onSegmentHover?.(segment);
  };

  const handlePointerOver = (event) => {
    event.stopPropagation();
    setHoveredObject(event.object);
  };

  const clearHover = (event) => {
    event?.stopPropagation();
    setHoveredObject(null);
  };

  const handleClick = (event) => {
    event.stopPropagation();
    onSegmentClick?.(segmentForMesh(event.object.name));
  };

  useFrame(({ camera }) => {
    if (!onModelFrame || !modelGroup.current) return;
    const project = name => {
      const point = new Vector3(...landmarks.points[name].position);
      modelGroup.current.localToWorld(point);
      point.project(camera);
      return { x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
    };
    const projected = Object.entries(landmarks.points).map(([name, landmark]) => ({
      name,
      region: landmark.region,
      ...project(name),
    }));
    const edge = (regions, side) => projected
      .filter(point => regions.some(region => point.region === region))
      .sort((a, b) => side === 'min' ? a.x - b.x : b.x - a.x)[0];
    const leftArm = edge(['left_forearm', 'left_hand'], 'min');
    const rightArm = edge(['right_forearm', 'right_hand'], 'max');
    const leftLeg = edge(['left_lower_leg', 'left_foot'], 'min');
    const rightLeg = edge(['right_lower_leg', 'right_foot'], 'max');
    onModelFrame({
      leftArm: rightArm,
      rightArm: leftArm,
      leftLeg: rightLeg,
      rightLeg: leftLeg,
    });
  });

  return (
    <group ref={modelGroup} rotation={[-Math.PI / 2, 0, 0]}>
      <primitive
        object={scene}
        onPointerOver={handlePointerOver}
        onPointerOut={clearHover}
        onClick={handleClick}
      />
    </group>
  );
}

function LoadingState() {
  return <Html center className="model-viewer-status">LOADING MODEL...</Html>;
}

/**
 * Frame the whole body: the camera distance fits both the model height and its arm span to
 * the canvas (recomputed when the canvas is resized), so head, hands and feet are never cut.
 */
function FitCamera({ target, margin = 1.08, controls = false, refHeight = 0 }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const object = target.current;
    if (!object) return;
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const dims = box.getSize(new Vector3());
    // With a reference height every body is framed in the same 2 m box, feet on the floor,
    // so a tall crew member really looks taller than a short one.
    if (refHeight > dims.y) {
      center.y = box.min.y + refHeight / 2;
      dims.y = refHeight;
    }
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const forHeight = dims.y / 2 / tanHalf;
    const forWidth = dims.x / 2 / (tanHalf * aspect);
    const distance = Math.max(forHeight, forWidth) * margin + dims.z / 2;
    camera.position.set(center.x, center.y, center.z + distance);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    if (controls) controls.target?.copy?.(center);
  }, [camera, size.width, size.height, target, margin, controls, refHeight]);
  return null;
}

/** Soft studio light: key from the front-left, cool fill, rim from behind for the silhouette. */
function Lights() {
  return (
    <>
      <hemisphereLight args={['#f2f4f7', '#20242c', 0.9]} />
      <directionalLight position={[-2.5, 3, 4]} intensity={2.1} />
      <directionalLight position={[3, 1, 2]} intensity={0.55} color="#cfe0ff" />
      <directionalLight position={[0, 2.5, -4]} intensity={1.3} />
    </>
  );
}

class ModelErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="model-viewer-error" role="alert">
          MODEL FILE NOT FOUND
          <span>Expected: {this.props.path}</span>
        </div>
      );
    }

    return this.props.children;
  }
}

function FittedModel({ frontView, skeleton = null, bones = null, ...modelProps }) {
  const group = useRef();
  const controls = useThree(state => state.controls);
  return (
    <>
      <group ref={group} key={skeleton ? 'skeleton' : 'body'}>
        <Center>
          {skeleton ? (
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <Skeleton3D data={skeleton} status={bones} onSegmentHover={modelProps.onSegmentHover} onSegmentClick={modelProps.onSegmentClick} />
            </group>
          ) : <AstronautModel {...modelProps} />}
        </Center>
      </group>
      <FitCamera target={group} margin={frontView ? 1.02 : 1.2} controls={controls || false} />
    </>
  );
}

const fmtPct = v => (v == null ? '—' : `${v.toFixed(1)} %`);

/** BODY / SKELETON switch and, in the skeleton view, the projected bone density line. */
function ViewSwitch({ mode, onMode, bones }) {
  const t = useT();
  return (
    <>
      <div className="viewer-switch" role="group" aria-label={t('common.viewMode')}>
        {['body', 'skeleton'].map(id => (
          <button
            key={id}
            type="button"
            className="viewer-switch-btn"
            aria-pressed={mode === id}
            onClick={event => { event.stopPropagation(); onMode(id); }}
            onKeyDown={event => event.stopPropagation()}
          >
            {t(id === 'body' ? 'common.viewBody' : 'common.viewSkeleton')}
          </button>
        ))}
      </div>
      {mode === 'skeleton' && bones ? (
        <div className="viewer-bones" data-testid="viewer-bones" onClick={event => event.stopPropagation()}>
          <span className="viewer-bones-head">
            <span className="viewer-bones-title">{t('common.boneDensity')}</span>
            <span className="viewer-bones-note">{t('common.bmdNote')}</span>
          </span>
          <span className="viewer-bones-rows">
            <span className="viewer-bones-row"><StatusTag status={bones.hip} /> {t('common.bmdHip')} <strong>{fmtPct(bones.bmd.hip)}</strong></span>
            <span className="viewer-bones-row"><StatusTag status={bones.femoral} /> {t('common.bmdFemoral')} <strong>{fmtPct(bones.bmd.femoral)}</strong></span>
          </span>
        </div>
      ) : null}
    </>
  );
}

export default function AstronautViewer({ model = null, sol = null, frontView = false, onModelFrame, segmentStatus, onSegmentHover, onSegmentClick }) {
  const [mode, setMode] = useState('body');
  const skeleton = useSkeleton(mode === 'skeleton' ? model : null);
  const code = model && /^crew_(C\d+)$/.test(model) ? `HAB-${model.slice(5)}` : null;
  const bones = useMemo(() => (code ? boneStatus(code, sol) : null), [code, sol]);
  const canSkeleton = Boolean(code);
  return (
    <div className={`astronaut-viewer${frontView ? ' astronaut-viewer-front' : ''}${canSkeleton ? ' has-switch' : ''}${mode === 'skeleton' && bones ? ' is-skeleton' : ''}`} aria-label="Front-facing astronaut health model">
      <ModelErrorBoundary key={model || DEFAULT_MODEL} path={modelPath(model)}>
        <Canvas camera={{ position: [0, 0, 5], fov: frontView ? 28 : 35 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <Lights />
          <Suspense fallback={<LoadingState />}>
            <FittedModel
              key={model || DEFAULT_MODEL}
              model={model}
              skeleton={mode === 'skeleton' ? skeleton : null}
              bones={bones?.segments ?? null}
              frontView={frontView}
              onModelFrame={onModelFrame}
              segmentStatus={segmentStatus}
              onSegmentHover={onSegmentHover}
              onSegmentClick={onSegmentClick}
            />
          </Suspense>
          {!frontView && <OrbitControls
            makeDefault
            enablePan
            zoomToCursor
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            minDistance={1}
            maxDistance={12}
          />}
        </Canvas>
      </ModelErrorBoundary>
      {canSkeleton ? <ViewSwitch mode={mode} onMode={setMode} bones={bones} /> : null}
    </div>
  );
}

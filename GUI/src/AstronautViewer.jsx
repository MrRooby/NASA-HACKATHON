import React, { Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { MOUSE, Vector3 } from 'three';
import landmarks from '../models/anny_astronaut_landmarks.json';
import { applySegmentTint, baseColors, clearSegmentTint, setColors, setHighlight } from './segmentTint.js';
import { segmentForMesh } from './organSegments.js';
import { getCurrentTheme, subscribeTheme } from './theme/index.js';

const MODEL_PATH = '/models/anny_astronaut_bone_segmented.glb';

/**
 * segmentStatus: optional { anatomicalSegment: 'ok' | 'caution' | 'alert' | 'no_data' } (see organSegments.js;
 *   the GLB's swapped chest/abdomen mesh names are translated there).
 * Without it the model keeps its own colours (offline demo).
 */
function AstronautModel({ onModelFrame, segmentStatus, onSegmentHover, onSegmentClick }) {
  const { scene } = useGLTF(MODEL_PATH);
  const modelGroup = useRef();
  const hoveredObject = useRef(null);
  const statusRef = useRef(segmentStatus);
  statusRef.current = segmentStatus;

  // The status colours belong to the UI theme: a theme switch repaints the model.
  const theme = useSyncExternalStore(subscribeTheme, getCurrentTheme, getCurrentTheme);

  // Status tint; re-applied whenever the statuses (or the theme) change. The hovered mesh keeps its highlight.
  useEffect(() => {
    applySegmentTint(scene, segmentStatus);
    if (hoveredObject.current) setHighlight(hoveredObject.current);
  }, [scene, segmentStatus, theme]);

  useEffect(() => () => {
    clearSegmentTint(scene);
    hoveredObject.current = null;
  }, [scene]);

  const setHoveredObject = (object) => {
    if (hoveredObject.current === object) return;
    // Back to the status tint (or the original colour when there is no status), not to the raw material.
    if (hoveredObject.current) setColors(hoveredObject.current, baseColors(hoveredObject.current, statusRef.current));
    hoveredObject.current = object;
    if (object) setHighlight(object);
    onSegmentHover?.(object ? segmentForMesh(object.name) : null);
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

function CameraLight() {
  const light = useRef();

  useFrame(({ camera }) => {
    if (light.current) light.current.position.copy(camera.position);
  });

  return <pointLight ref={light} intensity={3} distance={10} decay={1.5} />;
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
          <span>Expected: /models/anny_astronaut_bone_segmented.glb</span>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AstronautViewer({ frontView = false, onModelFrame, segmentStatus, onSegmentHover, onSegmentClick }) {
  return (
    <div className={`astronaut-viewer${frontView ? ' astronaut-viewer-front' : ''}`} aria-label="Front-facing astronaut health model">
      <ModelErrorBoundary>
        <Canvas camera={{ position: frontView ? [0, 0, 5] : [0, 0, 4], fov: frontView ? 28 : 35 }} dpr={[1, 2]}>
          <ambientLight intensity={1.4} />
          <hemisphereLight args={['#ffffff', '#b8c9c7', 1.8]} />
          <CameraLight />
          <Suspense fallback={<LoadingState />}>
            <Bounds fit clip margin={frontView ? 0.9 : 1.2}>
              <Center>
                <AstronautModel
                  onModelFrame={onModelFrame}
                  segmentStatus={segmentStatus}
                  onSegmentHover={onSegmentHover}
                  onSegmentClick={onSegmentClick}
                />
              </Center>
            </Bounds>
          </Suspense>
          {!frontView && <OrbitControls
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
      {!frontView && <span className="model-viewer-hint">L-DRAG ROTATE · R-DRAG PAN · SCROLL ZOOM · HOVER TO HIGHLIGHT</span>}
    </div>
  );
}

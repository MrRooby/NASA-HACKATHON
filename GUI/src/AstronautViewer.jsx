import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, Center, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { MOUSE } from 'three';

const MODEL_PATH = '/models/anny_astronaut_bone_segmented.glb';

function AstronautModel() {
  const { scene } = useGLTF(MODEL_PATH);
  const hoveredObject = useRef(null);
  const originalColors = useRef(new Map());

  useEffect(() => {
    scene.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      originalColors.current.set(object, materials.map(material => material.color?.clone()));
    });

    return () => {
      originalColors.current.clear();
      hoveredObject.current = null;
    };
  }, [scene]);

  const setHoveredObject = (object) => {
    if (hoveredObject.current === object) return;
    if (hoveredObject.current) restoreColor(hoveredObject.current);
    hoveredObject.current = object;
    if (object) highlight(object);
  };

  const restoreColor = (object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const colors = originalColors.current.get(object) || [];
    materials.forEach((material, index) => {
      if (material.color && colors[index]) material.color.copy(colors[index]);
    });
  };

  const highlight = (object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.color) material.color.set('#ffd166');
    });
  };

  const handlePointerOver = (event) => {
    event.stopPropagation();
    setHoveredObject(event.object);
  };

  const clearHover = (event) => {
    event?.stopPropagation();
    setHoveredObject(null);
  };

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <primitive
        object={scene}
        onPointerOver={handlePointerOver}
        onPointerOut={clearHover}
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

export default function AstronautViewer() {
  return (
    <div className="astronaut-viewer" aria-label="Interactive 3D astronaut model">
      <ModelErrorBoundary>
        <Canvas camera={{ position: [0, 0, 4], fov: 35 }} dpr={[1, 2]}>
          <ambientLight intensity={1.4} />
          <hemisphereLight args={['#ffffff', '#b8c9c7', 1.8]} />
          <CameraLight />
          <Suspense fallback={<LoadingState />}>
            <Bounds fit clip margin={1.2}>
              <Center>
                <AstronautModel />
              </Center>
            </Bounds>
          </Suspense>
          <OrbitControls
            enablePan
            zoomToCursor
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            minDistance={1}
            maxDistance={12}
          />
        </Canvas>
      </ModelErrorBoundary>
      <span className="model-viewer-hint">L-DRAG ROTATE · R-DRAG PAN · SCROLL ZOOM · HOVER TO HIGHLIGHT</span>
    </div>
  );
}

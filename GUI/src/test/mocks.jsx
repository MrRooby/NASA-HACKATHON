import { useEffect } from 'react';

// Stand-in for the WebGL astronaut viewer (three.js / R3F / drei / GLTF are not
// usable in jsdom). Reports fixed landmark anchors once, like the real model.
export const fixedAnchors = {
  leftArm: { x: 0.2, y: 0.4 },
  rightArm: { x: 0.8, y: 0.4 },
  leftLeg: { x: 0.35, y: 0.9 },
  rightLeg: { x: 0.65, y: 0.9 },
};

export function MockAstronautViewer({ frontView = false, onModelFrame }) {
  useEffect(() => {
    onModelFrame?.(fixedAnchors);
  }, []);
  return <div data-testid="astronaut-viewer" data-front-view={String(frontView)} />;
}

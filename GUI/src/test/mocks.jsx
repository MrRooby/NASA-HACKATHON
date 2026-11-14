import { useEffect } from 'react';

// Stand-in for the WebGL astronaut viewer (three.js / R3F / drei / GLTF are not
// usable in jsdom). Reports fixed landmark anchors once, like the real model.
export const fixedAnchors = {
  leftArm: { x: 0.2, y: 0.4 },
  rightArm: { x: 0.8, y: 0.4 },
  leftLeg: { x: 0.35, y: 0.9 },
  rightLeg: { x: 0.65, y: 0.9 },
};

// Exposes the segment tint it was given (data-segment-status) and, when the caller
// listens for clicks, one button per tinted mesh to simulate clicking the 3D model.
export function MockAstronautViewer({ frontView = false, onModelFrame, segmentStatus, onSegmentClick, onSegmentHover }) {
  useEffect(() => {
    onModelFrame?.(fixedAnchors);
  }, []);
  return (
    <div
      data-testid="astronaut-viewer"
      data-front-view={String(frontView)}
      data-segment-status={segmentStatus ? JSON.stringify(segmentStatus) : undefined}
    >
      {onSegmentClick && segmentStatus && Object.keys(segmentStatus).map(segment => (
        <button
          key={segment}
          type="button"
          aria-label={`model segment ${segment}`}
          onClick={() => onSegmentClick(segment)}
          onMouseEnter={() => onSegmentHover?.(segment)}
          onMouseLeave={() => onSegmentHover?.(null)}
        />
      ))}
    </div>
  );
}

// Test doubles for WebGL components (three.js / R3F / drei / GLTF are not usable in jsdom).

// Stand-in for src/body/BodyModel.jsx (WebGL is not available in jsdom):
//   vi.mock('../body/BodyModel.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockBodyModel }));
// Exposes its props as data-* attributes and one button per tinted segment when it is interactive.
export function MockBodyModel({ segmentStatus, autoRotate = false, interactive = true, selectedSegments = [], onSegmentClick, onSegmentHover, className, label }) {
  return (
    <div
      data-testid="body-model"
      className={className}
      aria-label={label}
      data-auto-rotate={String(Boolean(autoRotate))}
      data-interactive={String(Boolean(interactive))}
      data-selected={(selectedSegments || []).join(',')}
      data-segment-status={segmentStatus ? JSON.stringify(segmentStatus) : undefined}
    >
      {interactive && onSegmentClick && segmentStatus && Object.keys(segmentStatus).map(segment => (
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

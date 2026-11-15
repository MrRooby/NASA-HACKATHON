import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AstronautViewer from './AstronautViewer.jsx';

// WebGL is unavailable in jsdom: replace the R3F canvas and drei helpers so the
// viewer's DOM wrapper can be checked without loading three.js scenes or GLTF.
vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="r3f-canvas" />,
  useFrame: () => {},
  useThree: () => ({}),
}));
vi.mock('@react-three/drei', () => {
  const Pass = ({ children }) => children ?? null;
  const useGLTF = () => { throw new Error('GLTF loading is not available in tests'); };
  useGLTF.preload = () => {};
  return { Bounds: Pass, Center: Pass, Html: Pass, OrbitControls: () => null, useGLTF };
});

describe('AstronautViewer (WebGL mocked)', () => {
  it('renders the interactive viewer with orbit hint by default', () => {
    const { container } = render(<AstronautViewer />);
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('astronaut-viewer');
    expect(container.firstChild).not.toHaveClass('astronaut-viewer-front');
    expect(screen.getByText(/l-drag rotate/i)).toBeInTheDocument();
  });

  it('renders the front view without the orbit hint', () => {
    const { container } = render(<AstronautViewer frontView />);
    expect(container.firstChild).toHaveClass('astronaut-viewer-front');
    expect(screen.queryByText(/l-drag rotate/i)).not.toBeInTheDocument();
  });
});

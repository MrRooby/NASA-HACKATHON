import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.queryByText(/l-drag rotate/i)).not.toBeInTheDocument(); // no mouse hint on a touch tablet
  });

  it('renders the front view without the orbit hint', () => {
    const { container } = render(<AstronautViewer frontView />);
    expect(container.firstChild).toHaveClass('astronaut-viewer-front');
    expect(screen.queryByText(/l-drag rotate/i)).not.toBeInTheDocument();
  });

  it('offers a BODY / SKELETON switch for a crew model and shows the projected bone density', () => {
    render(<AstronautViewer model="crew_C4" sol={600} frontView />);
    const skeleton = screen.getByRole('button', { name: 'Skeleton' });
    expect(screen.getByRole('button', { name: 'Body' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('viewer-bones')).toHaveTextContent(/Hip \/ spine\s*\d+\.\d %/);
    fireEvent.click(skeleton);
    expect(skeleton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('viewer-bones')).toHaveTextContent(/Hip \/ spine\s*\d+\.\d %/);
  });

  it('has no switch for a model that is not a crew member', () => {
    render(<AstronautViewer frontView />);
    expect(screen.queryByRole('button', { name: 'Skeleton' })).toBeNull();
  });
});

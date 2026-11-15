import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { currentScreen, navButton, renderApp } from './test/renderApp.jsx';

// The shell hides its chrome (top bar + footer) while a screen asks for it: a running
// cognitive test needs the whole window. The screens are stubs here.
vi.mock('./screens/HomeScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('home'));
vi.mock('./screens/WearablesScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('wearables'));
vi.mock('./screens/BaseScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('base'));
vi.mock('./screens/ProfileScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('profile'));
vi.mock('./screens/CrewScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('crew'));
vi.mock('./screens/TestsScreen.jsx', () => ({
  default: ({ setChromeHidden, navigate }) => (
    <div data-testid="stub-tests">
      <button type="button" onClick={() => setChromeHidden(true)}>stub: test running</button>
      <button type="button" onClick={() => setChromeHidden(false)}>stub: test finished</button>
      <button type="button" onClick={() => navigate('crew')}>stub: leave</button>
    </div>
  ),
}));

describe('app shell: chrome hidden while a test runs', () => {
  it('hides the top bar on setChromeHidden(true) and brings them back', () => {
    renderApp();
    fireEvent.click(navButton('tests'));
    expect(screen.getByRole('banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'stub: test running' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByRole('main').closest('.shell')).toHaveClass('shell-bare');
    expect(currentScreen()).toBe('tests');

    fireEvent.click(screen.getByRole('button', { name: 'stub: test finished' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('never keeps the chrome hidden after the screen changes', () => {
    renderApp();
    fireEvent.click(navButton('tests'));
    fireEvent.click(screen.getByRole('button', { name: 'stub: test running' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub: leave' }));
    expect(currentScreen()).toBe('crew');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});

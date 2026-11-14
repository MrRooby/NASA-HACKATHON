import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { currentScreen, renderApp } from './test/renderApp.jsx';

// Shell chrome: a failing screen is contained; the habitat mark leads to the base.
vi.mock('./screens/CrewScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('crew'));
vi.mock('./screens/PersonScreen.jsx', () => ({
  default: () => { throw new Error('person exploded'); },
}));
vi.mock('./screens/BaseScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('base'));
vi.mock('./screens/TestRunScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('test'));
vi.mock('./tasks/index.js', async () => (await import('./test/screenStub.jsx')).stubTasks({ alert: 0, caution: 0, open: 0 }));

describe('app shell chrome', () => {
  it('a screen that throws shows a fault panel; the top bar keeps working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'stub: person C3' }));
    expect(screen.getByRole('alert')).toHaveTextContent('person exploded');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(currentScreen()).toBe('crew'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('the habitat status mark opens the base; quiet alarm counter without alarms', () => {
    renderApp();
    expect(screen.getByTestId('tb-alarms')).toHaveClass('is-quiet');
    fireEvent.click(screen.getByRole('button', { name: /^Habitat status/ }));
    expect(currentScreen()).toBe('base');
  });

  it('the brand returns to the crew screen', () => {
    renderApp({ url: '/?screen=base' });
    fireEvent.click(screen.getByRole('button', { name: 'AWERNASA' }));
    expect(currentScreen()).toBe('crew');
  });
});

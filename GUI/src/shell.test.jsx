import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { currentScreen, navButton, renderApp } from './test/renderApp.jsx';
import { stubMother } from './test/mother.js';

// The shell with stub screens and a stub task panel: routing, history, chrome, settings, drawer.
vi.mock('./screens/CrewScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('crew'));
vi.mock('./screens/PersonScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('person'));
vi.mock('./screens/BaseScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('base'));
vi.mock('./screens/TestRunScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('test'));
vi.mock('./tasks/index.js', async () => (await import('./test/screenStub.jsx')).stubTasks());

const routeOf = id => JSON.parse(screen.getByTestId(`stub-${id}`).getAttribute('data-route'));
const click = name => fireEvent.click(screen.getByRole('button', { name }));

describe('routes', () => {
  it('starts on the crew screen without a login', () => {
    renderApp();
    expect(currentScreen()).toBe('crew');
    expect(routeOf('crew')).toEqual({ screen: 'crew', code: null, organ: null, room: null, test: null });
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
    expect(screen.getByTestId('task-panel')).toBeInTheDocument();
    expect(screen.getByTestId('alert-panel')).toBeInTheDocument();
  });

  it('navigates to a person (with organ) and merges a later organ change', () => {
    renderApp();
    click('stub: C4 limbs');
    expect(currentScreen()).toBe('person');
    expect(routeOf('person')).toMatchObject({ screen: 'person', code: 'HAB-C4', organ: 'limbs' });
    expect(window.location.search).toBe('?screen=person&code=HAB-C4&organ=limbs');
    click('stub: organ heart');
    expect(routeOf('person')).toMatchObject({ code: 'HAB-C4', organ: 'heart' });
  });

  it('selects the person of the route in MOTHER', async () => {
    stubMother();
    renderApp();
    await waitFor(() => expect(screen.getByTestId('stub-crew')).toHaveAttribute('data-selected', 'HAB-C1'));
    click('stub: person C3');
    await waitFor(() => expect(screen.getByTestId('stub-person')).toHaveAttribute('data-selected', 'HAB-C3'));
  });

  it('ignores unknown screens (falls back to crew)', () => {
    renderApp({ url: '/?screen=person&code=HAB-C2' });
    expect(currentScreen()).toBe('person');
    click('stub: unknown screen');
    expect(currentScreen()).toBe('crew');
  });

  it('reads the start route from the URL', () => {
    renderApp({ url: '/?screen=base&room=farm' });
    expect(currentScreen()).toBe('base');
    expect(routeOf('base')).toMatchObject({ room: 'farm' });
  });

  it('top-bar CREW / BASE buttons switch screens', () => {
    renderApp();
    fireEvent.click(navButton('base'));
    expect(currentScreen()).toBe('base');
    expect(navButton('base')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(navButton('crew'));
    expect(currentScreen()).toBe('crew');
  });

  it('breadcrumb shows CREW ▸ NAME ▸ ORGAN and links back', () => {
    renderApp();
    click('stub: C4 limbs');
    const crumbs = screen.getByRole('navigation', { name: 'Location in the app' });
    expect(crumbs).toHaveTextContent(/crew/i);
    expect(crumbs).toHaveTextContent(/grażyna/i);
    expect(within(crumbs).getByText(/limbs/i)).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(crumbs).getByRole('button', { name: /grażyna/i }));
    expect(routeOf('person')).toMatchObject({ code: 'HAB-C4', organ: null });
  });
});

describe('history', () => {
  it('the browser back button returns to the previous route', async () => {
    renderApp();
    click('stub: person C3');
    expect(currentScreen()).toBe('person');
    act(() => window.history.back());
    await waitFor(() => expect(currentScreen()).toBe('crew'));
    act(() => window.history.forward());
    await waitFor(() => expect(currentScreen()).toBe('person'));
  });

  it('the on-screen back button uses the history, or goes to the parent route', async () => {
    renderApp({ url: '/?screen=person&code=HAB-C1&organ=heart' });
    // No history of ours: parent route (person without organ), then crew.
    click('Back');
    expect(routeOf('person')).toMatchObject({ code: 'HAB-C1', organ: null });
    click('Back');
    expect(currentScreen()).toBe('crew');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    click('stub: base gym');
    click('Back');
    await waitFor(() => expect(currentScreen()).toBe('crew'));
  });
});

describe('test route', () => {
  it('shows only the screen: no top bar, no side panel', async () => {
    renderApp();
    click('stub: run test');
    expect(currentScreen()).toBe('test');
    expect(routeOf('test')).toMatchObject({ code: 'HAB-C2', test: 'full' });
    expect(screen.queryByTestId('topbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('main').closest('.shell')).toHaveClass('shell-bare');
    click('stub: back');
    await waitFor(() => expect(currentScreen()).toBe('crew'));
  });
});

describe('top bar', () => {
  it('shows the alarm counters, the sol and the link state', async () => {
    renderApp();
    expect(screen.getByTestId('tb-alarms')).toHaveAccessibleName('2 alerts, 3 cautions');
    await waitFor(() => expect(screen.getByText('DEMO')).toBeInTheDocument());
    // Offline: the sol of the built-in demo records.
    expect(screen.getByTestId('topbar-sol')).toHaveTextContent(/SOL \d+/i);
  });

  it('LIVE with MOTHER, and the sol stepper changes the shared sol', async () => {
    stubMother();
    renderApp();
    await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Previous sol' })).toBeEnabled());
    const before = Number(screen.getByTestId('topbar-sol').textContent.match(/\d+/)[0]);
    click('Previous sol');
    await waitFor(() => expect(screen.getByTestId('topbar-sol')).toHaveTextContent(String(before - 1)));
    click('Latest');
    await waitFor(() => expect(screen.getByTestId('topbar-sol')).toHaveTextContent(String(before)));
  });

  it('opens the settings modal from the gear and closes it again', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('tb-settings'));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Polski' }));
    expect(screen.getByRole('dialog', { name: 'Ustawienia' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('TASKS (n) toggles the side-panel drawer, which closes on navigation', () => {
    renderApp();
    const button = screen.getByTestId('tb-tasks');
    expect(button).toHaveAccessibleName('Tasks (4)');
    expect(button).toHaveTextContent('4');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('main').closest('.shell')).toHaveClass('shell-drawer-open');
    click('stub: person C3');
    expect(screen.getByRole('main').closest('.shell')).not.toHaveClass('shell-drawer-open');
  });
});

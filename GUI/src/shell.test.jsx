import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SCREENS } from './App.jsx';
import { CREW_PROFILES } from './data/crewProfiles.js';
import { requestedPaths, stubMother } from './test/mother.js';
import { currentScreen, logIn, navButton, renderApp } from './test/renderApp.jsx';

// The shell is tested on its own: the content screens are owned by other modules and
// replaced by stubs here (login and settings are the real ones).
vi.mock('./screens/HomeScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('home'));
vi.mock('./screens/WearablesScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('wearables'));
vi.mock('./screens/BaseScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('base'));
vi.mock('./screens/ProfileScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('profile'));
vi.mock('./screens/CrewScreen.jsx', async () => (await import('./test/screenStub.jsx')).stubScreen('crew'));
vi.mock('./screens/TestsScreen.jsx', () => ({
  default: () => { throw new Error('centrifuge jammed'); },
}));

const topbar = () => screen.getByRole('banner');
const stub = id => screen.getByTestId(`stub-${id}`);

describe('login screen', () => {
  it('lists the four fictional crew members and works offline', async () => {
    renderApp({ login: null });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: /crew members/i });
    expect(within(list).getAllByRole('button')).toHaveLength(4);
    for (const profile of CREW_PROFILES) {
      expect(within(list).getByRole('button', { name: `Open session as ${profile.name}` })).toBeInTheDocument();
      expect(within(list).getByText(profile.role.en)).toBeInTheDocument();
      expect(within(list).queryByText(new RegExp(profile.callsign))).not.toBeInTheDocument(); // no callsigns
    }
    expect(screen.getByText('FICTIONAL')).toBeInTheDocument();
    expect(await screen.findByText('OFFLINE · DEMO')).toBeInTheDocument();
    expect(screen.getByText(/^AWERNASA/)).toHaveTextContent(/^AWERNASA v\d+\.\d+\.\d+/);
    expect(screen.getByTestId('login-sol')).toBeInTheDocument();
    for (const gone of [/EARTH RELAY/i, /DEMONSTRATION ONLY/i, /Any resemblance/i, /Works without a link/i]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it('shows the live link when MOTHER answers', async () => {
    stubMother();
    renderApp({ login: null });
    expect(await screen.findByText('LIVE · MOTHER')).toBeInTheDocument();
  });

  it('can switch the language before logging in', () => {
    renderApp({ login: null });
    fireEvent.click(screen.getByRole('button', { name: 'Polski' }));
    expect(screen.getByRole('button', { name: 'Otwórz sesję jako Roman Czarny' })).toBeInTheDocument();
    expect(screen.getByText('Geolog')).toBeInTheDocument();
  });
});

describe('app shell', () => {
  it('login -> home, with the top bar of the logged-in crew member', () => {
    renderApp({ login: 'HAB-C2' });
    expect(currentScreen()).toBe('home');
    expect(stub('home')).toHaveAttribute('data-session', 'HAB-C2');
    expect(stub('home')).toHaveAttribute('data-viewed', 'HAB-C2');
    expect(stub('home')).toHaveAttribute('data-profile', 'Bogusław Grzegrzułkiewicz');

    expect(screen.getByTestId('screen-name')).toHaveTextContent('Home');
    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(within(nav).getAllByRole('button').map(button => button.getAttribute('data-nav')))
      .toEqual(['home', 'profile', 'base', 'crew', 'tests', 'settings']);
    expect(within(nav).getByRole('button', { name: 'Bogusław Grzegrzułkiewicz' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Settings' })).toContainElement(document.querySelector('[data-nav="settings"] .nf-icon'));
    expect(screen.getByTestId('topbar-sol')).toHaveTextContent('SOL 600'); // offline: the sol of the built-in demo record
    expect(within(topbar()).getByText(/^\d\d:\d\d:\d\d UTC$/)).toBeInTheDocument();
    expect(within(topbar()).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('navigates between all screens and marks the active tab with aria-current', () => {
    renderApp();
    expect(SCREENS).toEqual(['home', 'wearables', 'base', 'profile', 'crew', 'tests', 'settings']);
    const names = { home: 'Home', profile: 'Crew profile', base: 'Base', crew: 'Crew', settings: 'Settings' };
    for (const id of ['profile', 'base', 'crew', 'settings', 'home']) {
      fireEvent.click(navButton(id));
      expect(currentScreen()).toBe(id);
      expect(screen.getByTestId('screen-name')).toHaveTextContent(names[id]);
      expect(navButton(id)).toHaveAttribute('aria-current', 'page');
      expect(document.querySelectorAll('.topbar-nav [aria-current]')).toHaveLength(1);
      if (id !== 'settings') expect(stub(id)).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.click(navButton('settings'));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('lets a screen navigate: wearables has no tab of its own, unknown screens are ignored', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'stub: wearables' }));
    expect(currentScreen()).toBe('wearables');
    expect(screen.getByTestId('screen-name')).toHaveTextContent('Wearable data');
    expect(document.querySelectorAll('.topbar-nav [aria-current]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'stub: unknown screen' }));
    expect(currentScreen()).toBe('wearables');
  });

  it('tracks whose data is viewed and returns to the session owner from HOME / own name', () => {
    renderApp({ login: 'HAB-C1' });
    fireEvent.click(screen.getByRole('button', { name: 'stub: profile of C3' }));
    expect(currentScreen()).toBe('profile');
    expect(stub('profile')).toHaveAttribute('data-viewed', 'HAB-C3');
    expect(stub('profile')).toHaveAttribute('data-session', 'HAB-C1');
    expect(stub('profile')).toHaveAttribute('data-profile', 'Roman Czarny');
    expect(within(topbar()).getByText('Viewing HAB-C3')).toBeInTheDocument();
    expect(navButton('profile')).not.toHaveAttribute('aria-current'); // the tab carries the owner's name

    fireEvent.click(navButton('base')); // other tabs keep the viewed person
    expect(stub('base')).toHaveAttribute('data-viewed', 'HAB-C3');

    fireEvent.click(navButton('profile'));
    expect(stub('profile')).toHaveAttribute('data-viewed', 'HAB-C1');
    expect(navButton('profile')).toHaveAttribute('aria-current', 'page');
    expect(within(topbar()).queryByText(/Viewing/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'stub: view C4' }));
    expect(stub('profile')).toHaveAttribute('data-viewed', 'HAB-C4');
    fireEvent.click(screen.getByRole('button', { name: 'stub: view self' }));
    expect(stub('profile')).toHaveAttribute('data-viewed', 'HAB-C1');

    fireEvent.click(screen.getByRole('button', { name: 'stub: view C4' }));
    fireEvent.click(navButton('home'));
    expect(stub('home')).toHaveAttribute('data-viewed', 'HAB-C1');
  });

  it('keeps the MOTHER subject in sync with the viewed crew member', async () => {
    const fetchMock = stubMother();
    renderApp({ login: null });
    await screen.findByText('LIVE · MOTHER');
    logIn('HAB-C2');
    await waitFor(() => expect(stub('home')).toHaveAttribute('data-report-subject', 'HAB-C2'));
    expect(stub('home')).toHaveAttribute('data-selected', 'HAB-C2');
    expect(screen.getByTestId('topbar-sol')).toHaveTextContent('SOL 600');
    expect(within(topbar()).getByText('LIVE · MOTHER')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'stub: profile of C3' }));
    await waitFor(() => expect(stub('profile')).toHaveAttribute('data-report-subject', 'HAB-C3'));
    expect(requestedPaths(fetchMock)).toContain('/api/organs/HAB-C3');

    fireEvent.click(navButton('home'));
    await waitFor(() => expect(stub('home')).toHaveAttribute('data-report-subject', 'HAB-C2'));
  });

  it('selects the logged-in crew member even when the session starts before MOTHER answers', async () => {
    stubMother();
    renderApp({ login: 'HAB-C4' });
    await waitFor(() => expect(stub('home')).toHaveAttribute('data-report-subject', 'HAB-C4'));
  });

  it('logs out to the login screen and starts the next session at home', () => {
    renderApp({ login: 'HAB-C1' });
    fireEvent.click(screen.getByRole('button', { name: 'stub: profile of C3' }));
    fireEvent.click(within(topbar()).getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('navigation', { name: /main navigation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: /crew members/i })).toBeInTheDocument();

    logIn('HAB-C4');
    expect(currentScreen()).toBe('home');
    expect(stub('home')).toHaveAttribute('data-viewed', 'HAB-C4');
    expect(within(topbar()).getByRole('button', { name: 'Grażyna Brzęczyszczykiewicz' })).toBeInTheDocument();
  });

  it('translates the shell', () => {
    renderApp({ lang: 'pl' });
    expect(within(topbar()).getByRole('button', { name: 'Wyloguj' })).toBeInTheDocument();
    expect(navButton('base')).toHaveTextContent('Baza');
    expect(screen.getByRole('navigation', { name: 'Nawigacja główna' })).toBeInTheDocument();
  });

  it('contains a crashing screen: the fault is shown and the other screens still work', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp();
    fireEvent.click(navButton('tests'));
    expect(screen.getByRole('alert')).toHaveTextContent('centrifuge jammed');
    expect(screen.getByRole('alert')).toHaveTextContent('[ ALRT ]');
    fireEvent.click(navButton('crew'));
    expect(stub('crew')).toBeInTheDocument();
  });
});

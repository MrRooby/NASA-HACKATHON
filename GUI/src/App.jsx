import React, { useCallback, useEffect, useState } from 'react';
import useMother from './useMother.js';
import { getProfile } from './data/crewProfiles.js';
import { demoReport } from './data/demoReports.js';
import { useT } from './i18n/index.js';
import { ConnectionBadge, Panel, StatusTag } from './components/index.js';
import NavIcon from './navIcons.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import WearablesScreen from './screens/WearablesScreen.jsx';
import BaseScreen from './screens/BaseScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
import CrewScreen from './screens/CrewScreen.jsx';
import TestsScreen from './screens/TestsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import './shell.css';
import CalendarScreen from './screens/CalendarScreen.jsx';

/**
 * Screen id -> component. Every screen gets { mother, session, viewedCode, setViewedCode, navigate, profile,
 * setChromeHidden }. setChromeHidden(true) hides the top bar (a running cognitive test needs
 * the whole window and steady frame timing); leaving the screen always brings them back.
 */
export const SCREEN_COMPONENTS = {
  home: HomeScreen,
  wearables: WearablesScreen,
  base: BaseScreen,
  profile: ProfileScreen,
  crew: CrewScreen,
  tests: TestsScreen,
  settings: SettingsScreen,
  calendar: CalendarScreen,
};

export const SCREENS = Object.keys(SCREEN_COMPONENTS);

const SCREEN_TITLE_KEYS = {
  home: 'common.screenHome',
  wearables: 'common.screenWearables',
  base: 'common.screenBase',
  profile: 'common.screenProfile',
  crew: 'common.screenCrew',
  tests: 'common.screenTests',
  settings: 'common.screenSettings',
  calendar: 'common.screenCalendar',
};

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <time className="topbar-clock" dateTime={now.toISOString()}>{now.toISOString().slice(11, 19)} UTC</time>;
}

/** A screen that throws must not take the whole terminal down. */
class ScreenBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Panel title={this.props.title} tone="alert" role="alert">
        <p className="screen-fault"><StatusTag status="alert" /> {String(this.state.error?.message || this.state.error)}</p>
        <p className="dim">{this.props.hint}</p>
      </Panel>
    );
  }
}

function NavTab({ id, icon, label, name, current, parent, square, onClick }) {
  return (
    <button
      type="button"
      className={['navtab', square ? 'navtab-square' : '', parent ? 'is-parent' : ''].filter(Boolean).join(' ')}
      data-nav={id}
      aria-current={current ? 'page' : undefined}
      aria-label={name ?? label}
      title={name ?? label}
      onClick={onClick}
    >
      <NavIcon name={icon} className="navtab-icon" />
      {!square && <span className="navtab-label" aria-hidden={name ? 'true' : undefined}>{label}</span>}
    </button>
  );
}

function TopBar({ mother, session, viewedCode, screen, navigate, onLogout }) {
  const t = useT();
  const me = getProfile(session);
  // Offline the screens show the built-in demo record of the viewed person: show its sol too.
  const sol = mother.report?.as_of?.sol ?? (mother.online ? undefined : demoReport(viewedCode)?.as_of?.sol);
  const own = { viewedCode: session };
  const viewingOther = viewedCode !== session;
  // Big full-width tabs for a touch tablet; settings and log out are square icon buttons in the corner.
  const tabs = [
    { id: 'home', icon: 'home', label: t('common.navHome'), opts: own, current: screen === 'home', parent: screen === 'wearables' || (screen === 'profile' && !viewingOther) },
    { id: 'base', icon: 'base', label: t('common.navBase'), current: screen === 'base' },
    { id: 'crew', icon: 'crew', label: t('common.navCrew'), current: screen === 'crew', parent: screen === 'profile' && viewingOther },
    { id: 'calendar', icon: 'calendar', label: t('common.navCalendar'), current: screen === 'calendar' },
    { id: 'tests', icon: 'tests', label: t('common.navTests'), current: screen === 'tests' },
  ];

  return (
    <header className="topbar">
      <div className="topbar-row">
        <span className="visually-hidden" data-testid="screen-name">{t(SCREEN_TITLE_KEYS[screen])}</span>
        <span className="topbar-sol" data-testid="topbar-sol">
          {sol != null ? t('common.solN', { n: sol }) : t('common.solUnknown')}
        </span>
        {viewingOther && <span className="topbar-viewing">{t('common.viewing', { code: viewedCode })}</span>}
        <span className="topbar-status">
          <ConnectionBadge mode={mother.mode} error={mother.error} />
          <UtcClock />
        </span>
      </div>

      <div className="topbar-tabs">
        <nav className="topbar-nav" aria-label={t('common.navMain')}>
          {tabs.map(tab => (
            <NavTab key={tab.id} {...tab} onClick={() => navigate(tab.id, tab.opts)} />
          ))}
          <NavTab
            id="settings"
            icon="settings"
            name={t('common.navSettings')}
            current={screen === 'settings'}
            square
            onClick={() => navigate('settings')}
          />
        </nav>
        <NavTab id="logout" icon="logout" name={t('common.logout')} square onClick={onLogout} />
      </div>
    </header>
  );
}

/**
 * App shell: login -> top bar + one screen.
 * State: session (crew code | null), screen (one of SCREENS), viewedCode (whose data is shown; defaults to session).
 * The MOTHER hook is used once, here; its selected subject always follows viewedCode.
 */
export default function App() {
  const t = useT();
  const mother = useMother();
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState('home');
  const [viewedOverride, setViewedOverride] = useState(null);
  const [chromeHidden, setChromeHiddenState] = useState(false);
  const [route, setRoute] = useState({ screen: 'home', open: null, key: 0 });
  const viewedCode = viewedOverride ?? session;

  const { selectSubject, setPeriod } = mother;

  // mother.report always belongs to viewedCode (on login and whenever another crew member is viewed).
  useEffect(() => {
    if (session && viewedCode) selectSubject(viewedCode);
  }, [session, viewedCode, selectSubject]);

  /** setViewedCode('HAB-C3'); setViewedCode(null) returns to the logged-in crew member. */
  const setViewedCode = useCallback(code => setViewedOverride(code || null), []);

  const setChromeHidden = useCallback(hidden => setChromeHiddenState(Boolean(hidden)), []);

  // The chrome never stays hidden after the screen that asked for it is gone.
  useEffect(() => {
    setChromeHiddenState(false);
  }, [screen, session]);

  /** navigate('profile') or navigate('profile', { viewedCode: 'HAB-C3' }); unknown screens are ignored. */
  const navigate = useCallback((next, opts) => {
    if (!SCREENS.includes(next)) return;
    if (opts && 'viewedCode' in opts) setViewedOverride(opts.viewedCode || null);
    // `open` asks the target screen to open one of its popups right away (e.g. the check-in).
    setRoute({ screen: next, open: opts?.open ?? null, key: Date.now() });
    setScreen(next);
  }, []);

  const login = useCallback(code => {
    setViewedOverride(null);
    setScreen('home');
    setPeriod(null); // a new session starts at the latest sol
    setSession(code);
  }, [setPeriod]);

  const logout = useCallback(() => {
    setSession(null);
    setViewedOverride(null);
    setScreen('home');
  }, []);

  if (!session) return <LoginScreen mother={mother} onLogin={login} />;

  const Screen = SCREEN_COMPONENTS[screen];
  const screenProps = { mother, session, viewedCode, setViewedCode, navigate, profile: getProfile(viewedCode), setChromeHidden, route: route.screen === screen ? route : null };

  return (
    <div className={chromeHidden ? 'shell shell-bare' : 'shell'}>
      {!chromeHidden && (
        <TopBar mother={mother} session={session} viewedCode={viewedCode} screen={screen} navigate={navigate} onLogout={logout} />
      )}
      <main className="screen" data-screen={screen}>
        <ScreenBoundary key={screen} title={t('common.screenFault')} hint={t('common.screenFaultHint')}>
          <Screen {...screenProps} />
        </ScreenBoundary>
      </main>
    </div>
  );
}

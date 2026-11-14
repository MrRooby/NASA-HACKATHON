import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMother from './useMother.js';
import { useT } from './i18n/index.js';
import { demoReport } from './data/demoReports.js';
import { useSharedHabitat } from './habitat/sharedHabitat.js';
import { AlertPanel, TaskPanel, useAlertCounts, useTasks } from './tasks/index.js';
import SettingsModal from './settings/SettingsModal.jsx';
import TopBar from './shell/TopBar.jsx';
import { DEFAULT_ROUTE, mergeRoute, normalizeRoute, parentRoute, routeFromSearch, routeToSearch, sameRoute } from './shell/route.js';
import CrewScreen from './screens/CrewScreen.jsx';
import PersonScreen from './screens/PersonScreen.jsx';
import BaseScreen from './screens/BaseScreen.jsx';
import TestRunScreen from './screens/TestRunScreen.jsx';
import './shell/shell.css';

/** route.screen -> component. Every screen gets { mother, route, navigate, back }. */
export const SCREEN_COMPONENTS = {
  crew: CrewScreen,
  person: PersonScreen,
  base: BaseScreen,
  test: TestRunScreen,
};

export const SCREENS = Object.keys(SCREEN_COMPONENTS);

/** A screen that throws must not take the whole terminal down. */
class ScreenBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen-fault" role="alert">
        <strong>{this.props.title}</strong>
        <span>{String(this.state.error?.message || this.state.error)}</span>
        <span className="dim">{this.props.hint}</span>
      </div>
    );
  }
}

const HISTORY_KEY = 'awernasaRoute';

/**
 * Route state mirrored into the browser history: navigate() pushes an entry, the browser /
 * phone back button (popstate) restores the previous route. back() uses the history when the
 * previous entry is ours, else goes to the parent route.
 */
export function useRoute() {
  const [route, setRoute] = useState(() => (typeof window === 'undefined' ? { ...DEFAULT_ROUTE } : routeFromSearch(window.location.search)));
  const routeRef = useRef(route);
  routeRef.current = route;
  const depth = useRef(0);

  useEffect(() => {
    const state = window.history.state || {};
    depth.current = state[HISTORY_KEY]?.depth ?? 0;
    window.history.replaceState({ ...state, [HISTORY_KEY]: { route: routeRef.current, depth: depth.current } }, '', routeToSearch(routeRef.current) || window.location.pathname);
    const onPop = event => {
      const entry = event.state?.[HISTORY_KEY];
      depth.current = entry?.depth ?? 0;
      setRoute(normalizeRoute(entry?.route ?? routeFromSearch(window.location.search)));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** navigate({ screen: 'person', code: 'HAB-C4', organ: 'limbs' }), navigate({ organ: 'heart' }), navigate('crew'). */
  const navigate = useCallback((patch, { replace = false } = {}) => {
    const next = mergeRoute(routeRef.current, patch);
    if (sameRoute(next, routeRef.current)) return;
    if (!replace) depth.current += 1;
    const entry = { [HISTORY_KEY]: { route: next, depth: depth.current } };
    const url = routeToSearch(next) || window.location.pathname;
    if (replace) window.history.replaceState(entry, '', url);
    else window.history.pushState(entry, '', url);
    routeRef.current = next;
    setRoute(next);
  }, []);

  const back = useCallback(() => {
    if (depth.current > 0) window.history.back();
    else navigate(parentRoute(routeRef.current), { replace: true });
  }, [navigate]);

  return { route, navigate, back };
}

/**
 * Shared sol (DESIGN.md §3): mother.period, with the latest sol remembered from the last
 * report fetched without a period. Offline the demo report's sol is shown and cannot change.
 */
function useSol(mother, code) {
  const reportSol = mother.report?.as_of?.sol ?? null;
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    if (!mother.period && reportSol != null) setLatest(reportSol);
  }, [mother.period, reportSol]);
  const demoSol = mother.online ? null : demoReport(code || 'HAB-C1')?.as_of?.sol ?? null;
  const value = mother.period?.sol ?? reportSol ?? latest ?? demoSol;
  const live = mother.online && value != null;
  const isLatest = !mother.period;
  const { setPeriod } = mother;
  return {
    value,
    isLatest,
    canPrev: live && value > 1,
    canNext: live && !isLatest && latest != null && value < latest,
    prev: () => value != null && setPeriod({ sol: value - 1 }),
    next: () => {
      if (value == null) return;
      if (latest != null && value + 1 >= latest) setPeriod(null);
      else setPeriod({ sol: value + 1 });
    },
    toLatest: () => setPeriod(null),
  };
}

function habitatOverall(data) {
  if (!data) return 'no_data';
  if (data.overall_status) return data.overall_status;
  const rank = { no_data: 0, ok: 1, caution: 2, alert: 3 };
  return (data.zones || []).reduce((worst, zone) => (rank[zone?.status] > rank[worst] ? zone.status : worst), 'no_data');
}

/**
 * App shell (DESIGN.md §3): top bar + main screen + side panel (TO DO on top, ALERTS below).
 * One useMother() for the whole app; its selected person follows route.code and the sol
 * (mother.period) is shared by every screen. route.screen === 'test' shows only the screen.
 */
export default function App() {
  const t = useT();
  const mother = useMother();
  const { route, navigate, back } = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { selectSubject, setPeriod } = mother;
  const periodRef = useRef(mother.period);
  periodRef.current = mother.period;

  // mother.report follows the person on screen; the shared sol survives the switch
  // (selectSubject() itself would jump back to the latest sol).
  useEffect(() => {
    if (!route.code) return;
    const keep = periodRef.current;
    selectSubject(route.code);
    if (keep) setPeriod(keep);
  }, [route.code, selectSubject, setPeriod]);

  // The drawer closes on every navigation.
  useEffect(() => { setDrawerOpen(false); }, [route]);

  const sol = useSol(mother, route.code);
  const { data: habitat } = useSharedHabitat({ sol: mother.period?.sol ?? null });
  const alerts = useAlertCounts({ mother, route }) || {};
  const tasks = useTasks({ mother, route, code: route.code });
  const openTasks = useMemo(() => {
    const items = Array.isArray(tasks?.items) ? tasks.items : [];
    if (items.length) return items.filter(item => !item.done).length;
    const counts = tasks?.counts;
    return counts ? Math.max(0, (counts.total || 0) - (counts.done || 0)) : 0;
  }, [tasks]);

  const Screen = SCREEN_COMPONENTS[route.screen] || CrewScreen;
  const screenProps = { mother, route, navigate, back };
  const toggleDrawer = useCallback(() => setDrawerOpen(open => !open), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const main = (
    <main className="screen" data-screen={route.screen}>
      <ScreenBoundary key={route.screen} title={t('common.screenFault')} hint={t('common.screenFaultHint')}>
        <Screen {...screenProps} />
      </ScreenBoundary>
    </main>
  );

  if (route.screen === 'test') return <div className="shell shell-bare">{main}</div>;

  return (
    <div className={`shell${drawerOpen ? ' shell-drawer-open' : ''}`}>
      <TopBar
        mother={mother}
        route={route}
        navigate={navigate}
        back={back}
        sol={sol}
        alerts={alerts}
        habitatStatus={habitatOverall(habitat)}
        tasksOpen={drawerOpen}
        tasksCount={openTasks}
        onTasks={toggleDrawer}
        onSettings={() => setSettingsOpen(true)}
      />
      {main}
      <div className="side-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside id="side-panel" className="side" aria-label={t('common.sidePanel')}>
        <div className="side-tasks"><TaskPanel {...screenProps} /></div>
        <div className="side-alerts"><AlertPanel {...screenProps} /></div>
      </aside>
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}

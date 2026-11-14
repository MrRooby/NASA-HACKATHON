// Standalone entry (cognitive.html): ONLY the cognitive module. No login, dashboard, 3D or /api calls;
// results never leave this browser. `?demo=1` runs the shortened demo protocols.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '../styles.css';
import './cognitive.css';
import Providers from '../Providers.jsx';
import { applyTheme, getThemeById, loadSelectedThemeId } from '../theme/index.js';
import SelfStart from './SelfStart.jsx';

export const isDemo = (search = typeof window !== 'undefined' ? window.location.search : '') => new URLSearchParams(search).get('demo') === '1';

export default function StandaloneApp({ demo = isDemo() }) {
  return (
    <main className="cog-standalone">
      <SelfStart demo={demo} />
    </main>
  );
}

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootEl) {
  // Same terminal look as the app: the theme variables live on <html> (set before the first paint);
  // Providers keep the saved theme, CRT mode and language of the app in sync.
  applyTheme(getThemeById(loadSelectedThemeId()));
  createRoot(rootEl).render(<Providers><StandaloneApp /></Providers>);
}

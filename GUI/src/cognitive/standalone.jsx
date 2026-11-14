// Standalone entry (cognitive.html): ONLY the cognitive module. No login, dashboard, 3D or /api calls;
// results never leave this browser. `?demo=1` runs the shortened demo protocols.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
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
if (rootEl) createRoot(rootEl).render(<StandaloneApp />);

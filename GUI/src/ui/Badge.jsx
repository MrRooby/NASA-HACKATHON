import { useT } from '../i18n/index.js';
import './ui.css';

const KEYS = { synthetic: 'ui.badgeSynthetic', simulated: 'ui.badgeSimulated', demo: 'ui.badgeDemo', todo: 'ui.badgeTodo', live: 'ui.badgeLive' };

/** <Badge kind="synthetic|simulated|demo|todo|live" />: small data-provenance tag. */
export function Badge({ kind, className = '', title }) {
  const t = useT();
  const k = String(kind || 'demo').toLowerCase();
  const text = KEYS[k] ? t(KEYS[k]) : String(kind).toUpperCase();
  return <span className={`ui-badge ui-badge--${k} ${className}`.trim()} data-badge={k} title={title}>{text}</span>;
}

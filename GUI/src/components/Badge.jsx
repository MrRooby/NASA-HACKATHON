import React from 'react';
import { useT } from '../i18n/index.js';
import { cx } from './cx.js';

/** Known data-provenance badges: kind -> { label key, tone }. */
export const BADGE_KINDS = {
  synthetic: { key: 'common.badgeSynthetic', tone: 'caution' },
  simulated: { key: 'common.badgeSimulated', tone: 'caution' },
  fictional: { key: 'common.badgeFictional', tone: 'info' },
  todo: { key: 'common.badgeTodo', tone: 'alert' },
  real: { key: 'common.badgeReal', tone: 'ok' },
  demo: { key: 'common.badgeDemo', tone: 'dim' },
};

/**
 * Small bordered tag, e.g. SYNTHETIC / SIMULATED / FICTIONAL / TODO.
 * props: kind (one of BADGE_KINDS; gives the translated label and the tone),
 *        tone 'accent'|'ok'|'caution'|'alert'|'info'|'dim' (overrides), children (overrides the label).
 */
export default function Badge({ kind, tone, className, children, ...rest }) {
  const t = useT();
  const known = BADGE_KINDS[kind];
  const label = children ?? (known ? t(known.key) : String(kind ?? '').toUpperCase());
  return (
    <span className={cx("badge", `badge-${tone || known?.tone || "accent"}`, className)} data-kind={kind} data-badge={kind || "tag"} {...rest}>
      {label}
    </span>
  );
}

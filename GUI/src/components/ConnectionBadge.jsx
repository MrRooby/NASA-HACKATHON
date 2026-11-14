import React from 'react';
import { useT } from '../i18n/index.js';
import { cx } from './cx.js';

/**
 * Connection state of the MOTHER backend.
 * props: mode 'online'|'connecting'|'offline' (useMother().mode), error ({ message, hint } | null).
 * Shows LIVE · MOTHER / CONNECTING… / OFFLINE · DEMO; the tooltip carries the error and its hint.
 */
export default function ConnectionBadge({ mode, error, className }) {
  const t = useT();
  const state = mode === 'online' || mode === 'connecting' ? mode : 'offline';
  const text = { online: t('common.connLive'), connecting: t('common.connConnecting'), offline: t('common.connOffline') }[state];
  const title = {
    online: t('common.connLiveHint'),
    connecting: t('common.connConnectingHint'),
    offline: [error?.message, error?.hint].filter(Boolean).join(' · ') || t('common.connUnreachable'),
  }[state];
  return (
    <span className={cx('conn', `conn-${state}`, className)} data-mode={state} title={title} role="status">
      <span className="conn-mark" aria-hidden="true" />
      {text}
    </span>
  );
}

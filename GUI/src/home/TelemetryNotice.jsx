import React from 'react';
import { cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { noticeKey } from './useCrewReport.js';
import './wearable.css';

/**
 * One terminal line about where the data on screen comes from: "AWAITING TELEMETRY…",
 * "LINK LOST — SHOWING DEMO DATA", a report error ... Renders nothing for live data.
 * props: source = result of useCrewReport(), code = viewed crew code.
 */
export default function TelemetryNotice({ source, code }) {
  const t = useT();
  const key = noticeKey(source.state, source.mode);
  if (!key) return null;
  const fault = source.state === 'error';
  const detail = fault ? [source.error?.message, source.error?.hint].filter(Boolean).join(' · ') : null;
  return (
    <p
      className={cx('tele-notice', `tele-${source.state}`)}
      role={fault ? 'alert' : 'status'}
      data-state={source.state}
    >
      {t(key, { code: code ?? '—' })}{detail ? `: ${detail}` : ''}
      {source.state === 'awaiting' ? <span className="cursor" /> : null}
    </p>
  );
}

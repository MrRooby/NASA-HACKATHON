import React, { useRef } from 'react';
import { useT } from '../i18n/index.js';
import { PixelAvatar, PixelIcon } from '../pixel/index.js';
import { PagerControls, StatusShape, useFitCount, usePager } from '../ui/index.js';
import { useAlerts } from './useAlerts.js';
import './tasks.css';

export const ALERT_ROW_H = 58; // px incl. gap; keep in sync with .ap-row in tasks.css
const PAGER_H = 40;

function AlertRow({ item, crew, navigate, t }) {
  return (
    <button
      type="button"
      className={`ap-row is-${item.severity}`}
      data-alert={item.id}
      data-severity={item.severity}
      onClick={() => item.target && navigate?.(item.target)}
      aria-label={t('tasks.open', { title: `${item.title}${item.detail ? `: ${item.detail}` : ''}` })}
      title={item.detail || item.title}
    >
      <span className="ap-sev"><StatusShape status={item.severity === 'info' ? 'no_data' : item.severity} size={14} /></span>
      <PixelIcon name={item.icon} size={32} />
      <span className="ap-text">
        <span className="ap-title">{item.title}</span>
        {item.detail && <span className="ap-detail">{item.detail}</span>}
      </span>
      {crew && item.code && <PixelAvatar code={item.code} size={28} />}
    </button>
  );
}

/**
 * ALERTS panel (side panel, under TO DO): what is wrong now, shape-coded severity, one click
 * to the source. Paged to fit, no scrolling. props: { mother, route, navigate }
 */
export function AlertPanel({ mother, route, navigate, className = '' }) {
  const t = useT();
  const { items, counts } = useAlerts({ mother, route });
  const crew = !route?.code;
  const listRef = useRef(null);
  const fit = useFitCount(listRef, ALERT_ROW_H, { reserve: PAGER_H, fallback: 4 });
  const pager = usePager(items, fit);
  const worst = counts.alert ? 'alert' : counts.caution ? 'caution' : 'ok';

  return (
    <section className={`ap is-${worst} ${className}`.trim()} aria-label={t('tasks.alertsLabel')}>
      <header className="ap-head">
        <PixelIcon name={counts.alert ? 'alert' : counts.caution ? 'caution' : 'ok'} size={24} />
        <h2 className="ap-heading">{t('tasks.alerts')}</h2>
        <span className="ap-counts" data-testid="alert-counts">
          {counts.alert > 0 && <span className="ap-count is-alert"><StatusShape status="alert" size={12} />{counts.alert}</span>}
          {counts.caution > 0 && <span className="ap-count is-caution"><StatusShape status="caution" size={12} />{counts.caution}</span>}
        </span>
      </header>
      <div className="ap-body" ref={listRef}>
        {items.length === 0 ? (
          <p className="ap-empty"><StatusShape status="ok" size={14} /> {t('tasks.noAlerts')}</p>
        ) : (
          <ul className="ap-list">
            {pager.pageItems.map(item => (
              <li key={item.id}><AlertRow item={item} crew={crew} navigate={navigate} t={t} /></li>
            ))}
          </ul>
        )}
        <PagerControls
          page={pager.page}
          pageCount={pager.pageCount}
          onPrev={pager.prev}
          onNext={pager.next}
          label={t('tasks.alertsLabel')}
          className="ap-pager"
        />
      </div>
    </section>
  );
}

export default AlertPanel;

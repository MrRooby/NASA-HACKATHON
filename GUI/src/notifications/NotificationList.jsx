import React from 'react';
import { Button, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import './notifications.css';

const SOURCE_KEYS = {
  organ: 'home.notifSourceOrgan',
  device: 'home.notifSourceDevice',
  habitat: 'home.notifSourceHabitat',
  event: 'home.notifSourceEvent',
};

function SeverityTag({ severity }) {
  if (severity === 'alert' || severity === 'caution') return <StatusTag status={severity} />;
  return <span className="stag notif-info-tag" data-status="info">[ INFO ]</span>;
}

/**
 * Terminal-style list of notifications (see buildNotifications.js for the item shape).
 * props: items (array; null/empty -> empty state), onOpen(target, item) for the [ OPEN ] button
 *        (no button without onOpen or without item.target), emptyText (defaults to
 *        "NO ACTIVE NOTIFICATIONS"), className.
 */
export default function NotificationList({ items, onOpen, emptyText, className }) {
  const t = useT();
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    return <p className={cx('notif-empty', className)} role="status">{emptyText ?? t('home.notifEmpty')}</p>;
  }

  return (
    <ol className={cx('notif-list', className)} aria-label={t('home.notifListLabel')}>
      {list.map(item => (
        <li
          key={item.id}
          className={cx('notif', `notif-${item.severity}`)}
          data-id={item.id}
          data-severity={item.severity}
          data-source={item.source}
        >
          <div className="notif-head">
            <SeverityTag severity={item.severity} />
            <span className="notif-source">{SOURCE_KEYS[item.source] ? t(SOURCE_KEYS[item.source]) : item.source}</span>
            <span className="notif-title">{item.title}</span>
            {onOpen && item.target ? (
              <Button
                small
                className="notif-open"
                aria-label={`${t('common.open')}: ${item.title}`}
                onClick={() => onOpen(item.target, item)}
              >
                {t('common.open')}
              </Button>
            ) : null}
          </div>
          {item.detail ? <p className="notif-detail">{item.detail}</p> : null}
          {item.action ? (
            <p className="notif-action"><span className="notif-prompt" aria-hidden="true">&gt; </span>{item.action}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

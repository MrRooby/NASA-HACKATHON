import React, { useState } from 'react';
import { Button, DataRow, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { formatValue } from './format.js';
import './wearable.css';

/**
 * One MOTHER organ card: label, status, headline, up to 3 metrics, `> action` when the
 * status is not ok, and a [ WHY? ] toggle revealing the rule behind it.
 * props: card (contract 1.1), highlighted (bool), compact (bool: no metrics, no why).
 */
export default function OrganCard({ card, highlighted = false, compact = false, className }) {
  const t = useT();
  const [showWhy, setShowWhy] = useState(false);
  const status = card.status ?? 'no_data';
  const metrics = compact ? [] : (card.metrics || []).slice(0, 3);
  return (
    <article
      className={cx('organ-card', `organ-${status}`, highlighted && 'is-highlight', className)}
      data-organ={card.organ}
      data-status={status}
      aria-label={card.label}
    >
      <header className="organ-head">
        <h3>{card.label}</h3>
        <StatusTag status={status} />
      </header>
      <div className="organ-body">
        <p className="organ-headline">{card.headline}</p>
        {metrics.map(metric => (
          <DataRow
            key={metric.name}
            label={metric.name}
            value={formatValue(metric.value)}
            unit={metric.unit}
            status={metric.status && metric.status !== 'ok' ? metric.status : undefined}
          />
        ))}
        {status !== 'ok' && card.action ? (
          <p className="organ-action"><span className="organ-prompt" aria-hidden="true">&gt; </span>{card.action}</p>
        ) : null}
        {!compact && card.why ? (
          <div className="organ-why-wrap">
            <Button small variant="ghost" aria-expanded={showWhy} onClick={() => setShowWhy(open => !open)}>
              {showWhy ? t('wearables.whyHide') : t('wearables.why')}
            </Button>
            {showWhy ? <p className="organ-why">{card.why}</p> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

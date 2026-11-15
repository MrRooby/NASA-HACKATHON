import React from 'react';
import { useI18n } from '../i18n/index.js';

/** Full-cover loading veil of the CREW screen: the content below is greyed out, one big word on top. */
export default function CrewLoading() {
  const { t } = useI18n();
  return (
    <div className="crew-loading" role="status" aria-live="polite" data-testid="crew-loading">
      <span className="crew-loading-text">{t('common.loading')}</span>
    </div>
  );
}

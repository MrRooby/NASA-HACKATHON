import React, { useEffect, useRef } from 'react';
import { StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';

/**
 * Full-window data dialog for a touch screen: title bar with a big X, content that must fit
 * without scrolling. Closes on X, Escape, or a tap on the dimmed backdrop.
 * props: title, status (optional StatusTag), icon (NavIcon name), onClose, children.
 */
export default function DataDialog({ title, status, icon, onClose, children }) {
  const t = useT();
  const closeRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [onClose]);

  return (
    <div className="dlg-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dlg" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="dlg-head">
          {icon ? <NavIcon name={icon} className="dlg-icon" /> : null}
          <h2 className="dlg-title">{title}</h2>
          {status ? <StatusTag status={status} className="dlg-status" /> : null}
          <button ref={closeRef} type="button" className="dlg-close" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
            <NavIcon name="close" />
          </button>
        </header>
        <div className="dlg-body">{children}</div>
      </section>
    </div>
  );
}

/** Page through a list without scrolling: ‹ 1/3 › with big touch buttons. */
export function Pager({ page, pages, onPage }) {
  const t = useT();
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" className="pager-btn" aria-label={t('home.pagePrev')} disabled={page <= 0} onClick={() => onPage(page - 1)}>
        <NavIcon name="prev" />
      </button>
      <span className="pager-pos">{t('home.pageOf', { n: page + 1, total: pages })}</span>
      <button type="button" className="pager-btn" aria-label={t('home.pageNext')} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <NavIcon name="next" />
      </button>
    </div>
  );
}

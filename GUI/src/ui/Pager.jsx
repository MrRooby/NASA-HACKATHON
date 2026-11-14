import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/index.js';
import './ui.css';

/** usePager(items, pageSize) → { page, pageCount, pageItems, setPage, next, prev, hasPrev, hasNext }. */
export function usePager(items, pageSize) {
  const list = items || [];
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const [rawPage, setRawPage] = useState(0);
  const page = Math.min(rawPage, pageCount - 1);
  useEffect(() => {
    if (rawPage > pageCount - 1) setRawPage(pageCount - 1);
  }, [rawPage, pageCount]);
  const setPage = useCallback(p => setRawPage(Math.max(0, Math.min(pageCount - 1, p))), [pageCount]);
  const next = useCallback(() => setRawPage(p => Math.min(pageCount - 1, Math.min(p, pageCount - 1) + 1)), [pageCount]);
  const prev = useCallback(() => setRawPage(p => Math.max(0, Math.min(p, pageCount - 1) - 1)), [pageCount]);
  const pageItems = useMemo(() => list.slice(page * size, page * size + size), [list, page, size]);
  return { page, pageCount, pageItems, setPage, next, prev, hasPrev: page > 0, hasNext: page < pageCount - 1 };
}

/**
 * useFitCount(ref, itemHeight, { min=1, reserve=0, fallback=5 }) → how many rows of itemHeight px
 * fit in the element's height (minus reserve px for controls). Tracks resizes (ResizeObserver).
 */
export function useFitCount(ref, itemHeight, { min = 1, reserve = 0, fallback = 5 } = {}) {
  const [count, setCount] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.clientHeight;
      if (!h) return;
      setCount(Math.max(min, Math.floor((h - reserve) / Math.max(1, itemHeight))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, itemHeight, min, reserve]);
  return count;
}

/** ‹ n/m › controls; hidden when there is a single page. */
export function PagerControls({ page, pageCount, onPrev, onNext, label, className = '' }) {
  const t = useT();
  if (pageCount <= 1) return null;
  return (
    <div className={`ui-pager__controls ${className}`.trim()} role="group" aria-label={label}>
      <button type="button" className="ui-pager__btn" onClick={onPrev} disabled={page <= 0} aria-label={t('ui.pagerPrev')}>‹</button>
      <span className="ui-pager__page" aria-live="polite" aria-label={t('ui.pagerLabel', { n: page + 1, m: pageCount })}>
        {t('ui.pagerPage', { n: page + 1, m: pageCount })}
      </span>
      <button type="button" className="ui-pager__btn" onClick={onNext} disabled={page >= pageCount - 1} aria-label={t('ui.pagerNext')}>›</button>
    </div>
  );
}

/**
 * <Pager items pageSize render label? className? as? />: no-scroll list; render(item, index) per row.
 * ←/→ and PageUp/PageDown change the page while focus is inside.
 */
export function Pager({ items, pageSize = 5, render, label, className = '', listClassName = '', empty = null }) {
  const pager = usePager(items, pageSize);
  const onKeyDown = event => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { pager.next(); event.preventDefault(); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { pager.prev(); event.preventDefault(); }
  };
  const offset = pager.page * Math.max(1, Math.floor(pageSize) || 1);
  return (
    <div className={`ui-pager ${className}`.trim()} onKeyDown={onKeyDown} data-page={pager.page + 1} data-pages={pager.pageCount}>
      {(items || []).length === 0 ? empty : (
        <ul className={`ui-pager__list ${listClassName}`.trim()} aria-label={label}>
          {pager.pageItems.map((item, i) => (
            <li key={item?.id ?? item?.key ?? offset + i} className="ui-pager__item">{render(item, offset + i)}</li>
          ))}
        </ul>
      )}
      <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={label} />
    </div>
  );
}

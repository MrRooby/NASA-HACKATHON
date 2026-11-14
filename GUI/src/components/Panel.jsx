import React from 'react';
import { cx } from './cx.js';

export const PANEL_TONES = ['default', 'ok', 'caution', 'alert'];

/**
 * Framed terminal panel with corner brackets and a header line: [ TITLE ] ───── meta
 * props: title (node), meta (node), tone 'default'|'ok'|'caution'|'alert', className, children;
 * other props go to the <section>.
 */
export default function Panel({ title, meta, tone = 'default', className, children, ...rest }) {
  const safeTone = PANEL_TONES.includes(tone) ? tone : 'default';
  return (
    <section className={cx('panel', `panel-tone-${safeTone}`, className)} data-tone={safeTone} {...rest}>
      {(title != null || meta != null) && (
        <div className="panel-head">
          {title != null && <h2 className="panel-title">{title}</h2>}
          <span className="panel-rule" aria-hidden="true" />
          {meta != null && <span className="panel-meta">{meta}</span>}
        </div>
      )}
      <div className="panel-body">{children}</div>
      <span className="panel-corners" aria-hidden="true" />
    </section>
  );
}

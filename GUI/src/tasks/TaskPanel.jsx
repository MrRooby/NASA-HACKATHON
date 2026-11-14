import React, { useMemo, useRef } from 'react';
import { useT } from '../i18n/index.js';
import { PixelAvatar, PixelIcon } from '../pixel/index.js';
import { PagerControls, StatusShape, useFitCount, usePager } from '../ui/index.js';
import { useTasks } from './useTasks.js';
import './tasks.css';

export const TASK_ROW_H = 54; // px incl. the 4-px gap; keep in sync with .tp-row in tasks.css
const PAGER_H = 40;
const MAX_BLOCKS = 20;

/** Due word: NOW / TODAY / SOL n. */
function dueText(item, t) {
  if (item.due === 'now') return t('tasks.dueNow');
  if (item.due === 'today') return t('tasks.dueToday');
  return t('tasks.dueSol', { n: item.dueSol });
}

/**
 * Crew view: the same routine task of several people becomes one row with their avatars
 * (done ones ticked). Findings (organ, cognitive, habitat) stay one row per person.
 */
export function groupForCrew(items) {
  const rows = [];
  const groups = new Map();
  for (const item of items) {
    if (item.source !== 'routine') { rows.push({ key: item.id, items: [item], lead: item }); continue; }
    const key = `${item.kind}:${item.dueSol}`;
    if (!groups.has(key)) {
      const row = { key, items: [], lead: item, grouped: true };
      groups.set(key, row);
      rows.push(row);
    }
    groups.get(key).items.push(item);
  }
  // A group counts as done only when everybody is done; re-sort so open groups come first.
  return rows
    .map(row => ({ ...row, done: row.items.every(item => item.done) }))
    .sort((a, b) => Number(a.done) - Number(b.done));
}

/** Pixel progress bar: blocks filled for the share of done tasks. */
function ProgressBlocks({ done, total }) {
  const blocks = Math.min(MAX_BLOCKS, Math.max(total, 1));
  const filled = total ? Math.round((done / total) * blocks) : 0;
  return (
    <div className="tp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      {Array.from({ length: blocks }, (_, i) => <span key={i} className={i < filled ? 'is-on' : ''} />)}
    </div>
  );
}

function CheckBox({ item, onToggle, t }) {
  const byMeasurement = item.doneBy === 'measurement';
  const label = byMeasurement ? t('tasks.doneByMeasurement') : t(item.done ? 'tasks.markUndone' : 'tasks.markDone', { title: item.title });
  return (
    <button
      type="button"
      className={`tp-check${item.done ? ' is-done' : ''}`}
      aria-pressed={item.done}
      aria-label={label}
      title={label}
      disabled={byMeasurement}
      onClick={() => onToggle(item)}
    >
      {item.done && <PixelIcon name="check" size={20} />}
    </button>
  );
}

function TaskRow({ row, crew, navigate, onToggle, t }) {
  const { lead } = row;
  const open = row.items.find(item => !item.done) || lead;
  const doneCount = row.items.filter(item => item.done).length;
  const priority = row.done ? 'done' : lead.priority;
  const overdue = !row.done && lead.source === 'routine' && lead.due === 'now';
  return (
    <div className={`tp-row is-${priority}`} data-task={lead.id} data-priority={lead.priority} data-done={row.done}>
      <button
        type="button"
        className="tp-main"
        onClick={() => navigate?.(open.target)}
        aria-label={t('tasks.open', { title: lead.title })}
        title={lead.detail || lead.title}
      >
        <PixelIcon name={lead.icon} size={32} />
        <span className="tp-text">
          <span className="tp-title">{lead.title}</span>
          <span className="tp-sub">
            <span className="tp-due" data-due={lead.due}>
              {(lead.priority === 'alert' || lead.priority === 'caution') && !row.done && (
                <StatusShape status={lead.priority} size={11} />
              )}
              {overdue ? t('tasks.overdue') : dueText(lead, t)}
            </span>
            {lead.detail && !row.done && <span className="tp-detail">{lead.detail}</span>}
          </span>
        </span>
        {crew && (
          <span className={`tp-who${row.grouped ? ' is-group' : ''}`}>
            {row.items.filter(item => item.code).slice(0, 4).map(item => (
              <span key={item.id} className={`tp-avatar${item.done ? ' is-done' : ''}`}>
                <PixelAvatar code={item.code} size={row.grouped ? 22 : 26} title={item.who ?? undefined} />
              </span>
            ))}
            {!lead.code && <PixelIcon name="base" size={24} />}
          </span>
        )}
      </button>
      {row.grouped && crew
        ? <span className="tp-count" aria-label={t('tasks.progress', { done: doneCount, total: row.items.length })}>{doneCount}/{row.items.length}</span>
        : <CheckBox item={lead} onToggle={onToggle} t={t} />}
    </div>
  );
}

/**
 * TO DO panel (top of the side panel, always visible). Fits its box: as many rows as the
 * height allows, the rest on further pages (‹ 1/3 ›), never a scroll bar.
 * props: { mother, route, navigate }
 */
export function TaskPanel({ mother, route, navigate, className = '' }) {
  const t = useT();
  const { items, toggleDone, counts, sol, scopeCode } = useTasks({ mother, route });
  const crew = !scopeCode;
  const rows = useMemo(() => (crew ? groupForCrew(items) : items.map(item => ({ key: item.id, items: [item], lead: item, done: item.done }))), [crew, items]);
  const listRef = useRef(null);
  const fit = useFitCount(listRef, TASK_ROW_H, { reserve: PAGER_H, fallback: 6 });
  const pager = usePager(rows, fit);

  return (
    <section className={`tp ${className}`.trim()} aria-label={t('tasks.listLabel')} data-scope={crew ? 'crew' : scopeCode}>
      <header className="tp-head">
        <PixelIcon name="calendar" size={24} />
        <h2 className="tp-heading">{sol != null ? t('tasks.todoSol', { n: sol }) : t('tasks.todoNoSol')}</h2>
        <span className="tp-score" data-testid="task-progress">{counts.done}/{counts.total}</span>
      </header>
      <ProgressBlocks done={counts.done} total={counts.total} />
      <div className="tp-body" ref={listRef}>
        {rows.length === 0 ? (
          <p className="tp-empty">{t('tasks.noTasks')}</p>
        ) : (
          <ul className="tp-list">
            {pager.pageItems.map(row => (
              <li key={row.key}>
                <TaskRow row={row} crew={crew} navigate={navigate} onToggle={toggleDone} t={t} />
              </li>
            ))}
          </ul>
        )}
        <PagerControls
          page={pager.page}
          pageCount={pager.pageCount}
          onPrev={pager.prev}
          onNext={pager.next}
          label={t('tasks.listLabel')}
          className="tp-pager"
        />
      </div>
    </section>
  );
}

export default TaskPanel;

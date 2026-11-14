import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelIcon } from '../pixel/index.js';
import { Badge, PagerControls, PixelFrame, RangeBar, Sparkline, StatusMark, useFitCount, usePager } from '../ui/index.js';
import { latestMeasurement } from '../shared/measurements.js';
import { ActionCard } from './ActionCard.jsx';
import { HAZARDS, ORGAN_BY_ID } from './catalog.js';
import { CognitiveTiles } from './CognitiveTiles.jsx';
import { HeroArt } from './HeroArt.jsx';
import { bandsRange, checkBands, knownStatus, normalRange, rateField } from './rating.js';
import { TrendChart, useBoxSize } from './TrendChart.jsx';
import { useOrganTrend } from './useOrganTrend.js';
import './organs.css';

// Right half of the PERSON screen (DESIGN.md §4.2): one organ.
//   head      hero pixel art, name, status, MOTHER headline, WHY? toggle, sibling tabs
//   DO NOW    MOTHER's action for a caution / alert card
//   content   one of: metric rows (range bar + sparkline, paged) | enlarged chart | WHY | action card
//   actions   big icon buttons (always visible)
// Nothing scrolls: the content area swaps instead of growing.

const ROW_HEIGHT = 62;
const COMPACT_ROW_HEIGHT = 50; // organs.css: phones (same media query)
const COMPACT_QUERY = '(max-height: 560px), (orientation: portrait) and (max-width: 900px)';

function useCompact() {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(COMPACT_QUERY).matches : false);
  const [compact, setCompact] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return compact;
}
const isNumber = value => typeof value === 'number' && Number.isFinite(value);

const fmt = value => {
  if (!isNumber(value)) return value == null ? '—' : String(value);
  const abs = Math.abs(value);
  return String(abs >= 100 ? Math.round(value) : abs >= 10 ? +value.toFixed(1) : +value.toFixed(2));
};

/** Metric rows of one organ: MOTHER checks first, then the person's own latest entries. */
export function buildRows({ card, organ, code, trend, t }) {
  const rows = [];
  const checks = card?.checks?.length ? card.checks : (card?.metrics || []).map(metric => ({ ...metric, label: metric.name, code: metric.name }));
  for (const check of checks) {
    const bands = checkBands(check);
    rows.push({
      id: `m:${check.code}`,
      label: check.label ?? check.name ?? check.code,
      value: check.value,
      unit: check.unit ?? '',
      status: knownStatus(check.status),
      bands,
      series: trend.series[check.code] || [],
      check,
    });
  }
  for (const action of ORGAN_BY_ID[organ]?.actions || []) {
    if (action.type !== 'number' && action.type !== 'pick') continue;
    const entry = code ? latestMeasurement(code, action.kind) : null;
    if (!entry) continue;
    const fields = action.type === 'number' ? action.fields : [{ key: action.field, configId: action.configId, unit: '' }];
    for (const field of fields) {
      const value = entry.values?.[field.key];
      if (!isNumber(value)) continue;
      const option = action.options?.find(item => item.value === value);
      const rating = option?.status && !action.configId ? { status: option.status, bands: null } : rateField(field, value);
      rows.push({
        id: `s:${action.kind}.${field.key}`,
        label: fields.length > 1 ? `${t(`organs.act_${action.id}`)} · ${t(`organs.field_${field.key}`)}` : t(`organs.act_${action.id}`),
        icon: action.icon,
        value: option?.label ?? value,
        unit: option?.label ? '' : field.unit,
        status: rating.status ?? 'no_data',
        bands: rating.bands,
        series: [],
        own: trend.own[`${action.kind}.${field.key}`] || [],
        self: true,
      });
    }
  }
  return rows;
}

function MetricRow({ row, onOpen, focused }) {
  const t = useT();
  const numeric = isNumber(row.value);
  const range = numeric && row.bands ? bandsRange(row.bands, row.value) : null;
  const normal = row.bands ? normalRange(row.bands) : null;
  const values = (row.self ? row.own : row.series).map(point => point.value);
  return (
    <div className="metric-row" data-status={row.status} data-focused={focused ? 'true' : undefined} data-testid={`metric-${row.id}`}>
      <div className="metric-name">
        <StatusMark status={row.status} size="sm" label={false} />
        {row.self ? <span className="metric-self">{t('organs.self')}</span> : null}
        <span className="metric-label" title={row.label}>{row.label}</span>
      </div>
      <div className="metric-value">
        <strong>{fmt(row.value)}</strong>
        {row.unit ? <span className="metric-unit" title={row.unit}>{row.unit}</span> : null}
      </div>
      <div className="metric-bar">
        {range
          ? <RangeBar value={row.value} min={range[0]} max={range[1]} low={normal?.[0]} high={normal?.[1]} status={row.status} unit={row.unit} compact />
          : <div className="metric-statusbar" data-status={row.status} />}
      </div>
      <button type="button" className="metric-spark" onClick={() => onOpen(row)} aria-label={t('organs.openTrend', { what: row.label })} disabled={values.length < 1}>
        <Sparkline values={values} status={row.status} low={normal?.[0] ?? undefined} high={normal?.[1] ?? undefined} width={84} height={26} />
      </button>
    </div>
  );
}

/** Row whose trend is drawn under the rows when there is room: the worst numeric row with a trend. */
const focusRow = rows => {
  const rank = { alert: 3, caution: 2, ok: 1, no_data: 0 };
  const withTrend = rows.filter(row => isNumber(row.value) && (row.self ? row.own : row.series).length >= 2);
  return withTrend.sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0))[0] || null;
};

const INLINE_CHART_MIN = 170;

function MetricList({ rows, onOpen, emptyText, sol, demo }) {
  const t = useT();
  const box = useRef(null);
  const { height } = useBoxSize(box);
  const rowHeight = useCompact() ? COMPACT_ROW_HEIGHT : ROW_HEIGHT;
  const fitAll = useFitCount(box, rowHeight, { min: 1, fallback: 4 });
  const fitPaged = useFitCount(box, rowHeight, { min: 1, reserve: 40, fallback: 3 });
  const pageSize = rows.length > fitAll ? fitPaged : fitAll;
  const pager = usePager(rows, pageSize);
  const focus = focusRow(rows);
  const room = height - rows.length * rowHeight;
  const inline = rows.length <= fitAll && focus && room >= INLINE_CHART_MIN;
  return (
    <div className="metric-list" ref={box}>
      {rows.length === 0 ? <p className="organ-empty"><PixelIcon name="no_data" size={32} /> {emptyText}</p> : (
        <>
          <div className="metric-rows">
            {pager.pageItems.map(row => <MetricRow key={row.id} row={row} onOpen={onOpen} focused={inline && row.id === focus.id} />)}
          </div>
          <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={t('organs.metrics')} />
          {inline ? (
            <div className="metric-inline-chart" data-testid="inline-chart">
              <TrendChart series={focus.series} own={focus.own || []} bands={focus.bands} unit={focus.unit} label={focus.label} currentSol={sol} />
              {demo && <Badge kind="demo" className="organ-chart-badge" />}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function WhyView({ organ, card }) {
  const t = useT();
  const def = ORGAN_BY_ID[organ];
  const hazard = HAZARDS[def?.hazard];
  const checks = (card?.checks || []).filter(check => check.formula || check.reference);
  const box = useRef(null);
  const fit = useFitCount(box, 64, { min: 1, reserve: 40, fallback: 3 });
  const pager = usePager(checks, fit);
  return (
    <div className="organ-why" data-testid="why-view">
      <p className="why-line"><PixelIcon name={def?.icon} size={32} /> <span>{t(`organs.what_${organ}`)}</span></p>
      <p className="why-line why-hazard"><PixelIcon name={hazard?.icon} size={32} /> <span><b>{t(`organs.hrp_${def?.hazard}`)}:</b> {t(`organs.hazard_${organ}`)}</span></p>
      <div className="why-checks" ref={box}>
        {pager.pageItems.map(check => (
          <div key={check.code} className="why-check">
            <span className="why-check-name">{check.label}</span>
            <span className="why-formula">{check.formula}</span>
            <span className="why-ref">
              <Badge kind={check.basis === 'team_assumption' ? 'todo' : 'live'} className="why-basis" title={check.basis} />
              <span className="why-basis-word">{t(check.basis === 'team_assumption' ? 'organs.basisTeam' : 'organs.basisSource')}</span>
              {check.reference}
            </span>
          </div>
        ))}
        <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={t('organs.why')} />
      </div>
    </div>
  );
}

/**
 * <OrganPanel organ report code sol online siblings statuses onSelectOrgan navigate />
 *   organ     organ id (catalog.js)
 *   report    organ report shown (live or demo) or null
 *   siblings  organ ids shown as tabs (organs that share a body segment)
 *   statuses  { organ: status } for the tab marks
 */
export function OrganPanel({ organ, report, code, sol = null, recordSol = null, online = false, siblings = [], statuses = {}, onSelectOrgan, navigate }) {
  const t = useT();
  const def = ORGAN_BY_ID[organ];
  const card = (report?.organs || []).find(item => item.organ === organ) || null;
  const status = card ? knownStatus(card.status) : 'no_data';
  const trend = useOrganTrend(code, organ, { sol, online, report });
  const [view, setView] = useState({ mode: 'metrics' });
  const rows = useMemo(() => buildRows({ card, organ, code, trend, t }), [card, organ, code, trend, t]);
  if (!def) return null;

  const openAction = action => {
    if (action.type === 'test') {
      navigate?.({ screen: 'test', code, test: action.test });
      return;
    }
    setView(current => (current.mode === 'action' && current.action === action.id ? { mode: 'metrics' } : { mode: 'action', action: action.id }));
  };
  const openRow = row => setView({ mode: 'chart', row: row.id });
  const chartRow = view.mode === 'chart' ? rows.find(row => row.id === view.row) : null;
  const activeAction = view.mode === 'action' ? def.actions.find(action => action.id === view.action) : null;
  const doNow = card && (status === 'caution' || status === 'alert') ? card.action : null;

  let content;
  if (activeAction) {
    content = <ActionCard action={activeAction} code={code} sol={recordSol} report={report} onClose={() => setView({ mode: 'metrics' })} />;
  } else if (view.mode === 'why') {
    content = <WhyView organ={organ} card={card} />;
  } else if (chartRow) {
    content = (
      <div className="organ-chart">
        <button type="button" className="organ-back" onClick={() => setView({ mode: 'metrics' })}>
          <PixelIcon name="back" size={20} /> {t('organs.backToMetrics')}
        </button>
        <TrendChart series={chartRow.series} own={chartRow.own || []} bands={chartRow.bands} unit={chartRow.unit} label={chartRow.label} currentSol={sol} />
        {trend.demo && <Badge kind="demo" className="organ-chart-badge" />}
      </div>
    );
  } else {
    content = (
      <>
        {organ === 'brain' && <CognitiveTiles code={code} />}
        {report ? (
          <MetricList rows={rows} onOpen={openRow} emptyText={t('organs.noMetrics')} sol={sol} demo={trend.demo} />
        ) : (
          <div className="organ-awaiting" data-testid="awaiting">
            <PixelIcon name="satellite" size={64} animate />
            <span>{t('organs.awaiting')}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <PixelFrame className={`organ-panel ui-frame--${status === 'caution' || status === 'alert' ? status : 'quiet'}`} data-status={status} data-organ={organ} aria-label={t(`organs.name_${organ}`)}>
      {siblings.length > 1 && (
        <div className="organ-tabs" role="tablist" aria-label={t('organs.siblings')}>
          {siblings.map(id => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === organ}
              className="organ-tab"
              data-status={statuses[id] ?? 'no_data'}
              onClick={() => onSelectOrgan?.(id)}
            >
              <PixelIcon name={ORGAN_BY_ID[id]?.icon} size={24} />
              <span>{t(`organs.name_${id}`)}</span>
              <StatusMark status={statuses[id] ?? 'no_data'} size="sm" label={false} />
            </button>
          ))}
        </div>
      )}

      <header className="organ-head">
        <div className="organ-hero"><HeroArt organ={def.hero} size={160} /></div>
        <div className="organ-title">
          <h2 className="organ-name">{t(`organs.name_${organ}`)}</h2>
          <div className="organ-status-line">
            <StatusMark status={status} size="lg" />
            {report?.demo ? <Badge kind="demo" /> : null}
          </div>
          <p className="organ-headline" title={card?.headline || ''}>{card?.headline || t('organs.noHeadline')}</p>
          <p className="organ-hazard" title={t(`organs.hazard_${organ}`)}>
            <PixelIcon name={HAZARDS[def.hazard]?.icon} size={20} /> <span>{t(`organs.hazard_${organ}`)}</span>
          </p>
        </div>
        <button
          type="button"
          className="organ-why-btn"
          aria-pressed={view.mode === 'why'}
          onClick={() => setView(current => (current.mode === 'why' ? { mode: 'metrics' } : { mode: 'why' }))}
        >
          {view.mode === 'why' ? t('organs.whyClose') : t('organs.why')}
        </button>
      </header>

      {doNow && (
        <div className="organ-donow" data-status={status} role="alert">
          <span className="organ-donow-tag"><PixelIcon name={status === 'alert' ? 'alert' : 'caution'} size={24} /> {t('organs.doNow')}</span>
          <span className="organ-donow-text" title={doNow}>{doNow}</span>
        </div>
      )}

      <div className="organ-content" data-mode={activeAction ? 'action' : view.mode}>{content}</div>

      <nav className="organ-actions" aria-label={t('organs.actions')} data-count={def.actions.length}>
        {def.actions.map(action => (
          <button
            key={action.id}
            type="button"
            className="organ-action"
            data-action={action.id}
            aria-pressed={activeAction?.id === action.id}
            onClick={() => openAction(action)}
          >
            <PixelIcon name={action.icon} size={32} />
            <span className="organ-action-label">{t(`organs.act_${action.id}`)}</span>
            {action.todo ? <Badge kind="todo" className="organ-action-todo" /> : null}
          </button>
        ))}
      </nav>
    </PixelFrame>
  );
}

export default OrganPanel;

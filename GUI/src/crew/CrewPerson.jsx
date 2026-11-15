import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, StatusTag } from '../components/index.js';
import CrewPortrait from './CrewPortrait.jsx';
import { useI18n } from '../i18n/index.js';
import { rosterProfile } from './roster.js';
import { useCrewReport } from '../home/useCrewReport.js';
import { ORGANS, crewHealth, findLocation, localized, zoneName } from './crewStatus.js';
import CrewChart from './CrewChart.jsx';
import { useCrewSeries } from './useCrewSeries.js';
import { LIVE_SECONDS, SIGNALS, useSimulatedVitals } from './useSimulatedVitals.js';
import {
  METRICS, TILE_WINDOW, WINDOWS, bandStatus, latestPoint, normalRanges, seriesExtent, windowStats, worstStatus,
} from './crewMetrics.js';
import { STATUS_GLYPH, UI_GLYPH } from './glyphs.js';
import CrewLoading from './CrewLoading.jsx';
import './crewPerson.css';

const STATUS_WORD = { ok: 'common.statusOk', caution: 'common.statusCaution', alert: 'common.statusAlert', no_data: 'common.statusNoData' };
const CHECKS_PER_PAGE = 6;
const REPLAY_STEP_SOLS = 2;
const REPLAY_TICK_MS = 80;
const LIVE = 'live'; // chart window: the simulated last LIVE_SECONDS seconds
const DEFAULT_WINDOW = 90;

/** Fast vitals are simulated per second; slow indicators never are. */
const isFast = metric => metric.lines.every(line => SIGNALS[line.key]);

/**
 * Status as shape + colour + word, never colour alone (DESIGN.md §1). `compact`: the glyph sits right
 * next to what it describes and the word becomes the tooltip / accessible text.
 */
function StatusMark({ status, compact = false }) {
  const { t } = useI18n();
  const word = t(STATUS_WORD[status]);
  return (
    <span className={`crew-mark crew-tone-${status}${compact ? ' crew-mark-compact' : ''}`} data-status={status} title={compact ? word : undefined}>
      <span className="crew-glyph" aria-hidden="true">{STATUS_GLYPH[status]}</span>
      {compact ? <span className="visually-hidden">{word}</span> : <> {word}</>}
    </span>
  );
}

function useNumber(lang) {
  return useMemo(() => {
    const cache = {};
    return (value, digits = 0, signed = false) => {
      if (value == null || !Number.isFinite(value)) return '—';
      cache[digits] ??= new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
      const text = cache[digits].format(value);
      return signed && value > 0 ? `+${text}` : text;
    };
  }, [lang]);
}

/** Everything one metric chart needs at the cursor: lines with tones, the value text and the status. */
function metricView(metric, personSeries, indicators, x1, number) {
  const lines = metric.lines.map(line => {
    const points = personSeries?.[line.key] ?? [];
    const bands = indicators?.[line.key]?.bands;
    const point = latestPoint(points, x1);
    return { ...line, points, bands, point, tone: bandStatus(point?.[1], bands) };
  });
  const status = lines.some(line => line.point) ? worstStatus(lines.map(line => line.tone)) : 'no_data';
  const value = lines.some(line => line.point)
    ? lines.map(line => number(line.point?.[1], metric.digits, metric.signed)).join(metric.joiner ?? ' ')
    : '—';
  return { lines, status, value };
}

/** Overview tile: name and one big number; the chart is in the details (click). */
function MetricTile({ metric, view, selected, onSelect, unit, simulated }) {
  const { t } = useI18n();
  const name = t(`crew.metric_${metric.id}`);
  return (
    <li>
      <button
        type="button"
        className="crew-tile"
        data-metric={metric.id}
        data-status={view.status}
        aria-pressed={selected}
        aria-label={t('crew.showDetails', { name })}
        onClick={() => onSelect(metric.id)}
      >
        <span className="crew-tile-head">
          <span className="crew-tile-name">{name}</span>
          <span className="crew-tile-flags">
            {view.status !== 'ok' ? <StatusMark status={view.status} compact /> : null}
          </span>
        </span>
        <span className="crew-tile-value">
          {view.value} <span className="crew-unit">{unit}</span>
        </span>
      </button>
    </li>
  );
}

function MetricDetail({ metric, solView, simView, sim, personSeries, indicators, extent, solEnd, windowSize, setWindowSize, unit, number, onOrgan }) {
  const { t } = useI18n();
  const name = t(`crew.metric_${metric.id}`);
  const options = simView ? [LIVE, ...WINDOWS] : WINDOWS;
  const active = options.includes(windowSize) ? windowSize : DEFAULT_WINDOW;
  const live = active === LIVE;
  const view = live ? simView : solView;
  const x1 = live ? sim.t : solEnd;
  const x0 = live ? sim.t - LIVE_SECONDS : active == null ? extent[0] : solEnd - active;
  const main = metric.lines[0];
  const indicator = indicators?.[main.key];
  const stats = windowStats((live ? sim.points : personSeries)?.[main.key], x0, x1);
  const axisLabel = live
    ? n => (n >= x1 ? t('crew.now') : t('crew.secondsAgo', { n: x1 - n }))
    : n => t('common.solN', { n });
  const ranges = normalRanges(indicator?.bands);
  const rangeText = ranges.map(([low, high]) => (
    low == null ? `< ${number(high, metric.digits)}` : high == null ? `≥ ${number(low, metric.digits)}` : `${number(low, metric.digits)}–${number(high, metric.digits)}`
  )).join(', ');
  const fmt = value => number(value, metric.digits, metric.signed);

  return (
    <section className="crew-detail" data-detail={metric.id} aria-label={name}>
      <div className="crew-detail-body">
      <div className="crew-detail-head">
        <div className="crew-detail-title">
          <h3>{name}</h3>
          {live ? (
            <span className="crew-detail-source">{t('crew.simNote', { n: Math.round(solEnd) })}</span>
          ) : metric.estimate ? (
            <span className="crew-detail-source">{t(`crew.estimateNote_${metric.id}`)}</span>
          ) : indicator?.label ? <span className="crew-detail-source">{indicator.label}</span> : null}
        </div>
        <div className="crew-detail-now">
          <span className="crew-detail-value">{view.value}</span> <span className="crew-unit">{unit}</span>
          <StatusMark status={view.status} compact />
        </div>
      </div>

      {metric.lines.length > 1 ? (
        <p className="crew-detail-legend">
          {metric.lines.map((line, index) => (
            <span key={line.key} className={`crew-legend-item${index ? ' crew-legend-2' : ''}`}>
              <span className="crew-legend-swatch" aria-hidden="true" />
              {t(`crew.${line.label}`)} {number(view.lines[index].point?.[1], metric.digits)}
            </span>
          ))}
        </p>
      ) : null}

      <div className="crew-windows" role="group" aria-label={t('crew.windowLabel')}>
        {options.map(size => (
          <Button key={size ?? 'all'} small active={active === size} aria-pressed={active === size} onClick={() => setWindowSize(size)}>
            {size === LIVE ? t('crew.windowLive', { n: LIVE_SECONDS }) : size == null ? t('crew.windowAll') : t('crew.windowSols', { n: size })}
          </Button>
        ))}
      </div>

      <CrewChart
        big
        lines={view.lines}
        bands={main && view.lines[0].bands}
        x0={x0}
        x1={x1}
        format={fmt}
        solLabel={axisLabel}
        label={`${name}: ${view.value} ${unit}`}
      />

      <dl className="crew-stats">
        <div><dt>{t('crew.statMin')}</dt><dd>{stats ? fmt(stats.min) : '—'}</dd></div>
        <div><dt>{t('crew.statAvg')}</dt><dd>{stats ? fmt(stats.mean) : '—'}</dd></div>
        <div><dt>{t('crew.statMax')}</dt><dd>{stats ? fmt(stats.max) : '—'}</dd></div>
        <div><dt>{t('crew.statChange')}</dt><dd>{stats ? number(stats.change, metric.digits, true) : '—'}</dd></div>
        <div><dt>{t('crew.normal')}</dt><dd>{rangeText ? `${rangeText} ${unit}` : '—'}</dd></div>
      </dl>

      {indicator?.context ? <p className="crew-detail-context" lang="en">{indicator.context}</p> : null}

      {metric.organ ? (
        <p className="crew-detail-links">
          <Button onClick={() => onOrgan(metric.organ)}>
            {t('crew.openOrgan', { name: t(`crew.organ_${metric.organ}`) })}
          </Button>
        </p>
      ) : null}
      </div>
    </section>
  );
}

/**
 * How many fixed-height rows fit in a list: (list height + gap) / (row height + gap), measured on every
 * resize (ResizeObserver), so the checks are paged instead of overflowing. Without layout (tests) -> 6.
 */
function useRowsThatFit(resetKey) {
  const ref = useRef(null);
  const [count, setCount] = useState(CHECKS_PER_PAGE);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const row = list.firstElementChild;
      const rowHeight = row ? row.getBoundingClientRect().height : 0;
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      if (list.clientHeight > 0 && rowHeight > 0) {
        setCount(Math.max(1, Math.floor((list.clientHeight + gap) / (rowHeight + gap))));
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, [resetKey]);
  return { ref, count };
}

function OrganDetail({ card, organ, number, onMetric }) {
  const { t } = useI18n();
  const [pageIndex, setPage] = useState(0);
  const perPage = useRowsThatFit(organ);
  useEffect(() => setPage(0), [organ]);
  const name = t(`crew.organ_${organ}`);
  const checks = card?.checks ?? [];
  const pages = Math.max(1, Math.ceil(checks.length / perPage.count));
  const page = Math.min(pageIndex, pages - 1);
  const shown = checks.slice(page * perPage.count, (page + 1) * perPage.count);
  const status = card?.status ?? 'no_data';
  const related = METRICS.filter(metric => metric.organ === organ);
  const valueText = check => (typeof check.value === 'number' ? number(check.value, Number.isInteger(check.value) ? 0 : 2) : check.value ?? '—');

  return (
    <section className="crew-detail crew-detail-organ" data-detail={`organ-${organ}`} aria-label={name}>
      <div className="crew-detail-body">
      <div className="crew-detail-head">
        <div className="crew-detail-title">
          <h3>
            {name} <StatusMark status={status} compact />
          </h3>
          {card?.headline && checks.length > 0 ? <span className="crew-detail-source" lang="en">{card.headline}</span> : null}
        </div>
      </div>

      {card?.action ? <p className="crew-organ-note" lang="en"><span className="label">{t('crew.action')}</span> {card.action}</p> : null}
      {card?.why ? <p className="crew-organ-note crew-organ-why" lang="en"><span className="label">{t('crew.why')}</span> {card.why}</p> : null}

      {checks.length === 0 ? (
        <div className="crew-nodata" role="status" data-testid="organ-no-data">
          <p className="crew-nodata-title">{t('crew.noDataTitle')}</p>
          <p className="crew-nodata-text">{t('crew.noDataConnect')} <strong>{t(`crew.needs_${organ}`)}</strong></p>
          {related.some(metric => metric.estimate) ? (
            <p className="crew-nodata-note">{t('crew.noDataEstimate', { name: related.filter(metric => metric.estimate).map(metric => t(`crew.metric_${metric.id}`)).join(', ') })}</p>
          ) : null}
        </div>
      ) : (
        <ul ref={perPage.ref} className="crew-checks" aria-label={t('crew.checksOf', { name })}>
          {shown.map(check => {
            const checkStatus = ['ok', 'caution', 'alert'].includes(check.status) ? check.status : 'no_data';
            return (
              <li key={check.code} className="crew-check" data-check={check.code} data-status={checkStatus}>
                <span className="crew-check-label" lang="en">{check.label}</span>
                <span className="crew-check-value">{valueText(check)} <span className="crew-unit">{check.unit ?? ''}</span></span>
                <StatusMark status={checkStatus} compact />
                <span className="crew-check-message" lang="en">{check.message ?? ''}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="crew-detail-foot">
        {pages > 1 ? (
          <span className="crew-pager">
            <Button small disabled={page === 0} aria-label={t('crew.prevPage')} onClick={() => setPage(page - 1)}>‹</Button>
            <span>{page + 1}/{pages}</span>
            <Button small disabled={page >= pages - 1} aria-label={t('crew.nextPage')} onClick={() => setPage(page + 1)}>›</Button>
          </span>
        ) : null}
        {related.map(metric => (
          <Button key={metric.id} onClick={() => onMetric(metric.id)}>{t(`crew.metric_${metric.id}`)}</Button>
        ))}
      </div>
      </div>
    </section>
  );
}

/**
 * Person view of the CREW screen: a simplified, picture-first version of the crew file that fits one
 * portrait screen (1080×1920) without scrolling. Header (who, how, where) → ten organs → live charts
 * (task-manager style, click = details on the right). The full PROFILE and WEARABLES screens stay one
 * click away, so nothing of the old profile is lost.
 * props: code ('HAB-C3'), mother (useMother state), session, habitat (GET /api/habitat body or null),
 *        navigate, onBack().
 */
export default function CrewPerson({ code, mother, session, habitat, navigate, onBack }) {
  const { t, lang } = useI18n();
  const number = useNumber(lang);
  const profile = rosterProfile(code);
  const source = useCrewReport(mother, code);
  const report = source.report;
  const health = crewHealth({ code, report, overview: mother?.overview });
  const location = profile ? findLocation(habitat, profile.crewCode) : null;

  const data = useCrewSeries({ online: Boolean(mother?.online) });
  // Veil while this person's report or the mission charts are still on their way.
  const loadingFirst = source.state === 'awaiting' || mother?.mode === 'connecting' || data.state === 'loading';
  const subjectId = report?.subject?.linked_health_subject ?? null;
  const personSeries = (subjectId && data.series?.[subjectId]) || null;
  const indicators = data.indicators;

  // Whole-mission extent over every chart of this person.
  const extent = useMemo(() => {
    let first = Infinity;
    let last = -Infinity;
    for (const metric of METRICS) {
      const range = seriesExtent(personSeries, metric);
      if (range) {
        first = Math.min(first, range[0]);
        last = Math.max(last, range[1]);
      }
    }
    return Number.isFinite(first) ? [first, last] : null;
  }, [personSeries]);

  const [selected, setSelected] = useState({ kind: 'metric', id: METRICS[0].id });
  const [windowSize, setWindowSize] = useState(LIVE);
  const [cursor, setCursor] = useState(null); // null = live (latest sol); a sol while replaying
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || !extent) return undefined;
    const timer = setInterval(() => {
      setCursor(current => {
        const next = (current ?? extent[0] + TILE_WINDOW) + REPLAY_STEP_SOLS;
        if (next >= extent[1]) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, REPLAY_TICK_MS);
    return () => clearInterval(timer);
  }, [playing, extent]);

  const startReplay = () => {
    if (!extent) return;
    setCursor(Math.min(extent[0] + TILE_WINDOW, extent[1]));
    setPlaying(true);
  };
  const stopReplay = () => {
    setPlaying(false);
    setCursor(null);
  };

  const x1 = cursor ?? extent?.[1] ?? 0;
  const views = Object.fromEntries(METRICS.map(metric => [metric.id, metricView(metric, personSeries, indicators, x1, number)]));

  // Live (not replaying, real series loaded): simulate the fast vitals per second around the latest real values.
  const realLive = cursor == null && data.state === 'ready' && Boolean(extent);
  const seeds = realLive
    ? Object.fromEntries(Object.keys(SIGNALS).map(key => [key, latestPoint(personSeries?.[key])?.[1]]).filter(([, value]) => Number.isFinite(value)))
    : null;
  const sim = useSimulatedVitals(seeds, { enabled: realLive });
  const simViews = sim
    ? Object.fromEntries(METRICS.filter(isFast).map(metric => [metric.id, metricView(metric, sim.points, indicators, Infinity, number)]))
    : {};
  const unitOf = metric => (metric.unitKey ? t(`crew.${metric.unitKey}`) : metric.unit);
  const organCard = organ => (report?.organs || []).find(card => card.organ === organ) || null;

  if (!profile) {
    return (
      <div className="crew-person">
        <Button onClick={onBack}><span className="crew-glyph" aria-hidden="true">{UI_GLYPH.back}</span> {t('crew.back')}</Button>
        <p>{t('crew.noRecord')}</p>
      </div>
    );
  }

  let liveText;
  if (cursor != null) liveText = t('crew.replaying', { n: Math.round(cursor) });
  else if (data.state === 'ready' && extent && sim) liveText = t('crew.liveSim', { n: Math.round(extent[1]) });
  else if (data.state === 'ready' && extent) liveText = t('crew.liveAt', { n: Math.round(extent[1]) });
  else if (data.state === 'ready') liveText = t('crew.seriesNone');
  else if (data.state === 'loading') liveText = t('crew.seriesLoading');
  else if (data.state === 'error') liveText = t('crew.seriesError');
  else liveText = t('crew.seriesOffline');
  const live = data.state === 'ready' && extent && cursor == null;

  const selectedMetric = selected.kind === 'metric' ? METRICS.find(metric => metric.id === selected.id) : null;

  return (
    <div className="crew-person" data-code={code} data-status={health.status} data-loading={loadingFirst ? 'true' : undefined}>
      {loadingFirst ? <CrewLoading /> : null}
      <header className="crew-person-head">
        <Button className="crew-back" aria-label={t('crew.backLabel')} onClick={onBack}><span className="crew-glyph" aria-hidden="true">{UI_GLYPH.back}</span> {t('crew.back')}</Button>
        <CrewPortrait code={profile.code} title={t('crew.avatarOf', { name: profile.name })} />
        <div className="crew-person-id">
          <h2 className="crew-person-name">
            {profile.name}
            {profile.code === session ? <> <Badge tone="accent">{t('crew.you')}</Badge></> : null}
          </h2>
          <p className="crew-person-role">
            {localized(profile.role, lang)} · {profile.code}
          </p>
          <p className="crew-person-where">
            <span className="label">{t('crew.home')}</span> {zoneName(habitat, profile.homeZone) ?? '—'}
            {' · '}
            <span className="label">{t('crew.location')}</span>{' '}
            <span data-testid="person-location">{location ? zoneName(habitat, location.code) : t('crew.locationUnknown')}</span>
          </p>
        </div>
        <div className="crew-person-actions">
          <Button onClick={() => navigate('profile')}>{t('crew.fullProfile')}</Button>
          <Button onClick={() => navigate('wearables')}>{t('crew.openWearables')}</Button>
        </div>
        <p className="crew-person-status" data-testid="person-status" data-status={health.status}>
          <StatusTag status={health.status} />{' '}
          <span className="crew-person-message">
            {health.source === 'none' ? t('crew.noRecord') : (health.message || t('crew.noMessage'))}
          </span>
          <span className="crew-person-badges">
          </span>
        </p>
      </header>

      <div className="crew-person-organs-wrap">
      <ul className="crew-person-organs" aria-label={t('crew.organsOf', { name: profile.name })}>
        {ORGANS.map(({ organ }) => {
          const status = health.organs[organ] ?? 'no_data';
          const name = t(`crew.organ_${organ}`);
          const isSelected = selected.kind === 'organ' && selected.id === organ;
          return (
            <li key={organ}>
              <button
                type="button"
                className="crew-organ-tile"
                data-organ={organ}
                data-status={status}
                aria-pressed={isSelected}
                aria-label={`${name}: ${t(STATUS_WORD[status])}`}
                onClick={() => setSelected({ kind: 'organ', id: organ })}
              >
                <span className="crew-organ-word" aria-hidden="true">{t(`crew.organShort_${organ}`)}</span>
                <span className={`crew-glyph crew-organ-state crew-tone-${status}`} aria-hidden="true">{STATUS_GLYPH[status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      </div>

      <div className="crew-person-live">
        <div className="crew-live-grid">
        <div className="crew-live-bar">
          <span className={live ? 'crew-live crew-live-on' : 'crew-live'} data-testid="person-live">
            {live ? <span className="crew-live-dot" aria-hidden="true" /> : null}
            {liveText}
          </span>
          {playing || cursor != null ? (
            <Button small onClick={stopReplay}><span className="crew-glyph" aria-hidden="true">{UI_GLYPH.stop}</span> {t('crew.stopReplay')}</Button>
          ) : (
            <Button small disabled={!extent} onClick={startReplay}><span className="crew-glyph" aria-hidden="true">{UI_GLYPH.play}</span> {t('crew.replay')}</Button>
          )}
        </div>

        <ul className="crew-tiles" aria-label={t('crew.chartsTitle')}>
          {METRICS.map(metric => (
            <MetricTile
              key={metric.id}
              metric={metric}
              view={simViews[metric.id] ?? views[metric.id]}
              simulated={Boolean(simViews[metric.id])}
              unit={unitOf(metric)}
              selected={selected.kind === 'metric' && selected.id === metric.id}
              onSelect={id => setSelected({ kind: 'metric', id })}
            />
          ))}
        </ul>

        {selectedMetric ? (
          <MetricDetail
            metric={selectedMetric}
            solView={views[selectedMetric.id]}
            simView={simViews[selectedMetric.id] ?? null}
            sim={sim}
            personSeries={personSeries}
            indicators={indicators}
            extent={extent ?? [x1 - TILE_WINDOW, x1]}
            solEnd={x1}
            windowSize={windowSize}
            setWindowSize={setWindowSize}
            unit={unitOf(selectedMetric)}
            number={number}
            onOrgan={organ => setSelected({ kind: 'organ', id: organ })}
          />
        ) : (
          <OrganDetail
            organ={selected.id}
            card={organCard(selected.id)}
            number={number}
            onMetric={id => setSelected({ kind: 'metric', id })}
          />
        )}
        </div>
      </div>
    </div>
  );
}

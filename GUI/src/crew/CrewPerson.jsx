import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, SegBar, StatusTag } from '../components/index.js';
import AstronautViewer from '../AstronautViewer.jsx';
import { segmentStatusFromReport } from '../organSegments.js';
import { vitalsFromReport } from '../home/vitals.js';
import { limbsFromReport } from '../home/limbData.js';
import { formatValue, words } from '../home/format.js';
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
import { UI_GLYPH } from './glyphs.js';
import CrewLoading from './CrewLoading.jsx';
import DataDialog, { Pager } from '../home/DataDialog.jsx';
import NavIcon from '../navIcons.jsx';
import './crewPerson.css';

const CHECKS_PER_PAGE = 5;
const STATUS_WORDS = { ok: 'common.statusOk', caution: 'common.statusCaution', alert: 'common.statusAlert', no_data: 'common.statusNoData' };
const REPLAY_STEP_SOLS = 2;
const REPLAY_TICK_MS = 80;
const LIVE = 'live'; // chart window: the simulated last LIVE_SECONDS seconds
const DEFAULT_WINDOW = 90;

/** NavIcon of each chart and organ tile. */
const METRIC_ICON = { hr: 'heart', bp: 'gauge', spo2: 'lungs', temp: 'gauge', pvt: 'history', bmd: 'leg', rad: 'radiation' };
const ORGAN_ICON = {
  brain: 'sleep', eyes: 'organs', heart: 'heart', lungs: 'lungs', blood: 'organs', kidneys: 'organs',
  gut: 'glucose', musculoskeletal: 'leg', limbs: 'bands', exposure: 'radiation',
};

/** Fast vitals are simulated per second; slow indicators never are. */
const isFast = metric => metric.lines.every(line => SIGNALS[line.key]);

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

/** Chart popup body: value, replay, window, chart, min / avg / max / normal, link to the organ. */
function MetricDetail({
  metric, solView, simView, sim, personSeries, indicators, extent, solEnd, windowSize, setWindowSize, unit, number,
  liveText, replay, onOrgan,
}) {
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
    <div className="crew-dlg crew-detail" data-detail={metric.id}>
      <div className="crew-detail-now">
        <span className="crew-detail-value">{view.value}</span>
        <span className="crew-unit">{unit}</span>
        <span className="crew-live-text" data-testid="person-live">{liveText}</span>
        {replay.active ? (
          <Button onClick={replay.stop}><span className="crew-glyph" aria-hidden="true">{UI_GLYPH.stop}</span> {t('crew.stopReplay')}</Button>
        ) : (
          <Button disabled={!replay.can} onClick={replay.start}><span className="crew-glyph" aria-hidden="true">{UI_GLYPH.play}</span> {t('crew.replay')}</Button>
        )}
      </div>

      <div className="crew-windows" role="group" aria-label={t('crew.windowLabel')}>
        {options.map(size => (
          <Button key={size ?? 'all'} active={active === size} aria-pressed={active === size} onClick={() => setWindowSize(size)}>
            {size === LIVE ? t('crew.windowLive', { n: LIVE_SECONDS }) : size == null ? t('crew.windowAll') : t('crew.windowSols', { n: size })}
          </Button>
        ))}
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
        <div className="crew-stats-normal"><dt>{t('crew.normal')}</dt><dd>{rangeText ? `${rangeText} ${unit}` : '—'}</dd></div>
      </dl>

      {metric.organ ? (
        <div className="crew-detail-links">
          <Button onClick={() => onOrgan(metric.organ)}>
            <NavIcon name={ORGAN_ICON[metric.organ]} /> {t(`crew.organ_${metric.organ}`)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * How many fixed-height rows fit in a list: (list height + gap) / (row height + gap), measured on every
 * resize (ResizeObserver), so the checks are paged instead of overflowing. Without layout (tests) -> 5.
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

/** Organ popup body: what to do, the checks (paged), links to the organ's charts. */
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
  const related = METRICS.filter(metric => metric.organ === organ);
  const valueText = check => (typeof check.value === 'number' ? number(check.value, Number.isInteger(check.value) ? 0 : 2) : check.value ?? '—');

  return (
    <div className="crew-dlg crew-detail-organ" data-detail={`organ-${organ}`}>
      {card?.action && checks.length > 0 ? (
        <p className="crew-organ-note" lang="en"><span className="crew-note-label">{t('crew.action')}</span> {card.action}</p>
      ) : null}

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
                <StatusTag status={checkStatus} className="crew-check-tag" />
                <span className="crew-check-label" lang="en">{check.label}</span>
                <span className="crew-check-value">{valueText(check)} <span className="crew-unit">{check.unit ?? ''}</span></span>
                <span className="crew-check-message" lang="en">{check.message ?? ''}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="crew-detail-foot">
        <Pager page={page} pages={pages} onPage={setPage} />
        <span className="crew-detail-related">
          {related.map(metric => (
            <Button key={metric.id} onClick={() => onMetric(metric.id)}>
              <NavIcon name={METRIC_ICON[metric.id]} /> {t(`crew.metricShort_${metric.id}`)}
            </Button>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Home's reading ids -> the chart popup that shows the same thing (readings without a chart stay plain). */
const VITAL_CHART = { hr: 'hr', spo2: 'spo2', map: 'bp', dose: 'rad' };
const VITAL_ICONS = { hr: 'heart', spo2: 'lungs', map: 'gauge', glucose: 'glucose', sleep: 'sleep', dose: 'radiation' };
const DEVICE_LABEL_KEYS = {
  left_arm: 'home.bandLeftArm', right_arm: 'home.bandRightArm', left_leg: 'home.bandLeftLeg', right_leg: 'home.bandRightLeg', head_eeg: 'home.bandHead',
};

/** Left column reading (same look as Home); a tap opens its chart when there is one. */
function VitalRow({ row, onOpen }) {
  const { t } = useI18n();
  const chart = VITAL_CHART[row.id];
  const label = t(`home.vitalShort_${row.id}`);
  const content = (
    <>
      <span className="home-vital-head">
        <NavIcon name={VITAL_ICONS[row.id]} className="home-vital-icon" />
        <span className="home-vital-label">{label}</span>
      </span>
      <span className="home-vital-value">
        {row.value != null ? formatValue(row.value) : '—'}
        {row.value != null ? <span className="home-vital-unit">{row.unit}</span> : null}
      </span>
      <span className="visually-hidden"><StatusTag status={row.status} /></span>
    </>
  );
  return (
    <li className={`home-vital home-vital-${row.status}${chart ? ' crew-vital-open' : ''}`} data-vital={row.id} data-status={row.status}>
      {chart ? (
        <button type="button" className="crew-vital-btn" aria-label={t('crew.showDetails', { name: label })} onClick={() => onOpen(chart)}>{content}</button>
      ) : content}
    </li>
  );
}

/** One key–value row of the person facts. */
function Fact({ label, children, wide = false, lines = 1, testId }) {
  return (
    <div className={`crew-fact${wide ? ' crew-fact-wide' : ''}`} data-testid={testId}>
      <dt>{label}</dt>
      <dd className={lines > 1 ? `crew-clamp crew-clamp-${lines}` : undefined}>{children}</dd>
    </div>
  );
}

/**
 * Person view of the CREW screen (sub-view with a big ‹ BACK), laid out like that person's Home but
 * read-only: left = name, body size, photo, 3D figure and the basic readings; right = everything about
 * the person written out (facts, overall status, ten organs, wearable bands). Organ checks and charts
 * open in a popup.
 * props: code ('HAB-C3'), mother (useMother state), session, habitat (GET /api/habitat body or null),
 *        navigate, onBack().
 */
export default function CrewPerson({ code, mother, session, habitat, onBack }) {
  const { t, lang } = useI18n();
  const number = useNumber(lang);
  const profile = rosterProfile(code);
  const source = useCrewReport(mother, code);
  const report = source.report;
  const health = crewHealth({ code, report, overview: mother?.overview });
  const location = profile ? findLocation(habitat, profile.crewCode) : null;

  const segmentStatus = useMemo(() => (report ? segmentStatusFromReport(report) : undefined), [report]);
  const vitals = useMemo(() => vitalsFromReport(report), [report]);
  const devices = useMemo(() => {
    const { limbs, headEeg } = limbsFromReport(report);
    return [...limbs.map(item => item.device && { ...item.device, limb: item.limb }), headEeg && { ...headEeg, limb: 'head_eeg' }].filter(Boolean);
  }, [report]);

  const data = useCrewSeries({ online: Boolean(mother?.online) });
  const loadingFirst = source.state === 'awaiting' || mother?.mode === 'connecting';
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

  const [selected, setSelected] = useState(null); // { kind: 'metric' | 'organ', id } = open popup
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
    if (windowSize === LIVE) setWindowSize(DEFAULT_WINDOW);
    setCursor(Math.min(extent[0] + TILE_WINDOW, extent[1]));
    setPlaying(true);
  };
  const stopReplay = () => {
    setPlaying(false);
    setCursor(null);
  };

  const x1 = cursor ?? extent?.[1] ?? 0;
  const metricOpen = selected?.kind === 'metric';
  const views = Object.fromEntries(METRICS.map(metric => [metric.id, metricView(metric, personSeries, indicators, x1, number)]));

  // Live (chart open, not replaying, real series loaded): simulate the fast vitals per second.
  const realLive = metricOpen && cursor == null && data.state === 'ready' && Boolean(extent);
  const seeds = realLive
    ? Object.fromEntries(Object.keys(SIGNALS).map(key => [key, latestPoint(personSeries?.[key])?.[1]]).filter(([, value]) => Number.isFinite(value)))
    : null;
  const sim = useSimulatedVitals(seeds, { enabled: realLive });
  const simViews = sim
    ? Object.fromEntries(METRICS.filter(isFast).map(metric => [metric.id, metricView(metric, sim.points, indicators, Infinity, number)]))
    : {};
  const unitOf = metric => (metric.unitKey ? t(`crew.${metric.unitKey}`) : metric.unit);
  const organCard = organ => (report?.organs || []).find(card => card.organ === organ) || null;

  const backButton = (
    <button type="button" className="crew-back" aria-label={t('crew.backLabel')} onClick={onBack}>
      <span className="crew-glyph" aria-hidden="true">{UI_GLYPH.back}</span> {t('common.back')}
    </button>
  );

  if (!profile) {
    return (
      <div className="crew-person">
        {backButton}
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

  const selectedMetric = metricOpen ? METRICS.find(metric => metric.id === selected.id) : null;
  const selectedOrgan = selected?.kind === 'organ' ? selected.id : null;
  const close = () => setSelected(null);
  const message = health.source === 'none' ? t('crew.noRecord') : (health.message || t('crew.noMessage'));
  const where = location ? zoneName(habitat, location.code) : t('crew.locationUnknown');
  const [firstName, ...lastNames] = profile.name.split(' ');
  const isYou = profile.code === session;

  return (
    <div className="crew-person" data-code={code} data-status={health.status} data-loading={loadingFirst ? 'true' : undefined}>
      {loadingFirst ? <CrewLoading /> : null}
      <div className="crew-person-stage">
        {/* ── left: the person, as on Home ── */}
        <section className="home-person crew-person-left" aria-label={profile.name}>
          <header className="home-head">
            <h2 className="home-name crew-person-name">
              <span className="home-name-first">{firstName}</span>{' '}
              <span className="home-name-last">{lastNames.join(' ')}</span>
              {profile.heightCm ? (
                <span className="home-body-size" data-testid="person-body-size">{t('home.bodySize', { h: profile.heightCm, m: profile.massKg })}</span>
              ) : null}
              {isYou ? <span className="crew-you" data-testid="crew-you">{t('crew.you')}</span> : null}
            </h2>
            <span className="home-photo crew-person-photo">
              <CrewPortrait code={profile.code} title={t('crew.avatarOf', { name: profile.name })} />
            </span>
          </header>
          <div className="home-body">
            <div className="home-figure crew-person-figure">
              <AstronautViewer model={profile.model} frontView segmentStatus={segmentStatus} sol={report?.as_of?.sol ?? null} />
            </div>
            <ul className="home-vitals" aria-label={t('crew.chartsTitle')}>
              {vitals.map(row => <VitalRow key={row.id} row={row} onOpen={id => setSelected({ kind: 'metric', id })} />)}
            </ul>
          </div>
        </section>

        {/* ── right: everything about the person, read-only ── */}
        <div className="crew-person-right">
          <header className="crew-person-top">
            {backButton}
            <StatusTag status={health.status} className="crew-person-tag" data-testid="person-status" />
            <p className={`crew-person-message crew-message-${health.status} crew-clamp crew-clamp-2`} data-testid="person-message">{message}</p>
          </header>

          <div className="crew-person-mid">
            <section className="crew-panel crew-facts-panel" aria-label={t('crew.factsTitle')}>
              <h3 className="crew-group-head"><NavIcon name="person" /> {t('crew.factsTitle')}</h3>
              <dl className="crew-facts">
                <Fact label={t('crew.role')}>{localized(profile.role, lang)}</Fact>
                <Fact label={t('crew.age')}>{profile.age ?? '—'} · {profile.nationality ?? '—'}</Fact>
                <Fact label={t('crew.homeModule')}>{zoneName(habitat, profile.homeZone) ?? '—'}</Fact>
                <Fact label={t('crew.nowIn')} testId="person-location">{where}</Fact>
                <Fact label={t('crew.education')} wide lines={2}>{localized(profile.education, lang) || '—'}</Fact>
                <Fact label={t('crew.bio')} wide lines={2}>{localized(profile.bio, lang) || '—'}</Fact>
              </dl>
            </section>

            <section className="crew-panel crew-bands-panel" aria-label={t('home.bandsPanel')}>
              <h3 className="crew-group-head"><NavIcon name="bands" /> {t('home.bandsPanel')}</h3>
              {devices.length === 0 ? <p className="crew-empty">{t('home.bandNone')}</p> : (
                <ul className="crew-bands">
                  {devices.map(device => {
                    const status = device.status ?? 'no_data';
                    const battery = device.battery_pct != null ? Math.round(device.battery_pct) : null;
                    const name = t(DEVICE_LABEL_KEYS[device.limb] || 'home.band');
                    return (
                      <li key={device.limb} className={`crew-band crew-band-${status}`} data-device={device.limb} data-status={status}>
                        <span className="crew-band-name">{name}</span>
                        <span className="crew-band-state">{words(device.state) || '—'}</span>
                        <SegBar value={battery} max={100} status={status} segments={6} label={`${t('home.battery')}: ${name}`} />
                        <span className="crew-band-pct">{battery != null ? `${battery}%` : '—'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="crew-panel crew-organs-panel" aria-label={t('crew.organsOf', { name: profile.name })}>
            <h3 className="crew-group-head"><NavIcon name="organs" /> {t('crew.organsTitle')}</h3>
            <ul className="crew-person-organs">
              {ORGANS.map(({ organ }) => {
                const status = health.organs[organ] ?? 'no_data';
                const name = t(`crew.organ_${organ}`);
                const line = organCard(organ)?.headline;
                return (
                  <li key={organ}>
                    <button
                      type="button"
                      className="crew-organ-row"
                      data-organ={organ}
                      data-status={status}
                      aria-label={`${name}: ${t(STATUS_WORDS[status])}`}
                      onClick={() => setSelected({ kind: 'organ', id: organ })}
                    >
                      <StatusTag status={status} className="crew-organ-tag" />
                      <span className="crew-organ-text">
                        <span className="crew-organ-word">{name}</span>
                        {line ? <span className="crew-organ-line" lang="en">{line}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {selectedMetric ? (
        <DataDialog
          title={`${t(`crew.metric_${selectedMetric.id}`)} · ${profile.name}`}
          status={(simViews[selectedMetric.id] ?? views[selectedMetric.id]).status}
          icon={METRIC_ICON[selectedMetric.id]}
          onClose={close}
        >
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
            liveText={liveText}
            replay={{ active: playing || cursor != null, can: Boolean(extent), start: startReplay, stop: stopReplay }}
            onOrgan={organ => setSelected({ kind: 'organ', id: organ })}
          />
        </DataDialog>
      ) : null}

      {selectedOrgan ? (
        <DataDialog
          title={`${t(`crew.organ_${selectedOrgan}`)} · ${profile.name}`}
          status={health.organs[selectedOrgan] ?? 'no_data'}
          icon={ORGAN_ICON[selectedOrgan]}
          onClose={close}
        >
          <OrganDetail
            organ={selectedOrgan}
            card={organCard(selectedOrgan)}
            number={number}
            onMetric={id => setSelected({ kind: 'metric', id })}
          />
        </DataDialog>
      ) : null}
    </div>
  );
}

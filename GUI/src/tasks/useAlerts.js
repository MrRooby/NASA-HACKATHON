import { useMemo } from 'react';
import { useT } from '../i18n/index.js';
import { getProfile } from '../data/crewProfiles.js';
import { ORGAN_ICON, iconForReadingCategory } from '../pixel/mapping.js';
import { roomForZone } from '../habitat/layout.js';
import { formatNumber, peakValue } from '../habitat/model.js';
import { buildNotifications } from '../notifications/buildNotifications.js';
import { eventIcon } from '../habitat/icons.js';
import { usePanelScope } from './scope.js';

// Alert list of the side panel: what is wrong right now, most severe first, each item a
// link to its source. Person screen: that person's organ cards and wearables (MOTHER report)
// plus the habitat. Crew screens: one item per crew member in caution / alert (overview
// status + top message) plus the habitat.
//
// item = { id, severity: 'alert'|'caution'|'info', source, icon, title, detail, code, target }

const SEVERITY_RANK = { alert: 0, caution: 1, info: 2 };
const STATUS_RANK = { alert: 3, caution: 2, ok: 1, no_data: 0 };
const ORGAN_ORDER = ['limbs', 'heart', 'lungs', 'brain', 'exposure', 'blood', 'kidneys', 'gut', 'eyes', 'musculoskeletal'];


/** Worst organ of an overview entry (ties: the more urgent body system first). */
export function worstOrgan(organs) {
  let best = null;
  for (const organ of ORGAN_ORDER) {
    const status = organs?.[organ];
    if (!status || STATUS_RANK[status] < STATUS_RANK.caution) continue;
    if (!best || STATUS_RANK[status] > STATUS_RANK[organs[best]]) best = organ;
  }
  return best;
}

function placeLabel(zone, t) {
  if (!zone) return null;
  const room = roomForZone(zone);
  if (room && room.zone === zone) return t(room.labelKey);
  const key = `base.zone_${zone}`;
  const text = t(key);
  return text === key ? zone.replace(/_/g, ' ').toUpperCase() : text;
}

/** Short channel name: 'ppco2' -> 'CO₂' (base.ch_*), else the backend label. */
export function channelShort(channel, label, t) {
  if (!channel) return label ?? null;
  const key = `base.ch_${channel}`;
  const text = t(key);
  return text === key ? label ?? channel : text;
}

function findReading(habitat, zone, channel) {
  return (habitat?.zones || []).find(item => item.code === zone)?.readings?.find(reading => reading.channel === channel) || null;
}

const hhmm = iso => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : null);

/** One notification (buildNotifications) -> one compact panel item. */
function fromNotification(item, { t, habitat, code }) {
  const base = { id: item.id, severity: item.severity, source: item.source, target: item.target, code: code ?? null };
  if (item.source === 'organ' || item.source === 'device') {
    return {
      ...base,
      icon: item.source === 'device' ? 'limb' : ORGAN_ICON[item.organ] || 'alert',
      title: item.source === 'device' ? item.title : t(`tasks.organ_${item.organ}`),
      detail: item.detail,
    };
  }
  if (item.source === 'habitat') {
    const reading = findReading(habitat, item.zone, item.channel);
    const extra = item.zones?.length > 1 ? ` +${item.zones.length - 1}` : '';
    const value = reading ? formatNumber(item.severity === 'alert' ? peakValue(reading) ?? reading.value : reading.value) : null;
    const name = channelShort(item.channel, reading?.label, t);
    return {
      ...base,
      icon: reading ? iconForReadingCategory(reading.category, reading.channel) : 'base',
      title: `${placeLabel(item.zone, t) ?? item.title}${extra}`,
      detail: [name, value != null ? `${item.severity === 'alert' ? t('tasks.peak') : ''} ${value} ${reading?.unit ?? ''}`.trim() : null]
        .filter(Boolean).join(' · ') || item.detail,
    };
  }
  // event
  const event = (habitat?.events || []).find(entry => `event:${entry.code}` === item.id);
  const window = event ? [hhmm(event.start_utc), hhmm(event.end_utc)].filter(Boolean).join('–') : null;
  return {
    ...base,
    icon: eventIcon(item.eventType),
    title: String(item.eventType || item.title).replace(/_/g, ' ').toUpperCase(),
    detail: [placeLabel(item.zone, t), window ? `${window} UTC` : null].filter(Boolean).join(' · ') || item.detail,
  };
}

/** Crew-wide items: one per person in caution / alert (their report at the sol, else the overview). */
function crewItems({ overview, reports = {}, codes, t }) {
  const out = [];
  for (const code of codes) {
    const report = reports[code];
    const entry = report
      ? {
        overall_status: report.overall_status,
        top_message: report.top_message,
        organs: Object.fromEntries((report.organs || []).map(card => [card.organ, card.status])),
      }
      : (overview || []).find(item => item?.subject?.code === code);
    const status = entry?.overall_status;
    if (status !== 'alert' && status !== 'caution') continue;
    const organ = worstOrgan(entry.organs);
    const profile = getProfile(code);
    out.push({
      id: `person:${code}`,
      severity: status,
      source: 'person',
      icon: organ ? ORGAN_ICON[organ] : 'crew',
      title: profile?.callsign ?? code,
      detail: entry.top_message ?? (organ ? t(`tasks.organ_${organ}`) : null),
      code,
      target: { screen: 'person', code, organ },
    });
  }
  return out;
}

/** Pure: panel items for a scope (exported for tests). */
export function buildAlerts({ scopeCode, codes, overview, report, reports, habitat, t }) {
  const personal = scopeCode
    ? buildNotifications({ report }).map(item => fromNotification(item, { t, habitat, code: scopeCode }))
    : crewItems({ overview, reports, codes, t });
  const site = buildNotifications({ habitat }).map(item => fromNotification(item, { t, habitat }));
  return [...personal, ...site].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function countAlerts(items) {
  const counts = { alert: 0, caution: 0 };
  for (const item of items || []) if (item.severity in counts) counts[item.severity] += 1;
  return counts;
}

/** useAlerts({ mother, route }) -> { items, counts } for the side panel scope. */
export function useAlerts({ mother, route, code } = {}) {
  const t = useT();
  const scope = usePanelScope({ mother, route, code });
  const items = useMemo(() => buildAlerts({ ...scope, t }), [scope, t]);
  return { items, counts: countAlerts(items) };
}

/** useAlertCounts({ mother }) -> { alert, caution } crew-wide (top bar). */
export function useAlertCounts({ mother } = {}) {
  return useAlerts({ mother, route: null }).counts;
}

export default useAlerts;

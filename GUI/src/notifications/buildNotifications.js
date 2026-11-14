// Active notifications for one crew member and the habitat, as a pure function of the
// two MOTHER responses: the organ report (GET /api/organs/{code}, contract 1.1) and the
// habitat (GET /api/habitat, contract 1.0). Texts that come from the backend (labels,
// headlines, actions) are passed through unchanged; the few texts composed here are English.
//
// item = {
//   id,                      unique and stable ('organ:limbs', 'device:left_leg',
//                            'habitat:module_M1', 'event:evt-000483')
//   severity,                'alert' | 'caution' | 'info'
//   source,                  'organ' | 'device' | 'habitat' | 'event'
//   title, detail, action,   strings; detail and action may be null
//   target,                  where [ OPEN ] leads: { screen: 'wearables', organ, limb? }
//                            { screen: 'wearables', device } · { screen: 'base', zone, zones?, channel?, sol? }
//                            { screen: 'base', zone, event, sol? }
// }
import { limbSegmentStatus } from '../organSegments.js';

export const SEVERITY_RANK = { alert: 0, caution: 1, info: 2 };
const SOURCE_RANK = { organ: 0, device: 1, habitat: 2, event: 3 };
const STATUS_RANK = { alert: 3, caution: 2, ok: 1 };

const isProblem = status => status === 'caution' || status === 'alert';
const rank = status => STATUS_RANK[status] ?? 0;

const DEVICE_LABEL = {
  left_arm: 'Left arm band',
  right_arm: 'Right arm band',
  left_leg: 'Left leg band',
  right_leg: 'Right leg band',
  head_eeg: 'EEG headband',
};

const words = text => String(text ?? '').replace(/_/g, ' ').trim();
const sentenceCase = text => {
  const plain = words(text);
  return plain ? plain[0].toUpperCase() + plain.slice(1) : plain;
};

/** 7.737 -> '7.74', 34 -> '34', 0.0078 -> '0.0078'. */
export function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  return String(Number(abs >= 1 ? value.toFixed(2) : value.toPrecision(2)));
}

const withUnit = (value, unit) => {
  const number = formatNumber(value);
  if (number == null) return null;
  return unit ? `${number} ${unit}` : number;
};

const clock = iso => (typeof iso === 'string' && iso.length >= 16 ? `${iso.slice(11, 16)} UTC` : null);

// ---------------------------------------------------------------- organ cards

function organNotifications(report) {
  const items = [];
  for (const card of report?.organs || []) {
    if (!card || !isProblem(card.status)) continue;
    const target = { screen: 'wearables', organ: card.organ };
    if (card.organ === 'limbs') {
      const perLimb = limbSegmentStatus(card, report.devices);
      const limbs = Object.keys(perLimb)
        .filter(limb => isProblem(perLimb[limb]))
        .sort((a, b) => rank(perLimb[b]) - rank(perLimb[a]));
      // Only when the card singles limbs out (all four coloured = nothing identified).
      if (limbs.length > 0 && limbs.length < 4) target.limb = limbs[0];
    }
    items.push({
      id: `organ:${card.organ}`,
      severity: card.status,
      source: 'organ',
      title: card.label || sentenceCase(card.organ),
      detail: card.headline ?? null,
      action: card.action ?? null,
      target,
    });
  }
  return items;
}

// ---------------------------------------------------------------- wearables

function deviceNotifications(report) {
  const items = [];
  for (const device of report?.devices || []) {
    if (!device?.limb || !device.status || device.status === 'ok') continue;
    const battery = formatNumber(typeof device.battery_pct === 'number' ? Math.round(device.battery_pct) : null);
    const facts = [device.state ? `State: ${words(device.state)}` : null, battery != null ? `battery ${battery}%` : null].filter(Boolean).join(' · ');
    items.push({
      id: `device:${device.limb}`,
      severity: isProblem(device.status) ? device.status : 'info',
      source: 'device',
      title: DEVICE_LABEL[device.limb] || `${sentenceCase(device.limb)} band`,
      detail: [device.message, facts].filter(Boolean).join(' · ') || null,
      action: null,
      target: { screen: 'wearables', device: device.limb },
    });
  }
  return items;
}

// ---------------------------------------------------------------- habitat zones

/** How far outside the normal range (relative to the limit) the sol's extremes went; 0 when inside or unknown. */
function exceedance(reading) {
  const { min, max, normal_min: low, normal_max: high } = reading;
  let worst = 0;
  if (typeof max === 'number' && typeof high === 'number' && max > high) worst = Math.max(worst, (max - high) / (Math.abs(high) || 1));
  if (typeof min === 'number' && typeof low === 'number' && min < low) worst = Math.max(worst, (low - min) / (Math.abs(low) || 1));
  return worst;
}

/** The extreme of the sol that left the normal range (the larger excursion), else null. */
function peakValue(reading) {
  const { min, max, normal_min: low, normal_max: high } = reading;
  const over = typeof max === 'number' && typeof high === 'number' && max > high ? (max - high) / (Math.abs(high) || 1) : 0;
  const under = typeof min === 'number' && typeof low === 'number' && min < low ? (low - min) / (Math.abs(low) || 1) : 0;
  if (over === 0 && under === 0) return null;
  return over >= under ? max : min;
}

const normalRange = reading => {
  const low = formatNumber(reading.normal_min);
  const high = formatNumber(reading.normal_max);
  if (low != null && high != null) return `normal ${low}–${high}`;
  if (high != null) return `normal ≤ ${high}`;
  if (low != null) return `normal ≥ ${low}`;
  return null;
};

/**
 * The reading that explains a zone's status: highest `field` status ('worst_status' for a
 * zone that alerted during the sol, 'status' for a caution on the latest value); among
 * equals a numeric reading beats a text one, then the larger excursion wins.
 */
export function worstReading(zone, field = 'worst_status') {
  let best = null;
  for (const reading of zone?.readings || []) {
    if (!reading || !isProblem(reading[field])) continue;
    if (!best) { best = reading; continue; }
    const byStatus = rank(reading[field]) - rank(best[field]);
    const byKind = Number(typeof reading.value === 'number') - Number(typeof best.value === 'number');
    const byExcess = exceedance(reading) - exceedance(best);
    if (byStatus > 0 || (byStatus === 0 && (byKind > 0 || (byKind === 0 && byExcess > 0)))) best = reading;
  }
  return best;
}

/** "CO2 partial pressure: peak 7.74 mmHg (normal 1.5–2.5), now 2.28 mmHg"; "low" for an excursion below the range. */
export function readingDetail(reading) {
  if (!reading) return null;
  const label = reading.label || words(reading.channel);
  if (typeof reading.value !== 'number') {
    const now = reading.text != null ? `now ${words(reading.text)}` : null;
    const fault = reading.worst_status && reading.worst_status !== reading.status ? `${reading.worst_status} during this sol` : null;
    return [label, [fault, now].filter(Boolean).join(', ')].filter(Boolean).join(': ');
  }
  const peak = peakValue(reading);
  const range = normalRange(reading);
  const now = withUnit(reading.value, reading.unit);
  if (peak == null || peak === reading.value) return `${label}: ${now}${range ? ` (${range})` : ''}`;
  const word = peak === reading.max ? 'peak' : 'low'; // which end of the normal range was left
  return `${label}: ${word} ${withUnit(peak, reading.unit)}${range ? ` (${range})` : ''}, now ${now}`;
}

function zoneNotifications(habitat) {
  const sol = habitat?.as_of?.sol ?? null;
  const alerts = [];
  const cautionGroups = new Map();

  for (const zone of habitat?.zones || []) {
    if (!zone?.code) continue;
    // A zone that alerted at any time in the sol stays flagged; a caution counts only on the latest value.
    const severity = zone.status === 'alert' ? 'alert' : zone.now_status === 'caution' ? 'caution' : null;
    if (!severity) continue;
    const reading = worstReading(zone, severity === 'alert' ? 'worst_status' : 'status')
      || worstReading(zone, 'worst_status');
    const entry = { zone, reading, severity };
    if (severity === 'alert') { alerts.push(entry); continue; }
    // The same caution in several zones of one type (four cupolas, one cold skylight) is one notification.
    const key = `${zone.type || zone.code}:${reading?.channel || '-'}`;
    if (!cautionGroups.has(key)) cautionGroups.set(key, []);
    cautionGroups.get(key).push(entry);
  }

  const target = (zone, reading) => ({
    screen: 'base',
    zone: zone.code,
    ...(reading?.channel ? { channel: reading.channel } : {}),
    ...(sol != null ? { sol } : {}),
  });

  const items = alerts.map(({ zone, reading }) => ({
    id: `habitat:${zone.code}`,
    severity: 'alert',
    source: 'habitat',
    title: zone.label || words(zone.code),
    detail: readingDetail(reading),
    action: null,
    target: target(zone, reading),
  }));

  for (const group of cautionGroups.values()) {
    const [{ zone, reading }] = group;
    if (group.length === 1) {
      items.push({
        id: `habitat:${zone.code}`,
        severity: 'caution',
        source: 'habitat',
        title: zone.label || words(zone.code),
        detail: readingDetail(reading),
        action: null,
        target: target(zone, reading),
      });
      continue;
    }
    // Group detail: the reading furthest from normal stands for the group.
    const worst = group.reduce((a, b) => (exceedance(b.reading || {}) > exceedance(a.reading || {}) ? b : a));
    items.push({
      id: `habitat:${group.map(entry => entry.zone.code).join('+')}`,
      severity: 'caution',
      source: 'habitat',
      title: `${group.length} zones: ${group.map(entry => entry.zone.label || words(entry.zone.code)).join(', ')}`,
      detail: readingDetail(worst.reading),
      action: null,
      target: { ...target(worst.zone, worst.reading), zones: group.map(entry => entry.zone.code) },
    });
  }
  return items;
}

// ---------------------------------------------------------------- habitat events

const EVENT_SEVERITY = { critical: 'alert', major: 'caution' };

function eventNotifications(habitat) {
  const sol = habitat?.as_of?.sol ?? null;
  const zoneLabel = Object.fromEntries((habitat?.zones || []).map(zone => [zone.code, zone.label]));
  const items = [];
  for (const event of habitat?.events || []) {
    const severity = EVENT_SEVERITY[event?.severity];
    if (!severity || !event.code) continue;
    // Events of this sol, or longer ones still overlapping it (MOTHER only lists those with an end).
    // An old instantaneous event (no end) of an earlier sol is history, not a notification.
    const current = sol == null || event.sol == null || event.sol === sol || event.end_utc != null;
    if (!current) continue;
    const where = event.zone ? zoneLabel[event.zone] || words(event.zone) : null;
    const started = clock(event.start_utc);
    const ended = clock(event.end_utc);
    const when = [started ? `from ${started}` : null, ended ? `to ${ended}` : null].filter(Boolean).join(' ');
    items.push({
      id: `event:${event.code}`,
      severity,
      source: 'event',
      title: sentenceCase(event.type || 'event'),
      detail: [where, event.crew ? `crew ${event.crew}` : null, when || null, event.sol != null ? `sol ${event.sol}` : null]
        .filter(Boolean).join(' · ') || null,
      action: null,
      target: { screen: 'base', zone: event.zone ?? null, event: event.code, ...(sol != null ? { sol } : {}) },
      startUtc: event.start_utc ?? null,
    });
  }
  return items;
}

// ---------------------------------------------------------------- public API

/**
 * buildNotifications({ report, habitat }) -> item[] sorted alert -> caution -> info;
 * within a severity: the person's organs, then wearables, then habitat zones, then
 * events (newest first). Either argument may be null. No duplicates: one item per
 * organ card (the report's top_message repeats a card headline and adds nothing),
 * per wearable, per zone (or group of same-type zones sharing a caution) and per event.
 */
export function buildNotifications({ report = null, habitat = null } = {}) {
  const all = [
    ...organNotifications(report),
    ...deviceNotifications(report),
    ...zoneNotifications(habitat),
    ...eventNotifications(habitat),
  ];
  const seen = new Set();
  const unique = all.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  const order = new Map(unique.map((item, index) => [item, index]));
  unique.sort((a, b) =>
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    || (SOURCE_RANK[a.source] - SOURCE_RANK[b.source])
    || (a.source === 'event' ? String(b.startUtc ?? '').localeCompare(String(a.startUtc ?? '')) : 0)
    || (order.get(a) - order.get(b)));
  return unique.map(({ startUtc, ...item }) => item);
}

/** { alert: n, caution: n, info: n } for a list of notifications. */
export function countBySeverity(items) {
  const counts = { alert: 0, caution: 0, info: 0 };
  for (const item of items || []) if (item?.severity in counts) counts[item.severity] += 1;
  return counts;
}

export default buildNotifications;

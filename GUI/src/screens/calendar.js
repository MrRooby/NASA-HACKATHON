const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function addDays(value, amount) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfWeek(value) {
  const date = startOfDay(value);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(date, mondayOffset);
}

export function endOfWeek(value) {
  return addDays(startOfWeek(value), 6);
}

export function startOfMonth(value) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

export function endOfMonth(value) {
  const date = startOfMonth(value);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date;
}

export function shiftMonth(value, amount) {
  const date = startOfMonth(value);
  date.setMonth(date.getMonth() + amount);
  return date;
}

export function monthGrid(value) {
  const first = startOfMonth(value);
  const gridStart = startOfWeek(first);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
  const gridEnd = endOfWeek(last);
  const days = [];
  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) days.push(date);
  return days;
}

export function isoDate(value) {
  const date = startOfDay(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function sameDay(left, right) {
  return isoDate(left) === isoDate(right);
}

export function formatRange(start, end, locale = 'en-US') {
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  const left = new Intl.DateTimeFormat(locale, options).format(start);
  const right = new Intl.DateTimeFormat(locale, options).format(end);
  return left === right ? left : `${left} – ${right}`;
}

export function formatMonth(value, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(value);
}

export function dayLabel(value, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(value);
}

export function averageStatus(records, key) {
  const values = records.map(record => record?.[key]);
  const categories = values.filter(value => typeof value === 'string');
  if (categories.length) {
    const rank = { no_data: 0, ok: 1, caution: 2, alert: 3 };
    const value = categories.reduce((worst, item) => (rank[item] ?? 0) > (rank[worst] ?? 0) ? item : worst, 'no_data');
    return { kind: 'category', state: categories.length < records.length ? 'partial' : 'complete', value, count: categories.length };
  }
  const valid = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (!valid.length) return { state: 'empty', value: null, count: 0 };
  const value = Math.round((valid.reduce((sum, item) => sum + item, 0) / valid.length) * 10) / 10;
  return { state: valid.length < records.length ? 'partial' : 'complete', value, count: valid.length };
}

export function aggregateWeeklyStatus(records, start, end) {
  return aggregateStatus(records, start, end);
}

export function aggregateStatus(records, start, end) {
  const startKey = isoDate(start);
  const endKey = isoDate(end);
  const visible = records.filter(record => record?.date >= startKey && record?.date <= endKey);
  return {
    records: visible,
    base: averageStatus(visible, 'baseStatus'),
    crew: averageStatus(visible, 'crewWellbeing'),
  };
}

export function dateFromIso(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function daysBetween(left, right) {
  return Math.round((startOfDay(right) - startOfDay(left)) / DAY_MS);
}

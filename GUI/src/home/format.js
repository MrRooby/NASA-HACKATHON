/** Number or text of a backend metric for display: 97 -> '97', 86.18 -> '86.18', null -> null. */
export function formatValue(value, digits = 2) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(digits)));
  }
  return value == null || value === '' ? null : String(value);
}

/** 'module_M2' -> 'module M2', 'low_battery' -> 'low battery'. */
export const words = text => String(text ?? '').replace(/_/g, ' ').trim();

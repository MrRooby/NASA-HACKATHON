import { BUILTIN_IDS, BUILTIN_THEMES, COLOR_KEYS, CSS_VARS, DEFAULT_THEME_ID } from './themes.js';

export const STORAGE_CUSTOM = 'awernasa.themes.custom';
export const STORAGE_SELECTED = 'awernasa.theme';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

const defaultTheme = BUILTIN_THEMES.find(theme => theme.id === DEFAULT_THEME_ID);
let currentTheme = defaultTheme;
const listeners = new Set();

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** validateTheme(obj) -> { ok, errors: string[] }. Checks id / name and all 13 colours. */
export function validateTheme(theme) {
  const errors = [];
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return { ok: false, errors: ['Theme must be a JSON object.'] };
  }
  if (typeof theme.id !== 'string' || !ID.test(theme.id)) {
    errors.push('"id" must be a string of letters, digits, ".", "_" or "-" (max 64).');
  }
  if (typeof theme.name !== 'string' || theme.name.trim() === '') {
    errors.push('"name" must be a non-empty string.');
  }
  const colors = theme.colors;
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) {
    errors.push('"colors" must be an object.');
  } else {
    for (const key of COLOR_KEYS) {
      if (!(key in colors)) errors.push(`colors.${key} is missing.`);
      else if (typeof colors[key] !== 'string' || !HEX.test(colors[key])) {
        errors.push(`colors.${key} must be a hex colour (#rgb or #rrggbb).`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Keep only the known fields, so nothing unexpected is stored or applied. */
function normalizeTheme(theme) {
  return {
    id: theme.id,
    name: theme.name.trim(),
    colors: Object.fromEntries(COLOR_KEYS.map(key => [key, theme.colors[key]])),
  };
}

/** importTheme(jsonText) -> { ok, errors, theme }. Parses, validates; built-in ids are reserved. */
export function importTheme(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return { ok: false, errors: [`Not valid JSON: ${error.message}`], theme: null };
  }
  const { ok, errors } = validateTheme(parsed);
  if (!ok) return { ok, errors, theme: null };
  if (BUILTIN_IDS.includes(parsed.id)) {
    return { ok: false, errors: [`"${parsed.id}" is a built-in theme id; choose another id.`], theme: null };
  }
  return { ok: true, errors: [], theme: normalizeTheme(parsed) };
}

/** Custom themes kept in localStorage (invalid or built-in-id entries are dropped). */
export function loadCustomThemes() {
  const raw = readStorage(STORAGE_CUSTOM);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter(theme => validateTheme(theme).ok && !BUILTIN_IDS.includes(theme.id))
      .map(normalizeTheme);
  } catch {
    return [];
  }
}

export function saveCustomThemes(list) {
  return writeStorage(STORAGE_CUSTOM, JSON.stringify(list));
}

/** Add (or replace, same id) a custom theme; returns the new custom list. */
export function addCustomTheme(theme) {
  const next = [...loadCustomThemes().filter(item => item.id !== theme.id), normalizeTheme(theme)];
  saveCustomThemes(next);
  return next;
}

/** Remove a custom theme; returns the new custom list. */
export function removeCustomTheme(id) {
  const next = loadCustomThemes().filter(item => item.id !== id);
  saveCustomThemes(next);
  return next;
}

/** Built-in themes followed by the stored custom ones (each custom one has custom: true). */
export function getAllThemes(custom = loadCustomThemes()) {
  return [...BUILTIN_THEMES, ...custom.map(theme => ({ ...theme, custom: true }))];
}

export function getThemeById(id, custom) {
  return getAllThemes(custom).find(theme => theme.id === id) || null;
}

export const loadSelectedThemeId = () => readStorage(STORAGE_SELECTED) || DEFAULT_THEME_ID;
export const saveSelectedThemeId = id => writeStorage(STORAGE_SELECTED, id);

/**
 * applyTheme(theme): sets the 13 CSS custom properties and data-theme on <html>
 * and makes the theme the current one for getStatusColors().
 */
export function applyTheme(theme) {
  const next = theme && validateTheme(theme).ok ? theme : defaultTheme;
  currentTheme = next;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    for (const key of COLOR_KEYS) root.style.setProperty(CSS_VARS[key], next.colors[key]);
    root.setAttribute('data-theme', next.id);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next.colors.bg);
  }
  listeners.forEach(listener => listener(next));
  return next;
}

/** The theme applied last (the default one before any applyTheme call). */
export const getCurrentTheme = () => currentTheme;

/** Status colours of the current theme: { ok, caution, alert, no_data } (no_data = dim). */
export function getStatusColors() {
  const { ok, caution, alert, dim } = currentTheme.colors;
  return { ok, caution, alert, no_data: dim };
}

/** subscribeTheme(listener) -> unsubscribe. The listener gets the theme after every applyTheme. */
export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

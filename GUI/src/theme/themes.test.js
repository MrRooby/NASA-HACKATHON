import { beforeEach, describe, expect, it } from 'vitest';
import exampleTheme from '../../themes/example-theme.json';
import {
  BUILTIN_THEMES, COLOR_KEYS, CSS_VARS, DEFAULT_THEME_ID, STORAGE_CUSTOM, STORAGE_SELECTED,
  addCustomTheme, applyTheme, getAllThemes, getCurrentTheme, getStatusColors, getThemeById, importTheme,
  loadCustomThemes, loadSelectedThemeId, removeCustomTheme, saveSelectedThemeId, subscribeTheme, validateTheme,
} from './index.js';

const byId = id => BUILTIN_THEMES.find(theme => theme.id === id);
const cssVar = name => document.documentElement.style.getPropertyValue(name);

beforeEach(() => {
  applyTheme(byId(DEFAULT_THEME_ID));
});

describe('built-in themes', () => {
  it('has the six themes, nostromo first and default', () => {
    expect(BUILTIN_THEMES.map(theme => theme.id)).toEqual([
      'nostromo', 'phosphor', 'catppuccin-mocha', 'catppuccin-macchiato', 'catppuccin-frappe', 'catppuccin-latte',
    ]);
    expect(DEFAULT_THEME_ID).toBe('nostromo');
  });

  it.each(BUILTIN_THEMES.map(theme => [theme.id, theme]))('%s is a valid theme with all 13 colours', (_id, theme) => {
    expect(validateTheme(theme)).toEqual({ ok: true, errors: [] });
    expect(Object.keys(theme.colors).sort()).toEqual([...COLOR_KEYS].sort());
  });

  it('nostromo uses the dotfiles palette', () => {
    expect(byId('nostromo').colors).toMatchObject({ bg: '#11111b', fg: '#d8cab8', accent: '#CE6B29', alert: '#E85A44' });
  });
});

describe('applyTheme', () => {
  it('sets every CSS variable and data-theme on <html>', () => {
    const theme = byId('phosphor');
    applyTheme(theme);
    for (const key of COLOR_KEYS) expect(cssVar(CSS_VARS[key])).toBe(theme.colors[key]);
    expect(cssVar('--accent-bright')).toBe('#9dffc6');
    expect(cssVar('--accent-dim')).toBe('#1f6b45');
    expect(document.documentElement).toHaveAttribute('data-theme', 'phosphor');
    expect(getCurrentTheme()).toBe(theme);
  });

  it('falls back to the default theme for invalid input', () => {
    applyTheme({ id: 'broken' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'nostromo');
  });

  it('notifies subscribers until they unsubscribe', () => {
    const seen = [];
    const unsubscribe = subscribeTheme(theme => seen.push(theme.id));
    applyTheme(byId('phosphor'));
    unsubscribe();
    applyTheme(byId('nostromo'));
    expect(seen).toEqual(['phosphor']);
  });
});

describe('getStatusColors', () => {
  it('follows the current theme; no_data is the dim colour', () => {
    expect(getStatusColors()).toEqual({ ok: '#57AE3A', caution: '#D4A93F', alert: '#E85A44', no_data: '#9b9b9b' });
    applyTheme(byId('phosphor'));
    expect(getStatusColors()).toEqual({ ok: '#4dff9a', caution: '#e6d94a', alert: '#ff5a4d', no_data: '#3f9a68' });
  });
});

describe('validateTheme / importTheme', () => {
  it('accepts themes/example-theme.json', () => {
    expect(validateTheme(exampleTheme)).toEqual({ ok: true, errors: [] });
    const result = importTheme(JSON.stringify(exampleTheme));
    expect(result.ok).toBe(true);
    expect(result.theme).toEqual(exampleTheme);
  });

  it('accepts #rgb colours', () => {
    expect(validateTheme({ ...exampleTheme, colors: { ...exampleTheme.colors, bg: '#000' } }).ok).toBe(true);
  });

  it.each([
    ['not an object', null],
    ['an array', []],
    ['missing id', { name: 'X', colors: exampleTheme.colors }],
    ['numeric name', { id: 'x', name: 5, colors: exampleTheme.colors }],
    ['missing colors', { id: 'x', name: 'X' }],
    ['a missing colour key', { id: 'x', name: 'X', colors: { ...exampleTheme.colors, info: undefined } }],
    ['a colour name instead of hex', { id: 'x', name: 'X', colors: { ...exampleTheme.colors, ok: 'green' } }],
    ['a css injection', { id: 'x', name: 'X', colors: { ...exampleTheme.colors, bg: '#000; background: url(x)' } }],
    ['an 8-digit hex', { id: 'x', name: 'X', colors: { ...exampleTheme.colors, bg: '#11111bff' } }],
  ])('rejects %s', (_label, input) => {
    const result = validateTheme(input);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('names the offending key', () => {
    const { colors } = exampleTheme;
    const withoutAccent = Object.fromEntries(Object.entries(colors).filter(([key]) => key !== 'accent'));
    expect(validateTheme({ id: 'x', name: 'X', colors: withoutAccent }).errors).toEqual(['colors.accent is missing.']);
  });

  it('importTheme rejects broken JSON and built-in ids, and drops unknown fields', () => {
    expect(importTheme('{ nope').ok).toBe(false);
    expect(importTheme(JSON.stringify({ ...exampleTheme, id: 'nostromo' })).ok).toBe(false);
    const { theme } = importTheme(JSON.stringify({ ...exampleTheme, extra: 1, colors: { ...exampleTheme.colors, pink: '#f0f' } }));
    expect(theme).toEqual(exampleTheme);
  });
});

describe('custom theme persistence', () => {
  it('stores, lists, replaces and removes custom themes in localStorage', () => {
    expect(loadCustomThemes()).toEqual([]);
    addCustomTheme(exampleTheme);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_CUSTOM))).toEqual([exampleTheme]);
    expect(getAllThemes()).toHaveLength(BUILTIN_THEMES.length + 1);
    expect(getThemeById('amber-terminal')).toMatchObject({ name: 'Amber Terminal', custom: true });

    addCustomTheme({ ...exampleTheme, name: 'Amber II' });
    expect(loadCustomThemes()).toHaveLength(1);
    expect(loadCustomThemes()[0].name).toBe('Amber II');

    expect(removeCustomTheme('amber-terminal')).toEqual([]);
    expect(getThemeById('amber-terminal')).toBeNull();
  });

  it('ignores corrupt or invalid stored themes', () => {
    window.localStorage.setItem(STORAGE_CUSTOM, '{ nope');
    expect(loadCustomThemes()).toEqual([]);
    window.localStorage.setItem(STORAGE_CUSTOM, JSON.stringify([exampleTheme, { id: 'bad' }, { ...exampleTheme, id: 'phosphor' }]));
    expect(loadCustomThemes().map(theme => theme.id)).toEqual(['amber-terminal']);
  });

  it('remembers the selected theme id', () => {
    expect(loadSelectedThemeId()).toBe('nostromo');
    saveSelectedThemeId('phosphor');
    expect(window.localStorage.getItem(STORAGE_SELECTED)).toBe('phosphor');
    expect(loadSelectedThemeId()).toBe('phosphor');
  });

  it('survives a throwing localStorage', () => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('denied'); };
    Storage.prototype.setItem = () => { throw new Error('denied'); };
    try {
      expect(loadCustomThemes()).toEqual([]);
      expect(loadSelectedThemeId()).toBe('nostromo');
      expect(saveSelectedThemeId('phosphor')).toBe(false);
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });
});

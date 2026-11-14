// Built-in colour themes. This file is the ONLY place where colours are written down;
// everything else (CSS, the 3D model tint) reads the CSS variables / getStatusColors().

/** Every theme must define all of these keys (hex colours). */
export const COLOR_KEYS = [
  'bg', 'panel', 'raised', 'border', 'fg', 'dim',
  'accent', 'accentBright', 'accentDim',
  'ok', 'caution', 'alert', 'info',
];

/** Theme colour key -> CSS custom property set on <html>. */
export const CSS_VARS = {
  bg: '--bg',
  panel: '--panel',
  raised: '--raised',
  border: '--border',
  fg: '--fg',
  dim: '--dim',
  accent: '--accent',
  accentBright: '--accent-bright',
  accentDim: '--accent-dim',
  ok: '--ok',
  caution: '--caution',
  alert: '--alert',
  info: '--info',
};

export const DEFAULT_THEME_ID = 'nostromo';

/** Hover highlight of a 3D model segment (not themed: it must stand out from every status tint). */
export const MODEL_HOVER_COLOR = '#ffd166';

export const BUILTIN_THEMES = [
  {
    id: 'nostromo',
    name: 'Nostromo',
    colors: {
      bg: '#11111b', panel: '#181825', raised: '#1e1e2e', border: '#7a4526',
      fg: '#d8cab8', dim: '#9b9b9b',
      accent: '#CE6B29', accentBright: '#e07b3a', accentDim: '#7a4526',
      ok: '#57AE3A', caution: '#D4A93F', alert: '#C4402B', info: '#5285AD',
    },
  },
  {
    id: 'phosphor',
    name: 'Phosphor CRT',
    colors: {
      bg: '#050a07', panel: '#08110c', raised: '#0c1a12', border: '#1f6b45',
      fg: '#7df0a8', dim: '#3f9a68',
      accent: '#4dff9a', accentBright: '#9dffc6', accentDim: '#1f6b45',
      ok: '#4dff9a', caution: '#e6d94a', alert: '#ff5a4d', info: '#5ad1ff',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    colors: {
      bg: '#1e1e2e', panel: '#181825', raised: '#313244', border: '#45475a',
      fg: '#cdd6f4', dim: '#7f849c',
      accent: '#b4befe', accentBright: '#89b4fa', accentDim: '#585b70',
      ok: '#a6e3a1', caution: '#f9e2af', alert: '#f38ba8', info: '#74c7ec',
    },
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    colors: {
      bg: '#24273a', panel: '#1e2030', raised: '#363a4f', border: '#494d64',
      fg: '#cad3f5', dim: '#8087a2',
      accent: '#b7bdf8', accentBright: '#8aadf4', accentDim: '#5b6078',
      ok: '#a6da95', caution: '#eed49f', alert: '#ed8796', info: '#7dc4e4',
    },
  },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    colors: {
      bg: '#303446', panel: '#292c3c', raised: '#414559', border: '#51576d',
      fg: '#c6d0f5', dim: '#838ba7',
      accent: '#babbf1', accentBright: '#8caaee', accentDim: '#626880',
      ok: '#a6d189', caution: '#e5c890', alert: '#e78284', info: '#85c1dc',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    colors: {
      bg: '#eff1f5', panel: '#e6e9ef', raised: '#ccd0da', border: '#bcc0cc',
      fg: '#4c4f69', dim: '#8c8fa1',
      accent: '#7287fd', accentBright: '#1e66f5', accentDim: '#acb0be',
      ok: '#40a02b', caution: '#df8e1d', alert: '#d20f39', info: '#209fb5',
    },
  },
];

export const BUILTIN_IDS = BUILTIN_THEMES.map(theme => theme.id);

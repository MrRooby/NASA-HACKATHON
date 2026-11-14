import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import exampleTheme from '../../themes/example-theme.json';
import Providers from '../Providers.jsx';
import SettingsScreen from '../screens/SettingsScreen.jsx';
import { STORAGE_LANG } from '../i18n/index.js';
import { makeMother, renderWithProviders } from '../test/renderApp.jsx';
import { STORAGE_CUSTOM, STORAGE_SELECTED } from '../theme/index.js';
import { STORAGE_CRT, useSettings } from './SettingsContext.jsx';

const html = document.documentElement;
const renderSettings = (mother = makeMother()) => renderWithProviders(<SettingsScreen mother={mother} />);
const themeFile = (content, name = 'theme.json') =>
  new File([typeof content === 'string' ? content : JSON.stringify(content)], name, { type: 'application/json' });
const importFile = file => fireEvent.change(screen.getByLabelText('Import theme (.json)'), { target: { files: [file] } });
const themeRow = id => document.querySelector(`.theme-row[data-theme-id="${id}"]`);

describe('language', () => {
  it('switches the visible text between English and Polish and persists the choice', () => {
    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Polski' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Motyw kolorów' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Polski' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(STORAGE_LANG)).toBe('pl');
    expect(html).toHaveAttribute('lang', 'pl');

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });
});

describe('CRT effect', () => {
  it('is on by default and the toggle sets data-crt on <html>', () => {
    renderSettings();
    expect(html).toHaveAttribute('data-crt', 'on');
    fireEvent.click(screen.getByRole('button', { name: 'CRT off' }));
    expect(html).toHaveAttribute('data-crt', 'off');
    expect(window.localStorage.getItem(STORAGE_CRT)).toBe('off');
    expect(screen.getByRole('button', { name: 'CRT off' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'CRT on' }));
    expect(html).toHaveAttribute('data-crt', 'on');
    expect(window.localStorage.getItem(STORAGE_CRT)).toBe('on');
  });

  it('starts off when the system prefers reduced motion, unless the user chose otherwise', () => {
    vi.stubGlobal('matchMedia', query => ({ matches: /prefers-reduced-motion/.test(query), media: query }));
    const first = renderSettings();
    expect(html).toHaveAttribute('data-crt', 'off');
    first.unmount();

    window.localStorage.setItem(STORAGE_CRT, 'on');
    renderSettings();
    expect(html).toHaveAttribute('data-crt', 'on');
  });
});

describe('themes', () => {
  it('lists the built-in themes with swatches and marks the active one', () => {
    renderSettings();
    expect(document.querySelectorAll('.theme-row')).toHaveLength(6);
    expect(html).toHaveAttribute('data-theme', 'nostromo');
    expect(themeRow('nostromo')).toHaveAttribute('aria-current', 'true');
    expect(within(themeRow('nostromo')).getByText('[ Active ]')).toBeInTheDocument();
    expect(themeRow('phosphor').querySelectorAll('.theme-swatch')).toHaveLength(13);
    expect(within(themeRow('phosphor')).queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('applies and persists the chosen theme', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Use theme Phosphor CRT' }));
    expect(html).toHaveAttribute('data-theme', 'phosphor');
    expect(html.style.getPropertyValue('--bg')).toBe('#050a07');
    expect(html.style.getPropertyValue('--accent')).toBe('#4dff9a');
    expect(themeRow('phosphor')).toHaveAttribute('aria-current', 'true');
    expect(themeRow('nostromo')).not.toHaveAttribute('aria-current');
    expect(window.localStorage.getItem(STORAGE_SELECTED)).toBe('phosphor');
  });

  it('starts with the stored theme', () => {
    window.localStorage.setItem(STORAGE_SELECTED, 'catppuccin-latte');
    renderSettings();
    expect(html).toHaveAttribute('data-theme', 'catppuccin-latte');
    expect(html.style.getPropertyValue('--bg')).toBe('#eff1f5');
  });

  it('imports a custom theme from a JSON file, activates it, and can remove it again', async () => {
    renderSettings();
    importFile(themeFile(exampleTheme));
    expect(await screen.findByText(/Theme "Amber Terminal" imported and activated/)).toBeInTheDocument();
    expect(document.querySelectorAll('.theme-row')).toHaveLength(7);
    expect(themeRow('amber-terminal')).toHaveAttribute('aria-current', 'true');
    expect(html).toHaveAttribute('data-theme', 'amber-terminal');
    expect(html.style.getPropertyValue('--accent')).toBe('#ffb000');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_CUSTOM))).toEqual([exampleTheme]);
    expect(window.localStorage.getItem(STORAGE_SELECTED)).toBe('amber-terminal');

    fireEvent.click(screen.getByRole('button', { name: 'Remove theme Amber Terminal' }));
    expect(themeRow('amber-terminal')).toBeNull();
    expect(html).toHaveAttribute('data-theme', 'nostromo');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_CUSTOM))).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_SELECTED)).toBe('nostromo');
  });

  it('keeps imported themes across a reload', async () => {
    const first = renderSettings();
    importFile(themeFile(exampleTheme));
    await screen.findByText(/imported and activated/);
    first.unmount();
    renderSettings();
    expect(themeRow('amber-terminal')).toHaveAttribute('aria-current', 'true');
    expect(html).toHaveAttribute('data-theme', 'amber-terminal');
  });

  it('shows validation errors for a bad theme file and keeps the current theme', async () => {
    renderSettings();
    importFile(themeFile({ id: 'bad theme', name: '', colors: { ...exampleTheme.colors, ok: 'green', info: undefined } }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Theme rejected:');
    expect(alert).toHaveTextContent('"id" must be');
    expect(alert).toHaveTextContent('"name" must be');
    expect(alert).toHaveTextContent('colors.ok must be a hex colour');
    expect(alert).toHaveTextContent('colors.info is missing.');
    expect(document.querySelectorAll('.theme-row')).toHaveLength(6);
    expect(html).toHaveAttribute('data-theme', 'nostromo');

    importFile(themeFile('{ not json', 'broken.json'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not valid JSON'));

    importFile(themeFile({ ...exampleTheme, id: 'phosphor' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('built-in theme id'));
  });
});

describe('data link info', () => {
  it('shows the API base read-only and the connection state', () => {
    renderSettings(makeMother({ mode: 'offline', online: false, error: { message: 'Cannot reach MOTHER', hint: 'start MOTHER' } }));
    expect(screen.getByText('same origin /api')).toBeInTheDocument();
    expect(screen.getByText('OFFLINE · DEMO')).toHaveAttribute('title', 'Cannot reach MOTHER · start MOTHER');
    expect(screen.getByText('Cannot reach MOTHER')).toBeInTheDocument();
  });
});

describe('useSettings', () => {
  let api;
  function Probe() {
    api = useSettings();
    return null;
  }

  it('exposes the documented API', async () => {
    render(<Providers><Probe /></Providers>);
    expect(api).toMatchObject({ themeId: 'nostromo', lang: 'en', crt: true });
    expect(api.themes.map(theme => theme.id)).toContain('catppuccin-mocha');
    for (const name of ['setTheme', 'importThemeFile', 'removeCustomTheme', 'setLang', 'setCrt']) {
      expect(typeof api[name]).toBe('function');
    }

    let result;
    await act(async () => { result = await api.importThemeFile(themeFile({ id: 'x' })); });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    await act(async () => { result = await api.importThemeFile(themeFile(exampleTheme)); });
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(api.themeId).toBe('amber-terminal');

    act(() => api.setTheme('phosphor'));
    expect(api.themeId).toBe('phosphor');
    act(() => api.setLang('pl'));
    expect(api.lang).toBe('pl');
    act(() => api.setCrt(false));
    expect(api.crt).toBe(false);
  });

  it('has a read-only fallback outside the provider', () => {
    render(<Probe />);
    expect(api).toMatchObject({ themeId: 'nostromo', lang: 'en', crt: false });
    expect(() => api.setTheme('phosphor')).not.toThrow();
  });
});

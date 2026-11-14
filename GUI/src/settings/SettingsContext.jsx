import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
  addCustomTheme,
  applyTheme,
  getAllThemes,
  importTheme,
  loadCustomThemes,
  loadSelectedThemeId,
  removeCustomTheme as removeStoredTheme,
  saveSelectedThemeId,
} from '../theme/index.js';

export const STORAGE_CRT = 'awernasa.crt';

const prefersReducedMotion = () => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
};

/** Stored choice, else on, except when the system asks for reduced motion. */
export function loadCrt() {
  try {
    const stored = window.localStorage.getItem(STORAGE_CRT);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
  } catch {
    // fall through to the default
  }
  return !prefersReducedMotion();
}

function saveCrt(enabled) {
  try {
    window.localStorage.setItem(STORAGE_CRT, enabled ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

/** Text of a File; FileReader fallback for environments without Blob.text(). */
function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file);
  });
}

// Without a provider (isolated component tests): default theme, read-only.
const fallback = {
  themeId: DEFAULT_THEME_ID,
  themes: BUILTIN_THEMES,
  theme: BUILTIN_THEMES[0],
  setTheme: () => {},
  importThemeFile: async () => ({ ok: false, errors: ['Settings are not available.'], theme: null }),
  removeCustomTheme: () => {},
  lang: 'en',
  setLang: () => {},
  crt: false,
  setCrt: () => {},
};

const SettingsContext = createContext(null);

/**
 * Theme, language and CRT effect. Must sit inside <I18nProvider> (the language lives there).
 * Applies the theme (CSS variables + data-theme) and data-crt="on|off" on <html>.
 */
export function SettingsProvider({ children }) {
  const { lang, setLang } = useI18n();
  const [customThemes, setCustomThemes] = useState(loadCustomThemes);
  const [themeId, setThemeId] = useState(loadSelectedThemeId);
  const [crt, setCrtState] = useState(loadCrt);

  const themes = useMemo(() => getAllThemes(customThemes), [customThemes]);
  const theme = themes.find(item => item.id === themeId) || themes[0];

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-crt', crt ? 'on' : 'off');
  }, [crt]);

  const setTheme = useCallback(id => {
    setThemeId(id);
    saveSelectedThemeId(id);
  }, []);

  const importThemeFile = useCallback(async file => {
    let text;
    try {
      text = await readFileText(file);
    } catch (error) {
      return { ok: false, errors: [`Cannot read the file: ${error?.message || 'unknown error'}`], theme: null };
    }
    const result = importTheme(text);
    if (result.ok) {
      setCustomThemes(addCustomTheme(result.theme));
      setThemeId(result.theme.id);
      saveSelectedThemeId(result.theme.id);
    }
    return result;
  }, []);

  const removeCustomTheme = useCallback(id => {
    setCustomThemes(removeStoredTheme(id));
    setThemeId(current => {
      if (current !== id) return current;
      saveSelectedThemeId(DEFAULT_THEME_ID);
      return DEFAULT_THEME_ID;
    });
  }, []);

  const setCrt = useCallback(enabled => {
    setCrtState(Boolean(enabled));
    saveCrt(Boolean(enabled));
  }, []);

  const value = useMemo(() => ({
    themeId: theme.id,
    themes,
    theme,
    setTheme,
    importThemeFile,
    removeCustomTheme,
    lang,
    setLang,
    crt,
    setCrt,
  }), [theme, themes, setTheme, importThemeFile, removeCustomTheme, lang, setLang, crt, setCrt]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * useSettings() -> { themeId, themes, theme, setTheme(id), importThemeFile(File) -> Promise<{ok, errors, theme}>,
 *   removeCustomTheme(id), lang, setLang(lang), crt, setCrt(bool) }
 */
export const useSettings = () => useContext(SettingsContext) || fallback;

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import enCommon from './locales/en/common.js';
import enLogin from './locales/en/login.js';
import enSettings from './locales/en/settings.js';
import enHome from './locales/en/home.js';
import enWearables from './locales/en/wearables.js';
import enBase from './locales/en/base.js';
import enProfile from './locales/en/profile.js';
import enCrew from './locales/en/crew.js';
import enTests from './locales/en/tests.js';

import plCommon from './locales/pl/common.js';
import plLogin from './locales/pl/login.js';
import plSettings from './locales/pl/settings.js';
import plHome from './locales/pl/home.js';
import plWearables from './locales/pl/wearables.js';
import plBase from './locales/pl/base.js';
import plProfile from './locales/pl/profile.js';
import plCrew from './locales/pl/crew.js';
import plTests from './locales/pl/tests.js';

// One file per namespace and language (src/i18n/locales/<lang>/<namespace>.js); keys are
// addressed as '<namespace>.<key>'. Texts that come from the backend stay in English.

export const DEFAULT_LANG = 'en';
export const LANGS = ['en', 'pl'];
export const NAMESPACES = ['common', 'login', 'settings', 'home', 'wearables', 'base', 'profile', 'crew', 'tests'];
export const STORAGE_LANG = 'awernasa.lang';

/** Raw dictionaries: locales[lang][namespace] = { key: 'Text' }. */
export const locales = {
  en: {
    common: enCommon, login: enLogin, settings: enSettings, home: enHome,
    wearables: enWearables, base: enBase, profile: enProfile, crew: enCrew, tests: enTests,
  },
  pl: {
    common: plCommon, login: plLogin, settings: plSettings, home: plHome,
    wearables: plWearables, base: plBase, profile: plProfile, crew: plCrew, tests: plTests,
  },
};

const flatten = byNamespace => Object.fromEntries(
  Object.entries(byNamespace).flatMap(([namespace, dict]) =>
    Object.entries(dict).map(([key, text]) => [`${namespace}.${key}`, text])),
);

/** Merged dictionaries: messages[lang]['home.title'] = 'Text'. */
export const messages = Object.fromEntries(LANGS.map(lang => [lang, flatten(locales[lang])]));

/** translate('pl', 'home.title', { n: 3 }): {n} interpolation; falls back to EN, then to the key. */
export function translate(lang, key, params) {
  const template = messages[lang]?.[key] ?? messages[DEFAULT_LANG][key] ?? key;
  if (!params || typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? String(params[name]) : match));
}

export function loadLang() {
  try {
    const stored = window.localStorage.getItem(STORAGE_LANG);
    return LANGS.includes(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function saveLang(lang) {
  try {
    window.localStorage.setItem(STORAGE_LANG, lang);
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

const defaultValue = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, params) => translate(DEFAULT_LANG, key, params),
};

const I18nContext = createContext(defaultValue);

/** <I18nProvider initialLang?>: owns the language (persisted under awernasa.lang) and sets <html lang>. */
export function I18nProvider({ initialLang, children }) {
  const [lang, setLangState] = useState(() => (LANGS.includes(initialLang) ? initialLang : loadLang()));

  const setLang = useCallback(next => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    saveLang(next);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key, params) => translate(lang, key, params),
  }), [lang, setLang]);

  return createElement(I18nContext.Provider, { value }, children);
}

/** useI18n() -> { lang, setLang, t }. Without a provider: English, read-only. */
export const useI18n = () => useContext(I18nContext);

/** useT() -> t(key, params?) for the current language. */
export const useT = () => useContext(I18nContext).t;

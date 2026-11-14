import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, LANGS, NAMESPACES, STORAGE_LANG, locales, messages, translate, useI18n, useT } from './index.js';

describe('dictionaries', () => {
  it('has EN and PL with every namespace', () => {
    expect(LANGS).toEqual(['en', 'pl']);
    for (const lang of LANGS) expect(Object.keys(locales[lang]).sort()).toEqual([...NAMESPACES].sort());
  });

  it.each(NAMESPACES)('namespace "%s" has identical keys in EN and PL', namespace => {
    expect(Object.keys(locales.pl[namespace]).sort()).toEqual(Object.keys(locales.en[namespace]).sort());
  });

  it.each(NAMESPACES)('namespace "%s" has only non-empty strings', namespace => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(locales[lang][namespace])) {
        expect(typeof text, `${lang}/${namespace}.${key}`).toBe('string');
        expect(text.trim(), `${lang}/${namespace}.${key}`).not.toBe('');
      }
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    const placeholders = text => (text.match(/\{\w+\}/g) || []).sort();
    for (const key of Object.keys(messages.en)) {
      expect(placeholders(messages.pl[key]), key).toEqual(placeholders(messages.en[key]));
    }
  });

  it('merges namespaces as <namespace>.<key>', () => {
    expect(messages.en['common.logout']).toBe('Log out');
    expect(messages.pl['common.logout']).toBe('Wyloguj');
    expect(messages.en['settings.title']).toBe('Settings');
  });
});

describe('translate', () => {
  it('interpolates {name} parameters', () => {
    expect(translate('en', 'common.solN', { n: 142 })).toBe('SOL 142');
    expect(translate('pl', 'login.openFor', { name: 'Roman Czarny' })).toBe('Otwórz sesję jako Roman Czarny');
    expect(translate('en', 'common.solN', { n: 0 })).toBe('SOL 0');
  });

  it('keeps a placeholder whose parameter is missing', () => {
    expect(translate('en', 'common.solN')).toBe('SOL {n}');
    expect(translate('en', 'common.solN', {})).toBe('SOL {n}');
  });

  it('falls back to English, then to the key', () => {
    messages.en['common.__onlyEnglish'] = 'Only English {n}';
    try {
      expect(translate('pl', 'common.__onlyEnglish', { n: 1 })).toBe('Only English 1');
    } finally {
      delete messages.en['common.__onlyEnglish'];
    }
    expect(translate('pl', 'common.doesNotExist')).toBe('common.doesNotExist');
    expect(translate('xx', 'common.logout')).toBe('Log out');
  });
});

describe('I18nProvider / useT', () => {
  let api;
  function Probe() {
    api = useI18n();
    const t = useT();
    return <p>{t('common.logout')}</p>;
  }

  it('defaults to English, switches to Polish and persists the choice', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByText('Log out')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');

    act(() => api.setLang('pl'));
    expect(screen.getByText('Wyloguj')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_LANG)).toBe('pl');
    expect(document.documentElement).toHaveAttribute('lang', 'pl');

    act(() => api.setLang('de')); // unknown language: ignored
    expect(api.lang).toBe('pl');
  });

  it('starts in the stored language', () => {
    window.localStorage.setItem(STORAGE_LANG, 'pl');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByText('Wyloguj')).toBeInTheDocument();
  });

  it('works without a provider (English)', () => {
    render(<Probe />);
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });
});

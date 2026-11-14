import React, { useEffect, useRef, useState } from 'react';
import { LANGS, useT } from '../i18n/index.js';
import { useSettings } from './SettingsContext.jsx';
import { PixelIcon } from '../pixel/index.js';
import './settings.css';

const LANG_NAME_KEYS = { en: 'settings.langEn', pl: 'settings.langPl' };
const SWATCH_KEYS = ['bg', 'panel', 'accent', 'ok', 'caution', 'alert'];

/**
 * Settings as a centred modal (DESIGN.md §3): colour theme (built-in + imported JSON), language,
 * CRT effect. Fits without scrolling: the theme list is a grid of compact swatch buttons.
 * props: open, onClose
 */
export default function SettingsModal({ open, onClose }) {
  const t = useT();
  const { themeId, themes, setTheme, importThemeFile, removeCustomTheme, lang, setLang, crt, setCrt } = useSettings();
  const fileInput = useRef(null);
  const closeButton = useRef(null);
  const [importState, setImportState] = useState(null); // { ok, errors, name }

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (!open) setImportState(null); }, [open]);

  if (!open) return null;

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = await importThemeFile(file);
    setImportState({ ok: result.ok, errors: result.errors || [], name: result.theme?.name });
  };

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal settings-modal px-frame" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-head">
          <PixelIcon name="gear" size={28} />
          <h2 id="settings-title">{t('settings.title')}</h2>
          <button ref={closeButton} type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <PixelIcon name="cross" size={20} />
          </button>
        </header>

        <section className="settings-block" aria-labelledby="settings-theme">
          <h3 id="settings-theme" className="settings-label">{t('settings.themeTitle')}</h3>
          <ul className="theme-grid">
            {themes.map(theme => {
              const active = theme.id === themeId;
              return (
                <li key={theme.id} className="theme-cell" data-theme-id={theme.id}>
                  <button
                    type="button"
                    className={`theme-chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    aria-label={t('settings.themeUseNamed', { name: theme.name })}
                    onClick={() => setTheme(theme.id)}
                    style={{ '--chip-bg': theme.colors.bg, '--chip-fg': theme.colors.fg, '--chip-accent': theme.colors.accent }}
                  >
                    <span className="theme-swatches" aria-hidden="true">
                      {SWATCH_KEYS.map(key => <span key={key} style={{ background: theme.colors[key] }} />)}
                    </span>
                    <span className="theme-chip-name">{theme.name}</span>
                  </button>
                  {theme.custom && (
                    <button type="button" className="theme-remove" aria-label={t('settings.themeRemoveNamed', { name: theme.name })} onClick={() => removeCustomTheme(theme.id)}>
                      <PixelIcon name="cross" size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="settings-row">
            <input
              ref={fileInput}
              type="file"
              className="visually-hidden"
              accept=".json,application/json"
              aria-label={t('settings.importButton')}
              tabIndex={-1}
              onChange={onFile}
            />
            <button type="button" className="px-btn" onClick={() => fileInput.current?.click()}>
              <PixelIcon name="next" size={16} /> {t('settings.importButton')}
            </button>
            {importState?.ok && <span className="settings-msg text-ok" role="status">{t('settings.importOk', { name: importState.name })}</span>}
            {importState && !importState.ok && (
              <span className="settings-msg text-alert" role="alert" title={importState.errors.join('\n')}>
                {t('settings.importFailed')} {importState.errors.join(' · ')}
              </span>
            )}
          </div>
        </section>

        <div className="settings-pair">
          <section className="settings-block" aria-labelledby="settings-lang">
            <h3 id="settings-lang" className="settings-label">{t('settings.langTitle')}</h3>
            <div className="seg-toggle" role="group" aria-labelledby="settings-lang">
              {LANGS.map(code => (
                <button key={code} type="button" className="px-btn" aria-pressed={lang === code} aria-label={t(LANG_NAME_KEYS[code])} onClick={() => setLang(code)}>
                  {code.toUpperCase()} <span className="seg-sub">{t(LANG_NAME_KEYS[code])}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-block" aria-labelledby="settings-crt">
            <h3 id="settings-crt" className="settings-label">{t('settings.crtTitle')}</h3>
            <div className="seg-toggle" role="group" aria-label={t('settings.crtLabel')}>
              <button type="button" className="px-btn" aria-pressed={crt} onClick={() => setCrt(true)}>{t('settings.crtOn')}</button>
              <button type="button" className="px-btn" aria-pressed={!crt} onClick={() => setCrt(false)}>{t('settings.crtOff')}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

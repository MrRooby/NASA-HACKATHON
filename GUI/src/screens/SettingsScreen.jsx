import React, { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../api.js';
import { ConnectionBadge, DataRow, LangFlags, SegBar, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import DataDialog, { Pager } from '../home/DataDialog.jsx';
import { useSettings } from '../settings/SettingsContext.jsx';
import { COLOR_KEYS } from '../theme/index.js';
import './settings.css';

const THEMES_PER_PAGE = 9;

/** One big theme tile drawn in the theme's own colours; tap = use it. */
function ThemeTile({ theme, active, onUse, onRemove }) {
  const t = useT();
  const c = theme.colors;
  return (
    <li className={cx('theme-row', active && 'is-active')} data-theme-id={theme.id} aria-current={active ? 'true' : undefined}>
      <button
        type="button"
        className="theme-use"
        aria-pressed={active}
        aria-label={t('settings.themeUseNamed', { name: theme.name })}
        onClick={() => onUse(theme.id)}
        style={{ background: c.bg, color: c.fg, borderColor: active ? c.accentBright : c.border }}
      >
        <span className="theme-name" style={{ color: c.accentBright }}>{theme.name}</span>
        <span className="theme-swatches" role="img" aria-label={t('settings.themeSwatches', { name: theme.name })}>
          {COLOR_KEYS.map(key => (
            <span key={key} className="theme-swatch" title={`${key} ${c[key]}`} style={{ background: c[key] }} />
          ))}
        </span>
        <span className="theme-kind" style={{ color: active ? c.ok : c.dim }}>
          {active ? `[ ${t('settings.themeActive')} ]` : theme.custom ? t('settings.themeCustom') : t('settings.themeBuiltin')}
        </span>
      </button>
      {theme.custom ? (
        <button
          type="button"
          className="theme-remove"
          aria-label={t('settings.themeRemoveNamed', { name: theme.name })}
          title={t('settings.themeRemove')}
          onClick={() => onRemove(theme.id)}
        >
          <NavIcon name="close" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * Settings, one screen, no scrolling: big theme tiles + import on the left; language flags,
 * the CRT switch and the data link on the right. Import errors and link details open in popups.
 */
export default function SettingsScreen({ mother }) {
  const t = useT();
  const { themeId, themes, setTheme, importThemeFile, removeCustomTheme, crt, setCrt } = useSettings();
  const fileInput = useRef(null);
  const [importState, setImportState] = useState(null); // { ok, errors, name }
  const [linkOpen, setLinkOpen] = useState(false);
  const [page, setPage] = useState(0);
  const closeImport = useCallback(() => setImportState(null), []);
  const closeLink = useCallback(() => setLinkOpen(false), []);

  const pages = Math.max(1, Math.ceil(themes.length / THEMES_PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const shown = themes.slice(safePage * THEMES_PER_PAGE, safePage * THEMES_PER_PAGE + THEMES_PER_PAGE);

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be chosen again
    if (!file) return;
    const result = await importThemeFile(file);
    setImportState({ ok: result.ok, errors: result.errors || [], name: result.theme?.name });
    if (result.ok) setPage(Math.max(0, Math.ceil((themes.length + 1) / THEMES_PER_PAGE) - 1));
  };

  return (
    <div className="settings-screen">
      <header className="settings-head">
        <h1>{t('settings.title')}</h1>
        <p className="settings-sub">{t('settings.subtitle')}</p>
      </header>

      <div className="settings-grid">
        <section className="settings-block settings-themes" aria-labelledby="settings-theme-title">
          <header className="settings-block-head">
            <h2 id="settings-theme-title">{t('settings.themeTitle')}</h2>
            <span className="settings-meta">{t('settings.themeMeta', { n: themes.length })}</span>
            <span className="spacer" />
            <Pager page={safePage} pages={pages} onPage={setPage} />
          </header>
          <ul className="theme-list">
            {shown.map(theme => (
              <ThemeTile key={theme.id} theme={theme} active={theme.id === themeId} onUse={setTheme} onRemove={removeCustomTheme} />
            ))}
          </ul>
          <div className="theme-import">
            <input
              ref={fileInput}
              type="file"
              className="visually-hidden"
              accept=".json,application/json"
              aria-label={t('settings.importButton')}
              tabIndex={-1}
              onChange={onFile}
            />
            <button type="button" className="settings-big settings-import" onClick={() => fileInput.current?.click()}>
              <span>{t('settings.importButton')}</span>
            </button>
            {importState?.ok ? (
              <p className="settings-import-ok" role="status"><StatusTag status="ok" /> {t('settings.importOk', { name: importState.name })}</p>
            ) : <p className="settings-import-hint">{t('settings.importHint')}</p>}
          </div>
        </section>

        <div className="settings-side">
          <section className="settings-block" aria-labelledby="settings-lang-title">
            <header className="settings-block-head"><h2 id="settings-lang-title">{t('settings.langTitle')}</h2></header>
            <LangFlags className="settings-flags" />
          </section>

          <section className="settings-block" aria-labelledby="settings-crt-title">
            <header className="settings-block-head"><h2 id="settings-crt-title">{t('settings.crtTitle')}</h2></header>
            <button
              type="button"
              role="switch"
              aria-checked={crt}
              aria-label={t('settings.crtTitle')}
              className={cx('settings-switch', crt && 'is-on')}
              onClick={() => setCrt(!crt)}
            >
              <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-knob" /></span>
              <span className="settings-switch-text">{crt ? t('common.on') : t('common.off')}</span>
            </button>
          </section>

          <section className="settings-block" aria-labelledby="settings-api-title">
            <header className="settings-block-head">
              <h2 id="settings-api-title">{t('settings.apiTitle')}</h2>
              <span className="spacer" />
              <ConnectionBadge mode={mother?.mode} error={mother?.error} />
            </header>
            <button type="button" className="settings-big" data-open="link" onClick={() => setLinkOpen(true)}>
              <NavIcon name="report" className="settings-big-icon" />
              <span>{t('settings.linkDetails')}</span>
            </button>
          </section>
        </div>
      </div>

      {importState && !importState.ok ? (
        <DataDialog title={t('settings.importTitle')} status="alert" icon="report" onClose={closeImport}>
          <div className="settings-errors" role="alert">
            <p>{t('settings.importFailed')}</p>
            <ul className="theme-errors">
              {importState.errors.slice(0, 8).map(error => <li key={error}>{error}</li>)}
            </ul>
          </div>
        </DataDialog>
      ) : null}

      {linkOpen ? (
        <DataDialog title={t('settings.apiTitle')} icon="report" onClose={closeLink}>
          <div className="settings-link">
            <DataRow label={t('settings.apiBase')} value={API_BASE || t('settings.apiSameOrigin')} />
            {mother?.error?.message
              ? <DataRow label={t('settings.apiState')} value={mother.error.message} status="alert" note={mother.error.hint} />
              : null}
            <p className="settings-note">{t('settings.apiNote')}</p>
            <h3>{t('settings.previewTitle')}</h3>
            <div className="settings-preview">
              <StatusTag status="ok" /><StatusTag status="caution" /><StatusTag status="alert" /><StatusTag status="no_data" />
            </div>
            <DataRow label={t('settings.previewSample')} value={128} unit="mmHg" status="caution" />
            <SegBar value={13} max={20} status="caution" label={t('settings.previewSample')} />
          </div>
        </DataDialog>
      ) : null}
    </div>
  );
}

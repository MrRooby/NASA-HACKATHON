import React, { useRef, useState } from 'react';
import { API_BASE } from '../api.js';
import { Badge, Button, ConnectionBadge, DataRow, LangFlags, Panel, SegBar, StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { useSettings } from '../settings/SettingsContext.jsx';
import { COLOR_KEYS } from '../theme/index.js';
import './settings.css';

function ThemeRow({ theme, active, onUse, onRemove }) {
  const t = useT();
  return (
    <li className={`theme-row${active ? ' is-active' : ''}`} data-theme-id={theme.id} aria-current={active ? 'true' : undefined}>
      <span className="theme-marker" aria-hidden="true">{active ? '▶' : ' '}</span>
      <span className="theme-name">
        {theme.name}
        <span className="theme-id">{theme.id}</span>
      </span>
      <span className="theme-swatches" role="img" aria-label={t('settings.themeSwatches', { name: theme.name })}>
        {COLOR_KEYS.map(key => (
          <span key={key} className="theme-swatch" title={`${key} ${theme.colors[key]}`} style={{ background: theme.colors[key] }} />
        ))}
      </span>
      <span className="theme-kind">{theme.custom ? t('settings.themeCustom') : t('settings.themeBuiltin')}</span>
      <span className="theme-actions">
        {active
          ? <span className="theme-active-tag">[ {t('settings.themeActive')} ]</span>
          : <Button aria-label={t('settings.themeUseNamed', { name: theme.name })} onClick={() => onUse(theme.id)}>{t('settings.themeUse')}</Button>}
        {theme.custom && (
          <Button variant="danger" aria-label={t('settings.themeRemoveNamed', { name: theme.name })} onClick={() => onRemove(theme.id)}>
            {t('settings.themeRemove')}
          </Button>
        )}
      </span>
    </li>
  );
}

/** Settings: theme (built-in + imported), language, CRT effect, read-only data link info. */
export default function SettingsScreen({ mother }) {
  const t = useT();
  const { themeId, themes, setTheme, importThemeFile, removeCustomTheme, lang, crt, setCrt } = useSettings();
  const fileInput = useRef(null);
  const [importState, setImportState] = useState(null); // { ok, errors, name }

  const onFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be chosen again
    if (!file) return;
    const result = await importThemeFile(file);
    setImportState({ ok: result.ok, errors: result.errors || [], name: result.theme?.name });
  };

  return (
    <div className="settings-screen">
      <div className="settings-head">
        <h1>{t('settings.title')}</h1>
        <p className="label">{t('settings.subtitle')}</p>
      </div>

      <div className="settings-grid">
        <Panel className="settings-themes" title={t('settings.themeTitle')} meta={t('settings.themeMeta', { n: themes.length })}>
          <ul className="theme-list">
            {themes.map(theme => (
              <ThemeRow key={theme.id} theme={theme} active={theme.id === themeId} onUse={setTheme} onRemove={removeCustomTheme} />
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
            <Button variant="primary" onClick={() => fileInput.current?.click()}>{t('settings.importButton')}</Button>
            <span className="dim small">{t('settings.importHint')}</span>
          </div>
          {importState?.ok && (
            <p className="text-ok" role="status"><StatusTag status="ok" /> {t('settings.importOk', { name: importState.name })}</p>
          )}
          {importState && !importState.ok && (
            <div className="text-alert" role="alert">
              <p><StatusTag status="alert" /> {t('settings.importFailed')}</p>
              <ul className="theme-errors">
                {importState.errors.map(error => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}
        </Panel>

        <div className="stack">
          <Panel title={t('settings.langTitle')} meta={lang}>
            <LangFlags />
            <p className="dim small settings-note">{t('settings.langNote')}</p>
          </Panel>

          <Panel title={t('settings.crtTitle')} meta={crt ? t('common.on') : t('common.off')}>
            <div className="row" role="group" aria-label={t('settings.crtLabel')}>
              <span className="label">{t('settings.crtLabel')}</span>
              <Button active={crt} aria-pressed={crt} onClick={() => setCrt(true)}>{t('settings.crtOn')}</Button>
              <Button active={!crt} aria-pressed={!crt} onClick={() => setCrt(false)}>{t('settings.crtOff')}</Button>
            </div>
            <p className="dim small settings-note">{t('settings.crtNote')}</p>
          </Panel>

          <Panel title={t('settings.apiTitle')} meta={<ConnectionBadge mode={mother?.mode} error={mother?.error} />}>
            <DataRow label={t('settings.apiBase')} value={API_BASE || t('settings.apiSameOrigin')} />
            {mother?.error?.message && <DataRow label={t('settings.apiState')} value={mother.error.message} status="alert" note={mother.error.hint} />}
            <p className="dim small settings-note">{t('settings.apiNote')}</p>
          </Panel>

          <Panel title={t('settings.previewTitle')} meta={<Badge kind="demo" />}>
            <div className="row">
              <StatusTag status="ok" /><StatusTag status="caution" /><StatusTag status="alert" /><StatusTag status="no_data" />
            </div>
            <DataRow label={t('settings.previewSample')} value={128} unit="mmHg" status="caution" />
            <SegBar value={13} max={20} status="caution" label={t('settings.previewSample')} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

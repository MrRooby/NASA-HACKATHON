import React from 'react';
import { I18nProvider } from './i18n/index.js';
import { SettingsProvider } from './settings/SettingsContext.jsx';

/** Language + settings (theme, CRT) around the app; also used by the tests. */
export default function Providers({ initialLang, children }) {
  return (
    <I18nProvider initialLang={initialLang}>
      <SettingsProvider>{children}</SettingsProvider>
    </I18nProvider>
  );
}

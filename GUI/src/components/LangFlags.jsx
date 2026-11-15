import React from 'react';
import { LANGS, useI18n } from '../i18n/index.js';
import { cx } from './cx.js';
import './langFlags.css';

// Inline SVG flags (no emoji: they do not render on many desktops; no external files).
// Flag colours are fixed like pixel-art sprite palettes, not theme colours.
function FlagPL() {
  return (
    <svg className="langflag-svg" viewBox="0 0 50 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect width="50" height="15" fill="#ffffff" />
      <rect y="15" width="50" height="15" fill="#dc143c" />
    </svg>
  );
}

function FlagGB() {
  return (
    <svg className="langflag-svg" viewBox="0 0 50 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect width="50" height="30" fill="#012169" />
      <path d="M0,0 L50,30 M50,0 L0,30" stroke="#ffffff" strokeWidth="6" />
      <path d="M0,0 L50,30 M50,0 L0,30" stroke="#c8102e" strokeWidth="2" />
      <path d="M25,0 V30 M0,15 H50" stroke="#ffffff" strokeWidth="10" />
      <path d="M25,0 V30 M0,15 H50" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}

/** Each language in its own name, so it can be found whatever the current language is. */
export const LANG_FLAGS = {
  en: { name: 'English', Flag: FlagGB },
  pl: { name: 'Polski', Flag: FlagPL },
};

/**
 * Language switch as two flag buttons (touch size, ≥ 48 px). The current language has
 * aria-pressed="true" and an accent frame. props: className, label (group name).
 */
export default function LangFlags({ className, label }) {
  const { t, lang, setLang } = useI18n();
  return (
    <span className={cx('langflags', className)} role="group" aria-label={label ?? t('settings.langTitle')}>
      {LANGS.map(code => {
        const { name, Flag } = LANG_FLAGS[code];
        return (
          <button
            key={code}
            type="button"
            className="langflag"
            data-lang={code}
            aria-pressed={lang === code}
            aria-label={name}
            title={name}
            onClick={() => setLang(code)}
          >
            <Flag />
          </button>
        );
      })}
    </span>
  );
}

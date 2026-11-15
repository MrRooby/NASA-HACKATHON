import React from 'react';
import './navIcons.css';

// Tab-bar icons from Nerd Fonts (Material Design Icons set, nf-md-*), served from a 1.4 kB subset
// of JetBrainsMono Nerd Font bundled with the app (src/assets/fonts/), so they work offline.
export const NAV_GLYPHS = {
  home: '\u{F02DC}', // nf-md-home
  person: '\u{F0004}', // nf-md-account
  base: '\u{F1383}', // nf-md-space_station
  crew: '\u{F0849}', // nf-md-account_group
  tests: '\u{F133C}', // nf-md-head_cog
  settings: '\u{F0493}', // nf-md-cog
  logout: '\u{F0343}', // nf-md-logout
};
export const NAV_ICONS = Object.keys(NAV_GLYPHS);

/** <NavIcon name="home" /> — decorative; the button carries the accessible name. */
export default function NavIcon({ name, className }) {
  const glyph = NAV_GLYPHS[name];
  if (!glyph) return null;
  return <span className={['nf-icon', className].filter(Boolean).join(' ')} aria-hidden="true">{glyph}</span>;
}

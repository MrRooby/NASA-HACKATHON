import React from 'react';
import './navIcons.css';

// App icons from Nerd Fonts (Material Design Icons set, nf-md-*), served from a small subset of
// JetBrainsMono Nerd Font bundled with the app (src/assets/fonts/), so they work offline.
export const NAV_GLYPHS = {
  home: '\u{F02DC}', // nf-md-home
  person: '\u{F0004}', // nf-md-account
  base: '\u{F1383}', // nf-md-space_station
  crew: '\u{F0849}', // nf-md-account_group
  tests: '\u{F133C}', // nf-md-head_cog
  calendar: '\u{F0E17}', // nf-md-calendar_month
  settings: '\u{F0493}', // nf-md-cog
  logout: '\u{F0343}', // nf-md-logout
  leg: '\u{F0F52}', // nf-md-foot_print
  bell: '\u{F009A}', // nf-md-bell
  organs: '\u{F05F6}', // nf-md-heart_pulse
  bands: '\u{F0897}', // nf-md-watch_variant
  body: '\u{F064D}', // nf-md-human_male
  close: '\u{F1398}', // nf-md-close_thick
  prev: '\u{F0141}', // nf-md-chevron_left
  next: '\u{F0142}', // nf-md-chevron_right
  heart: '\u{F02D1}', // nf-md-heart
  lungs: '\u{F1084}', // nf-md-lungs
  gauge: '\u{F029A}', // nf-md-gauge
  glucose: '\u{F1126}', // nf-md-diabetes
  sleep: '\u{F04B2}', // nf-md-sleep
  radiation: '\u{F043C}', // nf-md-radioactive
  history: '\u{F02DA}', // nf-md-history
  checkin: '\u{F014E}', // nf-md-clipboard_check
  report: '\u{F0909}', // nf-md-satellite_uplink
  box: '\u{F0131}', // nf-md-checkbox_blank_outline
  boxChecked: '\u{F0132}', // nf-md-checkbox_marked
};
export const NAV_ICONS = Object.keys(NAV_GLYPHS);

/** <NavIcon name="home" /> — decorative; the button carries the accessible name. */
export default function NavIcon({ name, className }) {
  const glyph = NAV_GLYPHS[name];
  if (!glyph) return null;
  return <span className={['nf-icon', className].filter(Boolean).join(' ')} aria-hidden="true">{glyph}</span>;
}

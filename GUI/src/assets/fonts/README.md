# nerd-icons-ab1e8f03.woff2

Subset of **JetBrainsMono Nerd Font Propo** (Nerd Fonts, https://www.nerdfonts.com) with only the icons
the app uses, all from the Material Design Icons set (`nf-md-*`). The list lives in `src/navIcons.jsx`.

| Name in the app | Glyph name | Code point | Used for |
|---|---|---|---|
| `home` | `nf-md-home` | U+F02DC | home tab |
| `person` | `nf-md-account` | U+F0004 | own profile tab |
| `base` | `nf-md-space_station` | U+F1383 | base tab |
| `crew` | `nf-md-account_group` | U+F0849 | crew tab |
| `tests` | `nf-md-head_cog` | U+F133C | tests tab / tile |
| `settings` | `nf-md-cog` | U+F0493 | settings |
| `logout` | `nf-md-logout` | U+F0343 | log out |
| `leg` | `nf-md-foot_print` | U+F0F52 | limb circulation |
| `bell` | `nf-md-bell` | U+F009A | notifications |
| `organs` | `nf-md-heart_pulse` | U+F05F6 | organs tile |
| `bands` | `nf-md-watch_variant` | U+F0897 | wearable bands |
| `body` | `nf-md-human_male` | U+F064D | body scan tile |
| `close` | `nf-md-close_thick` | U+F1398 | close dialog |
| `prev` | `nf-md-chevron_left` | U+F0141 | previous page |
| `next` | `nf-md-chevron_right` | U+F0142 | next page |
| `heart` | `nf-md-heart` | U+F02D1 | heart rate |
| `lungs` | `nf-md-lungs` | U+F1084 | blood oxygen |
| `gauge` | `nf-md-gauge` | U+F029A | blood pressure |
| `glucose` | `nf-md-diabetes` | U+F1126 | glucose |
| `sleep` | `nf-md-sleep` | U+F04B2 | sleep |
| `radiation` | `nf-md-radioactive` | U+F043C | radiation dose |
| `history` | `nf-md-history` | U+F02DA | history tile |
| `checkin` | `nf-md-clipboard_check` | U+F014E | check-in tile |
| `report` | `nf-md-satellite_uplink` | U+F0909 | report to Earth tile |
| `box` | `nf-md-checkbox_blank_outline` | U+F0131 | notification not acknowledged |
| `boxChecked` | `nf-md-checkbox_marked` | U+F0132 | notification acknowledged |

Licences: Nerd Fonts patcher MIT; JetBrains Mono SIL OFL 1.1; Material Design Icons Apache 2.0 (Pictogrammers).

Regenerate (needs `fonttools` and `brotli`):

```bash
pyftsubset JetBrainsMonoNerdFontPropo-Regular.ttf \
  --unicodes=U+F02DC,U+F0004,U+F1383,U+F0849,U+F133C,U+F0493,U+F0343,U+F0F52,U+F009A,U+F05F6,U+F0897,U+F064D,U+F1398,U+F0141,U+F0142,U+F02D1,U+F1084,U+F029A,U+F1126,U+F04B2,U+F043C,U+F02DA,U+F014E,U+F0909,U+F0131,U+F0132 \
  --flavor=woff2 --layout-features='' --no-hinting --desubroutinize \
  --output-file=nerd-icons.woff2
# then rename it to nerd-icons-<first 8 hex of its sha256>.woff2 and update src/navIcons.css,
# so browsers never keep an old copy without the new icons
```

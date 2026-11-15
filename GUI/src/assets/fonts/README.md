# nerd-icons.woff2

Subset of **JetBrainsMono Nerd Font Propo** (full-size icons) (Nerd Fonts, https://www.nerdfonts.com) with only the seven
tab-bar icons, all from the Material Design Icons set (`nf-md-*`):

| Icon | Glyph name | Code point |
|---|---|---|
| home | `nf-md-home` | U+F02DC |
| own profile | `nf-md-account` | U+F0004 |
| base | `nf-md-space_station` | U+F1383 |
| crew | `nf-md-account_group` | U+F0849 |
| tests | `nf-md-head_cog` | U+F133C |
| settings | `nf-md-cog` | U+F0493 |
| log out | `nf-md-logout` | U+F0343 |

Licences: Nerd Fonts patcher MIT; JetBrains Mono SIL OFL 1.1; Material Design Icons Apache 2.0 (Pictogrammers).

Regenerate (needs `fonttools` and `brotli`):

```bash
pyftsubset JetBrainsMonoNerdFontPropo-Regular.ttf \
  --unicodes=U+F02DC,U+F0004,U+F1383,U+F0849,U+F133C,U+F0493,U+F0343 \
  --flavor=woff2 --layout-features='' --no-hinting --desubroutinize \
  --output-file=nerd-icons.woff2
```

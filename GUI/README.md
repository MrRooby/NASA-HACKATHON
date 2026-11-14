## Awernasa

Crew health terminal of a Mars lava-tube habitat (NASA Space Apps health-monitoring challenge). React/Vite, offline-first: it shows live data from the MOTHER backend when reachable and built-in demo data otherwise. The interface is styled as a habitat terminal (monospace, 1px frames, `[ BUTTONS ]`, optional CRT scanlines) with switchable colour themes and two languages (EN / PL).

### Run locally

Requires **Node 20+** (Vite 6 / Vitest 4). With nvm: `nvm use` (reads `.nvmrc`).

```bash
npm ci
npm run dev          # live data: MOTHER_URL=http://127.0.0.1:8000 npm run dev
```

Open the local URL printed by Vite. Build the production bundle with `npm run build`.

### Live data from MOTHER

The dashboard asks the MOTHER backend for real data (`/api/status`, `/api/subjects`, `/api/organs`, `/api/organs/{code}?sol=N|day=N`, contract in `../MOTHER/UI_CONTRACT.md`) and refreshes every 30 s. URLs are relative: in Docker, nginx proxies `/api/` to MOTHER; in development, `vite.config.js` proxies `/api` to `MOTHER_URL` (default `http://127.0.0.1:8000`):

```bash
MOTHER_URL=http://127.0.0.1:8000 npm run dev
```

`VITE_API_BASE` (build time) overrides the base URL. If MOTHER or its database is unreachable, the app falls back to the built-in demo data and shows an `OFFLINE · DEMO` badge. Records with `data_kind: "synthetic"` are labelled `SYNTHETIC`.

Tests (`npm test`) never contact a backend: they replay recorded MOTHER responses from `src/test/fixtures/`.

### Project structure

- `src/main.jsx` — thin entry: fonts, base stylesheet, providers, `<App />`.
- `src/App.jsx` — app shell: login, top bar, navigation between the screens in `src/screens/`.
- `src/screens/` — one component (+ css file) per screen; all get `{ mother, session, viewedCode, setViewedCode, navigate, profile }`.
- `src/components/` — terminal UI kit: `Panel`, `Button`, `StatusTag`, `SegBar`, `DataRow`, `Badge`, `SolControl`, `ConnectionBadge`, `Avatar`.
- `src/theme/` — colour themes (the only place with colour values) and `applyTheme`; `src/styles.css` — base stylesheet, themed through CSS variables only.
- `src/i18n/` — EN / PL dictionaries, one file per namespace (`locales/<lang>/<namespace>.js`), `useT()`.
- `src/settings/SettingsContext.jsx` — theme, language and CRT effect (`useSettings()`), stored in localStorage.
- `src/data/crewProfiles.js` — the fictional crew of the habitat (flagged `fictional: true`).
- `src/checkin/` — daily check-in form and the threshold rules engine (`config/thresholds.json` → status, action, escalation).
- `src/api.js`, `src/useMother.js` — MOTHER client (timeouts, errors) and connection / polling state.
- `src/organSegments.js` — organ → 3D body segment mapping; `src/segmentTint.js` tints the model with the theme's status colours.
- `src/LiveDashboard.jsx` — the previous real-data view, kept for reference (not rendered).
- `../config/` — source-of-truth NASA threshold and measurement research.

### Themes

Settings (`[ ⚙ ]`) lists the built-in themes — `nostromo` (default), `phosphor`, and four Catppuccin flavours — and can import your own with `[ IMPORT THEME (.JSON) ]`. Imported themes and the selected one are stored in the browser (localStorage keys `awernasa.themes.custom`, `awernasa.theme`).

A theme is a JSON object with an `id`, a `name` and exactly these 13 colours, each as `#rgb` or `#rrggbb` (see [`themes/example-theme.json`](themes/example-theme.json)):

```json
{
  "id": "amber-terminal",
  "name": "Amber Terminal",
  "colors": {
    "bg": "#0b0700",
    "panel": "#140d02",
    "raised": "#1e1404",
    "border": "#7a5310",
    "fg": "#ffc24a",
    "dim": "#a97f2c",
    "accent": "#ffb000",
    "accentBright": "#ffd27a",
    "accentDim": "#7a5310",
    "ok": "#9bd24a",
    "caution": "#ffe066",
    "alert": "#ff5533",
    "info": "#66c2ff"
  }
}
```

| key | used for | CSS variable |
| --- | --- | --- |
| `bg`, `panel`, `raised` | page background, panel background, highlighted rows | `--bg`, `--panel`, `--raised` |
| `border` | 1px frames and rules | `--border` |
| `fg`, `dim` | text, secondary text / labels / "no data" | `--fg`, `--dim` |
| `accent`, `accentBright`, `accentDim` | buttons and titles, emphasis, dotted leaders | `--accent`, `--accent-bright`, `--accent-dim` |
| `ok`, `caution`, `alert`, `info` | status colours (also the tint of the 3D model), informational tags | `--ok`, `--caution`, `--alert`, `--info` |

`id` may contain letters, digits, `.`, `_` and `-`; the ids of the built-in themes are reserved. A file that does not match is rejected with the list of problems. Status is never shown by colour alone (`[ OK ]`, `[ CAUT ]`, `[ ALRT ]`, `[ ---- ]`), so a theme only changes the look.

All displayed values are synthetic demonstration data and are not medical advice.

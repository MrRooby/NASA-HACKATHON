## Awernasa

Offline-first React/Vite boilerplate for the NASA Space Apps health-monitoring challenge. The interface is intentionally self-contained so the demo can run without a backend: it includes deterministic synthetic metrics, a daily check-in, threshold/status cards, trend views, mission protocols, and an asynchronous Flight Surgeon report state.

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Build the production bundle with `npm run build`.

### Live data from MOTHER

The dashboard asks the MOTHER backend for real data (`/api/status`, `/api/subjects`, `/api/organs`, `/api/organs/{code}?sol=N|day=N`, contract in `../MOTHER/UI_CONTRACT.md`) and refreshes every 30 s. URLs are relative: in Docker, nginx proxies `/api/` to MOTHER; in development, `vite.config.js` proxies `/api` to `MOTHER_URL` (default `http://127.0.0.1:8000`):

```bash
MOTHER_URL=http://127.0.0.1:8000 npm run dev
```

`VITE_API_BASE` (build time) overrides the base URL. If MOTHER or its database is unreachable, the app falls back to the built-in demo data and shows an `OFFLINE · demo data` badge. Records with `data_kind: "synthetic"` are labelled `SYNTHETIC`.

Tests (`npm test`) never contact a backend: they replay recorded MOTHER responses from `src/test/fixtures/`.

### Project structure

- `src/main.jsx` — application shell, page views, demo state, and interactions.
- `src/api.js`, `src/useMother.js` — MOTHER client (timeouts, errors) and connection / polling state.
- `src/LiveDashboard.jsx` — real-data view: person picker, status bar, 10 organ cards, crew grid.
- `src/organSegments.js` — organ → 3D body segment mapping; `src/segmentTint.js` tints the model.
- `src/styles.css` — responsive visual system and dashboard layout.
- `../config/` — source-of-truth NASA threshold and measurement research to wire into the rules engine when persistence/API work begins.

All displayed values are synthetic demonstration data and are not medical advice.
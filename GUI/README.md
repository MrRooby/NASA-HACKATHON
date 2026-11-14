## Awernasa

Offline-first React/Vite boilerplate for the NASA Space Apps health-monitoring challenge. The interface is intentionally self-contained so the demo can run without a backend: it includes deterministic synthetic metrics, a daily check-in, threshold/status cards, trend views, mission protocols, and an asynchronous Flight Surgeon report state.

### Run locally

Requires **Node 20+** (Vite 6 / Vitest 4). With nvm: `nvm use` (reads `.nvmrc`).

```bash
npm ci
npm run dev          # live data: MOTHER_URL=http://127.0.0.1:8000 npm run dev
```

Open the local URL printed by Vite. Build the production bundle with `npm run build`.

### Cognitive tests on yourself (standalone)

`cognitive.html` runs only the cognitive module (PVT, Go/No-Go, DSST): no login, no dashboard, no 3D, no `/api` calls. Results live in this browser's localStorage (`cognitive.self.sessions.v1`) and are never sent anywhere; export/import them as JSON or export CSV. They never mix with astronaut data.

```bash
npm run cognitive                      # opens http://localhost:5173/cognitive.html
# http://localhost:5173/cognitive.html?demo=1   shortened demo (PVT 30 s, Go/No-Go 30 trials, DSST 30 s), never counted in the baseline
```

Without Node on the host, via Docker (from the repository root):

```bash
docker run --rm -it -p 5173:5173 -v "$PWD":/repo -w /repo/GUI node:20 npx vite --host 0.0.0.0
# then open http://localhost:5173/cognitive.html
```

`npm run build` produces both `dist/index.html` and `dist/cognitive.html`. Code: `src/cognitive/standalone.jsx`, `SelfStart.jsx`, `SelfHistory.jsx`, `Diagnostics.jsx`, `engine/{sink,localStore,localReport,diagnostics}.js`.

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
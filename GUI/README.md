## Orbit Health Monitor

Offline-first React/Vite boilerplate for the NASA Space Apps health-monitoring challenge. The interface is intentionally self-contained so the demo can run without a backend: it includes deterministic synthetic metrics, a daily check-in, threshold/status cards, trend views, mission protocols, and an asynchronous Flight Surgeon report state.

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Build the production bundle with `npm run build`.

### Project structure

- `src/main.jsx` — application shell, page views, demo state, and interactions.
- `src/styles.css` — responsive visual system and dashboard layout.
- `../config/` — source-of-truth NASA threshold and measurement research to wire into the rules engine when persistence/API work begins.

All displayed values are synthetic demonstration data and are not medical advice.
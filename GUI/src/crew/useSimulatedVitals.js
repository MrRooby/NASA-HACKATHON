// SIMULATED one-second vital signs for the live charts of the crew person view (CREW screen only).
// MOTHER only has one value per sol, so the fast vitals (heart rate, blood pressure, SpO2, body
// temperature) are simulated second by second around the person's latest real value. Every chart that
// shows them carries a SIMULATED badge. Slow indicators (bone density, dose, reaction time) are never
// simulated: per-second motion there would be invented.
//
// Model per signal: Ornstein–Uhlenbeck around the real value μ (mean-reverting noise, no drift away):
//   x(t+1) = x + θ(μ − x) + σ·N(0,1)
// plus, for heart rate, respiratory sinus arrhythmia (± RSA bpm with a breathing period of BREATH s).
import { useEffect, useMemo, useRef, useState } from 'react';

export const LIVE_SECONDS = 60;
const TICK_MS = 1000;
const BREATH_S = 5;
const RSA_BPM = 1.5;

/** Indicator id -> { theta, sigma, min, max, digits }. */
export const SIGNALS = {
  heart_rate_resting: { theta: 0.25, sigma: 1.2, min: 30, max: 220 },
  bp_systolic: { theta: 0.2, sigma: 1.0, min: 60, max: 240 },
  bp_diastolic: { theta: 0.2, sigma: 0.7, min: 30, max: 160 },
  spo2: { theta: 0.3, sigma: 0.15, min: 70, max: 100 },
  body_temperature: { theta: 0.1, sigma: 0.01, min: 33, max: 42 },
};

/** Standard normal sample (Box–Muller). `random` is injectable for tests. */
export function gaussian(random = Math.random) {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One step of one signal at second t. `state` = { x, mu }; returns the shown value. */
export function stepSignal(key, state, t, random = Math.random) {
  const { theta, sigma, min, max } = SIGNALS[key];
  state.x += theta * (state.mu - state.x) + sigma * gaussian(random);
  const rsa = key === 'heart_rate_resting' ? RSA_BPM * Math.sin((2 * Math.PI * t) / BREATH_S) : 0;
  return Math.min(max, Math.max(min, state.x + rsa));
}

/** History of `seconds` points per signal ending at second t0, so the chart starts full. */
export function primeSignals(seeds, t0, seconds = LIVE_SECONDS, random = Math.random) {
  const states = {};
  const points = {};
  for (const [key, mu] of Object.entries(seeds)) {
    if (!SIGNALS[key] || !Number.isFinite(mu)) continue;
    states[key] = { x: mu, mu };
    points[key] = [];
    for (let t = t0 - seconds; t <= t0; t += 1) points[key].push([t, stepSignal(key, states[key], t, random)]);
  }
  return { states, points };
}

/**
 * useSimulatedVitals(seeds, { enabled }) -> { t, points } | null
 * seeds: { indicator: latest real value }; a new set of seed values restarts the stream.
 * points[indicator] = [[second, value], ...], the last LIVE_SECONDS + 1 seconds; t = current second.
 */
export function useSimulatedVitals(seeds, { enabled = true } = {}) {
  const key = seeds ? JSON.stringify(seeds) : '';
  const stable = useMemo(() => (key ? JSON.parse(key) : null), [key]);
  const store = useRef(null);
  const [frame, setFrame] = useState(null);

  useEffect(() => {
    if (!enabled || !stable || Object.keys(stable).length === 0) {
      store.current = null;
      setFrame(null);
      return undefined;
    }
    let t = 0;
    store.current = primeSignals(stable, t);
    setFrame({ t, points: store.current.points });
    const timer = setInterval(() => {
      t += 1;
      const { states, points } = store.current;
      const next = {};
      for (const [signal, list] of Object.entries(points)) {
        next[signal] = [...list.slice(-LIVE_SECONDS), [t, stepSignal(signal, states[signal], t)]];
      }
      store.current = { states, points: next };
      setFrame({ t, points: next });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, stable]);

  return frame;
}

export default useSimulatedVitals;

// Timing layer (plan section 3). All times are in the performance.now() timescale (ms).

export const now = () => performance.now();

/**
 * Input time. event.timeStamp is a high-resolution time in the performance.now() scale in current
 * browsers; old Safari used epoch milliseconds. If it is more than 1 s away from performance.now()
 * we use performance.now() taken inside the handler. ts_source: 'e' = event.timeStamp, 'h' = handler.
 */
export function inputTime(event) {
  const n = performance.now();
  const ts = event && event.timeStamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts) || Math.abs(ts - n) > 1000) return { t: n, src: 'h' };
  return { t: ts, src: 'e' };
}

const raf = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(performance.now()), 16));
const caf = id => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

/**
 * Show a stimulus without React: `show()` mutates the DOM inside a requestAnimationFrame callback
 * (tSchedule is taken there), and the NEXT frame's callback records tOnset, the best estimate of
 * the first frame that actually contained the stimulus. RT is measured from tOnset.
 * `sched` is a scheduler from runner.js, so everything is cancelled on unmount.
 */
export function onsetViaRaf(sched, show, { onSchedule, onOnset } = {}) {
  sched.raf(() => {
    show();
    const tSchedule = performance.now();
    onSchedule?.(tSchedule);
    sched.raf(() => onOnset?.(performance.now(), tSchedule));
  });
}

export const rafImpl = { raf, caf };

/**
 * Timer resolution: smallest observed step of performance.now(). Bounded to ~25 ms of spinning.
 * Firefox with resistFingerprinting reports 100 ms here (-> quality 'low' when > 2 ms).
 */
export function timerResolution({ maxMs = 25, maxSteps = 20 } = {}) {
  let min = Infinity;
  let steps = 0;
  const start = performance.now();
  let last = start;
  let guard = 0;
  while (steps < maxSteps && performance.now() - start < maxMs && guard < 400000) {
    guard += 1;
    const t = performance.now();
    if (t > last) {
      min = Math.min(min, t - last);
      last = t;
      steps += 1;
    }
  }
  return Number.isFinite(min) ? Math.round(min * 1000) / 1000 : null;
}

const quantile = (sorted, q) => {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/** refresh_hz = 1000 / median(frame delta); frame_jitter_ms = p95 - p5 of the deltas. */
export function summarizeFrames(times) {
  const deltas = [];
  for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
  if (deltas.length === 0) return { refresh_hz: null, frame_jitter_ms: null };
  const sorted = [...deltas].sort((a, b) => a - b);
  const med = quantile(sorted, 0.5);
  return {
    refresh_hz: med > 0 ? Math.round((1000 / med) * 100) / 100 : null,
    frame_jitter_ms: Math.round((quantile(sorted, 0.95) - quantile(sorted, 0.05)) * 100) / 100,
  };
}

/** Measure `frames` consecutive rAF frames (default 120, ~2 s at 60 Hz). Returns { cancel, promise }. */
export function calibrateFrames(frames = 120) {
  let id = null;
  let cancelled = false;
  const times = [];
  const promise = new Promise(resolve => {
    const tick = t => {
      if (cancelled) return;
      times.push(typeof t === 'number' ? t : performance.now());
      if (times.length >= frames + 1) resolve(summarizeFrames(times));
      else id = raf(tick);
    };
    id = raf(tick);
  });
  return { promise, cancel: () => { cancelled = true; if (id != null) caf(id); } };
}

export function deviceWarnings({ refresh_hz: hz, frame_jitter_ms: jitter, timer_resolution_ms: res }) {
  const out = [];
  if (hz != null && hz < 50) out.push(`Low screen refresh rate (${hz} Hz). Plug in the charger and turn off battery saver.`);
  if (jitter != null && jitter > 4) out.push(`Unstable frame timing (jitter ${jitter} ms). Close other tabs and apps.`);
  if (res != null && res > 2) out.push(`Coarse browser timer (${res} ms). Results will be marked low quality.`);
  return out;
}

import { useEffect, useRef } from 'react';
import { rafImpl } from './clock.js';

/** Tracks every timeout and animation frame so one call cancels them all. */
export function createScheduler() {
  const timeouts = new Set();
  const frames = new Set();
  let dead = false;
  return {
    setTimeout(fn, ms) {
      if (dead) return null;
      const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) {
      if (id == null) return;
      clearTimeout(id);
      timeouts.delete(id);
    },
    raf(fn) {
      if (dead) return null;
      const id = rafImpl.raf(t => { frames.delete(id); fn(t); });
      frames.add(id);
      return id;
    },
    cancelRaf(id) {
      if (id == null) return;
      rafImpl.caf(id);
      frames.delete(id);
    },
    cancelAll() {
      dead = true;
      timeouts.forEach(clearTimeout);
      frames.forEach(rafImpl.caf);
      timeouts.clear();
      frames.clear();
    },
  };
}

/**
 * Runs `factory(sched)` in an effect. The factory builds ALL mutable state itself and returns a
 * cleanup function; every timer/frame created through `sched` is cancelled on unmount. Because a
 * new scheduler and fresh state are created per effect run, React StrictMode's mount -> unmount ->
 * mount sequence leaves exactly one live test (start is idempotent).
 */
export function useTrialRunner(factory) {
  const ref = useRef(factory);
  ref.current = factory;
  useEffect(() => {
    const sched = createScheduler();
    const cleanup = ref.current(sched);
    return () => {
      try { cleanup?.(); } finally { sched.cancelAll(); }
    };
  }, []);
}

/**
 * Native input wiring shared by the tasks (no React synthetic events: plan section 3.3).
 * `onPress(info)` is called for keydown of `keys` (matched on e.code) and pointerdown on `pointerEl`
 * (or inside `pointerEl` for elements matched by `pointerSelector`). Auto-repeat is ignored.
 */
export function attachInput({ pointerEl, keys, onKey, onPointer, onEscape, pointerFilter }) {
  const keyHandler = e => {
    if (e.code === 'Escape') { onEscape?.(); return; }
    if (e.repeat) { if (keys?.(e)) e.preventDefault(); return; }
    if (!keys || !keys(e)) return;
    e.preventDefault();
    onKey(e);
  };
  const pointerHandler = e => {
    if (pointerFilter && !pointerFilter(e)) return;
    onPointer(e);
  };
  window.addEventListener('keydown', keyHandler);
  pointerEl?.addEventListener('pointerdown', pointerHandler, { passive: true });
  return () => {
    window.removeEventListener('keydown', keyHandler);
    pointerEl?.removeEventListener('pointerdown', pointerHandler);
  };
}

export const deviceClassOf = (event, fallback = 'mouse') => {
  if (event?.type === 'keydown') return 'keyboard';
  const pt = event?.pointerType;
  if (pt === 'touch' || pt === 'pen') return 'touch';
  if (pt === 'mouse') return 'mouse';
  return fallback;
};

export const round2 = x => (x == null ? null : Math.round(x * 100) / 100);

const TRIAL_DEFAULTS = {
  is_practice: false, stimulus: null, condition: null, isi_ms: null, t_onset_ms: null, t_response_ms: null,
  rt_ms: null, expected: null, actual: null, event_type: null, timeout: false, anticipation: false,
  valid: true, focus_lost: false, ts_source: null,
};
/** Trial object per CONTRACT section 2 (all fields present, times rounded to 0.01 ms). */
export function makeTrial(fields) {
  const t = { ...TRIAL_DEFAULTS, ...fields };
  t.t_onset_ms = round2(t.t_onset_ms);
  t.t_response_ms = round2(t.t_response_ms);
  t.rt_ms = round2(t.rt_ms);
  t.isi_ms = t.isi_ms == null ? null : Math.round(t.isi_ms);
  return t;
}

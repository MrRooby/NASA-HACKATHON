// Focus loss detection (plan section 3.5): visibilitychange -> hidden and window blur mark the
// running trial valid=false / focus_lost=true. > 5 s without focus in total, or > 10 % invalid
// trials, makes the session 'interrupted'.

export const MAX_FOCUS_LOST_MS = 5000;
export const MAX_INVALID_FRACTION = 0.1;

export function createFocusGuard({ now = () => performance.now(), onEvent } = {}) {
  let lost = document.hidden === true;
  let lostSince = lost ? now() : null;
  let totalLost = 0;
  let trialActive = false;
  let trialFlagged = false;

  const begin = kind => {
    if (!lost) {
      lost = true;
      lostSince = now();
    }
    if (trialActive) trialFlagged = true;
    onEvent?.(kind);
  };
  const end = kind => {
    if (lost && !document.hidden) {
      totalLost += now() - lostSince;
      lost = false;
      lostSince = null;
      onEvent?.(kind);
    }
  };

  const onVisibility = () => (document.hidden ? begin('hidden') : end('visible'));
  const onBlur = () => begin('blur');
  const onFocus = () => end('focus');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);

  return {
    trialStart() {
      trialActive = true;
      trialFlagged = lost;
    },
    /** Returns { valid, focus_lost } for the trial that just ended. */
    trialEnd() {
      const flagged = trialFlagged;
      trialActive = false;
      trialFlagged = false;
      return { valid: !flagged, focus_lost: flagged };
    },
    isLost: () => lost,
    totalLostMs: () => totalLost + (lost ? now() - lostSince : 0),
    summary(trials) {
      const counted = trials.filter(t => !t.is_practice);
      const invalid = counted.filter(t => t.valid === false).length;
      const focus_lost_ms = Math.round(this.totalLostMs());
      const invalidFraction = counted.length ? invalid / counted.length : 0;
      let interrupted = false;
      let reason = null;
      if (focus_lost_ms > MAX_FOCUS_LOST_MS) { interrupted = true; reason = 'focus_lost_over_5s'; }
      else if (invalidFraction > MAX_INVALID_FRACTION) { interrupted = true; reason = 'invalid_trials_over_10pct'; }
      return { focus_lost_ms, invalid_trials: invalid, invalid_fraction: invalidFraction, interrupted, reason };
    },
    dispose() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    },
  };
}

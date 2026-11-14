import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFocusGuard } from './engine/focusGuard.js';

let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
const setHidden = v => { hidden = v; document.dispatchEvent(new Event('visibilitychange')); };
afterEach(() => { hidden = false; });

describe('focus guard', () => {
  it('visibilitychange -> hidden during a trial marks it invalid / focus_lost', () => {
    let t = 0;
    const events = [];
    const g = createFocusGuard({ now: () => t, onEvent: k => events.push(k) });
    g.trialStart();
    t = 100; setHidden(true);
    t = 600; setHidden(false);
    expect(g.trialEnd()).toEqual({ valid: false, focus_lost: true });
    g.trialStart();
    expect(g.trialEnd()).toEqual({ valid: true, focus_lost: false });
    expect(g.totalLostMs()).toBe(500);
    expect(events).toEqual(['hidden', 'visible']);
    g.dispose();
  });

  it('window blur counts too; a trial that starts while unfocused is invalid', () => {
    let t = 0;
    const g = createFocusGuard({ now: () => t });
    window.dispatchEvent(new Event('blur'));
    g.trialStart();
    t = 50; window.dispatchEvent(new Event('focus'));
    expect(g.trialEnd().valid).toBe(false);
    g.dispose();
  });

  it('more than 5000 ms without focus -> interrupted', () => {
    let t = 0;
    const g = createFocusGuard({ now: () => t });
    const trials = Array.from({ length: 100 }, (_, i) => ({ idx: i, valid: true }));
    setHidden(true); t = 5001; setHidden(false);
    const s = g.summary(trials);
    expect(s).toMatchObject({ interrupted: true, reason: 'focus_lost_over_5s', focus_lost_ms: 5001 });
    g.dispose();
  });

  it('exactly 5000 ms is still fine; more than 10 % invalid trials -> interrupted', () => {
    let t = 0;
    const g = createFocusGuard({ now: () => t });
    setHidden(true); t = 5000; setHidden(false);
    const ok = Array.from({ length: 50 }, () => ({ valid: true }));
    expect(g.summary(ok).interrupted).toBe(false);
    const bad = [...ok.slice(0, 44), ...Array.from({ length: 6 }, () => ({ valid: false }))];
    expect(g.summary(bad)).toMatchObject({ interrupted: true, reason: 'invalid_trials_over_10pct' });
    const practiceOnly = [{ is_practice: true, valid: false }, ...ok];
    expect(g.summary(practiceOnly).interrupted).toBe(false);
    g.dispose();
  });

  it('removes its listeners on dispose', () => {
    const spy = vi.fn();
    const g = createFocusGuard({ onEvent: spy });
    g.dispose();
    window.dispatchEvent(new Event('blur'));
    expect(spy).not.toHaveBeenCalled();
  });
});

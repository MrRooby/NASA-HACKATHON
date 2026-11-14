import { describe, expect, it } from 'vitest';
import { LOCK_TTL_MS, acquireTabLock } from './engine/tabLock.js';

describe('tab lock', () => {
  it('a second instance cannot start while the first holds the lock', () => {
    const a = acquireTabLock();
    const b = acquireTabLock();
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(false);
    a.release();
    const c = acquireTabLock();
    expect(c.acquired).toBe(true);
    c.release();
  });

  it('a stale lease (crashed tab) can be taken over', () => {
    let now = 1000;
    const a = acquireTabLock({ now: () => now });
    now += LOCK_TTL_MS + 1;
    const b = acquireTabLock({ now: () => now });
    expect(b.acquired).toBe(true);
    a.release();
    b.release();
  });
});

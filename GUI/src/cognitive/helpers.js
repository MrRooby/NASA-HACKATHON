import { act } from '@testing-library/react';
import { vi } from 'vitest';

export const FAKE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'];
export const useFake = () => vi.useFakeTimers({ toFake: FAKE });

/** Dispatch a key / pointer event whose timeStamp is the (fake) performance.now(), i.e. ts_source 'e'. */
export function stamp(event, at = performance.now()) {
  Object.defineProperty(event, 'timeStamp', { value: at, configurable: true });
  return event;
}
export const press = (code, { repeat = false, at } = {}) => {
  const ev = stamp(new KeyboardEvent('keydown', { code, repeat, bubbles: true, cancelable: true }), at);
  act(() => { window.dispatchEvent(ev); });
  return ev;
};
export const tap = (el, { at, pointerType = 'touch' } = {}) => {
  const ev = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  stamp(ev, at);
  act(() => { el.dispatchEvent(ev); });
  return ev;
};

/** Advance fake time in small steps until cond() is true (max `limit` ms). */
export function stepUntil(cond, { step = 5, limit = 40000 } = {}) {
  let waited = 0;
  while (!cond() && waited < limit) {
    act(() => { vi.advanceTimersByTime(step); });
    waited += step;
  }
  if (!cond()) throw new Error(`condition not met within ${limit} ms`);
  return waited;
}

import { act, fireEvent, screen, within } from '@testing-library/react';
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
export const tap = (el, { at, pointerType = 'touch', button = 0 } = {}) => {
  const ev = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'button', { value: button });
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

/** Fill the pre-test survey: sleep hours in the select, the 1-N scales by tapping one radio cell each. */
export function fillSurvey({ sleep = '7.5', sleepQuality = '7', fatigue = '3', kss = '3', stress = '2' } = {}) {
  fireEvent.change(screen.getByLabelText('Hours of sleep last night'), { target: { value: sleep } });
  for (const [name, value] of [['Sleep quality', sleepQuality], ['Fatigue now', fatigue], ['Sleepiness (KSS)', kss], ['Stress now', stress]]) {
    fireEvent.click(within(screen.getByRole('radiogroup', { name })).getByRole('radio', { name: value }));
  }
}

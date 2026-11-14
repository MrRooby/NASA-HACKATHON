import { createFocusGuard } from './focusGuard.js';
import { deviceClassOf } from './runner.js';

/**
 * State every task needs: event log, focus guard, first-input device class and the final hand-off.
 * `getTrials()` returns the trials recorded so far.
 */
export function createTaskKit({ getTrials, onComplete, onFirstInput, controlRef, extra = () => ({}) }) {
  const events = [];
  let deviceClass = null;
  let done = false;
  const log = (kind, detail = null) => events.push({ seq: events.length, t_ms: Math.round(performance.now() * 100) / 100, kind, detail });
  const guard = createFocusGuard({ onEvent: kind => log(kind) });

  const snapshot = () => ({
    trials: [...getTrials()],
    events: [...events],
    focus: guard.summary(getTrials()),
    device_class: deviceClass,
    ...extra(),
  });
  if (controlRef) controlRef.current = { snapshot };

  return {
    events,
    guard,
    log,
    snapshot,
    get done() { return done; },
    noteInput(event) {
      if (deviceClass) return;
      deviceClass = deviceClassOf(event);
      onFirstInput?.(deviceClass);
    },
    finish() {
      if (done) return;
      done = true;
      onComplete?.(snapshot());
    },
    dispose() {
      done = true;
      guard.dispose();
      if (controlRef && controlRef.current?.snapshot === snapshot) { /* keep last snapshot readable after unmount */ }
    },
  };
}

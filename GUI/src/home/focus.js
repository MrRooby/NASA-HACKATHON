// Hand-over between screens: a notification opened on the home screen tells the
// wearables screen which body region / organ to show first. One-shot, in memory.
let pending = null;

/** target of a notification, e.g. { screen: 'wearables', organ: 'limbs', limb: 'left_leg' }. */
export function setPendingFocus(target) {
  pending = target || null;
}

/** The pending target, without clearing it (safe to call during render). */
export function peekPendingFocus() {
  return pending;
}

export function clearPendingFocus() {
  pending = null;
}

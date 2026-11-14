// One running test per browser (S13): a localStorage lease with a heartbeat, announced over a
// BroadcastChannel. Falls back to an in-memory lock when storage is unavailable.

const KEY = 'cognitive.tab-lock';
export const LOCK_TTL_MS = 6000;
export const HEARTBEAT_MS = 2000;

let memoryLock = null;
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function readLock() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return memoryLock;
  }
}
function writeLock(value) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
    memoryLock = null;
  } catch {
    memoryLock = value;
  }
}

/** Returns { acquired, release }. When not acquired, another window holds a fresh lease. */
export function acquireTabLock({ name = 'test', now = () => Date.now() } = {}) {
  const id = makeId();
  const current = readLock();
  if (current && current.id !== id && now() - current.ts < LOCK_TTL_MS) {
    return { acquired: false, release() {} };
  }
  writeLock({ id, name, ts: now() });
  const check = readLock();
  if (check && check.id !== id) return { acquired: false, release() {} }; // lost a race

  let channel = null;
  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel('cognitive-test-lock');
      channel.postMessage({ type: 'claim', id });
    }
  } catch { channel = null; }

  const timer = setInterval(() => {
    const lock = readLock();
    if (!lock || lock.id === id) writeLock({ id, name, ts: now() });
  }, HEARTBEAT_MS);

  let released = false;
  return {
    acquired: true,
    release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      const lock = readLock();
      if (lock && lock.id === id) writeLock(null);
      try { channel?.postMessage({ type: 'release', id }); channel?.close(); } catch { /* ignore */ }
    },
  };
}

// Screen Wake Lock (feature-detected; silently does nothing where unsupported).
export function requestWakeLock() {
  let sentinel = null;
  let released = false;
  const supported = typeof navigator !== 'undefined' && navigator.wakeLock && typeof navigator.wakeLock.request === 'function';

  const acquire = async () => {
    if (!supported || released) return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      if (released) { sentinel.release?.().catch?.(() => {}); sentinel = null; }
    } catch {
      sentinel = null; // denied (e.g. low battery): not an error for the test
    }
  };
  const onVisible = () => { if (document.visibilityState === 'visible' && !sentinel) acquire(); };
  document.addEventListener('visibilitychange', onVisible);
  acquire();

  return {
    supported: Boolean(supported),
    release() {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { Promise.resolve(sentinel?.release?.()).catch(() => {}); } catch { /* ignore */ }
      sentinel = null;
    },
  };
}

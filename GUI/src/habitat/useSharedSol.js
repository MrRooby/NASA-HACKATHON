import { useCallback, useState } from 'react';
import { periodKind } from '../useMother.js';

/**
 * The sol shown by the base screen, shared with the rest of the app.
 *
 * useMother() keeps the selected period as `mother.period` (null = latest, or { sol: N } for
 * habitat crew) and changes it with `mother.setPeriod`. The base screen reads and writes the
 * same value, so moving the sol here also moves the organ cards of the other screens.
 *
 * When there is no usable `mother` (tests, storybook-like use) or the selected person is not
 * habitat crew (ISS subjects are addressed by flight day, not sol), the sol is kept locally.
 *
 * Returns { sol: number | null, setSol(sol | null), shared: boolean }.
 */
export function useSharedSol(mother) {
  const [localSol, setLocalSol] = useState(null);
  const setPeriod = mother?.setPeriod;
  const shared = typeof setPeriod === 'function' && (!mother.subject || periodKind(mother.subject) === 'sol');

  const sharedSol = mother?.period?.sol;
  const sol = shared ? (sharedSol != null && sharedSol !== '' ? Number(sharedSol) : null) : localSol;

  const setSol = useCallback(next => {
    const value = next == null || next === '' ? null : Number(next);
    if (shared) setPeriod(value == null ? null : { sol: value });
    else setLocalSol(value);
  }, [shared, setPeriod]);

  return { sol, setSol, shared };
}

export default useSharedSol;

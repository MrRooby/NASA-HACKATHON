import { useCallback, useEffect, useState } from 'react';

/**
 * Loads one list of src/data/crewStore.js: every list function resolves to
 * { items, connected, ... }.
 * useStoreList(() => listNotes(code), [code]) -> { items, connected, loading, error, reload }
 * `initialItems` is shown until the first answer (e.g. the static test catalogue).
 */
export function useStoreList(loader, deps, initialItems = []) {
  const [state, setState] = useState({ items: initialItems, connected: false, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    loader().then(
      result => {
        if (alive) setState({ items: result?.items ?? [], connected: result?.connected === true, loading: false, error: null });
      },
      error => {
        if (alive) setState(current => ({ ...current, loading: false, error }));
      },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion(current => current + 1), []);
  return { ...state, reload };
}

export default useStoreList;

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/index.js';
import { listMeasurements, subscribeMeasurements } from '../shared/measurements.js';
import { buildTasks, countTasks } from './buildTasks.js';
import { useCognitiveReports } from './cognitiveReports.js';
import { readDone, setDone, subscribeDone } from './doneStore.js';
import { usePanelScope } from './scope.js';

/** Re-render on every change of the measurement store and the manual ticks. */
function useStoreVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(n => n + 1);
    const offMeasurements = subscribeMeasurements(bump);
    const offDone = subscribeDone(bump);
    return () => { offMeasurements(); offDone(); };
  }, []);
  return version;
}

/**
 * useTasks({ mother, route }) -> { items, toggleDone(item | id), counts, sol, scopeCode }
 *
 * route.code set -> that person's tasks; otherwise the whole crew (every item has `code`).
 * See buildTasks.js for the sources and the item shape. A task is done when a matching
 * self-measurement exists for that person and sol (src/shared/measurements.js) or when it
 * was ticked off by hand (localStorage `awernasa.tasks.done.v1`, per sol).
 */
export function useTasks({ mother, route, code } = {}) {
  const t = useT();
  const scope = usePanelScope({ mother, route, code });
  const version = useStoreVersion();
  const cognitive = useCognitiveReports(scope.codes, scope.online);
  const cognitiveKey = JSON.stringify(Object.keys(cognitive).map(key => [key, cognitive[key]?.tests?.map(test => [test.test_id, test.status, test.baseline?.n])]));

  const items = useMemo(() => buildTasks({
    sol: scope.sol,
    codes: scope.codes,
    organs: scope.organs,
    cognitive,
    habitat: scope.habitat,
    measurements: listMeasurements(),
    doneMap: readDone(),
    scopeCode: scope.scopeCode,
    t,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [scope, cognitiveKey, version, t]);

  const toggleDone = useCallback((itemOrId, value) => {
    const item = typeof itemOrId === 'string' ? items.find(entry => entry.id === itemOrId) : itemOrId;
    if (!item) return;
    setDone(item.dueSol ?? scope.sol, item.id, value ?? !item.done);
  }, [items, scope.sol]);

  const counts = useMemo(() => countTasks(items), [items]);
  return { items, toggleDone, counts, sol: scope.sol, scopeCode: scope.scopeCode };
}

export default useTasks;

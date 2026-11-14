import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelIcon } from '../pixel/index.js';
import { Sparkline, StatusMark } from '../ui/index.js';
import { getCognitive } from '../cognitive/engine/api.js';
import { BASELINE_NEEDED, PROTOCOLS, TEST_ORDER } from '../cognitive/engine/protocols.js';

// The three cognitive tests (PVT, Go/No-Go, DSST) as compact tiles in the brain panel:
// status + key number + trend, or BUILDING BASELINE n/5 when there are not enough sessions.
// Data: GET /api/cognitive/{code} (read only here; sessions are run on the TEST screen).

const ICON = { pvt: 'pvt', gonogo: 'gonogo', dsst: 'dsst' };

export function useCognitive(code) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!code) return undefined;
    const controller = new AbortController();
    setData(null);
    getCognitive(code, { signal: controller.signal })
      .then(body => setData(body && Array.isArray(body.tests) ? body : null))
      .catch(() => setData(null));
    return () => controller.abort();
  }, [code]);
  return data;
}

function keyNumber(tile) {
  const m = tile?.latest?.metrics;
  if (!m) return null;
  if (tile.test_id === 'pvt' && m.pvt_median_rt_ms != null) return `${Math.round(m.pvt_median_rt_ms)} ms`;
  if (tile.test_id === 'gonogo' && m.gonogo_commission_rate != null) return `${Math.round(m.gonogo_commission_rate * 100)} %`;
  if (tile.test_id === 'dsst' && m.dsst_throughput_per_min != null) return `${m.dsst_throughput_per_min.toFixed(1)}/min`;
  return null;
}

/** <CognitiveTiles code /> */
export function CognitiveTiles({ code }) {
  const t = useT();
  const data = useCognitive(code);
  return (
    <ul className="cog-mini" aria-label={t('organs.cognitive')}>
      {TEST_ORDER.map(id => {
        const tile = (data?.tests || []).find(item => item.test_id === id) || null;
        const n = tile?.baseline?.n ?? 0;
        const needed = tile?.baseline?.needed ?? BASELINE_NEEDED;
        const ready = Boolean(tile?.baseline?.ready);
        const status = ready ? tile?.status ?? 'no_data' : 'no_data';
        const values = (tile?.trend || []).map(point => point.value);
        const number = keyNumber(tile);
        return (
          <li key={id} className="cog-mini-tile" data-testid={`cog-mini-${id}`} data-status={status}>
            <PixelIcon name={ICON[id]} size={32} />
            <span className="cog-mini-name">{PROTOCOLS[id]?.label ?? id}</span>
            {ready ? <StatusMark status={status} size="sm" /> : <span className="cog-mini-baseline">{t('organs.building', { n, needed })}</span>}
            {number && <span className="cog-mini-num">{number}</span>}
            {values.length >= 2 ? <Sparkline values={values} status={status} width={88} height={24} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default CognitiveTiles;

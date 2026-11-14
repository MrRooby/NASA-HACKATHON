import React from 'react';
import { TrendSpark } from './Tiles.jsx';
import { TEST_ORDER } from './engine/protocols.js';
import { KEY_METRIC, LABELS } from './engine/localReport.js';
import { fmt } from './session.js';

function keyText(test, m) {
  const v = m?.[KEY_METRIC[test]];
  if (v == null) return '-';
  if (test === 'pvt') return fmt(v, 0, ' ms');
  if (test === 'gonogo') return fmt(v * 100, 0, ' %');
  return fmt(v, 1, ' / min');
}

/** Own sessions (newest first) and a trend line per test. */
export default function SelfHistory({ sessions, report }) {
  const rows = [...sessions].reverse();
  return (
    <section className="data-panel cog-history" data-testid="self-history">
      <div className="panel-header"><span className="panel-title">MY SESSIONS</span></div>
      <div className="cog-tile-body">
        <div className="cog-trends">
          {TEST_ORDER.map(id => {
            const tile = report.tests.find(t => t.test_id === id);
            return (
              <div key={id} className="cog-trend">
                <span className="cog-muted">{LABELS[id]}</span>
                <TrendSpark values={tile.trend.map(p => p.value)} status={tile.status} />
              </div>
            );
          })}
        </div>
        {rows.length === 0 ? <p className="cog-muted">No sessions yet.</p> : (
          <div className="cog-table-wrap">
            <table className="cog-table">
              <thead><tr><th>Date</th><th>Test</th><th>No.</th><th>Result</th><th>Status</th><th>Quality</th><th>Counts</th></tr></thead>
              <tbody>
                {rows.map(s => {
                  const r = s.local_result || {};
                  const demo = r.status_reason === 'demo';
                  return (
                    <tr key={s.client_session_uuid} data-testid="history-row">
                      <td>{new Date(s.started_at).toLocaleString()}</td>
                      <td>{s.test_id}</td>
                      <td>{s.session_no}</td>
                      <td>{keyText(s.test_id, r.metrics)}</td>
                      <td>{r.status}</td>
                      <td>{r.quality}</td>
                      <td>{demo ? 'demo' : r.is_practice ? 'practice' : r.status === 'complete' && r.quality === 'ok' ? 'baseline' : 'no'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

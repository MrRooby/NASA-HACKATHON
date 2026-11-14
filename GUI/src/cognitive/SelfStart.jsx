import React, { useCallback, useMemo, useRef, useState } from 'react';
import SelfHistory from './SelfHistory.jsx';
import SessionFlow from './SessionFlow.jsx';
import Diagnostics from './Diagnostics.jsx';
import { Tile } from './Tiles.jsx';
import { DISCLAIMER, TEST_ORDER } from './engine/protocols.js';
import {
  clearSessions, downloadText, exportCsv, exportJson, importJson, listSessions, loadName, localReport, saveName, subjectFor,
} from './engine/localStore.js';
import { localSink } from './engine/sink.js';
import { fmt } from './session.js';

const stamp = () => new Date().toISOString().slice(0, 10);

/** Standalone "tests on yourself" screen: everything stays in this browser. */
export default function SelfStart({ demo = false }) {
  const [name, setName] = useState(loadName);
  const [tick, setTick] = useState(0);
  const [flow, setFlow] = useState(null);
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);
  const subject = subjectFor(name);
  const sessions = useMemo(() => listSessions(subject), [subject, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const report = useMemo(() => localReport(subject, sessions), [subject, sessions]);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  const doExportJson = () => downloadText(`cognitive-self-${stamp()}.json`, exportJson(subject), 'application/json');
  const doExportCsv = () => downloadText(`cognitive-self-${stamp()}.csv`, exportCsv(subject), 'text/csv');

  async function doImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = importJson(await file.text());
    setNotice(res.error ? res.error : `Imported ${res.added} session(s), skipped ${res.skipped} duplicate(s)${res.invalid ? `, ${res.invalid} invalid` : ''}.`);
    refresh();
  }

  function doClear() {
    // eslint-disable-next-line no-alert
    if (window.confirm('Delete ALL your sessions stored in this browser? Export them first if you want a copy.')) {
      clearSessions();
      setNotice('All local data was deleted.');
      refresh();
    }
  }

  const extra = useCallback(({ payload, demo: isDemo }) => (
    <>
      <div className="cog-card">
        <p className="cog-muted">Saved in this browser only. Keep a copy of your data:</p>
        <div className="cog-actions">
          <button type="button" className="btn-secondary cog-btn" onClick={doExportJson}>EXPORT JSON</button>
          <button type="button" className="btn-secondary cog-btn" onClick={doExportCsv}>EXPORT CSV</button>
        </div>
      </div>
      <Diagnostics payload={payload} demo={isDemo} />
    </>
  ), [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  if (flow) {
    return (
      <div className="cog-run">
        <SessionFlow subject={subject} mode={flow.mode} tiles={report.tests} sink={localSink} demo={demo} resultExtra={extra}
          onSaved={refresh} onExit={() => { setFlow(null); refresh(); }} />
      </div>
    );
  }

  const tiles = TEST_ORDER.map(id => report.tests.find(t => t.test_id === id));
  return (
    <div className="cog-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">COGNITIVE TESTS ON YOURSELF · COMPARED WITH YOUR OWN BASELINE</div>
          <h1 className="page-h1">MY COGNITIVE TESTS</h1>
        </div>
        <div className="header-actions">
          <label className="cog-select">
            <span>Your pseudonym</span>
            <input value={name} maxLength={24} aria-label="Your pseudonym"
              onChange={e => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              onBlur={() => { const n = name || 'SELF'; setName(n); saveName(n); }} />
          </label>
        </div>
      </div>

      <div className="cog-banner cog-banner-offline" role="note" data-testid="local-warning">
        Results are stored only in this browser — export them to keep a copy.
      </div>
      {demo && <div className="cog-banner cog-banner-synth" data-testid="demo-banner">DEMO mode: shortened tests (30 s / 30 trials), never counted in your baseline.</div>}
      {notice && <div className="cog-banner" role="status">{notice}</div>}

      <div className="cog-actions cog-actions-top">
        <button type="button" className="btn-primary cog-btn" onClick={() => { saveName(name); setFlow({ mode: 'quick' }); }}>QUICK TEST · PVT{demo ? ' (demo)' : ' (~4 min)'}</button>
        <button type="button" className="btn-secondary cog-btn" onClick={() => { saveName(name); setFlow({ mode: 'full' }); }}>FULL BATTERY{demo ? ' (demo)' : ' (~8 min)'}</button>
      </div>

      <div className="cog-tiles">{tiles.map(t => <Tile key={t.test_id} tile={t} />)}</div>
      {report.composite_z != null && <p className="cog-muted">Overall change vs your baseline (z): {fmt(report.composite_z, 2)}</p>}

      <SelfHistory sessions={sessions} report={report} />

      <div className="cog-actions">
        <button type="button" className="btn-secondary cog-btn" onClick={doExportJson} disabled={sessions.length === 0}>EXPORT JSON</button>
        <button type="button" className="btn-secondary cog-btn" onClick={doExportCsv} disabled={sessions.length === 0}>EXPORT CSV</button>
        <button type="button" className="btn-secondary cog-btn" onClick={() => fileRef.current?.click()}>IMPORT JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import JSON file" onChange={doImport} />
        <button type="button" className="btn-secondary cog-btn" onClick={doClear} disabled={sessions.length === 0}>CLEAR MY DATA</button>
      </div>
      <p className="cog-disclaimer">{report.disclaimer || DISCLAIMER}</p>
    </div>
  );
}

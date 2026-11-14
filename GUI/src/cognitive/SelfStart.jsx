import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Panel } from '../components/index.js';
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
      <Panel className="cog-card" title="Your data">
        <p className="cog-muted">Saved in this browser only. Keep a copy of your data:</p>
        <div className="cog-actions">
          <Button className="cog-btn" onClick={doExportJson}>EXPORT JSON</Button>
          <Button className="cog-btn" onClick={doExportCsv}>EXPORT CSV</Button>
        </div>
      </Panel>
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
      <header className="cog-head">
        <div>
          <p className="cog-eyebrow">COGNITIVE TESTS ON YOURSELF · COMPARED WITH YOUR OWN BASELINE</p>
          <h1>MY COGNITIVE TESTS</h1>
        </div>
        <label className="cog-select">
            <span>Your pseudonym</span>
            <input value={name} maxLength={24} aria-label="Your pseudonym"
              onChange={e => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              onBlur={() => { const n = name || 'SELF'; setName(n); saveName(n); }} />
        </label>
      </header>

      <p className="cog-banner cog-banner-offline" role="note" data-testid="local-warning">
        Results are stored only in this browser — export them to keep a copy.
      </p>
      {demo && <p className="cog-banner cog-banner-synth" data-testid="demo-banner">DEMO mode: shortened tests (30 s / 30 trials), never counted in your baseline.</p>}
      {notice && <p className="cog-banner" role="status">{notice}</p>}

      <div className="cog-actions">
        <Button variant="primary" className="cog-btn" onClick={() => { saveName(name); setFlow({ mode: 'quick' }); }}>QUICK TEST · PVT{demo ? ' (demo)' : ' (~4 min)'}</Button>
        <Button className="cog-btn" onClick={() => { saveName(name); setFlow({ mode: 'full' }); }}>FULL BATTERY{demo ? ' (demo)' : ' (~8 min)'}</Button>
      </div>

      <div className="cog-tiles">{tiles.map(t => <Tile key={t.test_id} tile={t} />)}</div>
      {report.composite_z != null && <p className="cog-muted">Overall change vs your baseline (z): {fmt(report.composite_z, 2)}</p>}

      <SelfHistory sessions={sessions} report={report} />

      <div className="cog-actions">
        <Button className="cog-btn" onClick={doExportJson} disabled={sessions.length === 0}>EXPORT JSON</Button>
        <Button className="cog-btn" onClick={doExportCsv} disabled={sessions.length === 0}>EXPORT CSV</Button>
        <Button className="cog-btn" onClick={() => fileRef.current?.click()}>IMPORT JSON</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import JSON file" onChange={doImport} />
        <Button variant="danger" className="cog-btn" onClick={doClear} disabled={sessions.length === 0}>CLEAR MY DATA</Button>
      </div>
      <p className="cog-disclaimer">{report.disclaimer || DISCLAIMER}</p>
    </div>
  );
}

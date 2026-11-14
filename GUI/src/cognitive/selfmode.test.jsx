import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StandaloneApp, { isDemo } from './standalone.jsx';
import { useFake } from './helpers.js';
import { DEMO_OVERRIDES } from './engine/protocols.js';
import { diagnose } from './engine/diagnostics.js';
import { KEY_METRIC, localReport, pyFixed, testBlock } from './engine/localReport.js';
import {
  CSV_COLUMNS, SESSIONS_KEY, addSession, clearSessions, exportCsv, exportJson, importJson, listSessions, subjectFor,
} from './engine/localStore.js';
import { apiSink, localSink } from './engine/sink.js';
import { buildPayload, uuid4 } from './session.js';
import { goNoGoShort } from './tests/gonogo/sequence.js';

const cases = JSON.parse(readFileSync(resolve(process.cwd(), '../config/cognitive/fixtures/report_cases.json'), 'utf8')).cases;

function approx(actual, expected, path = '') {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs(actual - expected), path).toBeLessThanOrEqual(1e-9);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect(actual.length, path).toBe(expected.length);
    expected.forEach((e, i) => approx(actual[i], e, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    expect(Object.keys(actual).sort(), path).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) approx(actual[k], expected[k], `${path}.${k}`);
  } else expect(actual, path).toEqual(expected);
}

describe('local report parity with MOTHER (report_cases.json)', () => {
  it.each(cases.map(c => [c.name, c]))('%s', (_name, c) => {
    const report = localReport('SELF-X', c.sessions);
    approx(report.tests.find(t => t.test_id === c.test_id), c.expected, c.name);
    const [, z] = testBlock(c.test_id, c.sessions);
    if (c.expected_key_z == null) expect(z).toBeNull(); else expect(Math.abs(z - c.expected_key_z)).toBeLessThanOrEqual(1e-9);
  });

  it('has the GET /api/cognitive/{subject} shape', () => {
    const r = localReport('SELF-X', []);
    expect(Object.keys(r).sort()).toEqual(['composite_z', 'disclaimer', 'schema_version', 'subject', 'tests']);
    expect(r.subject).toEqual({ code: 'SELF-X', data_kind: 'self_test' });
    expect(r.tests.map(t => t.test_id)).toEqual(['pvt', 'gonogo', 'dsst']);
    expect(r.composite_z).toBeNull();
  });

  it('formats like Python (half-even ties, signs)', () => {
    expect(pyFixed(2.5, 0, true)).toBe('+2');
    expect(pyFixed(3.5, 0, true)).toBe('+4');
    expect(pyFixed(-0.4, 0, true)).toBe('-0');
    expect(pyFixed(0, 1, true)).toBe('+0.0');
    expect(pyFixed(-7.142857, 1, true)).toBe('-7.1');
    expect(KEY_METRIC.pvt).toBe('pvt_median_rt_ms');
  });
});

const SUBJECT = 'SELF-TEST';
function makePayload(i, { test = 'pvt', rt = 280, extra = {}, device = {} } = {}) {
  const trials = test === 'pvt'
    ? Array.from({ length: 25 }, (_, k) => ({ is_practice: false, stimulus: 'counter', valid: true, timeout: false, rt_ms: rt + k, event_type: 'response', ts_source: k % 2 ? 'h' : 'e', isi_ms: 2000, t_onset_ms: 1 }))
    : [];
  const t0 = Date.UTC(2026, 10, 1 + i, 8, 0, 0);
  const { payload } = buildPayload({
    subject: SUBJECT, test, sessionNo: i + 1, stimulusSet: 'A', seed: 1, status: 'complete', startedAt: t0, completedAt: t0 + 180000, durationS: 180,
    device: { device_class: 'keyboard', timer_resolution_ms: 0.1, ...device }, context: {}, main: { trials, events: [], focus: {} },
  });
  return { ...payload, ...extra };
}

describe('localSink / localStore', () => {
  it('stores the full payload plus the server-equivalent result and never calls fetch', async () => {
    const res = await localSink.submit(makePayload(0));
    expect(res.state).toBe('local');
    expect(fetch).not.toHaveBeenCalled();
    const [s] = listSessions();
    expect(s.trials).toHaveLength(25);
    expect(s.local_result).toMatchObject({ status: 'complete', quality: 'ok', is_practice: true, scoring_version: '1.0' });
    expect(window.localStorage.getItem(SESSIONS_KEY)).toBeTruthy();
    expect(window.localStorage.getItem('cognitive.queue.v1')).toBeNull();
  });

  it('forces the first complete session per test to practice, not the second', async () => {
    await localSink.submit(makePayload(0));
    await localSink.submit(makePayload(1));
    await localSink.submit(makePayload(2));
    expect(listSessions().map(s => s.local_result.is_practice)).toEqual([true, false, false]);
  });

  it('applies server rules: timer > 2 ms -> low quality; scoring invalid overrides complete', () => {
    addSession(makePayload(0, { device: { timer_resolution_ms: 5 } }));
    expect(listSessions()[0].local_result.quality).toBe('low');
    const { record } = addSession({ ...makePayload(1), trials: [] });
    expect(record.local_result.status).toBe('invalid');
    expect(record.local_result.status_reason).toMatch(/scoring/);
  });

  it('dedupes by client_session_uuid', () => {
    const p = makePayload(0);
    addSession(p);
    expect(addSession(p).duplicate).toBe(true);
    expect(listSessions()).toHaveLength(1);
  });

  it('JSON export/import round-trips losslessly and dedupes', () => {
    for (let i = 0; i < 4; i += 1) addSession(makePayload(i));
    const json = exportJson();
    const before = listSessions();
    expect(JSON.parse(json)).toEqual(before);
    clearSessions();
    expect(importJson(json)).toEqual({ added: 4, skipped: 0, invalid: 0 });
    expect(listSessions()).toEqual(before);
    expect(importJson(json)).toEqual({ added: 0, skipped: 4, invalid: 0 });
    expect(importJson('nope').error).toBeTruthy();
    expect(importJson(JSON.stringify([{ foo: 1 }]))).toEqual({ added: 0, skipped: 0, invalid: 1 });
  });

  it('imports a raw POST payload by computing its result', () => {
    expect(importJson(JSON.stringify([makePayload(0)])).added).toBe(1);
    expect(listSessions()[0].local_result.status).toBe('complete');
  });

  it('CSV: header and one row per session', () => {
    addSession(makePayload(0));
    addSession(makePayload(1));
    const lines = exportCsv().trim().split('\n');
    expect(lines[0].split(',')).toEqual(CSV_COLUMNS);
    expect(lines[0].startsWith('started_at,test_id,session_no,status,quality,is_practice,device_class,')).toBe(true);
    expect(lines).toHaveLength(3);
    const row = lines[1].split(',');
    expect(row.slice(0, 7)).toEqual(['2026-11-01T08:00:00.000Z', 'pvt', '1', 'complete', 'ok', '1', 'keyboard']);
    expect(row[7 + CSV_COLUMNS.slice(7).indexOf('pvt_median_rt_ms')]).toBe('292');
  });

  it('clear removes everything; report then has no data', () => {
    addSession(makePayload(0));
    clearSessions();
    expect(listSessions()).toEqual([]);
  });

  it('report from stored sessions: practice excluded, baseline builds to ready', () => {
    for (let i = 0; i < 5; i += 1) addSession(makePayload(i, { rt: 280 + i }));
    const tile = localReport(subjectFor('test'), listSessions('SELF-TEST')).tests[0];
    expect(tile.baseline).toEqual({ n: 3, needed: 3, ready: true });
    expect(tile.latest.session_no).toBe(5);
    expect(tile.next).toEqual({ session_no: 6, stimulus_set: 'B' });
  });

  it('apiSink is the queue-based sink', () => { expect(apiSink.name).toBe('api'); expect(typeof apiSink.submit).toBe('function'); });
});

describe('demo mode', () => {
  it('protocol overrides: PVT 30 s, DSST 30 s, Go/No-Go 30 trials with the sequence rules', () => {
    expect(DEMO_OVERRIDES.pvt.durationMs).toBe(30000);
    expect(DEMO_OVERRIDES.dsst.durationS).toBe(30);
    const { total, nogo } = DEMO_OVERRIDES.gonogo.shortTrials;
    for (let seed = 1; seed <= 200; seed += 1) {
      const seq = goNoGoShort(seed, total, nogo);
      expect(seq).toHaveLength(30);
      expect(seq.filter(s => s.stimulus === 'nogo')).toHaveLength(8);
      expect(seq.slice(0, 3).every(s => s.stimulus === 'go')).toBe(true);
      expect(/nogo,nogo,nogo/.test(seq.map(s => s.stimulus).join(','))).toBe(false);
    }
  });

  it('isDemo reads ?demo=1', () => { expect(isDemo('?demo=1')).toBe(true); expect(isDemo('')).toBe(false); });
});

describe('diagnostics', () => {
  it('computes histogram, h share, device values and ISI difference', () => {
    const d = diagnose({ ...makePayload(0), seed: 5, device: { refresh_hz: 60, frame_jitter_ms: 1, timer_resolution_ms: 0.1, focus_lost_ms: 7 } });
    expect(d.n_rt).toBe(25);
    expect(d.histogram.bins.reduce((a, b) => a + b.count, 0)).toBe(25);
    expect(d.ts_h).toMatchObject({ n: 12, total: 25 });
    expect(d.device).toEqual({ refresh_hz: 60, frame_jitter_ms: 1, timer_resolution_ms: 0.1, focus_lost_ms: 7 });
    expect(d.isi.n).toBe(25);
  });
});

describe('standalone page', () => {
  beforeEach(() => { useFake(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders without auth and without any fetch', () => {
    render(<StandaloneApp demo={false} />);
    expect(screen.getByRole('heading', { name: /my cognitive tests/i })).toBeInTheDocument();
    expect(screen.getByTestId('local-warning')).toHaveTextContent(/stored only in this browser/i);
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(3);
    expect(screen.getByLabelText('Your pseudonym')).toHaveValue('SELF');
    expect(screen.queryByText(/sign in|log in/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /quick test/i }));
    expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs a full demo Quick flow locally: saved as demo practice, diagnostics shown, zero fetch', async () => {
    render(<StandaloneApp demo />);
    expect(screen.getByTestId('demo-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /quick test/i }));
    for (const [label, value] of [['Hours of sleep last night', '7.5'], ['Sleep quality', '7'], ['Fatigue now', '3'], ['Sleepiness (KSS)', '3'], ['Stress now', '2']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(screen.getByTestId('demo-note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start practice/i }));
    for (let i = 0; i < 400 && !screen.queryByRole('button', { name: /start test/i }); i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    }
    fireEvent.click(screen.getByRole('button', { name: /start test/i }));
    for (let i = 0; i < 400 && !screen.queryByTestId('result-card'); i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    }
    expect(screen.getByTestId('result-card')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(/in this browser only/i);
    expect(screen.getByTestId('diagnostics')).toBeInTheDocument();
    const [s] = listSessions();
    expect(s.subject_code).toBe('SELF-SELF');
    expect(s.duration_s).toBeLessThanOrEqual(40);
    expect(s.local_result).toMatchObject({ is_practice: true, status_reason: 'demo' });
    expect(s.is_practice).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(uuid4()).toBeTruthy();
  }, 30000);
});

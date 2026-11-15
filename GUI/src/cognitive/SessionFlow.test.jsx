import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionFlow from './SessionFlow.jsx';
import { acquireTabLock } from './engine/tabLock.js';
import { assess, batteryFor, buildPayload, sessionStatus, uuid4 } from './session.js';
import { fillSurvey, useFake } from './helpers.js';
import { score } from './engine/score.js';

describe('session payload (CONTRACT section 3)', () => {
  const trial = (extra) => ({ is_practice: false, stimulus: 'counter', valid: true, timeout: false, ...extra });
  const base = () => ({
    subject: 'SYN-01', test: 'pvt', sessionNo: 3, stimulusSet: 'C', seed: 123,
    status: 'complete', startedAt: Date.UTC(2026, 10, 14, 8, 1, 2), completedAt: Date.UTC(2026, 10, 14, 8, 4, 10), durationS: 180,
    device: { device_class: 'touch', refresh_hz: 60, frame_jitter_ms: 1.2, timer_resolution_ms: 0.1 },
    context: { sleep_h: 7.5, sleep_quality: 7, fatigue: 3, kss: 3, stress: 2, caffeine_3h: false },
    practice: { trials: [trial({ idx: 0, is_practice: true, rt_ms: 250, event_type: 'response' })], events: [{ seq: 0, t_ms: 1, kind: 'blur', detail: null }], focus: { focus_lost_ms: 100 } },
    main: { trials: [trial({ idx: 0, rt_ms: 280, event_type: 'response' }), trial({ idx: 1, rt_ms: 300, event_type: 'response' })], events: [{ seq: 0, t_ms: 5, kind: 'extra_press', detail: null }], focus: { focus_lost_ms: 50 } },
  });

  it('has every contract field, renumbers idx/seq and scores like the server will', () => {
    const { payload, scored } = buildPayload(base());
    expect(Object.keys(payload).sort()).toEqual([
      'app_version', 'battery_position', 'battery_uuid', 'client_metrics', 'client_session_uuid', 'completed_at', 'context', 'device',
      'duration_s', 'events', 'is_practice', 'protocol_version', 'seed', 'session_no', 'started_at', 'status', 'status_reason',
      'stimulus_set', 'subject_code', 'test_id', 'trials', 'tz_offset_min',
    ]);
    expect(payload.protocol_version).toBe('pvtb-1.0');
    expect(payload.started_at).toBe('2026-11-14T08:01:02.000Z');
    expect(payload.trials.map(t => [t.idx, t.is_practice])).toEqual([[0, true], [1, false], [2, false]]);
    expect(payload.events.map(e => e.seq)).toEqual([0, 1]);
    expect(payload.device).toMatchObject({ device_class: 'touch', refresh_hz: 60, focus_lost_ms: 150 });
    expect(payload.client_metrics.pvt_median_rt_ms).toBe(290); // practice trial excluded
    expect(scored.metrics.pvt_median_rt_ms).toBe(290);
    expect(payload.client_session_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(payload)).not.toMatch(/NaN|undefined/);
  });

  it('uuid4 has the v4 shape even without crypto.randomUUID', () => {
    const orig = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try { expect(uuid4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); }
    finally { Object.defineProperty(crypto, 'randomUUID', { value: orig, configurable: true }); }
  });

  it('battery order: Quick = PVT; Full alternates Go/No-Go and DSST with the session number', () => {
    expect(batteryFor('quick', 1)).toEqual(['pvt']);
    expect(batteryFor('full', 1)).toEqual(['pvt', 'gonogo', 'dsst']);
    expect(batteryFor('full', 2)).toEqual(['pvt', 'dsst', 'gonogo']);
  });

  it('status: aborted > interrupted > complete', () => {
    expect(sessionStatus({ aborted: true, focus: { interrupted: true } }).status).toBe('aborted');
    expect(sessionStatus({ aborted: false, focus: { interrupted: true, reason: 'x' } })).toEqual({ status: 'interrupted', reason: 'x' });
    expect(sessionStatus({ aborted: false, focus: {} }).status).toBe('complete');
  });

  it('result assessment uses text AND status; baseline building is neutral', () => {
    const good = score('pvt', Array.from({ length: 25 }, (_, i) => ({ idx: i, rt_ms: 280, event_type: 'response' })));
    expect(assess('pvt', good, { baselineReady: false })).toMatchObject({ status: 'no_data', text: 'BASELINE BUILDING' });
    expect(assess('pvt', good, { baselineReady: true }).status).toBe('ok');
    expect(assess('pvt', good, { baselineReady: true, sessionStatus: 'interrupted' })).toMatchObject({ text: 'NOT COUNTED', repeat: true });
    const lapsy = score('pvt', [...Array.from({ length: 25 }, (_, i) => ({ idx: i, rt_ms: 280, event_type: 'response' })), ...Array.from({ length: 6 }, (_, i) => ({ idx: 30 + i, rt_ms: 500, event_type: 'lapse' }))]);
    expect(assess('pvt', lapsy, { baselineReady: true }).status).toBe('alert');
  });
});

describe('SessionFlow', () => {
  beforeEach(() => { useFake(); });
  afterEach(() => { vi.useRealTimers(); });

  it('survey -> screen check -> instructions; reports running state and refuses a second window', async () => {
    const running = vi.fn();
    render(<SessionFlow subject="SYN-01" mode="quick" onRunningChange={running} onExit={() => {}} />);
    expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeDisabled();
    fillSurvey();
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(screen.getByRole('heading', { name: /checking your screen/i })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('heading', { name: /screen check/i })).toBeInTheDocument();
    expect(screen.getByText(/Refresh rate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(screen.getByRole('heading', { name: /reaction time/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(4);
    fireEvent.click(screen.getByRole('button', { name: /start practice/i }));
    expect(screen.getByTestId('cog-field')).toBeInTheDocument();
    expect(running).toHaveBeenLastCalledWith(true);
  });

  it('shows "test running in another window" when the lock is taken', () => {
    const other = acquireTabLock();
    render(<SessionFlow subject="SYN-01" mode="quick" onExit={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/another window/i);
    other.release();
  });
});

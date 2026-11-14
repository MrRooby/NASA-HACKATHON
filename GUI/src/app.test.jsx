import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bioRow, intakeInput, renderApp, rowStatus, submitCheckIn } from './test/renderApp.jsx';

vi.mock('react-dom/client', async () => (await import('./test/renderApp.jsx')).mockReactDomClient());
vi.mock('./AstronautViewer.jsx', async () => ({ default: (await import('./test/mocks.jsx')).MockAstronautViewer }));

afterEach(() => {
  vi.useRealTimers();
});

describe('auth screen', () => {
  it('renders the sign-in screen with the medical disclaimer first', async () => {
    await renderApp({ signIn: false });
    expect(screen.getByRole('button', { name: /sign in to your health space/i })).toBeInTheDocument();
    expect(screen.getByText(/does not diagnose illness or replace a certified flight surgeon/i)).toBeInTheDocument();
    expect(screen.queryByText(/good morning/i)).not.toBeInTheDocument();
  });

  it('toggles passcode visibility', async () => {
    const { container } = await renderApp({ signIn: false });
    const passcode = container.querySelector('input[autocomplete="current-password"]');
    expect(passcode).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'SHOW' }));
    expect(passcode).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'HIDE' }));
    expect(passcode).toHaveAttribute('type', 'password');
  });

  it('signs in through the form with the prefilled demo credentials', async () => {
    await renderApp({ signIn: false });
    fireEvent.click(screen.getByRole('button', { name: /sign in to your health space/i }));
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
  });

  it('signs out back to the auth screen', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(screen.getByRole('button', { name: /continue with demo profile/i })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('renders the overview with a mocked 3D viewer and connector lines', async () => {
    const { container } = await renderApp();
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
    expect(screen.getByTestId('astronaut-viewer')).toHaveAttribute('data-front-view', 'true');
    // Once the model reports anchors, one connector is drawn per sensor card.
    expect(container.querySelectorAll('.body-connectors line')).toHaveLength(4);
  });

  it('lists all eight biometrics in the telemetry table', async () => {
    await renderApp();
    const labels = ['Blood pressure', 'Diastolic pressure', 'Heart rate', 'Glucose', 'Temperature', 'Sleep', 'Mood', 'Radiation'];
    for (const label of labels) expect(bioRow(label)).toBeTruthy();
    expect(within(bioRow('Blood pressure')).getByText('128')).toBeInTheDocument();
    expect(within(bioRow('Radiation')).getByText('252')).toBeInTheDocument();
  });

  it('classifies the seeded demo values against config thresholds', async () => {
    await renderApp();
    expect({
      sbp: rowStatus('Blood pressure'),
      dbp: rowStatus('Diastolic pressure'),
      hr: rowStatus('Heart rate'),
      glucose: rowStatus('Glucose'),
      temperature: rowStatus('Temperature'),
      sleep: rowStatus('Sleep'),
      mood: rowStatus('Mood'),
      rad: rowStatus('Radiation'),
    }).toEqual({
      sbp: 'caution', dbp: 'caution', hr: 'ok', glucose: 'ok',
      temperature: 'ok', sleep: 'caution', mood: 'ok', rad: 'ok',
    });
    expect(within(bioRow('Blood pressure')).getByText('[CAU]')).toHaveClass('stag-caution');
    expect(within(bioRow('Heart rate')).getByText('[NOM]')).toHaveClass('stag-ok');
  });

  it('shows the reference range from the ok band, or a fallback when it has no lower bound', async () => {
    await renderApp();
    expect(within(bioRow('Blood pressure')).getByText('90–120')).toBeInTheDocument();
    expect(within(bioRow('Glucose')).getByText('70–100')).toBeInTheDocument();
    expect(within(bioRow('Radiation')).getByText('See guidance')).toBeInTheDocument();
  });

  it('opens one recommended action per non-nominal indicator, with basis labels', async () => {
    const { container } = await renderApp();
    expect(screen.getByText('3 OPEN')).toBeInTheDocument();
    const entries = [...container.querySelectorAll('.action-entry')];
    expect(entries.map(e => e.querySelector('.ae-sys').textContent)).toEqual(['Blood pressure', 'Diastolic pressure', 'Sleep']);
    expect(entries[0]).toHaveTextContent('CONFIGURED REFERENCE');
    expect(entries[2]).toHaveTextContent('TEAM ASSUMPTION');
    entries.forEach(e => expect(e).toHaveTextContent('REVIEW AFTER RECHECK'));
  });

  it('colours sensor cards by the worst status of their indicators', async () => {
    const { container } = await renderApp();
    expect(container.querySelector('.sensor-left-arm')).toHaveClass('sensor-caution');
    expect(container.querySelector('.sensor-left-arm')).toHaveTextContent('slightly above baseline');
    expect(container.querySelector('.sensor-right-arm')).toHaveClass('sensor-ok');
    expect(container.querySelector('.sensor-left-leg')).toHaveClass('sensor-caution');
    expect(container.querySelector('.sensor-left-leg')).toHaveTextContent('keep monitoring');
    expect(container.querySelector('.sensor-right-leg')).toHaveClass('sensor-ok');
  });

  it('renders the system event log', async () => {
    const { container } = await renderApp();
    const codes = [...container.querySelectorAll('.log-code')];
    expect(codes).toHaveLength(5);
    expect(codes.find(c => c.textContent === 'SBP_CAUTION')).toHaveClass('caution');
    expect(codes.find(c => c.textContent === 'SYNC_OK')).toHaveClass('ok');
  });
});

describe('synthetic trend data', () => {
  const sparkPoints = container =>
    [...container.querySelectorAll('.bio-spark polyline')].map(p => p.getAttribute('points'));

  it('expands each 6-point seed trend to a 30-point sparkline', async () => {
    const { container } = await renderApp();
    const all = sparkPoints(container);
    expect(all).toHaveLength(8);
    all.forEach(points => expect(points.split(' ')).toHaveLength(30));
  });

  it('is deterministic across independent renders', async () => {
    const first = sparkPoints((await renderApp()).container);
    const second = sparkPoints((await renderApp()).container);
    expect(first).toHaveLength(8);
    expect(second).toEqual(first);
  });
});

describe('navigation', () => {
  it('moves dashboard -> check-in -> dashboard via the Base tab', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
    expect(screen.getByRole('heading', { name: /log entry \/ data intake/i })).toBeInTheDocument();
    expect(screen.queryByText(/good morning/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Base' }));
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
  });
});

describe('cognitive tests page', () => {
  it('opens from the top bar (lazy chunk) and goes back to the overview', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Cognitive tests' }));
    expect(await screen.findByRole('heading', { name: 'COGNITIVE TESTS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick test/i })).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Base' }));
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
  });
});

describe('daily check-in', () => {
  it('prefills the form with the current readings', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
    expect(intakeInput('SYSTOLIC PRESSURE')).toHaveValue(128);
    expect(intakeInput('DIASTOLIC PRESSURE')).toHaveValue(82);
    expect(intakeInput('RESTING HEART RATE')).toHaveValue(68);
    expect(intakeInput('FASTING GLUCOSE')).toHaveValue(92);
    expect(intakeInput('BODY TEMPERATURE')).toHaveValue(36.8);
    expect(intakeInput('SLEEP DURATION')).toHaveValue(6.2);
    expect(intakeInput('SYMPTOM LOG')).toHaveValue('NONE');
    expect(screen.getByRole('button', { name: '4' })).toHaveClass('sel');
  });

  it('selects a mood score and updates the symptom log', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: '2' })).toHaveClass('sel');
    expect(screen.getByRole('button', { name: '4' })).not.toHaveClass('sel');
    fireEvent.change(intakeInput('SYMPTOM LOG'), { target: { value: 'HEADACHE' } });
    expect(intakeInput('SYMPTOM LOG')).toHaveValue('HEADACHE');
  });

  it('commits, returns to the dashboard and shows a toast that clears after 4 s', async () => {
    vi.useFakeTimers();
    const { container } = await renderApp();
    submitCheckIn({ 'SYSTOLIC PRESSURE': 150 });
    expect(screen.getByRole('heading', { name: /good morning, john doe/i })).toBeInTheDocument();
    expect(container.querySelector('.toast-bar')).toHaveTextContent('FD-142 INTAKE COMPLETE');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(container.querySelector('.toast-bar')).toBeNull();
  });

  it('escalates an alert reading with the configured action', async () => {
    const { container } = await renderApp();
    submitCheckIn({ 'SYSTOLIC PRESSURE': 150 });
    expect(rowStatus('Blood pressure')).toBe('alert');
    expect(within(bioRow('Blood pressure')).getByText('[ALT]')).toHaveClass('stag-alert');
    const entry = [...container.querySelectorAll('.action-entry')].find(e => e.querySelector('.ae-sys').textContent === 'Blood pressure');
    expect(entry).toHaveTextContent('ESCALATION RECOMMENDED');
    expect(container.querySelector('.sensor-left-arm')).toHaveClass('sensor-alert');
    expect(container.querySelector('.sensor-left-arm')).toHaveTextContent('150/82');
  });

  it('clears all actions when every reading is nominal', async () => {
    await renderApp();
    submitCheckIn({ 'SYSTOLIC PRESSURE': 115, 'DIASTOLIC PRESSURE': 75, 'SLEEP DURATION': 8 });
    expect(screen.getByText('0 OPEN')).toBeInTheDocument();
    expect(screen.getByText(/all systems nominal/i)).toBeInTheDocument();
  });

  it('applies a low mood score to the mood indicator', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /commit log entry/i }));
    expect(rowStatus('Mood')).toBe('caution');
  });
});

describe('flight surgeon report', () => {
  it('queues the report locally and flips the button state', async () => {
    const { container } = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /share with flight surgeon/i }));
    const button = screen.getByRole('button', { name: /report queued/i });
    expect(button).toHaveClass('sent');
    expect(container.querySelector('.toast-bar')).toHaveTextContent('ASYNC TRANSMISSION PENDING');

    const report = JSON.parse(window.localStorage.getItem('orbit-health-report'));
    expect(report).toMatchObject({ mission: 'ISS-EXP74', flightDay: 142, disclaimer: expect.stringMatching(/not for clinical use/i) });
    expect(report.indicators.map(i => i.id)).toEqual(['sbp', 'dbp', 'hr', 'glucose', 'temperature', 'sleep', 'mood', 'rad']);
    expect(Number.isNaN(Date.parse(report.createdAt))).toBe(false);
  });

  it('includes check-in results and escalation flags in the report', async () => {
    await renderApp();
    submitCheckIn({ 'SYSTOLIC PRESSURE': 150, 'FASTING GLUCOSE': 65 });
    fireEvent.click(screen.getByRole('button', { name: /share with flight surgeon/i }));
    const report = JSON.parse(window.localStorage.getItem('orbit-health-report'));
    const byId = Object.fromEntries(report.indicators.map(i => [i.id, i]));
    expect(byId.sbp).toMatchObject({ value: 150, status: 'alert', escalate: true });
    expect(byId.glucose).toMatchObject({ value: 65, status: 'alert', escalate: true });
    expect(byId.hr).toMatchObject({ value: 68, status: 'ok', escalate: false });
  });

  it('keeps the queued state when navigating away and back', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /share with flight surgeon/i }));
    fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Base' }));
    expect(screen.getByRole('button', { name: /report queued/i })).toBeInTheDocument();
  });
});

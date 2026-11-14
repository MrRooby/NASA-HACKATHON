import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import thresholdConfig from '../../config/thresholds.json';
import { bioRow, renderApp, rowStatus, submitCheckIn } from './test/renderApp.jsx';

vi.mock('react-dom/client', async () => (await import('./test/renderApp.jsx')).mockReactDomClient());
vi.mock('./AstronautViewer.jsx', async () => ({ default: (await import('./test/mocks.jsx')).MockAstronautViewer }));

// Status logic is exercised end-to-end: type a value in the check-in form,
// commit, read the status class of the dashboard row.
const inputs = {
  bp_systolic: { field: 'SYSTOLIC PRESSURE', row: 'Blood pressure' },
  bp_diastolic: { field: 'DIASTOLIC PRESSURE', row: 'Diastolic pressure' },
  heart_rate_resting: { field: 'RESTING HEART RATE', row: 'Heart rate' },
  glucose_fasting: { field: 'FASTING GLUCOSE', row: 'Glucose' },
  body_temperature: { field: 'BODY TEMPERATURE', row: 'Temperature' },
  sleep_hours: { field: 'SLEEP DURATION', row: 'Sleep' },
};

async function statusFor(configId, value) {
  const { field, row } = inputs[configId];
  await renderApp();
  submitCheckIn({ [field]: value });
  return rowStatus(row);
}

describe('threshold status logic (hand-checked clinical cases)', () => {
  it.each([
    ['bp_systolic', 119, 'ok'],
    ['bp_systolic', 120, 'caution'], // upper bound is exclusive
    ['bp_systolic', 139, 'caution'],
    ['bp_systolic', 140, 'alert'],
    ['bp_systolic', 85, 'caution'],
    ['bp_diastolic', 79, 'ok'],
    ['bp_diastolic', 95, 'alert'],
    ['heart_rate_resting', 45, 'ok'],
    ['heart_rate_resting', 110, 'caution'],
    ['heart_rate_resting', 130, 'alert'],
    ['glucose_fasting', 65, 'alert'],
    ['glucose_fasting', 110, 'caution'],
    ['glucose_fasting', 130, 'alert'],
    ['body_temperature', 37.5, 'ok'],
    ['body_temperature', 37.6, 'caution'],
    ['body_temperature', 39, 'alert'],
    ['body_temperature', 34.5, 'alert'],
    ['sleep_hours', 4.5, 'alert'],
    ['sleep_hours', 7, 'ok'],
  ])('%s = %s -> %s', async (configId, value, expected) => {
    expect(await statusFor(configId, value)).toBe(expected);
  });
});

describe('threshold status logic follows every configured band', () => {
  const cases = Object.keys(inputs).flatMap(configId => {
    const indicator = thresholdConfig.indicators.find(i => i.id === configId);
    return indicator.bands.map(band => {
      const value = band.min == null ? band.max - 1
        : band.max == null ? band.min + 1
        : Number(((band.min + band.max) / 2).toFixed(1));
      return [configId, value, band];
    });
  });

  it.each(cases)('%s = %s', async (configId, value, band) => {
    expect(await statusFor(configId, value)).toBe(band.status);
    const tag = within(bioRow(inputs[configId].row)).getByText(/^\[(NOM|CAU|ALT)\]$/);
    expect(tag).toHaveClass(`stag-${band.status}`);
  });
});

describe('mood self-score', () => {
  it.each([[1, 'caution'], [2, 'caution'], [3, 'ok'], [5, 'ok']])('score %s -> %s', async (score, expected) => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
    fireEvent.click(screen.getByRole('button', { name: String(score) }));
    fireEvent.click(screen.getByRole('button', { name: /commit log entry/i }));
    expect(rowStatus('Mood')).toBe(expected);
  });
});

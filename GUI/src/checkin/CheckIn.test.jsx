import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CheckIn, { FIELD_TO_METRIC } from './CheckIn.jsx';
import { createBiometrics, thresholdConfig, updateBiometric } from './thresholdLogic.js';
import { I18nProvider } from '../i18n/index.js';

/** The check-in wired to the rules engine exactly like the profile screen does it. */
function Harness({ onSubmit, lang = 'en' }) {
  const [biometrics, setBiometrics] = useState(createBiometrics);
  return (
    <I18nProvider initialLang={lang}>
      <CheckIn
        biometrics={biometrics}
        sol={142}
        onUpdate={(id, value) => setBiometrics(current => updateBiometric(current, id, value))}
        onSubmit={onSubmit}
      />
      <output data-testid="readings">{JSON.stringify(Object.fromEntries(biometrics.map(item => [item.id, item.status])))}</output>
    </I18nProvider>
  );
}

const field = label => screen.getByLabelText(label).closest('.intake-field');
const statusOf = label => field(label).getAttribute('data-status');
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
const band = (configId, status) => thresholdConfig.indicators.find(item => item.id === configId).bands.find(item => item.status === status);

describe('CheckIn: threshold status of typed values', () => {
  it.each([
    ['Systolic pressure', 119, 'ok'],
    ['Systolic pressure', 120, 'caution'], // upper bound of the ok band is exclusive
    ['Systolic pressure', 139, 'caution'],
    ['Systolic pressure', 140, 'alert'],
    ['Diastolic pressure', 79, 'ok'],
    ['Diastolic pressure', 95, 'alert'],
    ['Resting heart rate', 45, 'ok'],
    ['Resting heart rate', 130, 'alert'],
    ['Fasting glucose', 65, 'alert'],
    ['Fasting glucose', 110, 'caution'],
    ['Body temperature', 37.5, 'ok'],
    ['Body temperature', 37.6, 'caution'],
    ['Body temperature', 39, 'alert'],
    ['Sleep duration', 7, 'ok'],
    ['Sleep duration', 4.5, 'alert'],
  ])('%s = %s -> %s', (label, value, expected) => {
    render(<Harness />);
    type(label, value);
    expect(statusOf(label)).toBe(expected);
    expect(field(label)).toHaveClass(`intake-${expected}`);
    expect(within(field(label)).getByText(/^\[ (OK|CAUT|ALRT) \]$/)).toHaveAttribute('data-status', expected);
  });

  it('starts with the demo readings already rated', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Systolic pressure')).toHaveValue(128);
    expect(statusOf('Systolic pressure')).toBe('caution');
    expect(statusOf('Resting heart rate')).toBe('ok');
    expect(screen.getByText(/Daily biometric intake · SOL 142/)).toBeInTheDocument();
  });

  it('shows the message and action of the matching band, and hides them when normal', () => {
    render(<Harness />);
    type('Systolic pressure', 150);
    const alert = band('bp_systolic', 'alert');
    expect(within(field('Systolic pressure')).getByRole('note')).toHaveTextContent(alert.message);
    expect(within(field('Systolic pressure')).getByRole('note')).toHaveTextContent(alert.action);
    type('Systolic pressure', 110);
    expect(within(field('Systolic pressure')).queryByRole('note')).not.toBeInTheDocument();
  });

  it('treats a cleared field as not rated (ok), like the first GUI', () => {
    render(<Harness />);
    type('Systolic pressure', '');
    expect(statusOf('Systolic pressure')).toBe('ok');
  });
});

describe('CheckIn: mood self-score', () => {
  it.each([[1, 'caution'], [2, 'caution'], [3, 'ok'], [4, 'ok'], [5, 'ok']])('score %s -> %s', (score, expected) => {
    render(<Harness />);
    const mood = within(screen.getByRole('group', { name: 'Psych self-score (1–5)' }));
    fireEvent.click(mood.getByRole('button', { name: String(score) }));
    expect(mood.getByRole('button', { name: String(score) })).toHaveAttribute('aria-pressed', 'true');
    expect(mood.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(JSON.parse(screen.getByTestId('readings').textContent).mood).toBe(expected);
    expect(screen.getByRole('group', { name: 'Psych self-score (1–5)' }).closest('.intake-field')).toHaveAttribute('data-status', expected);
  });

  it('offers exactly the scores 1 to 5', () => {
    render(<Harness />);
    const buttons = within(screen.getByRole('group', { name: 'Psych self-score (1–5)' })).getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('CheckIn: form', () => {
  it('reports every edit with the id of the reading', () => {
    const onUpdate = vi.fn();
    render(<I18nProvider initialLang="en"><CheckIn onUpdate={onUpdate} /></I18nProvider>);
    type('Resting heart rate', 72);
    type('Sleep duration', 7.5);
    fireEvent.change(screen.getByLabelText('Symptom log'), { target: { value: 'FATIGUE' } }); // not a reading
    expect(onUpdate.mock.calls).toEqual([['hr', '72'], ['sleep', '7.5']]);
    expect(Object.keys(FIELD_TO_METRIC)).toEqual(['systolic', 'diastolic', 'hr', 'glucose', 'temperature', 'sleep', 'mood']);
  });

  it('submits with the current values', () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<Harness onSubmit={onSubmit} />);
    type('Fasting glucose', 101);
    fireEvent.change(screen.getByLabelText('Symptom log'), { target: { value: 'HEADACHE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit log entry' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toMatchObject({ glucose: '101', symptoms: 'HEADACHE', mood: 4, systolic: 128 });
  });

  it('renders without readings (no status tags)', () => {
    render(<I18nProvider initialLang="en"><CheckIn /></I18nProvider>);
    expect(screen.getByLabelText('Systolic pressure')).toHaveValue(128);
    expect(screen.queryByText(/^\[ (OK|CAUT|ALRT|----) \]$/)).not.toBeInTheDocument();
  });

  it('is translated to Polish', () => {
    render(<Harness lang="pl" />);
    expect(screen.getByLabelText('Ciśnienie skurczowe')).toHaveValue(128);
    expect(screen.getByRole('button', { name: 'Zatwierdź wpis' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ból głowy' })).toHaveValue('HEADACHE');
  });
});

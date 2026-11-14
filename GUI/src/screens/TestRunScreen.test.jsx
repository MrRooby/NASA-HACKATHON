import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/index.js';
import TestRunScreen from './TestRunScreen.jsx';

// The session itself (SessionFlow) is the existing cognitive module; here only the screen around it.
// fetch fails in tests (setup.js): MOTHER offline, nothing is ever posted.

function renderRun(route) {
  const navigate = vi.fn();
  render(<I18nProvider><TestRunScreen mother={{ mode: 'offline', online: false, report: null }} route={{ screen: 'test', code: 'HAB-C2', ...route }} navigate={navigate} /></I18nProvider>);
  return { navigate };
}

describe('TestRunScreen', () => {
  it('runs the quick session (PVT) of the person: starts with the pre-test survey', async () => {
    renderRun({ test: 'quick' });
    expect(screen.getByTestId('test-run')).toHaveAttribute('data-mode', 'quick');
    expect(screen.getByText('QUICK · PVT')).toBeInTheDocument();
    expect(screen.getByText('Bogusław Grzegrzułkiewicz')).toBeInTheDocument();
    expect(await screen.findByText('Before you start')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('MOTHER offline');
  });

  it('runs the full battery for test "full"', async () => {
    renderRun({ test: 'full' });
    expect(screen.getByTestId('test-run')).toHaveAttribute('data-mode', 'full');
    await waitFor(() => expect(screen.getByText('Before you start')).toBeInTheDocument());
  });

  it('goes back to the person with the brain open on EXIT', () => {
    const { navigate } = renderRun({ test: 'quick' });
    fireEvent.click(screen.getByRole('button', { name: /EXIT/ }));
    expect(navigate).toHaveBeenCalledWith({ screen: 'person', code: 'HAB-C2', organ: 'brain' });
  });
});

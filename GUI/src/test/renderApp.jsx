import { fireEvent, render, screen } from '@testing-library/react';

// main.jsx exports nothing and calls createRoot(...).render(<App />) on import.
// Test files mock react-dom/client (see mockReactDomClient) so that import only
// captures the <App /> element; each test then renders it with RTL, which gives
// fresh state per test and automatic cleanup.
export function mockReactDomClient() {
  return {
    createRoot: () => ({
      render: element => { globalThis.__capturedApp = element; },
      unmount: () => {},
    }),
  };
}

let appElement;

export async function loadApp() {
  if (!appElement) {
    document.body.innerHTML = '<div id="root"></div>';
    await import('../main.jsx');
    appElement = globalThis.__capturedApp;
    document.body.innerHTML = '';
  }
  return appElement;
}

export async function renderApp({ signIn = true } = {}) {
  const utils = render(await loadApp());
  if (signIn) {
    fireEvent.click(screen.getByRole('button', { name: /continue with demo profile/i }));
  }
  return utils;
}

/** Row of the dashboard biometric table for a given label. */
export function bioRow(label) {
  return screen.getAllByRole('row').find(row => row.querySelector('.bio-id')?.textContent === label);
}

export function rowStatus(label) {
  const cls = [...bioRow(label).classList].find(c => c.startsWith('bio-row-'));
  return cls.replace('bio-row-', '');
}

/** Check-in input next to a given (upper-case) label. */
export function intakeInput(label) {
  const field = screen.getByText(label, { selector: 'label' }).closest('.intake-field');
  return field.querySelector('input, select');
}

/** Open check-in, set fields, commit, and land back on the dashboard. */
export function submitCheckIn(values) {
  fireEvent.click(screen.getByRole('button', { name: /start daily check-in/i }));
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(intakeInput(label), { target: { value: String(value) } });
  }
  fireEvent.click(screen.getByRole('button', { name: /commit log entry/i }));
}

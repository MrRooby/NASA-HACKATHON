import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, requestedPaths, stubMother } from '../test/mother.js';
import CognitivePage from './CognitivePage.jsx';
import { enqueue, resetQueueMemory } from './engine/queue.js';

const SUBJECTS = [
  { code: 'SYN-01', label: 'SYN-01', kind: 'crew_health', synthetic: true, data_kind: 'synthetic' },
  { code: 'SYN-02', label: 'SYN-02', kind: 'crew_health', synthetic: true, data_kind: 'synthetic' },
];
const tile = (test_id, label, status, headline, n, extra = {}) => ({
  test_id, label, status, headline, baseline: { n, needed: 3, ready: n >= 3 }, latest: null, trend: [], next: { session_no: n + 1, stimulus_set: 'ABCD'[n % 4] }, ...extra,
});
const COGNITIVE = {
  schema_version: 'cog-1.0',
  subject: { code: 'SYN-01', data_kind: 'synthetic' },
  disclaimer: 'Performance indicator compared with your own baseline - not a diagnosis.',
  tests: [
    tile('pvt', 'Reaction time (PVT)', 'no_data', 'Building your baseline (2/3)', 2),
    tile('gonogo', 'Impulse control (Go/No-Go)', 'caution', 'Commission errors 18 %.', 4, {
      latest: { session_id: 3, quality: 'ok', metrics: { gonogo_commission_rate: 0.18 } },
      trend: [0.1, 0.12, 0.18].map((value, i) => ({ started_at: `2026-11-0${i + 1}`, value })),
    }),
    tile('dsst', 'Processing speed (DSST)', 'alert', 'Speed -2.4 SD vs your baseline.', 5, {
      latest: { session_id: 9, quality: 'ok', metrics: { dsst_throughput_per_min: 24.4 } },
    }),
  ],
  composite_z: -0.3,
};

const route = url => {
  if (url === '/api/subjects') return jsonResponse(SUBJECTS);
  if (url === '/api/cognitive/SYN-01') return jsonResponse(COGNITIVE);
  if (url === '/api/cognitive/SYN-02') return jsonResponse({ error: 'unknown subject' }, { status: 404 });
};

describe('CognitivePage', () => {
  it('renders the three tiles with status, headline, baseline n/3 and the synthetic label', async () => {
    const fetchMock = stubMother(route);
    render(<CognitivePage />);
    const pvt = await screen.findByTestId('tile-pvt');
    await waitFor(() => expect(pvt).toHaveTextContent('Building your baseline (2/3)'));
    expect(pvt).toHaveAttribute('data-status', 'no_data');
    expect(pvt).toHaveTextContent('Baseline 2/3');
    expect(within(pvt).getByText(/BUILDING BASELINE/)).toBeInTheDocument();
    const gng = screen.getByTestId('tile-gonogo');
    expect(gng).toHaveAttribute('data-status', 'caution');
    expect(gng).toHaveTextContent('CAUTION');
    expect(gng).toHaveTextContent('18 %');
    expect(gng.querySelector('svg.spark polyline')).not.toBeNull();
    expect(screen.getByTestId('tile-dsst')).toHaveAttribute('data-status', 'alert');
    expect(screen.getByTestId('synthetic-label')).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
    expect(screen.queryByText(/not reachable/i)).not.toBeInTheDocument();
    expect(requestedPaths(fetchMock)).toEqual(expect.arrayContaining(['/api/subjects', '/api/cognitive/SYN-01']));
    expect(screen.getByRole('button', { name: /quick test/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /full battery/i })).toBeEnabled();
  });

  it('remembers the chosen person and shows empty tiles for one without data (404)', async () => {
    stubMother(route);
    render(<CognitivePage />);
    const select = await screen.findByRole('combobox', { name: 'Person' });
    await waitFor(() => expect(select).toHaveValue('SYN-01'));
    fireEvent.change(select, { target: { value: 'SYN-02' } });
    expect(window.localStorage.getItem('cognitive.subject')).toBe('SYN-02');
    expect(await screen.findByText(/no cognitive data for this person yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('tile-pvt')).toHaveAttribute('data-status', 'no_data');
  });

  it('starts from the remembered person next time', async () => {
    window.localStorage.setItem('cognitive.subject', 'SYN-02');
    stubMother(route);
    render(<CognitivePage />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('SYN-02'));
  });

  it('offline: banner, placeholder tiles and the queued count', async () => {
    resetQueueMemory();
    enqueue({ client_session_uuid: 'pending-1', test_id: 'pvt', trials: [] });
    window.localStorage.setItem('cognitive.subject', 'SYN-01'); // default fetch mock rejects every call
    render(<CognitivePage />);
    expect(await screen.findByText(/MOTHER is not reachable/i)).toBeInTheDocument();
    expect(screen.getByTestId('queued-banner')).toHaveTextContent('1 result is waiting to be sent');
    expect(screen.getByTestId('tile-dsst')).toHaveAttribute('data-status', 'no_data');
    resetQueueMemory();
  });

  it('uses the crew list of the app when given', async () => {
    stubMother(route);
    render(<CognitivePage mother={{ subjects: SUBJECTS, selectedCode: 'SYN-02' }} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('SYN-02'));
  });
});

describe('CognitivePage self-test link', () => {
  it('links to the standalone local-only self-test page in a new tab', async () => {
    stubMother(route);
    render(<CognitivePage />);
    const link = await screen.findByTestId('self-test-link');
    expect(link).toHaveAttribute('href', '/cognitive.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.closest('p')).toHaveTextContent(/only in your browser/i);
  });
});

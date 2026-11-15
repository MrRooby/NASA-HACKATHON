import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrendChart } from './Tiles.jsx';

const trend = values => values.map((value, i) => ({ started_at: `2040-06-${String(10 + i).padStart(2, '0')}T10:00:00Z`, value }));

describe('TrendChart', () => {
  it('draws one dot per session, the last one highlighted, and the own baseline', () => {
    const { container } = render(<TrendChart tile={{ test_id: 'pvt', status: 'ok', baseline: { needed: 3 }, trend: trend([280, 290, 300, 285, 295]) }} />);
    expect(container.querySelectorAll('.cog-chart-pt')).toHaveLength(5);
    expect(container.querySelectorAll('.cog-chart-last')).toHaveLength(1);
    expect(container.querySelector('.cog-chart-base')).not.toBeNull();
    expect(screen.getByText(/baseline 290/)).toBeInTheDocument(); // mean of the first 3 sessions
    expect(screen.getByText('10.06')).toBeInTheDocument();
    expect(screen.getByText('14.06')).toBeInTheDocument();
  });

  it('shows Go/No-Go as percent of No-Go trials', () => {
    render(<TrendChart tile={{ test_id: 'gonogo', status: 'ok', baseline: { needed: 3 }, trend: trend([0.1, 0.2, 0.3]) }} />);
    expect(screen.getByText(/baseline 20/)).toBeInTheDocument();
  });

  it('says so when there are fewer than two sessions', () => {
    render(<TrendChart tile={{ test_id: 'dsst', status: 'no_data', trend: trend([40]) }} />);
    expect(screen.getByText('no trend yet')).toBeInTheDocument();
  });
});

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RangeBar, Sparkline, TrendChart, chartDomain } from './charts.jsx';

const co2 = {
  channel: 'ppco2', value: 2.279, min: 1.826, max: 7.737, normal_min: 1.5, normal_max: 2.5, status: 'ok', worst_status: 'alert',
};

describe('chartDomain', () => {
  it('holds every number, padded; null without numbers', () => {
    const [lo, hi] = chartDomain([1, 5, null, '3'], 0);
    expect([lo, hi]).toEqual([1, 5]);
    expect(chartDomain([null, undefined])).toBeNull();
    const [a, b] = chartDomain([4, 4]);
    expect(a).toBeLessThan(4);
    expect(b).toBeGreaterThan(4);
  });
});

describe('RangeBar', () => {
  it('draws the normal band, the sol min – max and a marker for the latest value', () => {
    const { container } = render(<RangeBar reading={co2} />);
    const band = container.querySelector('[data-part="band"]');
    const range = container.querySelector('[data-part="solrange"]');
    const marker = container.querySelector('[data-part="marker"]');
    expect(band).toBeInTheDocument();
    expect(range).toBeInTheDocument();
    // the sol range reaches further right than the normal band (the peak was out of range)
    const right = node => parseFloat(node.getAttribute('x')) + parseFloat(node.getAttribute('width'));
    expect(right(range)).toBeGreaterThan(right(band));
    expect(marker).toHaveAttribute('data-status', 'ok'); // latest value OK: no status colour
    const x = parseFloat(marker.getAttribute('x1'));
    expect(x).toBeGreaterThan(parseFloat(band.getAttribute('x')));
    expect(x).toBeLessThan(right(band));
  });

  it('colours the marker only when the latest value is not OK', () => {
    const { container } = render(<RangeBar reading={{ ...co2, value: 7, status: 'alert' }} />);
    expect(container.querySelector('[data-part="marker"]')).toHaveClass('is-alert');
  });

  it('draws nothing for a text reading and no band without a normal range', () => {
    const { container } = render(<RangeBar reading={{ channel: 'leak', value: null, text: 'none' }} />);
    expect(container.querySelector('svg')).toBeNull();
    const { container: other } = render(<RangeBar reading={{ value: 3, min: 1, max: 4 }} />);
    expect(other.querySelector('[data-part="band"]')).toBeNull();
    expect(other.querySelector('[data-part="marker"]')).toBeInTheDocument();
  });
});

describe('TrendChart', () => {
  const points = [
    { sol: 136, value: 2.1 }, { sol: 137, value: 2.3 }, { sol: 138, value: null },
    { sol: 139, value: 2.2 }, { sol: 140, value: 6.5 }, { sol: 141, value: 2.4 }, { sol: 142, value: 2.279 },
  ];

  it('draws a dot per sol with data, sol labels, the normal band and the unit', () => {
    const { container, getByRole, getByText } = render(
      <TrendChart points={points} normalMin={1.5} normalMax={2.5} unit="mmHg" status="caution" label="Trend: CO2" width={600} height={300} />,
    );
    expect(getByRole('img', { name: 'Trend: CO2' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-part="point"]')).toHaveLength(6);
    expect([...container.querySelectorAll('[data-part="sol"]')].map(node => node.textContent))
      .toEqual(['136', '137', '138', '139', '140', '141', '142']);
    expect(container.querySelector('[data-part="band"]')).toBeInTheDocument();
    expect(getByText('mmHg')).toBeInTheDocument();
    // the missing sol breaks the line in two
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    // the last dot carries the status; higher values are drawn higher
    const last = container.querySelector('[data-sol="142"]');
    expect(last).toHaveClass('is-last', 'is-caution');
    const cy = sol => parseFloat(container.querySelector(`[data-sol="${sol}"]`).getAttribute('cy'));
    expect(cy(140)).toBeLessThan(cy(139));
  });
});

describe('Sparkline', () => {
  it('needs at least two values', () => {
    const { container } = render(<Sparkline points={[{ sol: 1, value: 3 }, { sol: 2, value: null }]} />);
    expect(container.querySelector('svg')).toBeNull();
    const { container: two } = render(<Sparkline points={[{ sol: 1, value: 3 }, { sol: 2, value: 4 }]} />);
    expect(two.querySelector('polyline')).toBeInTheDocument();
  });
});

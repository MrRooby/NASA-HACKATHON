import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/index.js';
import {
  Badge, BigNumber, IconButton, Pager, PixelFrame, RangeBar, Sparkline, StatusMark, normalizeStatus, rangeGeometry,
  sparkPoints, useFitCount, usePager,
} from './index.js';

describe('<StatusMark>', () => {
  it.each([
    ['ok', 'square', 'OK'], ['caution', 'triangle', 'CAUTION'], ['alert', 'diamond', 'ALERT'], ['no_data', 'circle', 'NO DATA'],
  ])('%s → %s shape and the word %s', (status, shape, word) => {
    const { container } = render(<StatusMark status={status} />);
    expect(container.querySelector('[data-shape]')).toHaveAttribute('data-shape', shape);
    expect(container.firstChild).toHaveAttribute('data-status', status);
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it('normalises synonyms and missing statuses', () => {
    expect(normalizeStatus('warning')).toBe('caution');
    expect(normalizeStatus('CRITICAL')).toBe('alert');
    expect(normalizeStatus(undefined)).toBe('no_data');
    expect(normalizeStatus('weird')).toBe('no_data');
  });

  it('label=false keeps the word as the accessible name', () => {
    render(<StatusMark status="alert" label={false} />);
    expect(screen.getByRole('img', { name: 'ALERT' })).toBeInTheDocument();
    expect(screen.queryByText('ALERT')).toBeNull();
  });

  it('speaks Polish', () => {
    render(<I18nProvider initialLang="pl"><StatusMark status="caution" /><StatusMark status="no_data" /></I18nProvider>);
    expect(screen.getByText('UWAGA')).toBeInTheDocument();
    expect(screen.getByText('BRAK DANYCH')).toBeInTheDocument();
  });
});

describe('rangeGeometry / <RangeBar>', () => {
  it('places the marker and the normal band on the scale', () => {
    const g = rangeGeometry({ value: 50, min: 0, max: 100, low: 25, high: 75 });
    expect(g.pos).toBeCloseTo(0.5);
    expect(g.bandStart).toBeCloseTo(0.25);
    expect(g.bandEnd).toBeCloseTo(0.75);
    expect(g.off).toBeNull();
    expect(g.inBand).toBe(true);
  });

  it('clamps off-scale values and reports the side', () => {
    expect(rangeGeometry({ value: 150, min: 0, max: 100 })).toMatchObject({ pos: 1, off: 'above' });
    expect(rangeGeometry({ value: -5, min: 0, max: 100 })).toMatchObject({ pos: 0, off: 'below' });
  });

  it('handles one-sided limits by opening the band to the scale edge', () => {
    const onlyHigh = rangeGeometry({ value: 10, min: 0, max: 40, high: 34 });
    expect(onlyHigh.bandStart).toBe(0);
    expect(onlyHigh.bandEnd).toBeCloseTo(0.85);
    expect(onlyHigh.inBand).toBe(true);
    const onlyLow = rangeGeometry({ value: 90, min: 80, max: 100, low: 95 });
    expect(onlyLow.bandEnd).toBe(1);
    expect(onlyLow.inBand).toBe(false);
  });

  it('auto-scales when min/max are missing and never goes below 0 for positive data', () => {
    const g = rangeGeometry({ value: 1.73, low: 2, high: 3 });
    expect(g.min).toBeGreaterThanOrEqual(0);
    expect(g.max).toBeGreaterThan(3);
    expect(g.pos).toBeGreaterThan(0);
    expect(g.pos).toBeLessThan(g.bandStart);
  });

  it('works without a value or any bound', () => {
    expect(rangeGeometry({ value: null, low: 1, high: 2 }).pos).toBeNull();
    expect(rangeGeometry({}).pos).toBeNull();
    expect(rangeGeometry({ value: 5 }).pos).not.toBeNull();
  });

  it('renders the marker, an off-scale arrow and the band numbers', () => {
    const { container, rerender } = render(<RangeBar value={50} min={0} max={100} low={25} high={75} />);
    const marker = container.querySelector('.ui-range__marker');
    expect(marker).toHaveAttribute('data-pos', '0.5000');
    expect(parseFloat(marker.style.left)).toBe(50);
    expect(container.firstChild).toHaveAttribute('data-status', 'ok');
    expect(screen.getByText('25')).toBeInTheDocument();
    rerender(<RangeBar value={200} min={0} max={100} low={25} high={75} />);
    expect(container.querySelector('.ui-range__marker--above')).not.toBeNull();
    expect(container.firstChild).toHaveAttribute('data-status', 'caution');
    rerender(<RangeBar value={200} min={0} max={100} low={25} high={75} status="alert" compact />);
    expect(container.firstChild).toHaveAttribute('data-status', 'alert');
    expect(container.querySelector('.ui-range__scale')).toBeNull();
    rerender(<RangeBar value={null} low={1} high={2} />);
    expect(container.querySelector('.ui-range__marker')).toBeNull();
    expect(container.firstChild).toHaveAttribute('data-status', 'no_data');
  });
});

describe('<Sparkline>', () => {
  it.each([[[]], [[5]], [[null, 3, null]], [undefined]])('shows "—" for fewer than 2 points: %j', values => {
    const { container } = render(<Sparkline values={values} />);
    expect(container.firstChild).toHaveClass('ui-spark--empty');
    expect(container.firstChild).toHaveTextContent('—');
  });

  it('draws a step line, the normal band and the last point', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 2]} low={1.5} high={2.5} width={100} height={20} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-points', '4');
    expect(svg.querySelector('.ui-spark__line').getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+( H[\d.]+ V[\d.]+){3}$/);
    expect(svg.querySelector('.ui-spark__band')).not.toBeNull();
    expect(svg.querySelector('.ui-spark__last')).not.toBeNull();
  });

  it('skips gaps and accepts { value } objects', () => {
    const { points } = sparkPoints([{ value: 1 }, null, 3], { width: 104, height: 24 });
    expect(points.map(p => p.v)).toEqual([1, 3]);
    expect(points[0].x).toBe(2);
    expect(points[1].x).toBe(102);
    expect(points[0].y).toBeGreaterThan(points[1].y);
  });

  it('can hide the last point marker', () => {
    const { container } = render(<Sparkline values={[1, 2]} showLast={false} />);
    expect(container.querySelector('.ui-spark__last')).toBeNull();
  });
});

describe('usePager / <Pager>', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: i, name: `Item ${i + 1}` }));

  it('pages through items and clamps at both ends', () => {
    const { result } = renderHook(() => usePager(items, 3));
    expect(result.current.pageCount).toBe(3);
    expect(result.current.pageItems.map(i => i.id)).toEqual([0, 1, 2]);
    act(() => result.current.prev());
    expect(result.current.page).toBe(0);
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.page).toBe(2);
    expect(result.current.pageItems.map(i => i.id)).toEqual([6]);
    expect(result.current.hasNext).toBe(false);
  });

  it('keeps the page valid when the list shrinks', () => {
    const { result, rerender } = renderHook(({ list }) => usePager(list, 3), { initialProps: { list: items } });
    act(() => result.current.setPage(2));
    rerender({ list: items.slice(0, 4) });
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems.map(i => i.id)).toEqual([3]);
  });

  it('renders ‹ n/m › buttons and supports the keyboard', () => {
    render(<Pager items={items} pageSize={3} label="Tasks" render={item => <span>{item.name}</span>} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Item 4')).toBeNull();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByText('Item 4')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(screen.getByText('Item 7')).toBeInTheDocument();
    expect(next).toBeDisabled();
    fireEvent.keyDown(prev, { key: 'PageUp' });
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('hides the controls for a single page and shows `empty` for no items', () => {
    const { rerender } = render(<Pager items={items.slice(0, 2)} pageSize={5} render={i => i.name} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<Pager items={[]} pageSize={5} render={i => i.name} empty={<p>Nothing</p>} />);
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });
});

describe('useFitCount', () => {
  it('counts the rows that fit in the measured height', () => {
    const { result } = renderHook(() => {
      const ref = useRef({ clientHeight: 250 });
      return useFitCount(ref, 40, { reserve: 40 });
    });
    expect(result.current).toBe(5);
  });

  it('falls back when the element has no height yet', () => {
    const { result } = renderHook(() => useFitCount(useRef({ clientHeight: 0 }), 40, { fallback: 3 }));
    expect(result.current).toBe(3);
  });
});

describe('<PixelFrame>, <IconButton>, <Badge>, <BigNumber>', () => {
  it('frame stays quiet when ok and takes the tone for caution/alert', () => {
    const { container, rerender } = render(<PixelFrame title="Kidneys" icon="kidneys" status="ok">body</PixelFrame>);
    expect(container.firstChild).toHaveClass('ui-frame--quiet');
    expect(screen.getByRole('heading', { name: 'Kidneys' })).toBeInTheDocument();
    expect(screen.queryByText('OK')).toBeNull();
    rerender(<PixelFrame title="Kidneys" status="alert" as="div">body</PixelFrame>);
    expect(container.firstChild.tagName).toBe('DIV');
    expect(container.firstChild).toHaveClass('ui-frame--alert');
    expect(screen.getByText('ALERT')).toBeInTheDocument();
  });

  it('icon button is a labelled, pressable tile', () => {
    let clicks = 0;
    render(<IconButton icon="water_cup" label="Log water" active={false} onClick={() => { clicks += 1; }} />);
    const button = screen.getByRole('button', { name: 'Log water' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('svg[data-icon="water_cup"]')).not.toBeNull();
    fireEvent.click(button);
    expect(clicks).toBe(1);
  });

  it('badge carries data-badge and a translated word', () => {
    const { container } = render(<Badge kind="synthetic" />);
    expect(container.firstChild).toHaveAttribute('data-badge', 'synthetic');
    expect(container.firstChild).toHaveTextContent('SYNTHETIC');
    render(<I18nProvider initialLang="pl"><Badge kind="simulated" /></I18nProvider>);
    expect(screen.getByText('SYMULACJA')).toBeInTheDocument();
  });

  it('big number shows value, unit and a dash for missing data', () => {
    const { rerender } = render(<BigNumber value={62} unit="bpm" label="HR" icon="hr" status="caution" />);
    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByText('bpm')).toBeInTheDocument();
    rerender(<BigNumber value={null} unit="bpm" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('bpm')).toBeNull();
    rerender(<BigNumber value={1.7349} digits={2} />);
    expect(screen.getByText('1.73')).toBeInTheDocument();
  });
});

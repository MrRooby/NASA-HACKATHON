import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/index.js';
import {
  Avatar, Badge, Button, ConnectionBadge, DataRow, Panel, SegBar, SolControl, StatusTag,
  filledSegments, statusText,
} from './index.js';

describe('StatusTag', () => {
  it.each([
    ['ok', '[ OK ]'],
    ['caution', '[ CAUT ]'],
    ['alert', '[ ALRT ]'],
    ['no_data', '[ ---- ]'],
    [undefined, '[ ---- ]'],
    ['weird', '[ ---- ]'],
  ])('status %s -> %s', (status, text) => {
    render(<StatusTag status={status} />);
    const tag = screen.getByText(text);
    expect(tag).toHaveClass('stag', `stag-${['ok', 'caution', 'alert'].includes(status) ? status : 'no_data'}`);
    expect(statusText(status)).toBe(text);
  });

  it('carries the full word as a tooltip, translated', () => {
    render(<I18nProvider initialLang="pl"><StatusTag status="caution" /></I18nProvider>);
    expect(screen.getByText('[ CAUT ]')).toHaveAttribute('title', 'Uwaga');
  });
});

describe('SegBar', () => {
  it('draws the requested number of segments and lights value / max of them', () => {
    const { container } = render(<SegBar value={50} max={100} status="ok" label="O2 reserve" />);
    const bar = screen.getByRole('meter', { name: 'O2 reserve' });
    expect(container.querySelectorAll('.seg')).toHaveLength(20);
    expect(container.querySelectorAll('.seg-on')).toHaveLength(10);
    expect(bar).toHaveClass('segbar-ok');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('supports a custom segment count, clamps, and shows nothing lit without a value', () => {
    const { container, rerender } = render(<SegBar value={3} max={4} segments={8} />);
    expect(container.querySelectorAll('.seg')).toHaveLength(8);
    expect(container.querySelectorAll('.seg-on')).toHaveLength(6);
    rerender(<SegBar value={999} max={4} segments={8} />);
    expect(container.querySelectorAll('.seg-on')).toHaveLength(8);
    rerender(<SegBar value={-5} max={4} segments={8} />);
    expect(container.querySelectorAll('.seg-on')).toHaveLength(0);
    rerender(<SegBar value={null} max={4} segments={8} status="no_data" />);
    expect(container.querySelectorAll('.seg-on')).toHaveLength(0);
    expect(screen.getByRole('meter')).not.toHaveAttribute('aria-valuenow');
  });

  it('filledSegments rounds to whole blocks', () => {
    expect(filledSegments(600, 600)).toBe(20);
    expect(filledSegments(142, 600)).toBe(5);
    expect(filledSegments(1, 600)).toBe(0);
    expect(filledSegments('abc', 600)).toBe(0);
    expect(filledSegments(5, 0)).toBe(0);
  });
});

describe('SolControl', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the latest sol while value is null and emits a debounced number when typing', () => {
    const onChange = vi.fn();
    render(<SolControl value={null} latest={600} onChange={onChange} />);
    const number = screen.getByRole('spinbutton', { name: 'Sol' });
    expect(number).toHaveValue(600);
    expect(screen.getByRole('button', { name: 'Latest' })).toBeDisabled();

    fireEvent.change(number, { target: { value: '14' } });
    fireEvent.change(number, { target: { value: '142' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(142);
  });

  it('emits from the slider, clamps to max and ignores empty / invalid drafts', () => {
    const onChange = vi.fn();
    render(<SolControl value={142} max={600} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Sol slider' });
    expect(slider).toHaveValue('142');
    fireEvent.change(slider, { target: { value: '380' } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenLastCalledWith(380);

    const number = screen.getByRole('spinbutton', { name: 'Sol' });
    fireEvent.change(number, { target: { value: '9999' } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenLastCalledWith(600);

    onChange.mockClear();
    fireEvent.change(number, { target: { value: '' } });
    fireEvent.change(number, { target: { value: '0' } });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('[ LATEST ] emits null at once and follows the outside value', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SolControl value={142} latest={600} onChange={onChange} label="Mission sol" />);
    expect(screen.getByRole('group', { name: 'Mission sol' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(onChange).toHaveBeenCalledWith(null);
    rerender(<SolControl value={null} latest={600} onChange={onChange} label="Mission sol" />);
    expect(screen.getByRole('spinbutton', { name: 'Mission sol' })).toHaveValue(600);
    rerender(<SolControl value={380} latest={600} onChange={onChange} label="Mission sol" />);
    expect(screen.getByRole('spinbutton', { name: 'Mission sol' })).toHaveValue(380);
  });
});

describe('Panel', () => {
  it('renders the title as a heading, the meta and the tone', () => {
    const { container } = render(<Panel title="Wearable data" meta="sol 142" tone="caution"><p>body</p></Panel>);
    expect(screen.getByRole('heading', { level: 2, name: 'Wearable data' })).toBeInTheDocument();
    expect(screen.getByText('sol 142')).toHaveClass('panel-meta');
    expect(container.firstChild).toHaveClass('panel', 'panel-tone-caution');
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('defaults the tone and omits the header without title and meta', () => {
    const { container } = render(<Panel tone="purple">x</Panel>);
    expect(container.firstChild).toHaveClass('panel-tone-default');
    expect(container.querySelector('.panel-head')).toBeNull();
  });
});

describe('Button', () => {
  it('is a plain button with variant / active classes and passes props through', () => {
    const onClick = vi.fn();
    render(<Button variant="danger" active aria-current="page" onClick={onClick}>Purge</Button>);
    const button = screen.getByRole('button', { name: 'Purge' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('btn', 'btn-danger', 'is-active');
    expect(button).toHaveAttribute('aria-current', 'page');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(['default', 'primary', 'danger', 'ghost'])('variant %s', variant => {
    render(<Button variant={variant}>x</Button>);
    expect(screen.getByRole('button')).toHaveClass(`btn-${variant}`);
  });
});

describe('DataRow', () => {
  it('shows label, value, unit, status tag and note', () => {
    const { container } = render(<DataRow label="Heart rate" value={68} unit="bpm" status="ok" note="resting" />);
    expect(screen.getByText('Heart rate')).toHaveClass('datarow-label');
    expect(container.querySelector('.datarow-value')).toHaveTextContent('68 bpm');
    expect(screen.getByText('[ OK ]')).toBeInTheDocument();
    expect(screen.getByText('resting')).toHaveClass('datarow-note');
    expect(container.querySelector('.datarow-leader')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a dash for a missing value and no tag without a status', () => {
    const { container } = render(<DataRow label="Glucose" value={null} unit="mg/dL" />);
    expect(container.querySelector('.datarow-value')).toHaveTextContent('—');
    expect(container.querySelector('.datarow-value')).not.toHaveTextContent('mg/dL');
    expect(container.querySelector('.stag')).toBeNull();
    expect(container.querySelector('.datarow-note')).toBeNull();
  });

  it('keeps a zero value', () => {
    const { container } = render(<DataRow label="Alarms" value={0} />);
    expect(container.querySelector('.datarow-value')).toHaveTextContent('0');
  });
});

describe('Badge', () => {
  it.each([
    ['synthetic', 'SYNTHETIC'], ['simulated', 'SIMULATED'], ['fictional', 'FICTIONAL'], ['todo', 'TODO'],
  ])('kind %s -> %s', (kind, text) => {
    render(<Badge kind={kind} />);
    expect(screen.getByText(text)).toHaveClass('badge');
  });

  it('accepts a custom label and tone', () => {
    render(<Badge tone="alert">EVA</Badge>);
    expect(screen.getByText('EVA')).toHaveClass('badge-alert');
  });
});

describe('ConnectionBadge', () => {
  it.each([
    ['online', 'LIVE · MOTHER', 'conn-online'],
    ['connecting', 'CONNECTING…', 'conn-connecting'],
    ['offline', 'OFFLINE · DEMO', 'conn-offline'],
  ])('mode %s', (mode, text, className) => {
    render(<ConnectionBadge mode={mode} />);
    expect(screen.getByText(text)).toHaveClass('conn', className);
  });

  it('puts the error and its hint in the tooltip', () => {
    render(<ConnectionBadge mode="offline" error={{ message: 'database unreachable', hint: 'check the VPN' }} />);
    expect(screen.getByText('OFFLINE · DEMO')).toHaveAttribute('title', 'database unreachable · check the VPN');
  });
});

describe('Avatar', () => {
  it('draws a different pixel silhouette per crew code, in currentColor', () => {
    const shapes = ['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4'].map(code => {
      const { container, unmount } = render(<Avatar code={code} size={32} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('fill', 'currentColor');
      expect(svg).toHaveAttribute('width', '32');
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(10);
      const shape = svg.innerHTML;
      unmount();
      return shape;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('accepts short codes and falls back to a plain silhouette', () => {
    const { container, rerender } = render(<Avatar code="C3" title="Roman Czarny" />);
    expect(screen.getByRole('img', { name: 'Roman Czarny' })).toHaveAttribute('data-code', 'C3');
    const c3 = container.querySelector('svg').innerHTML;
    rerender(<Avatar code="SYN-01" />);
    expect(container.querySelector('svg').innerHTML).not.toBe(c3);
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(10);
  });
});

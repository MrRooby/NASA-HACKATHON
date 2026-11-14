import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import habitat142 from '../test/fixtures/habitat_sol142.json';
import { I18nProvider } from '../i18n/index.js';
import { buildNotifications } from './buildNotifications.js';
import NotificationList from './NotificationList.jsx';

const items = buildNotifications({ report: habC4Sol142, habitat: habitat142 });

describe('NotificationList', () => {
  it('shows the empty state for no items', () => {
    const { rerender } = render(<NotificationList items={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('NO ACTIVE NOTIFICATIONS');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    rerender(<NotificationList items={null} emptyText="ALL CLEAR" />);
    expect(screen.getByRole('status')).toHaveTextContent('ALL CLEAR');
  });

  it('renders every notification in order with severity tag, source, title, detail and action', () => {
    render(<NotificationList items={items} onOpen={() => {}} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(items.length);
    expect(rows.map(row => row.dataset.id)).toEqual(items.map(item => item.id));

    const first = within(rows[0]);
    expect(rows[0]).toHaveAttribute('data-severity', 'alert');
    expect(first.getByText('[ ALRT ]')).toBeInTheDocument();
    expect(first.getByText('Health')).toBeInTheDocument();
    expect(first.getByText('Limbs (circulation)')).toBeInTheDocument();
    expect(first.getByText(/^Left leg: blood flow \(perfusion\) 25%/)).toBeInTheDocument();
    expect(rows[0].querySelector('.notif-action')).toHaveTextContent(/^> Inspect the limb/);

    const kidneys = within(rows.find(row => row.dataset.id === 'organ:kidneys'));
    expect(kidneys.getByText('[ CAUT ]')).toBeInTheDocument();

    const m1 = rows.find(row => row.dataset.id === 'habitat:module_M1');
    expect(within(m1).getByText('Habitat')).toBeInTheDocument();
    expect(m1.querySelector('.notif-action')).toBeNull(); // the habitat API sends no action
    expect(within(rows.find(row => row.dataset.id === 'event:evt-000483')).getByText('Scrubber fault')).toBeInTheDocument();
  });

  it('[ OPEN ] calls onOpen with the target of that notification', () => {
    const onOpen = vi.fn();
    render(<NotificationList items={items} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open: Limbs (circulation)' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toEqual({ screen: 'person', code: 'HAB-C4', organ: 'limbs', limb: 'left_leg' });
    expect(onOpen.mock.calls[0][1]).toBe(items[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Open: Habitation module M1 (C1, C2)' }));
    expect(onOpen.mock.calls[1][0]).toMatchObject({ screen: 'base', zone: 'module_M1' });
  });

  it('has no open button without onOpen or without a target', () => {
    const { rerender } = render(<NotificationList items={items} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<NotificationList items={[{ id: 'x', severity: 'info', source: 'event', title: 'Note', detail: null, action: null, target: null }]} onOpen={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('[ INFO ]')).toBeInTheDocument();
  });

  it('translates its own labels (backend texts stay English)', () => {
    render(<I18nProvider initialLang="pl"><NotificationList items={items} onOpen={() => {}} /></I18nProvider>);
    expect(screen.getAllByText('Zdrowie').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Otwórz: Limbs (circulation)' })).toBeInTheDocument();
    expect(screen.getByText(/^Left leg: blood flow/)).toBeInTheDocument();
  });
});

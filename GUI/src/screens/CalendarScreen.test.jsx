import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/renderApp.jsx';
import CalendarScreen from './CalendarScreen.jsx';
import { isoDate } from './calendar.js';

describe('CalendarScreen', () => {
  it('renders all seven days and switches between week and month', () => {
    renderWithProviders(<CalendarScreen />);
    expect(screen.getByRole('grid', { name: 'Weekly plan' }).querySelectorAll('[role="gridcell"]')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('grid', { name: 'Monthly plan' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Select/ }).length).toBeGreaterThanOrEqual(28);
  });

  it('navigates periods with icon buttons and changes the header', () => {
    renderWithProviders(<CalendarScreen />);
    const heading = screen.getByRole('heading', { level: 1 });
    const before = heading.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(heading.textContent).not.toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(heading.textContent).toBe(before);
  });

  it('opens the period status in a popup with both averages', () => {
    renderWithProviders(<CalendarScreen />);
    expect(screen.queryByText('Crew wellbeing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    const dialog = screen.getByRole('dialog', { name: 'Week status' });
    expect(within(dialog).getByText('Base status')).toBeInTheDocument();
    expect(within(dialog).getByText('Crew wellbeing')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.getByRole('dialog', { name: 'Month status' })).toBeInTheDocument();
  });

  it('opens day details when a day is tapped in either view', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /Select/ })[0]);
    expect(screen.getByRole('dialog')).toHaveTextContent('2026');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Select/ })[10]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows at most three events per day and a +N count for the rest', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    const crowdedDay = screen.getByRole('button', { name: 'Select 2026-11-19' });
    expect(crowdedDay.querySelectorAll('.cal-event')).toHaveLength(3);
    expect(crowdedDay).toHaveTextContent('+14 more');
    expect(crowdedDay).not.toHaveTextContent('Operational task 17');
  });

  it('shows a normal day on one page and pages only a very long day', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select 2026-11-19' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('.cal-dlg-event')).toHaveLength(12);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next page' }));
    expect(dialog.querySelectorAll('.cal-dlg-event')).toHaveLength(dialog.querySelectorAll('.cal-dlg-event').length);
    expect(dialog).toHaveTextContent('Operational task 13');
    expect(dialog).not.toHaveTextContent('Operational task 12');
  });

  it('opens every crew member from the wellbeing check of today and goes back', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: `Select ${isoDate(new Date())}` }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Crew wellbeing check/ }));
    const list = within(dialog).getByRole('list', { name: 'Crew members' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(10);
    expect(list).toHaveTextContent('Aleksander Polkowski');
    expect(list).not.toHaveTextContent('HAB-C');
    // one status tag per person, no repeated status words
    for (const row of rows) expect(row.querySelectorAll('.stag')).toHaveLength(1);
    expect(list.querySelectorAll('.stag-alert')).toHaveLength(1);
    expect(list.querySelectorAll('.stag-caution')).toHaveLength(2);
    expect(dialog).toHaveTextContent('3 of 10 need attention');
    expect(dialog).toHaveTextContent('Flight surgeon notified');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(within(dialog).queryByRole('list', { name: 'Crew members' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Events' })).toBeInTheDocument();
  });

  it('shows the crew wellbeing view in Polish', () => {
    renderWithProviders(<CalendarScreen />, { lang: 'pl' });
    fireEvent.click(screen.getByRole('button', { name: `Wybierz ${isoDate(new Date())}` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Badanie dobrostanu/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(10);
    expect(dialog).toHaveTextContent('Nastrój');
    expect(within(dialog).getByRole('button', { name: 'Wstecz' })).toBeInTheDocument();
  });
});

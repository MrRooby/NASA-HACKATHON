import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/renderApp.jsx';
import CalendarScreen from './CalendarScreen.jsx';

describe('CalendarScreen', () => {
  it('renders all seven days and switches between week and month', () => {
    renderWithProviders(<CalendarScreen />);
    expect(screen.getByRole('grid', { name: 'Weekly plan' }).querySelectorAll('[role="gridcell"]')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('grid', { name: 'Monthly plan' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Select/ }).length).toBeGreaterThanOrEqual(28);
  });

  it('navigates periods with large labelled buttons and changes the header', () => {
    renderWithProviders(<CalendarScreen />);
    const heading = screen.getByRole('heading', { level: 1 });
    const before = heading.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(heading.textContent).not.toBe(before);
    expect(screen.getByRole('button', { name: 'Previous period' })).toHaveClass('calendar-nav-button');
  });

  it('selects a day in month view and keeps a weekly summary visible', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Select/ })[10]);
    expect(screen.getByRole('heading', { name: 'Monthly status' })).toBeInTheDocument();
    expect(screen.getAllByText('Base status average').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Crew wellbeing average').length).toBeGreaterThanOrEqual(1);
  });

  it('opens day details when a day tile is clicked in either view', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /Select/ })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('h2')).toHaveTextContent('2026');
    fireEvent.click(screen.getByRole('button', { name: 'Close day details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Select/ })[10]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a bounded event list with large scroll controls', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    const day = screen.getByRole('button', { name: 'Select 2026-11-25' });
    fireEvent.click(day);
    expect(screen.getByRole('button', { name: 'Show previous events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show next events' })).toBeInTheDocument();
  });

  it('reports hidden events by count instead of rendering all event names', () => {
    renderWithProviders(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    const crowdedDay = screen.getByRole('button', { name: 'Select 2026-11-19' });
    expect(crowdedDay).toHaveTextContent('+17 events');
    expect(crowdedDay).not.toHaveTextContent('Zadanie operacyjne 1');
    expect(crowdedDay).not.toHaveTextContent('Zadanie operacyjne 17');
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HabitatMap, { mapStatus } from './HabitatMap.jsx';
import { ROOMS } from './layout.js';
import { deriveHabitat } from './model.js';
import { I18nProvider } from '../i18n/index.js';
import { habitatFixtures } from './testHelpers.js';

const rooms142 = deriveHabitat(habitatFixtures[142]).rooms;
const roomEl = id => document.querySelector(`.hmap-room[data-room="${id}"]`);

describe('HabitatMap', () => {
  it('draws the plan as one SVG with every room as a focusable button', () => {
    render(<HabitatMap rooms={rooms142} selectedId={null} onSelect={() => {}} />);
    const svg = screen.getByRole('group', { name: 'Habitat map: select a room' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 2048 599');

    const buttons = within(svg).getAllByRole('button');
    expect(buttons).toHaveLength(ROOMS.length);
    expect(buttons.map(button => button.getAttribute('data-room'))).toEqual(ROOMS.map(room => room.id));
    for (const button of buttons) {
      expect(button).toHaveAttribute('tabindex', '0');
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button.getAttribute('aria-label')).toBeTruthy();
      expect(button.querySelector('path.hmap-room-fill')).toHaveAttribute('d');
    }
    // walls (hatched), corridor lines and both dashed tube ends are there
    expect(svg.querySelectorAll('path.hmap-wall')).toHaveLength(2);
    expect(svg.querySelector('path.hmap-wall').getAttribute('fill')).toMatch(/^url\(#hmap-hatch-/);
    expect(svg.querySelectorAll('path.hmap-corridor')).toHaveLength(2);
    expect(svg.querySelectorAll('path.hmap-dashed')).toHaveLength(2);
    expect(svg.querySelectorAll('path.hmap-bracket')).toHaveLength(4);
  });

  it('labels the rooms in English by default', () => {
    render(<HabitatMap rooms={rooms142} />);
    for (const name of ['AIRLOCK 1', 'AIRLOCK 2', 'SERVICE / STORAGE', 'MEDBAY', 'RECREATION ZONE', 'LAB',
      'CREW QUARTERS N', 'CREW QUARTERS S', 'REACTOR']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // the technical zone is written on two lines, like on the reference plan
    expect(screen.getByText('TECHNICAL')).toBeInTheDocument();
    expect(screen.getByText('ZONE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^TECHNICAL ZONE/ })).toBeInTheDocument();
  });

  it('labels the rooms in Polish as on the reference plan', () => {
    render(<I18nProvider initialLang="pl"><HabitatMap rooms={rooms142} /></I18nProvider>);
    for (const name of ['ŚLUZA 1', 'ŚLUZA 2', 'SERWIS / MAGAZYN', 'SZPITAL', 'STREFA REKREACYJNA', 'LAB', 'REAKTOR']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText('STREFA MIESZKALNA')).toHaveLength(2);
    expect(screen.getByText('TECHNICZNA')).toBeInTheDocument();
    // the two quarters stay distinguishable for assistive tech
    expect(screen.getByRole('button', { name: /^STREFA MIESZKALNA N/ })).toBe(roomEl('quarters_north'));
    expect(screen.getByRole('button', { name: /^STREFA MIESZKALNA S/ })).toBe(roomEl('quarters_south'));
  });

  it('takes status classes from the data', () => {
    render(<HabitatMap rooms={rooms142} />);
    expect(roomEl('quarters_north')).toHaveClass('is-alert');
    expect(roomEl('quarters_north')).toHaveAttribute('data-status', 'alert');
    expect(roomEl('quarters_south')).toHaveClass('is-ok');
    expect(roomEl('recreation')).toHaveClass('is-ok'); // farm alert stays on its marker
    expect(roomEl('quarters_north').getAttribute('aria-label')).toMatch(/Alert/);
    expect(document.querySelectorAll('.hmap-room.is-alert')).toHaveLength(1);
  });

  it('accepts rooms as an object and draws unknown / missing rooms as no_data', () => {
    render(<HabitatMap rooms={{ lab: { status: 'caution' }, medbay: { status: 'weird' } }} />);
    expect(roomEl('lab')).toHaveClass('is-caution');
    expect(roomEl('medbay')).toHaveClass('is-no_data');
    expect(roomEl('airlock_1')).toHaveClass('is-no_data');
    expect(mapStatus('unrated')).toBe('no_data');
    expect(mapStatus('alert')).toBe('alert');
  });

  it('marks simulated rooms', () => {
    render(<HabitatMap rooms={rooms142} />);
    for (const id of ['service', 'technical', 'reactor']) {
      expect(roomEl(id)).toHaveClass('is-simulated');
      expect(within(roomEl(id)).queryByText('SIMULATED')).not.toBeInTheDocument(); // badges and callsigns removed
      expect(roomEl(id).getAttribute('aria-label')).toMatch(/SIMULATED/);
    }
    expect(roomEl('lab')).not.toHaveClass('is-simulated');
    expect(screen.queryAllByText('SIMULATED')).toHaveLength(0); // no SIMULATED labels on the map
  });

  it('shows crew markers in the rooms where the crew is', () => {
    render(<HabitatMap rooms={rooms142} />);
    const codes = id => [...roomEl(id).querySelectorAll('.hmap-crew')].map(marker => marker.getAttribute('data-crew'));
    expect(codes('quarters_north')).toEqual(['C1', 'C2']);
    expect(codes('quarters_south')).toEqual(['C3', 'C4']);
    expect(codes('lab')).toEqual([]);
    // a dot, not a code label; its accessible name is the person's full name
    expect(roomEl('quarters_north').querySelector('.hmap-crew[data-crew="C1"] circle.hmap-crew-dot')).not.toBeNull();
    expect(screen.queryByText('C1')).toBeNull();
    expect(roomEl('quarters_north').getAttribute('aria-label')).toMatch(/crew: C1, C2/);
    expect(document.querySelectorAll('.hmap-crew')).toHaveLength(4);
  });

  it('opens the crew member on a tap on a dot and shows name and photo on hover', () => {
    const onSelect = vi.fn();
    const onCrewOpen = vi.fn();
    render(<HabitatMap rooms={rooms142} onSelect={onSelect} onCrewOpen={onCrewOpen} />);
    const dot = roomEl('quarters_north').querySelector('.hmap-crew[data-crew="C1"]');
    expect(dot).toHaveAttribute('role', 'button');
    expect(dot).toHaveAttribute('aria-label', 'Aleksander Polkowski');
    fireEvent.pointerEnter(dot);
    const card = document.querySelector('.hmap-card[data-card="C1"]');
    expect(card).not.toBeNull();
    expect(card.querySelector('image')).not.toBeNull();
    expect(within(card).getByText('Aleksander')).toBeInTheDocument();
    fireEvent.pointerLeave(dot);
    expect(document.querySelector('.hmap-card')).toBeNull();
    fireEvent.click(dot);
    expect(onCrewOpen).toHaveBeenCalledWith('HAB-C1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks a sub-zone that is not ok, and only that one', () => {
    render(<HabitatMap rooms={rooms142} />);
    const marks = [...roomEl('recreation').querySelectorAll('.hmap-mark')];
    expect(marks.map(mark => [mark.getAttribute('data-subzone'), mark.getAttribute('data-status')])).toEqual([['farm', 'alert']]);
    expect(marks[0]).toHaveClass('is-alert');
    expect(within(marks[0]).getByText('FARM')).toBeInTheDocument();
  });

  it('selects a room on click', () => {
    const onSelect = vi.fn();
    render(<HabitatMap rooms={rooms142} selectedId="lab" onSelect={onSelect} />);
    expect(roomEl('lab')).toHaveClass('is-selected');
    expect(roomEl('lab')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.hmap-room.is-selected')).toHaveLength(1);

    fireEvent.click(roomEl('reactor'));
    expect(onSelect).toHaveBeenLastCalledWith('reactor');
    // clicking a label or marker inside the room counts too
    fireEvent.click(roomEl('quarters_north').querySelector('.hmap-crew[data-crew="C1"]'));
    expect(onSelect).toHaveBeenLastCalledWith('quarters_north');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('selects a room with Enter or Space, and ignores other keys', () => {
    const onSelect = vi.fn();
    render(<HabitatMap rooms={rooms142} onSelect={onSelect} />);
    const medbay = screen.getByRole('button', { name: /^MEDBAY/ });
    medbay.focus();
    expect(document.activeElement).toBe(medbay);

    fireEvent.keyDown(medbay, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('medbay');
    fireEvent.keyDown(roomEl('airlock_2'), { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith('airlock_2');
    fireEvent.keyDown(medbay, { key: 'a' });
    fireEvent.keyDown(medbay, { key: 'Tab' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('keeps ids unique when two maps are on one page', () => {
    render(<><HabitatMap rooms={rooms142} /><HabitatMap rooms={rooms142} /></>);
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

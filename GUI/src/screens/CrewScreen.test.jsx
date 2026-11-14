import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CrewScreen, { segmentStatusFromOrgans } from './CrewScreen.jsx';
import { makeMother, renderWithProviders } from '../test/renderApp.jsx';
import { stubHabitat } from '../habitat/testHelpers.js';
import { jsonResponse, fixtures } from '../test/mother.js';

vi.mock('../body/BodyModel.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockBodyModel }));

const tile = code => document.querySelector(`.crew-tile[data-code="${code}"]`);
const renderCrew = (mother = makeMother(), navigate = vi.fn()) => {
  renderWithProviders(<CrewScreen mother={mother} route={{ screen: 'crew' }} navigate={navigate} />);
  return navigate;
};

describe('CREW start screen', () => {
  it('shows the four habitat crew members, each as one big button', async () => {
    stubHabitat();
    const navigate = renderCrew();
    const tiles = document.querySelectorAll('.crew-tile');
    expect([...tiles].map(item => item.getAttribute('data-code'))).toEqual(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4']);
    expect(screen.getAllByTestId('body-model')).toHaveLength(4);
    for (const model of screen.getAllByTestId('body-model')) {
      expect(model).toHaveAttribute('data-auto-rotate', 'true');
      expect(model).toHaveAttribute('data-interactive', 'false');
    }
    fireEvent.click(within(tile('HAB-C2')).getByRole('button', { name: 'Open Bogusław Grzegrzułkiewicz' }));
    expect(navigate).toHaveBeenCalledWith({ screen: 'person', code: 'HAB-C2' });
    await waitFor(() => expect(within(tile('HAB-C1')).getByTestId('crew-location')).toHaveTextContent(/Module M1/i));
  });

  it('an organ icon opens the person at that organ (and not the tile)', () => {
    stubHabitat();
    const navigate = renderCrew();
    const organs = within(tile('HAB-C4')).getAllByRole('button', { name: /Open for/ });
    expect(organs).toHaveLength(10);
    fireEvent.click(tile('HAB-C4').querySelector('[data-organ="limbs"]'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ screen: 'person', code: 'HAB-C4', organ: 'limbs' });
  });

  it('live: per-person reports give organ colours, vitals and the status', async () => {
    stubHabitat(url => (url.includes('/api/organs/HAB-C4') ? jsonResponse(fixtures.habC4Sol142) : undefined));
    renderCrew();
    await waitFor(() => expect(tile('HAB-C4')).toHaveAttribute('data-status', 'alert'));
    expect(tile('HAB-C4').querySelector('[data-organ="limbs"]')).toHaveAttribute('data-status', 'alert');
    expect(tile('HAB-C4').querySelector('[data-organ="kidneys"]')).toHaveAttribute('data-status', 'caution');
    expect(within(tile('HAB-C4')).getByLabelText('Heart rate 62 bpm')).toBeInTheDocument();
    expect(within(tile('HAB-C4')).getByLabelText('Blood oxygen 97.2 %')).toBeInTheDocument();
    const status = JSON.parse(within(tile('HAB-C4')).getByTestId('body-model').getAttribute('data-segment-status'));
    expect(status.left_thigh).toBe('alert');
    expect(status.right_thigh).not.toBe('alert');
    // Caution / alert tiles show the top message in one line.
    expect(tile('HAB-C4').querySelector('.crew-msg')).toHaveTextContent(fixtures.habC4Sol142.top_message);
    expect(within(tile('HAB-C4')).getByText('SYNTHETIC')).toBeInTheDocument();
  });

  it('offline: the built-in demo records with a DEMO badge on every tile', async () => {
    renderCrew(makeMother({ mode: 'offline', online: false, overview: null, report: null }));
    await waitFor(() => expect(screen.getAllByText('DEMO')).toHaveLength(4));
    expect(tile('HAB-C4')).toHaveAttribute('data-status', 'alert');
  });

  it('maps the ten organ statuses onto body segments (worst wins)', () => {
    const segments = segmentStatusFromOrgans({ brain: 'ok', eyes: 'caution', limbs: 'alert', heart: 'ok' });
    expect(segments.head).toBe('caution');
    expect(segments.left_hand).toBe('alert');
    expect(segments.chest).toBe('ok');
  });
});

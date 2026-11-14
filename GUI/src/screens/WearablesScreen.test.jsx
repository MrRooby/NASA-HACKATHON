import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import habC1 from '../test/fixtures/organs_HAB-C1.json';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import { clone, makeMother, renderScreen, screenProps } from '../home/testUtils.jsx';
import { peekPendingFocus, setPendingFocus } from '../home/focus.js';
import { getProfile } from '../data/crewProfiles.js';
import WearablesScreen, { organsForRegion, regionForSegment, regionForTarget } from './WearablesScreen.jsx';

vi.mock('../AstronautViewer.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockAstronautViewer }));

beforeEach(() => setPendingFocus(null));
afterEach(() => vi.useRealTimers());

const notice = () => document.querySelector('.tele-notice');
const organCards = () => [...document.querySelectorAll('.organ-card')];
const organCard = organ => document.querySelector(`.organ-card[data-organ="${organ}"]`);
const headTag = organ => organCard(organ).querySelector('.organ-head .stag');
const shownOrgans = () => organCards().map(card => card.dataset.organ);
const chip = name => within(screen.getByRole('group', { name: 'Body regions' })).getByRole('button', { name });

function renderWearables({ mother = makeMother({ report: habC4Sol142, period: { sol: 142 } }), ...rest } = {}, options) {
  return renderScreen(WearablesScreen, screenProps({ mother, ...rest }), options);
}

describe('WearablesScreen: header', () => {
  it('shows person, mission, sol, zone, the SYNTHETIC badge and the overall status', () => {
    renderWearables();
    const header = screen.getByRole('heading', { name: 'Body scan' }).closest('section');
    expect(header).toHaveAttribute('data-tone', 'alert');
    expect(within(header).getByText('Grażyna Brzęczyszczykiewicz')).toBeInTheDocument();
    expect(within(header).getByText(/«ZNACHOR»/)).toBeInTheDocument();
    expect(within(header).getByText('Mars lava-tube habitat')).toBeInTheDocument();
    expect(screen.getByTestId('wear-sol')).toHaveTextContent('142');
    expect(within(header).getByText('module M2')).toBeInTheDocument();
    expect(within(header).getByText('SYNTHETIC')).toBeInTheDocument();
    const status = header.querySelector('.wear-status');
    expect(within(status).getByText('[ ALRT ]')).toBeInTheDocument();
    expect(within(status).getByText(habC4Sol142.top_message)).toBeInTheDocument();
    expect(notice()).toBeNull();
  });

  it('has no read-only banner for your own data and one when viewing someone else', () => {
    const { rerenderWith, props } = renderWearables();
    expect(screen.queryByTestId('read-only-banner')).not.toBeInTheDocument();
    rerenderWith({ ...props, session: 'HAB-C1', viewedCode: 'HAB-C4', profile: getProfile('HAB-C4') });
    expect(screen.getByTestId('read-only-banner')).toHaveTextContent('VIEWING GRAŻYNA BRZĘCZYSZCZYKIEWICZ — READ ONLY');
  });

  it('[ BACK ] returns to the home screen', () => {
    const { props } = renderWearables();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.navigate).toHaveBeenCalledWith('home');
  });
});

describe('WearablesScreen: sol control', () => {
  it('is bound to mother.period and calls mother.setPeriod on a change', () => {
    vi.useFakeTimers();
    const { props } = renderWearables();
    const input = screen.getByRole('spinbutton', { name: 'Sol' });
    expect(input).toHaveValue(142);
    expect(screen.getByRole('slider', { name: 'Sol slider' })).toHaveAttribute('max', '600');

    fireEvent.change(input, { target: { value: '150' } });
    expect(props.mother.setPeriod).not.toHaveBeenCalled(); // debounced
    act(() => { vi.advanceTimersByTime(600); });
    expect(props.mother.setPeriod).toHaveBeenCalledTimes(1);
    expect(props.mother.setPeriod).toHaveBeenCalledWith({ sol: 150 });

    fireEvent.change(screen.getByRole('slider', { name: 'Sol slider' }), { target: { value: '380' } });
    act(() => { vi.advanceTimersByTime(600); });
    expect(props.mother.setPeriod).toHaveBeenLastCalledWith({ sol: 380 });

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(props.mother.setPeriod).toHaveBeenLastCalledWith(null);
  });

  it('on the latest sol shows the sol of the report and disables [ LATEST ]', () => {
    renderWearables({ mother: makeMother({ report: habC1 }), session: 'HAB-C1' });
    expect(screen.getByRole('spinbutton', { name: 'Sol' })).toHaveValue(600);
    expect(screen.getByRole('button', { name: 'Latest' })).toBeDisabled();
  });

  it('shows that a new report is being loaded', () => {
    renderWearables({ mother: makeMother({ report: habC4Sol142, period: { sol: 142 }, loadingReport: true }) });
    expect(screen.getByText('UPDATING…')).toBeInTheDocument();
  });
});

describe('WearablesScreen: organ cards', () => {
  it('renders the ten organ cards in the order of the report', () => {
    renderWearables();
    expect(shownOrgans()).toEqual(['brain', 'eyes', 'heart', 'lungs', 'blood', 'kidneys', 'gut', 'musculoskeletal', 'limbs', 'exposure']);
    expect(screen.getByTestId('organ-count')).toHaveTextContent('10 systems · schema 1.1');
    expect(organCard('limbs')).toHaveAttribute('data-status', 'alert');
    expect(headTag('limbs')).toHaveTextContent('[ ALRT ]');
    expect(headTag('kidneys')).toHaveTextContent('[ CAUT ]');
    expect(headTag('eyes')).toHaveTextContent('[ ---- ]');
    expect(headTag('heart')).toHaveTextContent('[ OK ]');
    // A metric that is not ok carries its own tag.
    expect(within(organCard('limbs')).getByText('Circulation: left leg').closest('.datarow')).toHaveTextContent('25 % of other limbs[ ALRT ]');
  });

  it('shows label, headline, at most three metrics and the action only when not ok', () => {
    renderWearables();
    const kidneys = organCard('kidneys');
    expect(within(kidneys).getByRole('heading', { name: 'Kidneys & urine' })).toBeInTheDocument();
    expect(within(kidneys).getByText('Stone risk: urine volume 1.73 L/d (< 2.5).')).toBeInTheDocument();
    expect(kidneys.querySelectorAll('.datarow')).toHaveLength(3);
    expect(within(kidneys).getByText('Hydration').closest('.datarow')).toHaveTextContent('1.01 SG');
    expect(kidneys.querySelector('.organ-action')).toHaveTextContent(/^> Drink to ≥2\.5 L urine\/day/);

    const heart = organCard('heart');
    expect(within(heart).getByText('Mean arterial pressure').closest('.datarow')).toHaveTextContent('86.18 mmHg');
    expect(heart.querySelector('.organ-action')).toBeNull();
    expect(organCard('lungs').querySelectorAll('.datarow')).toHaveLength(1);
    expect(organCard('eyes').querySelectorAll('.datarow')).toHaveLength(0);
  });

  it('[ WHY? ] reveals and hides the rule behind a card', () => {
    renderWearables();
    const limbs = organCard('limbs');
    const why = habC4Sol142.organs.find(card => card.organ === 'limbs').why;
    expect(within(limbs).queryByText(why)).not.toBeInTheDocument();
    const toggle = within(limbs).getByRole('button', { name: 'Why?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(within(limbs).getByText(why)).toBeInTheDocument();
    expect(within(limbs).getByRole('button', { name: 'Hide why' })).toHaveAttribute('aria-expanded', 'true');
    // Only this card opened.
    expect(document.querySelectorAll('.organ-why')).toHaveLength(1);
    fireEvent.click(within(limbs).getByRole('button', { name: 'Hide why' }));
    expect(within(limbs).queryByText(why)).not.toBeInTheDocument();
  });
});

describe('WearablesScreen: body map', () => {
  it('shows the free-view astronaut tinted by segment status', () => {
    renderWearables();
    const viewer = screen.getByTestId('astronaut-viewer');
    expect(viewer).toHaveAttribute('data-front-view', 'false');
    const tint = JSON.parse(viewer.dataset.segmentStatus);
    expect(tint).toMatchObject({ left_thigh: 'alert', left_foot: 'alert', right_foot: 'ok', abdomen: 'caution', head: 'ok' });
  });

  it('a region chip filters the organ cards and shows that limb', () => {
    renderWearables();
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('L leg')).toHaveAttribute('data-status', 'alert');
    expect(chip('R leg')).toHaveAttribute('data-status', 'ok');

    fireEvent.click(chip('L leg'));
    expect(chip('L leg')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('All')).toHaveAttribute('aria-pressed', 'false');
    expect(shownOrgans()).toEqual(['musculoskeletal', 'limbs']);
    expect(screen.getByTestId('organ-count')).toHaveTextContent('2 of 10 · L leg');
    const limb = document.querySelector('.wear-limb');
    expect(limb).toHaveAttribute('data-limb', 'left_leg');
    expect(limb.querySelector('[data-field="circulation"]')).toHaveTextContent('25 %');
    const readout = document.querySelector('.wear-region');
    expect(readout).toHaveAttribute('data-region', 'left_leg');
    expect(readout.querySelector('.wear-region-head')).toHaveTextContent('L leg[ ALRT ]');
    expect(within(readout).getByText('Limbs (circulation)')).toBeInTheDocument();

    fireEvent.click(chip('Head'));
    expect(shownOrgans()).toEqual(['brain', 'eyes']);
    expect(document.querySelector('.wear-limb')).toBeNull();

    fireEvent.click(chip('Head')); // same chip again: back to all
    expect(shownOrgans()).toHaveLength(10);

    fireEvent.click(chip('Abdomen'));
    expect(shownOrgans()).toEqual(['kidneys', 'gut']);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(shownOrgans()).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
  });

  it('clicking a segment of the model pins its region; hovering only highlights', () => {
    renderWearables();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'model segment chest' }));
    expect(shownOrgans()).toHaveLength(10);
    expect(organCards().filter(card => card.classList.contains('is-highlight')).map(card => card.dataset.organ)).toEqual(['heart', 'lungs']);
    expect(document.querySelector('.wear-region')).toHaveAttribute('data-region', 'chest');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'model segment chest' }));
    expect(document.querySelectorAll('.organ-card.is-highlight')).toHaveLength(0);
    expect(document.querySelector('.wear-region')).toHaveTextContent(/Hover a body part/);

    fireEvent.click(screen.getByRole('button', { name: 'model segment right_forearm' }));
    expect(chip('R arm')).toHaveAttribute('aria-pressed', 'true');
    expect(shownOrgans()).toEqual(['blood', 'limbs']);
    expect(document.querySelector('.wear-limb')).toHaveAttribute('data-limb', 'right_arm');
  });

  it('opens on the region of a notification handed over from the home screen', () => {
    setPendingFocus({ screen: 'wearables', organ: 'limbs', limb: 'left_leg' });
    renderWearables();
    expect(chip('L leg')).toHaveAttribute('aria-pressed', 'true');
    expect(shownOrgans()).toEqual(['musculoskeletal', 'limbs']);
    expect(peekPendingFocus()).toBeNull(); // one-shot
  });

  it('forgets the pinned region when another person is viewed', () => {
    const { rerenderWith, props } = renderWearables();
    fireEvent.click(chip('Head'));
    expect(shownOrgans()).toHaveLength(2);
    rerenderWith({ ...props, mother: makeMother({ report: habC1 }), viewedCode: 'HAB-C1', profile: getProfile('HAB-C1') });
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
    expect(shownOrgans()).toHaveLength(10);
  });

  it('region helpers', () => {
    expect(regionForSegment('left_foot').id).toBe('left_leg');
    expect(regionForSegment('neck')).toMatchObject({ id: 'neck', segments: ['neck'] });
    expect(regionForSegment(null)).toBeNull();
    expect(regionForTarget({ organ: 'kidneys' }).id).toBe('abdomen');
    expect(regionForTarget({ device: 'head_eeg' }).id).toBe('head');
    expect(regionForTarget({ device: 'right_arm' }).id).toBe('right_arm');
    expect(regionForTarget({ organ: 'exposure' })).toBeNull();
    expect(regionForTarget(null)).toBeNull();
    expect(organsForRegion(habC4Sol142, regionForSegment('neck'))).toEqual([]);
    expect(organsForRegion(null, regionForSegment('head'))).toEqual([]);
  });
});

describe('WearablesScreen: environment and wearables', () => {
  it('shows the exposure card as ENVIRONMENT', () => {
    renderWearables();
    const env = screen.getByRole('heading', { name: 'Environment' }).closest('section');
    expect(within(env).getByText('[ OK ]')).toBeInTheDocument();
    expect(within(env).getByText('All 1 check normal.')).toBeInTheDocument();
    expect(within(env).getByText('Radiation dose (personal dosimeter)').closest('.datarow')).toHaveTextContent('67.81 mSv');
  });

  it('lists every band with state and battery', () => {
    renderWearables();
    const panel = screen.getByRole('heading', { name: 'Wearables' }).closest('section');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map(row => row.dataset.device)).toEqual(['left_arm', 'right_arm', 'left_leg', 'right_leg', 'head_eeg']);
    expect(within(rows[4]).getByText('EEG headband')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('connected');
    expect(rows[0]).toHaveTextContent('94 %');
    expect(within(rows[0]).getByRole('meter', { name: 'Battery: Left arm band' })).toHaveAttribute('aria-valuenow', '94');
    expect(panel).toHaveTextContent('5 bands · all ok');
    expect(panel).toHaveAttribute('data-tone', 'default');
  });

  it('puts bands that need attention first', () => {
    const report = clone(habC4Sol142);
    Object.assign(report.devices.find(device => device.limb === 'right_leg'), {
      status: 'caution', state: 'low_battery', battery_pct: 8.2, message: 'Right leg band battery low.',
    });
    renderWearables({ mother: makeMother({ report, period: { sol: 142 } }) });
    const panel = screen.getByRole('heading', { name: 'Wearables' }).closest('section');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map(row => row.dataset.device)).toEqual(['right_leg', 'left_arm', 'right_arm', 'left_leg', 'head_eeg']);
    expect(rows[0]).toHaveAttribute('data-status', 'caution');
    expect(rows[0]).toHaveTextContent('low battery');
    expect(rows[0]).toHaveTextContent('8 %');
    expect(within(rows[0]).getByText('Right leg band battery low.')).toBeInTheDocument();
    expect(panel).toHaveTextContent('5 bands · 1 need attention');
    expect(panel).toHaveAttribute('data-tone', 'caution');
  });
});

describe('WearablesScreen: no live report', () => {
  it('offline: demo report, DEMO badge, notice, and no sol control', () => {
    renderWearables({ mother: makeMother({ mode: 'offline', report: null }) });
    expect(notice()).toHaveTextContent('LINK LOST — SHOWING DEMO DATA');
    const header = screen.getByRole('heading', { name: 'Body scan' }).closest('section');
    expect(within(header).getByText('DEMO')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(header).toHaveTextContent('Sol 142 · No link · sol fixed');
    expect(shownOrgans()).toHaveLength(10);
    expect(organCard('limbs')).toHaveAttribute('data-status', 'alert');
  });

  it('online without a report: awaits telemetry and does not crash', () => {
    renderWearables({ mother: makeMother({ report: null, loadingReport: true }) });
    expect(notice()).toHaveTextContent('AWAITING TELEMETRY…');
    expect(organCards()).toHaveLength(0);
    expect(screen.getByText('NO ORGAN DATA')).toBeInTheDocument();
    expect(screen.getByText('NO EXPOSURE DATA')).toBeInTheDocument();
    expect(screen.getByText('NO WEARABLE DATA')).toBeInTheDocument();
    expect(screen.getByTestId('astronaut-viewer')).not.toHaveAttribute('data-segment-status');
    fireEvent.click(chip('L arm')); // a chip still works on an empty report
    expect(chip('L arm')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.wear-region')).toHaveTextContent('No organ card is linked to this part.');
  });

  it('survives a report without organs, devices or subject', () => {
    renderWearables({ mother: makeMother({ report: { schema_version: '1.1', as_of: {}, overall_status: 'no_data' }, code: 'HAB-C4' }) });
    expect(organCards()).toHaveLength(0);
    expect(screen.getByTestId('wear-sol')).toHaveTextContent('—');
  });
});

describe('WearablesScreen: Polish', () => {
  it('translates its own texts and leaves backend texts in English', () => {
    renderWearables({ session: 'HAB-C1', viewedCode: 'HAB-C4' }, { lang: 'pl' });
    expect(screen.getByRole('heading', { name: 'Skan ciała' })).toBeInTheDocument();
    expect(screen.getByTestId('read-only-banner')).toHaveTextContent('PODGLĄD: GRAŻYNA BRZĘCZYSZCZYKIEWICZ — TYLKO DO ODCZYTU');
    expect(document.querySelector('.wear-chip[data-region="left_leg"]')).toHaveTextContent('L noga');
    expect(within(organCard('kidneys')).getByRole('button', { name: 'Dlaczego?' })).toBeInTheDocument();
    expect(within(organCard('kidneys')).getByRole('heading', { name: 'Kidneys & urine' })).toBeInTheDocument();
  });
});

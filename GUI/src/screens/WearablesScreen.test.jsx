import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import habC1 from '../test/fixtures/organs_HAB-C1.json';
import habC4Sol142 from '../test/fixtures/organs_HAB-C4_sol142.json';
import { clone, makeMother, renderScreen, screenProps } from '../home/testUtils.jsx';
import { peekPendingFocus, setPendingFocus } from '../home/focus.js';
import { getProfile } from '../data/crewProfiles.js';
import WearablesScreen, { dialogForTarget, organsForRegion, regionForSegment, regionForTarget } from './WearablesScreen.jsx';

vi.mock('../AstronautViewer.jsx', async () => ({ default: (await import('../test/mocks.jsx')).MockAstronautViewer }));

beforeEach(() => setPendingFocus(null));
afterEach(() => vi.useRealTimers());

const notice = () => document.querySelector('.tele-notice');
const tiles = () => [...document.querySelectorAll('.wear-organs .wear-tile')];
const tile = organ => document.querySelector(`.wear-organs .wear-tile[data-organ="${organ}"]`);
const shownOrgans = () => tiles().map(item => item.dataset.organ);
const dialog = () => screen.queryByRole('dialog');
const closeDialog = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
const segment = name => screen.getByRole('button', { name: `model segment ${name}` });

function renderWearables({ mother = makeMother({ report: habC4Sol142, period: { sol: 142 } }), ...rest } = {}, options) {
  return renderScreen(WearablesScreen, screenProps({ mother, ...rest }), options);
}

describe('WearablesScreen: header', () => {
  it('shows the person, the overall status and the top message, without badges or callsigns', () => {
    renderWearables();
    const head = document.querySelector('.wear-head');
    expect(head).toHaveAttribute('data-status', 'alert');
    expect(within(head).getByText('Grażyna Brzęczyszczykiewicz')).toBeInTheDocument();
    expect(head.querySelector('.wear-overall')).toHaveTextContent('[ ALRT ]');
    expect(within(head).getByText(habC4Sol142.top_message)).toBeInTheDocument();
    expect(screen.getByTestId('wear-sol')).toHaveTextContent('142');
    expect(within(head).queryByText(/«ZNACHOR»/)).not.toBeInTheDocument();
    expect(within(head).queryByText('SYNTHETIC')).not.toBeInTheDocument();
    expect(notice()).toBeNull();
  });

  it('has no read-only banner for your own data and one when viewing someone else', () => {
    const { rerenderWith, props } = renderWearables();
    expect(screen.queryByTestId('read-only-banner')).not.toBeInTheDocument();
    rerenderWith({ ...props, session: 'HAB-C1', viewedCode: 'HAB-C4', profile: getProfile('HAB-C4') });
    expect(screen.getByTestId('read-only-banner')).toHaveTextContent('VIEWING GRAŻYNA BRZĘCZYSZCZYKIEWICZ — READ ONLY');
  });

  it('‹ BACK returns to the home screen', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(props.mother.setPeriod).toHaveBeenLastCalledWith(null);
  });

  it('on the latest sol shows the sol of the report and disables LATEST', () => {
    renderWearables({ mother: makeMother({ report: habC1 }), session: 'HAB-C1' });
    expect(screen.getByRole('spinbutton', { name: 'Sol' })).toHaveValue(600);
    expect(screen.getByRole('button', { name: 'Latest' })).toBeDisabled();
  });

  it('shows that a new report is being loaded', () => {
    renderWearables({ mother: makeMother({ report: habC4Sol142, period: { sol: 142 }, loadingReport: true }) });
    expect(screen.getByText('UPDATING…')).toBeInTheDocument();
  });
});

describe('WearablesScreen: organ tiles', () => {
  it('shows ten tiles in report order with status, one big value and the metric name', () => {
    renderWearables();
    expect(shownOrgans()).toEqual(['brain', 'eyes', 'heart', 'lungs', 'blood', 'kidneys', 'gut', 'musculoskeletal', 'limbs', 'exposure']);
    expect(tile('limbs')).toHaveAttribute('data-status', 'alert');
    expect(tile('limbs').querySelector('.stag')).toHaveTextContent('[ ALRT ]');
    // the metric with the card's status leads
    expect(tile('limbs').querySelector('.wear-tile-value')).toHaveTextContent('25% of other limbs');
    expect(tile('limbs').querySelector('.wear-tile-metric')).toHaveTextContent('Circulation: left leg');
    expect(tile('kidneys').querySelector('.stag')).toHaveTextContent('[ CAUT ]');
    expect(tile('heart').querySelector('.wear-tile-value')).toHaveTextContent('4.19mmol/L');
    // no metrics: the headline instead
    expect(tile('eyes').querySelector('.stag')).toHaveTextContent('[ ---- ]');
    expect(tile('eyes').querySelector('.wear-tile-headline')).toHaveTextContent(/^No data yet/);
  });

  it('a tile opens the organ popup with headline, action, paged checks and why', () => {
    renderWearables();
    fireEvent.click(tile('kidneys'));
    const dlg = dialog();
    expect(dlg).toHaveAccessibleName('Kidneys & urine');
    expect(within(dlg).getByText('Stone risk: urine volume 1.73 L/d (< 2.5).', { selector: '.wear-dlg-headline' })).toBeInTheDocument();
    expect(dlg.querySelector('.wear-dlg-action')).toHaveTextContent(/^> Drink to ≥2\.5 L urine\/day/);
    const kidneys = habC4Sol142.organs.find(card => card.organ === 'kidneys');
    expect(dlg.querySelectorAll('.wear-check')).toHaveLength(4);
    expect(within(dlg).getByText('Hydration').closest('.wear-check')).toHaveTextContent('Hydration1.01SG[ OK ]Well hydrated.');
    expect(within(dlg).getByText(/1 \/ 2|1\/2/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Next page' }));
    expect(dlg.querySelectorAll('.wear-check')).toHaveLength(kidneys.checks.length - 4);
    expect(dlg.querySelector('.wear-dlg-why')).toHaveTextContent(kidneys.why);
    closeDialog();
    expect(dialog()).toBeNull();
  });

  it('an ok organ has no action line', () => {
    renderWearables();
    fireEvent.click(tile('heart'));
    expect(dialog().querySelector('.wear-dlg-action')).toBeNull();
    expect(dialog().querySelectorAll('.wear-check')).toHaveLength(3);
  });
});

describe('WearablesScreen: body map', () => {
  it('shows the free-view astronaut tinted by segment status', () => {
    renderWearables();
    const viewer = screen.getByTestId('astronaut-viewer');
    expect(viewer).toHaveAttribute('data-front-view', 'false');
    expect(JSON.parse(viewer.dataset.segmentStatus)).toMatchObject({ left_thigh: 'alert', left_foot: 'alert', right_foot: 'ok', abdomen: 'caution', head: 'ok' });
  });

  it('hovering a segment highlights the organ tiles mapped there', () => {
    renderWearables();
    fireEvent.mouseEnter(segment('chest'));
    expect(tiles().filter(item => item.classList.contains('is-highlight')).map(item => item.dataset.organ)).toEqual(['heart', 'lungs']);
    fireEvent.mouseLeave(segment('chest'));
    expect(document.querySelectorAll('.wear-tile.is-highlight')).toHaveLength(0);
  });

  it('tapping a limb opens its region popup with the band and its organs; an organ there opens its popup', () => {
    renderWearables();
    fireEvent.click(segment('left_foot'));
    const dlg = dialog();
    expect(dlg).toHaveAccessibleName('L leg');
    expect(dlg.querySelector('.dlg-status')).toHaveTextContent('[ ALRT ]');
    expect(dlg.querySelector('.wear-limb')).toHaveAttribute('data-limb', 'left_leg');
    expect(dlg.querySelector('[data-field="circulation"]')).toHaveTextContent('25 %');
    expect([...dlg.querySelectorAll('.wear-tile')].map(item => item.dataset.organ)).toEqual(['musculoskeletal', 'limbs']);
    fireEvent.click(dlg.querySelector('.wear-tile[data-organ="limbs"]'));
    expect(dialog()).toHaveAccessibleName('Limbs (circulation)');
  });

  it('a part with several organs opens the region; a part with one organ opens that organ', () => {
    renderWearables();
    fireEvent.click(segment('head'));
    expect(dialog()).toHaveAccessibleName('Head');
    expect([...dialog().querySelectorAll('.wear-tile')].map(item => item.dataset.organ)).toEqual(['brain', 'eyes']);
    expect(dialog().querySelector('.wear-limb')).toBeNull();
    closeDialog();
    fireEvent.click(segment('pelvis'));
    expect(dialog()).toHaveAccessibleName('Digestion & metabolism');
  });

  it('opens the popup of a notification handed over from the home screen', () => {
    setPendingFocus({ screen: 'wearables', organ: 'limbs', limb: 'left_leg' });
    renderWearables();
    expect(dialog()).toHaveAccessibleName('L leg');
    expect(peekPendingFocus()).toBeNull(); // one-shot
  });

  it('a notification about an organ or a band opens that popup', () => {
    setPendingFocus({ screen: 'wearables', organ: 'kidneys' });
    const first = renderWearables();
    expect(dialog()).toHaveAccessibleName('Kidneys & urine');
    first.unmount();
    setPendingFocus({ screen: 'wearables', device: 'right_leg' });
    renderWearables();
    expect(dialog()).toHaveAccessibleName('Bands');
  });

  it('closes the popup when another person is viewed', () => {
    const { rerenderWith, props } = renderWearables();
    fireEvent.click(tile('heart'));
    expect(dialog()).not.toBeNull();
    rerenderWith({ ...props, mother: makeMother({ report: habC1 }), viewedCode: 'HAB-C1', profile: getProfile('HAB-C1') });
    expect(dialog()).toBeNull();
  });

  it('region helpers', () => {
    expect(regionForSegment('left_foot').id).toBe('left_leg');
    expect(regionForSegment('neck')).toMatchObject({ id: 'neck', segments: ['neck'] });
    expect(regionForSegment(null)).toBeNull();
    expect(regionForTarget({ organ: 'kidneys' }).id).toBe('abdomen');
    expect(regionForTarget({ device: 'head_eeg' }).id).toBe('head');
    expect(regionForTarget({ organ: 'exposure' })).toBeNull();
    expect(organsForRegion(habC4Sol142, regionForSegment('neck'))).toEqual([]);
    expect(organsForRegion(null, regionForSegment('head'))).toEqual([]);
    expect(dialogForTarget({ organ: 'limbs', limb: 'left_leg' })).toMatchObject({ kind: 'region', region: { id: 'left_leg' } });
    expect(dialogForTarget({ device: 'head_eeg' })).toEqual({ kind: 'bands' });
    expect(dialogForTarget({ organ: 'gut' })).toEqual({ kind: 'organ', organ: 'gut' });
    expect(dialogForTarget(null)).toBeNull();
  });
});

describe('WearablesScreen: environment and bands', () => {
  it('ENVIRONMENT opens the exposure card', () => {
    renderWearables();
    const button = document.querySelector('[data-open="environment"]');
    expect(button).toHaveAttribute('data-status', 'ok');
    fireEvent.click(button);
    expect(dialog()).toHaveAccessibleName('Radiation & air');
    expect(within(dialog()).getByText('Radiation dose (personal dosimeter)').closest('.wear-check')).toHaveTextContent('67.81mSv');
  });

  it('BANDS lists every band with state and battery', () => {
    renderWearables();
    const button = document.querySelector('[data-open="bands"]');
    expect(button).toHaveTextContent('5 · all ok');
    fireEvent.click(button);
    const rows = within(dialog()).getAllByRole('listitem');
    expect(rows.map(row => row.dataset.device)).toEqual(['left_arm', 'right_arm', 'left_leg', 'right_leg', 'head_eeg']);
    expect(within(rows[4]).getByText('EEG headband')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('connected');
    expect(rows[0]).toHaveTextContent('94 %');
    expect(within(rows[0]).getByRole('meter', { name: 'Battery: Left arm band' })).toHaveAttribute('aria-valuenow', '94');
  });

  it('puts bands that need attention first and flags the button', () => {
    const report = clone(habC4Sol142);
    Object.assign(report.devices.find(device => device.limb === 'right_leg'), {
      status: 'caution', state: 'low_battery', battery_pct: 8.2, message: 'Right leg band battery low.',
    });
    renderWearables({ mother: makeMother({ report, period: { sol: 142 } }) });
    const button = document.querySelector('[data-open="bands"]');
    expect(button).toHaveAttribute('data-status', 'caution');
    expect(button).toHaveTextContent('1 of 5 need care');
    fireEvent.click(button);
    const rows = within(dialog()).getAllByRole('listitem');
    expect(rows.map(row => row.dataset.device)).toEqual(['right_leg', 'left_arm', 'right_arm', 'left_leg', 'head_eeg']);
    expect(rows[0]).toHaveTextContent('low battery');
    expect(rows[0]).toHaveTextContent('8 %');
    expect(within(rows[0]).getByText('Right leg band battery low.')).toBeInTheDocument();
  });
});

describe('WearablesScreen: no live report', () => {
  it('offline: demo report, notice, and no sol control', () => {
    renderWearables({ mother: makeMother({ mode: 'offline', report: null }) });
    expect(notice()).toHaveTextContent('LINK LOST — SHOWING DEMO DATA');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(document.querySelector('.wear-sol-fixed')).toHaveTextContent('Sol 142No link · sol fixed');
    expect(screen.queryByText('DEMO')).not.toBeInTheDocument();
    expect(shownOrgans()).toHaveLength(10);
    expect(tile('limbs')).toHaveAttribute('data-status', 'alert');
  });

  it('online without a report: awaits telemetry and does not crash', () => {
    renderWearables({ mother: makeMother({ report: null, loadingReport: true }) });
    expect(notice()).toHaveTextContent('AWAITING TELEMETRY…');
    expect(tiles()).toHaveLength(0);
    expect(screen.getByText('NO ORGAN DATA')).toBeInTheDocument();
    expect(screen.getByTestId('astronaut-viewer')).not.toHaveAttribute('data-segment-status');
    fireEvent.click(document.querySelector('[data-open="environment"]'));
    expect(within(dialog()).getByText('NO EXPOSURE DATA')).toBeInTheDocument();
    closeDialog();
    fireEvent.click(document.querySelector('[data-open="bands"]'));
    expect(within(dialog()).getByText('NO WEARABLE DATA')).toBeInTheDocument();
  });

  it('survives a report without organs, devices or subject', () => {
    renderWearables({ mother: makeMother({ report: { schema_version: '1.1', as_of: {}, overall_status: 'no_data' }, code: 'HAB-C4' }) });
    expect(tiles()).toHaveLength(0);
    expect(screen.getByTestId('wear-sol')).toHaveTextContent('—');
  });
});

describe('WearablesScreen: Polish', () => {
  it('translates its own texts and leaves backend texts in English', () => {
    renderWearables({ session: 'HAB-C1', viewedCode: 'HAB-C4' }, { lang: 'pl' });
    expect(screen.getByTestId('read-only-banner')).toHaveTextContent('PODGLĄD: GRAŻYNA BRZĘCZYSZCZYKIEWICZ — TYLKO DO ODCZYTU');
    expect(document.querySelector('[data-open="environment"]')).toHaveTextContent('Środowisko');
    expect(document.querySelector('[data-open="bands"]')).toHaveTextContent('Opaski');
    fireEvent.click(segment('left_foot'));
    expect(dialog()).toHaveAccessibleName('L noga');
    fireEvent.click(dialog().querySelector('.wear-tile[data-organ="limbs"]'));
    expect(dialog()).toHaveAccessibleName('Limbs (circulation)');
    expect(within(dialog()).getByText('Dlaczego?')).toBeInTheDocument();
  });
});

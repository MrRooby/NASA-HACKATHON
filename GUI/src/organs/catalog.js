// Organ catalogue of the PERSON screen (GUI/DESIGN.md §4.2): the 10 organ cards of the MOTHER
// contract, in contract order, with their pixel icon, body segments, the space hazard that
// threatens them and the actions the crew member can do from the organ panel.
//
// Texts are i18n keys of the `organs` namespace (src/i18n/locales/<lang>/organs.js):
//   name_<organ>, what_<organ>, hazard_<organ>, act_<action>, field_<key>, opt_<action>_<value>, step_<action>_<n>
//
// Action types:
//   test   -> full-screen cognitive session: navigate({ screen: 'test', code, test })
//   number -> numeric stepper card (one or more `fields`), saved with recordMeasurement(kind)
//   pick   -> icon picker card (`options`), saved with recordMeasurement(kind)
//   cups   -> water cups tapper (250 mL a cup), saved as { ml }
//   check  -> limb check: limb + findings toggles, saved as kind 'symptoms'
//   bands  -> wearable band status (read only, from the MOTHER report)
//   dose   -> cumulative dose vs the career limit (read only)
//   info   -> pixel how-to: up to 4 icon steps; `todo` marks a skeleton (no measurement yet)
// Field rating: `configId` (config/thresholds.json) or own `bands` (basis on every band).
import { ORGAN_ORDER, ORGAN_SEGMENTS } from '../organSegments.js';
import { ORGAN_ICON } from '../pixel/index.js';

const T = 'team_assumption';
const S = 'source';

/** The five NASA HRP spaceflight hazards. */
export const HAZARDS = {
  radiation: { icon: 'radiation' },
  isolation: { icon: 'crew' },
  distance: { icon: 'satellite' },
  gravity: { icon: 'scale' },
  environment: { icon: 'co2' },
};

const glucose = {
  id: 'glucose', icon: 'glucose', type: 'number', kind: 'glucose',
  fields: [{ key: 'mgdl', unit: 'mg/dL', min: 30, max: 400, step: 1, initial: 90, configId: 'glucose_fasting' }],
};

/** Urine colour chart (hydration). sg = approximate specific gravity of that colour. */
export const URINE_COLOURS = [
  { value: 1, color: '#f6f3c4', sg: 1.005, status: 'ok' },
  { value: 2, color: '#f3e77a', sg: 1.010, status: 'ok' },
  { value: 3, color: '#ead244', sg: 1.015, status: 'ok' },
  { value: 4, color: '#d9a520', sg: 1.025, status: 'caution' },
  { value: 5, color: '#b0661c', sg: 1.030, status: 'alert' },
  { value: 6, color: '#8a2b1e', sg: null, status: 'alert' }, // red / brown: blood or muscle breakdown
];

export const ORGANS = [
  {
    id: 'brain',
    hero: 'brain',
    hazard: 'isolation',
    actions: [
      { id: 'pvt', icon: 'pvt', type: 'test', test: 'quick' },
      { id: 'battery', icon: 'dsst', type: 'test', test: 'full' },
      {
        id: 'mood', icon: 'mood_4', type: 'pick', kind: 'mood', field: 'score', configId: 'mood',
        options: [1, 2, 3, 4, 5].map(value => ({ value, icon: `mood_${value}` })),
      },
      { id: 'sleep', icon: 'sleep', type: 'number', kind: 'sleep', fields: [{ key: 'hours', unit: 'h', min: 0, max: 16, step: 0.5, initial: 7.5, configId: 'sleep_hours' }] },
      { id: 'psych', icon: 'questionnaire', type: 'info', todo: true, steps: [{ icon: 'mood_3' }, { icon: 'caution' }, { icon: 'crew' }, { icon: 'sleep' }] },
      { id: 'ppc', icon: 'chat', type: 'info', steps: [{ icon: 'calendar' }, { icon: 'satellite' }, { icon: 'clock' }, { icon: 'chat' }] },
    ],
  },
  {
    id: 'eyes',
    hero: 'eyes',
    hazard: 'gravity',
    actions: [
      {
        id: 'acuity', icon: 'eye_chart', type: 'pick', kind: 'eye_check', field: 'line', extra: { test: 'acuity' },
        options: [
          { value: 20, label: '20/20', status: 'ok', basis: S },
          { value: 25, label: '20/25', status: 'ok', basis: S },
          { value: 32, label: '20/32', status: 'caution', basis: T },
          { value: 40, label: '20/40', status: 'caution', basis: T },
          { value: 63, label: '20/63+', status: 'alert', basis: T },
        ],
      },
      { id: 'fundus', icon: 'camera', type: 'info', todo: true, steps: [{ icon: 'light' }, { icon: 'camera' }, { icon: 'eye' }, { icon: 'satellite' }] },
      { id: 'iop', icon: 'eye', type: 'info', todo: true, steps: [{ icon: 'pill' }, { icon: 'eye' }, { icon: 'bp' }, { icon: 'calendar' }] },
    ],
  },
  {
    id: 'heart',
    hero: 'heart',
    hazard: 'gravity',
    actions: [
      {
        id: 'bp', icon: 'bp', type: 'number', kind: 'bp',
        fields: [
          { key: 'systolic', unit: 'mmHg', min: 60, max: 240, step: 1, initial: 118, configId: 'bp_systolic' },
          { key: 'diastolic', unit: 'mmHg', min: 30, max: 150, step: 1, initial: 76, configId: 'bp_diastolic' },
        ],
      },
      { id: 'hr', icon: 'hr', type: 'number', kind: 'hr', fields: [{ key: 'bpm', unit: 'bpm', min: 25, max: 220, step: 1, initial: 64, configId: 'heart_rate_resting' }] },
    ],
  },
  {
    id: 'lungs',
    hero: 'lungs',
    hazard: 'environment',
    actions: [
      { id: 'spo2', icon: 'spo2', type: 'number', kind: 'spo2', fields: [{ key: 'pct', unit: '%', min: 60, max: 100, step: 1, initial: 97, configId: 'spo2' }] },
      { id: 'temp', icon: 'thermometer', type: 'number', kind: 'temp', fields: [{ key: 'celsius', unit: '°C', min: 33, max: 42, step: 0.1, initial: 36.7, configId: 'body_temperature' }] },
    ],
  },
  {
    id: 'blood',
    hero: 'blood',
    hazard: 'radiation',
    actions: [
      { id: 'draw', icon: 'syringe', type: 'info', every: 30, steps: [{ icon: 'clock' }, { icon: 'syringe' }, { icon: 'test_tube' }, { icon: 'satellite' }] },
      glucose,
    ],
  },
  {
    id: 'kidneys',
    hero: 'kidneys',
    hazard: 'gravity',
    actions: [
      {
        id: 'water', icon: 'water_cup', type: 'cups', kind: 'water', cupMl: 250, target: 2500,
        bands: [{ min: 0, max: 1500, status: 'alert', basis: T }, { min: 1500, max: 2500, status: 'caution', basis: T }, { min: 2500, max: 4000, status: 'ok', basis: S }],
      },
      { id: 'urine_sample', icon: 'dipstick', type: 'pick', kind: 'urine_sample', field: 'colour', options: URINE_COLOURS.map(c => ({ ...c, swatch: c.color, basis: T })) },
      {
        id: 'urine_volume', icon: 'urine', type: 'number', kind: 'urine_volume',
        fields: [{
          key: 'liters', unit: 'L/d', min: 0, max: 6, step: 0.1, initial: 2.0,
          bands: [{ min: 0, max: 0.5, status: 'alert', basis: T }, { min: 0.5, max: 2.5, status: 'caution', basis: S }, { min: 2.5, max: 6.01, status: 'ok', basis: S }],
        }],
      },
    ],
  },
  {
    id: 'gut',
    hero: 'gut',
    hazard: 'environment',
    actions: [
      { id: 'meal', icon: 'stomach', type: 'number', kind: 'meal', fields: [{ key: 'kcal', unit: 'kcal', min: 0, max: 3000, step: 50, initial: 700 }] },
      glucose,
      {
        id: 'bristol', icon: 'stomach', type: 'pick', kind: 'bristol', field: 'type',
        options: [1, 2, 3, 4, 5, 6, 7].map(value => ({ value, bristol: value, status: value <= 2 || value >= 6 ? 'caution' : 'ok', basis: S })),
      },
      { id: 'weight', icon: 'scale', type: 'number', kind: 'weight', fields: [{ key: 'kg', unit: 'kg', min: 30, max: 160, step: 0.1, initial: 70 }] },
    ],
  },
  {
    id: 'musculoskeletal',
    hero: 'musculoskeletal',
    hazard: 'gravity',
    actions: [
      {
        id: 'exercise', icon: 'dumbbell', type: 'number', kind: 'exercise',
        modes: [{ value: 'ared', icon: 'dumbbell' }, { value: 'treadmill', icon: 'treadmill' }],
        fields: [{ key: 'minutes', unit: 'min', min: 0, max: 240, step: 5, initial: 60, configId: 'exercise_minutes_daily' }],
      },
      { id: 'grip', icon: 'grip', type: 'number', kind: 'grip', fields: [{ key: 'kg', unit: 'kg', min: 0, max: 90, step: 1, initial: 35 }] },
    ],
  },
  {
    id: 'limbs',
    hero: 'limbs',
    hazard: 'environment',
    actions: [
      { id: 'bands', icon: 'limb', type: 'bands' },
      {
        id: 'limb_check', icon: 'check', type: 'check', kind: 'symptoms',
        findings: [{ value: 'pressure', icon: 'pressure' }, { value: 'swelling', icon: 'limb' }, { value: 'colour', icon: 'blood' }, { value: 'cold', icon: 'thermometer' }],
      },
    ],
  },
  {
    id: 'exposure',
    hero: 'exposure',
    hazard: 'radiation',
    actions: [
      { id: 'dose', icon: 'radiation', type: 'dose', limit: 600 },
      { id: 'shelter', icon: 'structure', type: 'info', steps: [{ icon: 'sun' }, { icon: 'structure' }, { icon: 'radiation_sensor' }, { icon: 'clock' }] },
    ],
  },
].map(organ => ({ ...organ, icon: ORGAN_ICON[organ.id], segments: ORGAN_SEGMENTS[organ.id] }));

export const ORGAN_BY_ID = Object.fromEntries(ORGANS.map(organ => [organ.id, organ]));

/** Every action of every organ (unique by id). */
export const ALL_ACTIONS = [...new Map(ORGANS.flatMap(organ => organ.actions).map(action => [action.id, action])).values()];

/** Organs that colour a body segment, in contract order (head -> brain, eyes). */
export function organsForSegment(segment) {
  return ORGANS.filter(organ => organ.segments.includes(segment)).map(organ => organ.id);
}

/** Organs sharing at least one body segment with this organ (the tabs of the organ panel), itself included. */
export function siblingOrgans(organId) {
  const organ = ORGAN_BY_ID[organId];
  if (!organ) return [];
  if (organ.segments.length === 0) return [organ.id];
  return ORGANS.filter(other => other.id === organ.id || other.segments.some(segment => organ.segments.includes(segment))).map(other => other.id);
}

// Contract check at import time: the catalogue follows MOTHER's organ order.
if (ORGANS.map(organ => organ.id).join() !== ORGAN_ORDER.join()) {
  throw new Error('organs/catalog.js is out of step with organSegments.js ORGAN_ORDER');
}

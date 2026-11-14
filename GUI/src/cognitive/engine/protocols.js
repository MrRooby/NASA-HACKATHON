// Offline copy of GET /api/cognitive/protocols (CONTRACT section 1).
export const APP_VERSION = '0.2.0';

export const PROTOCOLS = {
  pvt: { test_id: 'pvt', protocol_version: 'pvtb-1.0', label: 'Reaction time (PVT)', duration_s: 180, practice_trials: 3 },
  gonogo: { test_id: 'gonogo', protocol_version: 'gonogo-1.0', label: 'Impulse control (Go/No-Go)', duration_s: null, practice_trials: 10 },
  dsst: { test_id: 'dsst', protocol_version: 'dsst-1.0', label: 'Processing speed (DSST)', duration_s: 90, practice_trials: 9 },
};

export const TEST_ORDER = ['pvt', 'gonogo', 'dsst'];
export const DISCLAIMER = 'Performance indicator compared with your own baseline - not a diagnosis.';
export const BASELINE_NEEDED = 3;

// `?demo=1` (standalone only): shortened runs passed to the tasks as props; the default protocols stay untouched.
export const DEMO_OVERRIDES = {
  pvt: { durationMs: 30000 },
  gonogo: { shortTrials: { total: 30, nogo: 8 } },
  dsst: { durationS: 30 },
};

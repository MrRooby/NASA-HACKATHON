// Bone status for the skeleton view. Bone density (BMD) cannot be measured in flight, so like MOTHER
// (MOTHER/mother/derive.py BMD_RATE, forecast.py) it is projected from the mission time: % of the
// pre-flight value lost per month, between full resistive-exercise compliance and none.
// Mars gravity (0.38 g) slows the loss compared with the ISS rates: team assumption, factor below.
import { evaluateValue } from '../checkin/thresholdLogic.js';

export const BMD_RATE = {
  // indicator: [% / month with full exercise compliance, % / month without countermeasures]
  bmd_hip_spine_pct_baseline: [0.64, 1.25],
  bmd_femoral_neck_pct_baseline: [0.32, 1.0],
};
export const MARS_GRAVITY_FACTOR = 0.5; // team assumption: half of the microgravity loss rate
const DAYS_PER_SOL = 88775.244 / 86400;
const DAYS_PER_MONTH = 30.44;

/** Exercise compliance 0.70–0.95, fixed per person (deterministic from the code: no data source yet). */
export function complianceOf(code) {
  const s = String(code || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 0.7 + (h % 26) / 100;
}

/** { hip, femoral } in % of the pre-flight value after `sol` sols, or null without a sol. */
export function projectBmd(code, sol) {
  if (sol == null || !Number.isFinite(Number(sol))) return null;
  const months = (Number(sol) * DAYS_PER_SOL) / DAYS_PER_MONTH;
  const c = complianceOf(code);
  const pct = ([withEx, without]) => 100 - (withEx * c + without * (1 - c)) * MARS_GRAVITY_FACTOR * months;
  return { hip: pct(BMD_RATE.bmd_hip_spine_pct_baseline), femoral: pct(BMD_RATE.bmd_femoral_neck_pct_baseline), compliance: c };
}

/**
 * Status per skeleton segment (organSegments.js names): spine, pelvis and ribs follow the hip/spine BMD,
 * thighs the femoral neck, the rest of the limbs the milder of the two; the skull is not load-bearing.
 */
export function boneStatus(code, sol) {
  const bmd = projectBmd(code, sol);
  if (!bmd) return null;
  const hip = evaluateValue('bmd_hip_spine_pct_baseline', bmd.hip).status;
  const femoral = evaluateValue('bmd_femoral_neck_pct_baseline', bmd.femoral).status;
  const rank = { ok: 0, caution: 1, alert: 2 };
  const milder = rank[hip] <= rank[femoral] ? hip : femoral;
  const segments = {
    head: 'ok', neck: milder, chest: hip, abdomen: hip, pelvis: hip,
    left_thigh: femoral, right_thigh: femoral,
    left_lower_leg: milder, right_lower_leg: milder, left_foot: milder, right_foot: milder,
    left_upper_arm: milder, right_upper_arm: milder, left_forearm: milder, right_forearm: milder,
    left_hand: 'ok', right_hand: 'ok',
  };
  return { segments, bmd, hip, femoral };
}

// Maps MOTHER organ cards (contract 1.1) onto the 17 named meshes of
// public/models/anny_astronaut_bone_segmented.glb.
//
// Mesh names are the astronaut's own (anatomical) left/right, which is also what
// MOTHER means by "left leg" and by devices[].limb = "left_leg".
//
//   organ            -> body segments
//   ---------------     --------------------------------------------------------
//   brain            -> head
//   eyes             -> head
//   heart            -> chest
//   lungs            -> chest
//   blood            -> left_upper_arm, right_upper_arm
//   kidneys          -> abdomen
//   gut              -> abdomen, pelvis
//   musculoskeletal  -> left_thigh, left_lower_leg, right_thigh, right_lower_leg
//   limbs            -> per limb (see limbSegmentStatus):
//                         left_arm  -> left_upper_arm, left_forearm, left_hand
//                         right_arm -> right_upper_arm, right_forearm, right_hand
//                         left_leg  -> left_thigh, left_lower_leg, left_foot
//                         right_leg -> right_thigh, right_lower_leg, right_foot
//   exposure         -> no segment (environment badge in the UI)
//   (neck has no organ and keeps the model's own colour)
//
// When several organs land on one segment, the worst status wins:
// alert > caution > ok > no_data.

// The model labels its two torso meshes the wrong way round. Verified from the GLB bounding boxes
// (Z is up): mesh "abdomen" spans z 0.20..0.53 (upper torso, ribcage) and mesh "chest" spans
// z -0.12..0.25 (belly). anny_astronaut_landmarks.json has the same swap (spine01/02 under "abdomen").
// Everything in this app uses the anatomical names; translate only when talking to the 3D meshes.
const MESH_FOR_SEGMENT = { chest: 'abdomen', abdomen: 'chest' };
const SEGMENT_FOR_MESH = { abdomen: 'chest', chest: 'abdomen' };

/** Anatomical segment name for a mesh name of the GLB. */
export function segmentForMesh(meshName) {
  return SEGMENT_FOR_MESH[meshName] ?? meshName;
}

/** GLB mesh name for an anatomical segment name. */
export function meshForSegment(segment) {
  return MESH_FOR_SEGMENT[segment] ?? segment;
}

export const BODY_SEGMENTS = [
  'head', 'neck', 'chest', 'abdomen', 'pelvis',
  'left_upper_arm', 'left_forearm', 'left_hand',
  'right_upper_arm', 'right_forearm', 'right_hand',
  'left_thigh', 'left_lower_leg', 'left_foot',
  'right_thigh', 'right_lower_leg', 'right_foot',
];

export const LIMB_SEGMENTS = {
  left_arm: ['left_upper_arm', 'left_forearm', 'left_hand'],
  right_arm: ['right_upper_arm', 'right_forearm', 'right_hand'],
  left_leg: ['left_thigh', 'left_lower_leg', 'left_foot'],
  right_leg: ['right_thigh', 'right_lower_leg', 'right_foot'],
};

const ALL_LIMB_SEGMENTS = Object.values(LIMB_SEGMENTS).flat();

export const ORGAN_SEGMENTS = {
  brain: ['head'],
  eyes: ['head'],
  heart: ['chest'],
  lungs: ['chest'],
  blood: ['left_upper_arm', 'right_upper_arm'],
  kidneys: ['abdomen'],
  gut: ['abdomen', 'pelvis'],
  musculoskeletal: ['left_thigh', 'left_lower_leg', 'right_thigh', 'right_lower_leg'],
  limbs: ALL_LIMB_SEGMENTS,
  exposure: [],
};

/** Organ order of the contract (MOTHER always sends the 10 cards in this order). */
export const ORGAN_ORDER = Object.keys(ORGAN_SEGMENTS);

export const STATUS_RANK = { no_data: 0, ok: 1, caution: 2, alert: 3 };

/** Worst of the given statuses (alert > caution > ok > no_data); null for an empty list. */
export function worstStatus(statuses) {
  let worst = null;
  for (const status of statuses) {
    if (!(status in STATUS_RANK)) continue;
    if (worst == null || STATUS_RANK[status] > STATUS_RANK[worst]) worst = status;
  }
  return worst;
}

const isProblem = status => status === 'caution' || status === 'alert';

// "Left leg", "Circulation: right arm", "perfusion_left_leg", "left_arm" ...
const LIMB_PATTERN = /(?:^|[^a-z])(left|right)[\s_-]+(arm|leg)(?![a-z])/gi;

/** Limb keys (left_arm, right_leg ...) named in a piece of text. */
export function limbsInText(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(LIMB_PATTERN)].map(match => `${match[1].toLowerCase()}_${match[2].toLowerCase()}`);
}

/**
 * Status per limb (left_arm, right_arm, left_leg, right_leg) derived from the limbs card.
 *
 * - limbs card ok / no_data: every limb gets that status.
 * - limbs card caution / alert: only the limbs that the card identifies get coloured,
 *   the other limbs are 'ok'. A limb is identified by
 *     1. a non-ok metric or check whose name / label / code / message names it
 *        ("Circulation: left leg", "perfusion_left_leg") -> that metric's status;
 *     2. the headline naming it ("Left leg: blood flow 25% ...") -> the card status;
 *     3. only if 1+2 found nothing: a non-ok wearable on that limb (devices[].limb)
 *        -> the card status (the device itself never colours the body).
 *   If nothing identifies a limb, every limb gets the card status.
 */
export function limbSegmentStatus(limbsCard, devices = []) {
  const limbKeys = Object.keys(LIMB_SEGMENTS);
  const cardStatus = limbsCard?.status ?? 'no_data';
  if (!isProblem(cardStatus)) return Object.fromEntries(limbKeys.map(limb => [limb, cardStatus]));

  const found = {};
  const mark = (limb, status) => {
    if (!LIMB_SEGMENTS[limb]) return;
    found[limb] = worstStatus([found[limb], status].filter(Boolean));
  };

  for (const item of [...(limbsCard.metrics || []), ...(limbsCard.checks || [])]) {
    if (!isProblem(item?.status)) continue;
    const text = [item.name, item.label, item.code, item.message].filter(Boolean).join(' | ');
    for (const limb of limbsInText(text)) mark(limb, item.status);
  }
  for (const limb of limbsInText(limbsCard.headline)) mark(limb, cardStatus);
  if (Object.keys(found).length === 0) {
    for (const device of devices || []) {
      if (isProblem(device?.status)) mark(device.limb, cardStatus);
    }
  }

  if (Object.keys(found).length === 0) return Object.fromEntries(limbKeys.map(limb => [limb, cardStatus]));
  return Object.fromEntries(limbKeys.map(limb => [limb, found[limb] ?? 'ok']));
}

/**
 * { segmentName: status } for one organ report (GET /api/organs/{code}).
 * Segments without any organ (neck) are left out.
 */
export function segmentStatusFromReport(report) {
  const collected = {};
  const add = (segment, status) => { (collected[segment] ||= []).push(status); };
  for (const card of report?.organs || []) {
    if (card.organ === 'limbs') {
      const perLimb = limbSegmentStatus(card, report.devices);
      for (const [limb, status] of Object.entries(perLimb)) {
        for (const segment of LIMB_SEGMENTS[limb]) add(segment, status);
      }
      continue;
    }
    for (const segment of ORGAN_SEGMENTS[card.organ] || []) add(segment, card.status ?? 'no_data');
  }
  return Object.fromEntries(Object.entries(collected).map(([segment, statuses]) => [segment, worstStatus(statuses)]));
}

/** Organ cards that colour a given segment (for the hover / click panel). */
export function organsForSegment(report, segment) {
  return (report?.organs || []).filter(card => (ORGAN_SEGMENTS[card.organ] || []).includes(segment));
}

export function segmentLabel(segment) {
  return String(segment || '').replace(/_/g, ' ');
}

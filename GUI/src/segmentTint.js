import { Color } from 'three';
import { paintBody } from './bodyShading.js';
import { MODEL_HOVER_COLOR, getCurrentTheme, getStatusColors } from './theme/index.js';

// Status colours of the body map come from the current UI theme (src/theme) and are read
// at call time, so the 3D model follows a theme switch on its next paint.
// STATUS_COLORS.ok / .caution / .alert / .no_data always return the current theme's colours.
export const STATUS_COLORS = Object.freeze({
  get ok() { return getStatusColors().ok; },
  get caution() { return getStatusColors().caution; },
  get alert() { return getStatusColors().alert; },
  get no_data() { return getStatusColors().no_data; },
});

export const HOVER_COLOR = MODEL_HOVER_COLOR;

// "Quiet display": a healthy segment is a calm, greyed green; only caution and alert get the
// full status colour, so the eye goes to what needs attention.
const OK_QUIET = 0.38; // how far OK is pulled towards the neutral body grey
const NO_DATA_QUIET = 0.5;
const NEUTRAL = '#8b939b';

/**
 * Colour of one body segment: hover colour, status colour, or the model's own colour when
 * there is no status at all (offline demo without a report).
 */
export function segmentColor(segment, segmentStatus, originalColor, hoveredSegment = null) {
  if (hoveredSegment && segment === hoveredSegment) return new Color(HOVER_COLOR);
  // No report at all (offline demo without data): the model's own colours.
  if (!segmentStatus) return originalColor ? originalColor.clone() : new Color(NEUTRAL);
  const status = segmentStatus[segment];
  // A segment no organ maps to (e.g. the neck): neutral grey, not the model's pale blue.
  if (!status) return new Color(NEUTRAL);
  const neutral = new Color(NEUTRAL);
  if (status === 'ok') return new Color(STATUS_COLORS.ok).lerp(neutral, OK_QUIET);
  if (status === 'caution' || status === 'alert') return new Color(STATUS_COLORS[status]);
  return new Color(STATUS_COLORS.no_data).lerp(neutral, NO_DATA_QUIET);
}

/** Paint the body: status colours per segment, soft borders between segments, optional hover. */
export function paintSegments(scene, segmentStatus, hoveredSegment = null) {
  void getCurrentTheme; // colours are read through STATUS_COLORS at call time
  paintBody(scene, (segment, original) => segmentColor(segment, segmentStatus, original, hoveredSegment));
}

// Cockpit primitives (DESIGN.md §5): quiet display, redundant status coding, no scrolling.
export { StatusMark, StatusShape, SHAPE } from './StatusMark.jsx';
export { RangeBar, rangeGeometry } from './RangeBar.jsx';
export { Sparkline, sparkPoints } from './Sparkline.jsx';
export { Pager, PagerControls, usePager, useFitCount } from './Pager.jsx';
export { PixelFrame } from './PixelFrame.jsx';
export { IconButton } from './IconButton.jsx';
export { Badge } from './Badge.jsx';
export { BigNumber } from './BigNumber.jsx';
export { STATUSES, STATUS_COLOUR, STATUS_KEY, normalizeStatus } from './status.js';

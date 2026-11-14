import React from 'react';

// Nine simple geometric symbols of our own design (no Wechsler / CTB glyphs).
const SHAPES = [
  <circle key="0" cx="12" cy="12" r="7" fill="none" />,
  <circle key="1" cx="12" cy="12" r="6" fill="currentColor" />,
  <path key="2" d="M12 4 L20 19 H4 Z" fill="none" />,
  <path key="3" d="M4 5 H20 L12 20 Z" fill="none" />,
  <rect key="4" x="5" y="5" width="14" height="14" fill="none" />,
  <path key="5" d="M12 3 L21 12 L12 21 L3 12 Z" fill="none" />,
  <path key="6" d="M12 4 V20 M4 12 H20" fill="none" />,
  <path key="7" d="M5 5 L19 19 M19 5 L5 19" fill="none" />,
  <path key="8" d="M4 7 H20 M4 12 H20 M4 17 H20" fill="none" />,
];

export const SHAPE_COUNT = SHAPES.length;

export function Symbol({ shape, size = 40, className = '' }) {
  return (
    <svg className={`cog-symbol ${className}`} width={size} height={size} viewBox="0 0 24 24" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {SHAPES[shape]}
    </svg>
  );
}

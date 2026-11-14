import React, { useEffect, useState } from 'react';

// Card corner -> key of the anchors reported by AstronautViewer's onModelFrame.
// Those keys are SCREEN sides (leftArm = the arm on the viewer's left), so they match
// the card corners, not the astronaut's anatomical sides.
const CORNER_ANCHOR = { tl: 'leftArm', tr: 'rightArm', bl: 'leftLeg', br: 'rightLeg' };

/**
 * Thin lines from the four limb cards to their limb on the 3D model.
 * stageRef: positioned container of the cards and the model (the svg fills it);
 * modelRef: element the anchors are relative to; anchors: { leftArm: {x, y}, ... } in 0..1
 * of the model element. Renders nothing until anchors, both elements and the cards
 * ([data-corner]) exist; cards stacked above / below the model (narrow screens) get no line.
 */
export default function ConnectorOverlay({ stageRef, modelRef, anchors }) {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    const stageEl = stageRef.current;
    const modelEl = modelRef.current;
    if (!anchors || !stageEl || !modelEl) {
      setLines([]);
      return undefined;
    }
    const update = () => {
      const stage = stageEl.getBoundingClientRect();
      const model = modelEl.getBoundingClientRect();
      const next = [];
      for (const [corner, key] of Object.entries(CORNER_ANCHOR)) {
        const cardEl = stageEl.querySelector(`[data-corner="${corner}"]`);
        const anchor = anchors[key];
        if (!cardEl || !anchor) continue;
        const card = cardEl.getBoundingClientRect();
        const onLeft = corner.endsWith('l');
        // Only when the card really sits beside the model.
        if (onLeft ? card.right > model.left + 1 : card.left < model.right - 1) continue;
        next.push({
          corner,
          status: cardEl.dataset.status || 'no_data',
          x1: (onLeft ? card.right : card.left) - stage.left,
          y1: card.top + Math.min(card.height / 2, 14) - stage.top,
          x2: model.left + model.width * anchor.x - stage.left,
          y2: model.top + model.height * anchor.y - stage.top,
        });
      }
      setLines(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stageEl);
    observer.observe(modelEl);
    return () => observer.disconnect();
  }, [anchors, modelRef, stageRef]);

  if (lines.length === 0) return null;
  return (
    <svg className="home-connectors" aria-hidden="true">
      {lines.map(line => (
        <g key={line.corner} className={`home-connector home-connector-${line.status}`} data-corner={line.corner}>
          <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          <rect x={line.x2 - 2} y={line.y2 - 2} width="4" height="4" />
        </g>
      ))}
    </svg>
  );
}

/** True when two anchor sets differ by more than `eps` (fractions of the model box) anywhere. */
export function anchorsMoved(previous, next, eps = 0.004) {
  if (!previous || !next) return previous !== next;
  return Object.keys(CORNER_ANCHOR).some(corner => {
    const key = CORNER_ANCHOR[corner];
    const a = previous[key];
    const b = next[key];
    if (!a || !b) return a !== b;
    return Math.abs(a.x - b.x) > eps || Math.abs(a.y - b.y) > eps;
  });
}

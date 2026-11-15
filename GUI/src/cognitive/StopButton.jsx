import React from 'react';
import { Button } from '../components/index.js';

/**
 * Quiet [ STOP ] control inside a running task field: the only way to abort on a tablet (no Escape key).
 * attachInput ignores pointerdown on [data-cog-stop], so a tap here is never recorded as a response.
 */
export default function StopButton({ onStop }) {
  return (
    <Button variant="ghost" className="cog-stop" data-cog-stop="" tabIndex={-1} onClick={() => onStop?.()}>
      STOP
    </Button>
  );
}

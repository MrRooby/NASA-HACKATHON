import { useLayoutEffect, useRef, useState } from 'react';

/**
 * How many rows of a popup list fit in the space it is given: (box height + gap) / (tallest row + gap).
 * The box (ref) must have a height that does not depend on its rows (flex: 1, overflow hidden),
 * so a short list is shown on one page instead of being split with empty space left over.
 * rowSelector picks the rows inside the box. Without layout (tests) the fallback count is used.
 */
export default function useFitRows(fallback, rowSelector = 'li', resetKey = null) {
  const ref = useRef(null);
  const [count, setCount] = useState(fallback);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const rows = [...box.querySelectorAll(rowSelector)];
      if (!rows.length || box.clientHeight <= 0) return;
      const list = rows[0].parentElement;
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      const rowHeight = Math.max(...rows.map(row => row.getBoundingClientRect().height));
      if (rowHeight > 0) setCount(Math.max(1, Math.floor((box.clientHeight + gap) / (rowHeight + gap))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    measure();
    return () => observer.disconnect();
  }, [rowSelector, resetKey]);
  return { ref, count };
}

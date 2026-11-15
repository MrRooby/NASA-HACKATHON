import { useEffect, useState } from 'react';

/**
 * How many fixed-height rows fit in the element: the list pages instead of scrolling.
 * Falls back to `fallback` where ResizeObserver is missing (tests) or before the first layout.
 */
export default function useFitCount(ref, rowPx, fallback = 4) {
  const [count, setCount] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const height = element.clientHeight;
      if (height > 0) setCount(Math.max(1, Math.floor(height / rowPx)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rowPx]);
  return count;
}

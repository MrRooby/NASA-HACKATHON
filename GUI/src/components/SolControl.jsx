import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import Button from './Button.jsx';
import { cx } from './cx.js';

/**
 * Sol picker: slider + number input + [ LATEST ].
 * props: value (number | null; null = latest), max (600), min (1),
 *        latest (number shown while value is null, e.g. report.as_of.sol; defaults to max),
 *        onChange(sol: number | null) — debounced for typing / dragging, immediate null for LATEST,
 *        label (defaults to "Sol"), debounceMs (400), className.
 */
export default function SolControl({ value, max = 600, min = 1, latest, onChange, label, debounceMs = 400, className }) {
  const t = useT();
  const text = label ?? t('common.sol');
  const shown = value ?? latest ?? '';
  const [draft, setDraft] = useState(shown);
  const dirty = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Follow the outside value whenever the user is not editing.
  useEffect(() => {
    dirty.current = false;
    setDraft(shown);
  }, [shown]);

  // Debounced commit, so dragging the slider does not emit one value per step.
  useEffect(() => {
    if (!dirty.current) return undefined;
    const number = Number(draft);
    if (draft === '' || !Number.isFinite(number) || number < min) return undefined;
    const timer = setTimeout(() => {
      dirty.current = false;
      onChangeRef.current?.(Math.min(max, Math.round(number)));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [draft, min, max, debounceMs]);

  const edit = next => {
    dirty.current = true;
    setDraft(next);
  };

  const toLatest = () => {
    dirty.current = false;
    setDraft(latest ?? '');
    onChangeRef.current?.(null);
  };

  return (
    <div className={cx('solctl', className)} role="group" aria-label={text}>
      <span className="solctl-label">{text}</span>
      <input
        type="range"
        className="solctl-range"
        min={min}
        max={max}
        value={draft === '' ? max : draft}
        onChange={event => edit(event.target.value)}
        aria-label={t('common.sliderOf', { label: text })}
      />
      <input
        type="number"
        className="solctl-number"
        min={min}
        max={max}
        value={draft}
        onChange={event => edit(event.target.value)}
        aria-label={text}
      />
      <Button small disabled={value == null} onClick={toLatest}>{t('common.latest')}</Button>
    </div>
  );
}

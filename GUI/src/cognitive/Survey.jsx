import React, { useState } from 'react';
import { Button, Panel } from '../components/index.js';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const SLEEP_STEPS = Array.from({ length: 29 }, (_, i) => i * 0.5);

const SCALES = [
  { id: 'sleep_quality', label: 'Sleep quality', from: 1, to: 10, low: 'very poor', high: 'excellent' },
  { id: 'fatigue', label: 'Fatigue now', from: 1, to: 10, low: 'fresh', high: 'exhausted' },
  { id: 'kss', label: 'Sleepiness (KSS)', from: 1, to: 9, low: 'very alert', high: 'very sleepy' },
  { id: 'stress', label: 'Stress now', from: 1, to: 10, low: 'calm', high: 'very stressed' },
];

/**
 * Pre-test questionnaire, built for touch: every scale is one row of large radio cells (one tap per question),
 * sleep hours stay a native select (29 half-hour steps; the tablet opens its own picker). onDone(context) with
 * the CONTRACT field names.
 */
export default function Survey({ onDone }) {
  const [v, setV] = useState({ sleep_h: '', sleep_quality: '', fatigue: '', kss: '', stress: '', caffeine_3h: 'no' });
  const set = key => e => setV(cur => ({ ...cur, [key]: e.target.value }));
  const complete = ['sleep_h', 'sleep_quality', 'fatigue', 'kss', 'stress'].every(k => v[k] !== '');

  const submit = e => {
    e.preventDefault();
    if (!complete) return;
    onDone({
      sleep_h: Number(v.sleep_h), sleep_quality: Number(v.sleep_quality), fatigue: Number(v.fatigue),
      kss: Number(v.kss), stress: Number(v.stress), caffeine_3h: v.caffeine_3h === 'yes',
    });
  };

  const cells = (name, values, labelOf = String) => values.map(n => (
    <label key={n} className="cog-seg-cell">
      <input type="radio" name={name} value={String(n)} checked={v[name] === String(n)} onChange={set(name)} />
      <span>{labelOf(n)}</span>
    </label>
  ));

  return (
    <Panel className="cog-card cog-survey" title="Before you start">
      <form onSubmit={submit}>
        <p className="cog-muted">Six quick questions. They help interpret your results.</p>
        <div className="cog-q">
          <label className="cog-q-label" htmlFor="sleep_h">Hours of sleep last night</label>
          <select id="sleep_h" className="cog-q-select" value={v.sleep_h} onChange={set('sleep_h')} required>
            <option value="">Choose...</option>
            {SLEEP_STEPS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="cog-q-hint">0 to 14 h, in half hours</span>
        </div>
        {SCALES.map(({ id, label, from, to, low, high }) => (
          <div className="cog-q" key={id}>
            <span className="cog-q-label" id={`${id}-label`}>{label}</span>
            <div className="cog-seg" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} style={{ '--cells': to - from + 1 }}>
              {cells(id, range(from, to))}
            </div>
            <span className="cog-q-hint" id={`${id}-hint`}>{from} = {low}, {to} = {high}</span>
          </div>
        ))}
        <div className="cog-q">
          <span className="cog-q-label" id="caffeine-label">Caffeine in the last 3 hours</span>
          <div className="cog-seg cog-seg-yn" role="radiogroup" aria-labelledby="caffeine-label" style={{ '--cells': 2 }}>
            {[['no', 'No'], ['yes', 'Yes']].map(([val, text]) => (
              <label key={val} className="cog-seg-cell">
                <input type="radio" name="caffeine_3h" value={val} checked={v.caffeine_3h === val} onChange={set('caffeine_3h')} />
                <span>{text}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="cog-actions"><Button type="submit" variant="primary" className="cog-btn" disabled={!complete}>CONTINUE</Button></div>
      </form>
    </Panel>
  );
}

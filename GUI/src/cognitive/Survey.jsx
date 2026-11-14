import React, { useState } from 'react';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const SLEEP_STEPS = Array.from({ length: 29 }, (_, i) => i * 0.5);

/** Pre-test questionnaire. onDone(context) with the CONTRACT field names. */
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

  const scale = (id, label, from, to, hint) => (
    <div className="cog-q">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={v[id]} onChange={set(id)} required>
        <option value="">Choose...</option>
        {range(from, to).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="cog-q-hint">{hint}</span>
    </div>
  );

  return (
    <form className="cog-card cog-survey" onSubmit={submit}>
      <h2 className="cog-h2">Before you start</h2>
      <p className="cog-muted">Six quick questions. They help interpret your results.</p>
      <div className="cog-q">
        <label htmlFor="sleep_h">Hours of sleep last night</label>
        <select id="sleep_h" value={v.sleep_h} onChange={set('sleep_h')} required>
          <option value="">Choose...</option>
          {SLEEP_STEPS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="cog-q-hint">0 to 14 h, in half hours</span>
      </div>
      {scale('sleep_quality', 'Sleep quality', 1, 10, '1 = very poor, 10 = excellent')}
      {scale('fatigue', 'Fatigue now', 1, 10, '1 = fresh, 10 = exhausted')}
      {scale('kss', 'Sleepiness (KSS)', 1, 9, '1 = very alert, 9 = very sleepy')}
      {scale('stress', 'Stress now', 1, 10, '1 = calm, 10 = very stressed')}
      <fieldset className="cog-q cog-q-radio">
        <legend>Caffeine in the last 3 hours</legend>
        <label><input type="radio" name="caffeine" value="no" checked={v.caffeine_3h === 'no'} onChange={set('caffeine_3h')} /> No</label>
        <label><input type="radio" name="caffeine" value="yes" checked={v.caffeine_3h === 'yes'} onChange={set('caffeine_3h')} /> Yes</label>
      </fieldset>
      <button type="submit" className="btn-primary cog-btn" disabled={!complete}>CONTINUE</button>
    </form>
  );
}

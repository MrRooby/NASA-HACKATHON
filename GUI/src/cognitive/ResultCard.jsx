import React from 'react';
import { DISCLAIMER, PROTOCOLS } from './engine/protocols.js';
import { metricLines } from './session.js';

const ICON = { ok: '✓', caution: '!', alert: '⚠', no_data: 'i' };

/** Result of one test: status by colour AND text, key metrics, disclaimer. */
export default function ResultCard({ test, scored, assessment, saveState, hasNext, onNext, onRepeat, saveMessages = null }) {
  const saveText = {
    sent: 'Saved to MOTHER.',
    queued: 'Saved on this device. It will be sent when MOTHER is reachable.',
    rejected: 'MOTHER did not accept this session. It was not stored.',
    ...(saveMessages || {}),
  }[saveState] || '';
  return (
    <div className="cog-card cog-result" data-testid="result-card">
      <h2 className="cog-h2">{PROTOCOLS[test].label}</h2>
      <p className={`cog-status cog-status-${assessment.status}`} data-status={assessment.status}>
        <span className="cog-status-icon" aria-hidden="true">{ICON[assessment.status]}</span> {assessment.text}
      </p>
      <dl className="cog-dl">
        {metricLines(test, scored.metrics).map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
      </dl>
      <p className="cog-muted">{assessment.note}</p>
      {saveText && <p className="cog-muted" data-testid="save-state">{saveText}</p>}
      <p className="cog-disclaimer">{DISCLAIMER}</p>
      <div className="cog-actions">
        {assessment.repeat && onRepeat && <button type="button" className="btn-secondary cog-btn" onClick={onRepeat}>REPEAT TEST</button>}
        <button type="button" className="btn-primary cog-btn" onClick={onNext}>{hasNext ? 'NEXT TEST' : 'FINISH'}</button>
      </div>
    </div>
  );
}

import React from 'react';
import { Button, DataRow, Panel, StatusTag } from '../components/index.js';
import { DISCLAIMER, PROTOCOLS } from './engine/protocols.js';
import { metricLines } from './session.js';

const TONES = ['ok', 'caution', 'alert'];

/** Result of one test: status as [ OK ] / [ CAUT ] / [ ALRT ] / [ ---- ] AND text, key metrics, disclaimer. */
export default function ResultCard({ test, scored, assessment, saveState, hasNext, onNext, onRepeat, saveMessages = null }) {
  const saveText = {
    sent: 'Saved to MOTHER.',
    queued: 'Saved on this device. It will be sent when MOTHER is reachable.',
    rejected: 'MOTHER did not accept this session. It was not stored.',
    ...(saveMessages || {}),
  }[saveState] || '';
  return (
    <Panel className="cog-card cog-result" title={PROTOCOLS[test].label} tone={TONES.includes(assessment.status) ? assessment.status : 'default'} data-testid="result-card">
      <p className={`cog-status cog-status-${assessment.status}`} data-status={assessment.status}>
        <StatusTag status={assessment.status} /> {assessment.text}
      </p>
      <div className="cog-rows">
        {metricLines(test, scored.metrics).map(([k, v]) => <DataRow key={k} label={k} value={v} />)}
      </div>
      <p className="cog-muted">{assessment.note}</p>
      {saveText && <p className="cog-muted" data-testid="save-state">{saveText}</p>}
      <p className="cog-disclaimer">{DISCLAIMER}</p>
      <div className="cog-actions">
        {assessment.repeat && onRepeat && <Button className="cog-btn" onClick={onRepeat}>REPEAT TEST</Button>}
        <Button variant="primary" className="cog-btn" onClick={onNext}>{hasNext ? 'NEXT TEST' : 'FINISH'}</Button>
      </div>
    </Panel>
  );
}

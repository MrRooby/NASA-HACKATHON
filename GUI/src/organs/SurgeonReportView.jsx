import { useMemo, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelIcon } from '../pixel/index.js';
import { PagerControls, PixelFrame, StatusMark, useFitCount, usePager } from '../ui/index.js';
import { evaluateValue, queueSurgeonReport, thresholdConfig } from '../checkin/thresholdLogic.js';
import { buildProfileReport } from '../profile/surgeonReport.js';
import { latestMeasurement } from '../shared/measurements.js';
import { ORGAN_BY_ID } from './catalog.js';
import { knownStatus } from './rating.js';

// Flight-surgeon report of one person (asynchronous: queued until the next transmission window,
// Mars <-> Earth one-way delay is minutes). Built with the existing logic
// (profile/surgeonReport.js -> checkin/thresholdLogic.js buildSurgeonReport / queueSurgeonReport)
// from the person's latest own measurements and the organ cards on screen.

// Own measurement -> check-in indicator of thresholdLogic (id, config id).
const OWN = [
  { id: 'sbp', kind: 'bp', key: 'systolic', configId: 'bp_systolic' },
  { id: 'dbp', kind: 'bp', key: 'diastolic', configId: 'bp_diastolic' },
  { id: 'hr', kind: 'hr', key: 'bpm', configId: 'heart_rate_resting' },
  { id: 'glucose', kind: 'glucose', key: 'mgdl', configId: 'glucose_fasting' },
  { id: 'temperature', kind: 'temp', key: 'celsius', configId: 'body_temperature' },
  { id: 'spo2', kind: 'spo2', key: 'pct', configId: 'spo2' },
  { id: 'sleep', kind: 'sleep', key: 'hours', configId: 'sleep_hours' },
  { id: 'mood', kind: 'mood', key: 'score', configId: 'mood' },
  { id: 'exercise', kind: 'exercise', key: 'minutes', configId: 'exercise_minutes_daily' },
];

/** Check-in indicators from the person's latest own entries (only the ones measured). */
export function ownBiometrics(code) {
  return OWN.flatMap(item => {
    const value = latestMeasurement(code, item.kind)?.values?.[item.key];
    if (typeof value !== 'number') return [];
    const band = evaluateValue(item.configId, value);
    return [{ id: item.id, value, status: band.status, message: band.message || '', action: band.action || '', escalate: band.escalate === true }];
  });
}

const marsDelay = () => {
  const mars = (thresholdConfig.environments || []).find(env => env.id === 'mars_surface');
  const [lo, hi] = mars?.comm_delay_one_way_s || [180, 1320];
  return { lo: Math.round(lo / 60), hi: Math.round(hi / 60) };
};

export function SurgeonReportView({ profile, code, report, sol, mother, onClose }) {
  const t = useT();
  const [queued, setQueued] = useState(null);
  const findings = useMemo(
    () => (report?.organs || []).filter(card => card.status === 'caution' || card.status === 'alert')
      .sort((a, b) => (a.status === 'alert' ? -1 : 0) - (b.status === 'alert' ? -1 : 0)),
    [report],
  );
  const box = useRef(null);
  const fit = useFitCount(box, 56, { min: 1, reserve: 40, fallback: 3 });
  const pager = usePager(findings, fit);
  const delay = marsDelay();

  const send = () => {
    const biometrics = ownBiometrics(code);
    const built = buildProfileReport({
      profile: profile || { code, name: code },
      biometrics,
      mother,
      sol,
    });
    if (report && !built.mother) {
      built.organs = (report.organs || []).map(({ organ, status, headline, action }) => ({ organ, status, headline, action }));
      if (report.demo) built.demo = true;
    }
    const ok = queueSurgeonReport(built);
    setQueued({ ok, at: new Date().toISOString().slice(11, 16), indicators: biometrics.length });
  };

  return (
    <PixelFrame className="report-view" icon="satellite" title={t('person.reportTitle')} actions={(
      <button type="button" className="act-close" onClick={onClose} aria-label={t('organs.close')}><PixelIcon name="cross" size={20} /></button>
    )}>
      <p className="report-delay"><PixelIcon name="clock" size={24} /> {t('person.reportDelay', delay)}</p>
      <div className="report-findings" ref={box}>
        {findings.length === 0 ? (
          <p className="report-none"><PixelIcon name="ok" size={32} /> {t('person.reportNone')}</p>
        ) : (
          <>
            {pager.pageItems.map(card => (
              <div key={card.organ} className="report-item" data-status={card.status}>
                <PixelIcon name={ORGAN_BY_ID[card.organ]?.icon} size={32} status={card.status} />
                <span className="report-item-name">{t(`organs.name_${card.organ}`)}</span>
                <StatusMark status={knownStatus(card.status)} size="sm" />
                <span className="report-item-text" title={card.headline}>{card.headline}</span>
              </div>
            ))}
            <PagerControls page={pager.page} pageCount={pager.pageCount} onPrev={pager.prev} onNext={pager.next} label={t('person.reportTitle')} />
          </>
        )}
      </div>
      <div className="act-footer">
        <button type="button" className="act-save" onClick={send} data-testid="report-send">
          <PixelIcon name="satellite" size={24} /> {t('person.reportSend')}
        </button>
        {queued ? (
          <span className="act-saved" role="status" data-testid="report-queued">
            <PixelIcon name={queued.ok ? 'check' : 'cross'} size={20} /> {queued.ok ? t('person.reportQueued', { time: queued.at }) : t('person.reportFailed')}
          </span>
        ) : null}
      </div>
    </PixelFrame>
  );
}

export default SurgeonReportView;

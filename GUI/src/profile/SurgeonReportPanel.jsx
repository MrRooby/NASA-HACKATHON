import React, { useState } from 'react';
import { Button, StatusTag } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { listSurgeonReports, queueSurgeonReport } from '../data/crewStore.js';
import { buildProfileReport } from './surgeonReport.js';
import { useStoreList } from './useStoreList.js';

const utcStamp = iso => (typeof iso === 'string' && iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : null);

/** One big figure of the report summary. */
function Figure({ label, value, status, ...rest }) {
  return (
    <div className="pf-fig" data-status={status} {...rest}>
      <span className="pf-label">{label}</span>
      <span className="pf-fig-value">{value ?? '—'}</span>
      {status ? <StatusTag status={status} /> : null}
    </div>
  );
}

/**
 * FLIGHT SURGEON REPORT popup body: builds the asynchronous health summary and queues it through
 * crewStore (localStorage key `orbit-health-report`, as in the first GUI). Nothing is sent to
 * Earth yet (see GUI/TODO.md, section d).
 * props: profile (own profile), biometrics (assessed check-in readings), symptoms (from the
 *        committed check-in, or null), mother (useMother state), sol (current sol or null).
 */
export default function SurgeonReportPanel({ profile, biometrics, symptoms = null, mother, sol = null }) {
  const t = useT();
  const stored = useStoreList(() => listSurgeonReports(profile.code), [profile.code]);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState(null);

  const attention = biometrics.filter(item => item.status !== 'ok').length;
  const motherAttached = Boolean(mother?.online && mother.report?.subject?.code === profile.code);
  const last = stored.items[0] || null;

  const share = async () => {
    setFailure(null);
    try {
      await queueSurgeonReport(profile.code, buildProfileReport({ profile, biometrics, mother, sol, symptoms }));
      setSent(true);
      stored.reload();
    } catch (error) {
      setSent(false);
      setFailure(error?.message || String(error));
    }
  };

  return (
    <div className="pf-report">
      <p className="pf-lead">{t('profile.reportHint')}</p>
      <div className="pf-figs">
        <Figure label={t('profile.reportReadings')} value={biometrics.length} />
        <Figure label={t('profile.reportAttention')} value={attention} status={attention > 0 ? 'caution' : 'ok'} />
        <Figure label={t('profile.reportMother')} value={motherAttached ? t('profile.reportMotherAttached') : t('profile.reportMotherMissing')} />
        <Figure label={t('profile.reportLast')} value={utcStamp(last?.createdAt)} data-testid="report-last" />
      </div>

      <div className="pf-actions">
        <Button variant="primary" className="pf-big pf-share" onClick={share}>{sent ? t('profile.reportQueued') : t('profile.reportShare')}</Button>
        {sent ? (
          <p className="pf-state" role="status">
            <StatusTag status="ok" /> {t('profile.reportQueuedDetail')}
          </p>
        ) : null}
        {failure ? (
          <p className="pf-state text-alert" role="alert">
            <StatusTag status="alert" /> {t('profile.reportFailed')} {failure}
          </p>
        ) : null}
      </div>
    </div>
  );
}

import React from 'react';
import { DataRow, SegBar, StatusTag, cx } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { formatValue, words } from './format.js';
import './wearable.css';

export const LIMB_LABEL_KEYS = {
  left_arm: 'home.limbLeftArm',
  right_arm: 'home.limbRightArm',
  left_leg: 'home.limbLeftLeg',
  right_leg: 'home.limbRightLeg',
};

/**
 * One limb's wearable band: circulation (% of the other limbs), pulse, SpO2, perfusion
 * index, skin temperature, band state and battery. `data` is one entry of
 * limbsFromReport(report).limbs. The limb name is the astronaut's own left / right.
 * props: data, corner ('tl' | 'tr' | 'bl' | 'br', grid placement on the home screen), className.
 */
export default function LimbCard({ data, corner, className }) {
  const t = useT();
  const { limb, status, device } = data;
  const title = t(LIMB_LABEL_KEYS[limb] || limb);
  const problem = status === 'caution' || status === 'alert';
  const circulation = formatValue(data.circulationPct, 0);
  const battery = device?.battery_pct != null ? Math.round(device.battery_pct) : null;
  const deviceProblem = device && device.status !== 'ok';

  return (
    <article
      className={cx('limb-card', `limb-${status}`, corner && `limb-corner-${corner}`, className)}
      data-limb={limb}
      data-status={status}
      data-corner={corner}
      aria-label={title}
    >
      <header className="limb-head">
        <h3>{title}</h3>
        <StatusTag status={status} />
      </header>

      <div className="limb-body">
        <div className="limb-circ">
          <span className="label">{t('home.circulation')}</span>
          <span className="limb-circ-value" data-field="circulation">
            {circulation ?? '—'}<span className="limb-unit"> %</span>
          </span>
          <SegBar
            className="segbar-wide"
            value={data.circulationPct}
            max={100}
            status={status}
            segments={20}
            label={`${t('home.circulation')}: ${title}`}
            title={t('home.circulationUnit')}
          />
        </div>

        <DataRow data-field="hr" label={t('home.heartRate')} value={formatValue(data.hr, 0)} unit="bpm" />
        <DataRow data-field="spo2" label={t('home.spo2')} value={formatValue(data.spo2, 1)} unit="%" />
        <DataRow data-field="pi" label={t('home.perfusionIndex')} value={formatValue(data.perfusionIndex)} />
        <DataRow data-field="skin" label={t('home.skinTemp')} value={formatValue(data.skinTemp, 1)} unit="°C" />

        <div className={cx('limb-band', deviceProblem && `limb-band-${device.status}`)} data-field="band">
          <span className="label">{t('home.band')}</span>
          {device ? (
            <>
              <span className="limb-band-state">{words(device.state) || '—'}</span>
              <span className="limb-band-battery">
                <SegBar
                  value={battery}
                  max={100}
                  status={device.status}
                  segments={10}
                  label={`${t('home.battery')}: ${title}`}
                />
                <span className="limb-band-pct">{battery != null ? `${battery} %` : '—'}</span>
              </span>
            </>
          ) : <span className="limb-band-state dim">{t('home.bandNone')}</span>}
        </div>

        {problem && data.message ? <p className="limb-msg" data-field="message">{data.message}</p> : null}
        {deviceProblem && device.message ? <p className="limb-msg limb-msg-device" data-field="band-message">{device.message}</p> : null}
      </div>
    </article>
  );
}

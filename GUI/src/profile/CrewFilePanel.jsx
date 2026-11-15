import React from 'react';
import { Avatar, Badge, Button, Panel, StatusTag } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import { crewHealth, findLocation, localized, zoneName } from '../crew/crewStatus.js';

/** 'PL' -> 'PL · Poland' (name in the UI language; just the code when the runtime cannot name it). */
export function nationalityText(code, lang) {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames([lang], { type: 'region' }).of(code);
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

function Field({ label, children, wide = false }) {
  return (
    <div className={wide ? 'crew-file-field crew-file-field-wide' : 'crew-file-field'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * [ CREW FILE ]: who the person is (fictional profile), how they are (MOTHER) and where
 * they are (habitat occupancy).
 * props: profile, report (organ report of that person: live, or the demo one when offline; may be null),
 *        mother (useMother state), habitat (GET /api/habitat body or null), navigate.
 */
export default function CrewFilePanel({ profile, report, mother, habitat, navigate }) {
  const { t, lang } = useI18n();
  const health = crewHealth({ code: profile.code, report, overview: mother?.overview });
  const location = findLocation(habitat, profile.crewCode);
  const noRecord = health.source === 'none';
  const waiting = noRecord && mother?.online && !mother.reportError;

  return (
    <Panel
      className="profile-file"
      title={t('profile.fileTitle')}
      tone={health.status === 'alert' || health.status === 'caution' ? health.status : 'default'}
      meta={(
        <>
          <span>{profile.code}</span>
        </>
      )}
    >
      <div className="crew-file">
        <div className="crew-file-photo">
          <Avatar code={profile.code} size={128} title={t('profile.avatarOf', { name: profile.name })} />
        </div>

        <div className="crew-file-main">
          <h1 className="crew-file-name">{profile.name}</h1>
          <p className="crew-file-role">{localized(profile.role, lang)}</p>

          <dl className="crew-file-fields">
            <Field label={t('profile.fieldAge')}>{profile.age}</Field>
            <Field label={t('profile.fieldNationality')}>{nationalityText(profile.nationality, lang)}</Field>
            <Field label={t('profile.fieldHome')}>{zoneName(habitat, profile.homeZone) ?? '—'}</Field>
            <Field label={t('profile.fieldLocation')}>
              <span data-testid="profile-location">{location ? zoneName(habitat, location.code) : t('profile.locationUnknown')}</span>
            </Field>
            <Field label={t('profile.fieldEducation')} wide>{localized(profile.education, lang)}</Field>
            {profile.bio ? <Field label={t('profile.fieldBio')} wide>{localized(profile.bio, lang)}</Field> : null}
          </dl>
        </div>
      </div>

      <div className="crew-file-status" data-testid="profile-status" data-status={health.status}>
        <span className="label">{t('profile.fieldStatus')}</span>
        <StatusTag status={health.status} />
        <span className="crew-file-status-text">
          {noRecord
            ? (waiting ? t('common.loading') : t('profile.statusNone'))
            : (health.message || t('profile.statusNoMessage'))}
        </span>
        {health.sol != null ? <span className="label">{t('common.solN', { n: health.sol })}</span> : null}
        <span className="spacer" />
        <Button onClick={() => navigate('wearables')}>{t('profile.wearableData')}</Button>
      </div>
    </Panel>
  );
}

import React from 'react';
import { Avatar, StatusTag } from '../components/index.js';
import { useI18n } from '../i18n/index.js';
import NavIcon from '../navIcons.jsx';
import { getCrewPhoto } from '../data/crewPhotos.js';
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

/**
 * Head of the profile screen: photo (or pixel avatar), name, role, age · height · weight,
 * current location and the overall health status (MOTHER).
 * props: profile, report (organ report of that person: live or demo; may be null),
 *        mother (useMother state), habitat (GET /api/habitat body or null), actions (node, right side).
 */
export function CrewHeader({ profile, report, mother, habitat, actions = null }) {
  const { t, lang } = useI18n();
  const health = crewHealth({ code: profile.code, report, overview: mother?.overview });
  const location = findLocation(habitat, profile.crewCode);
  const noRecord = health.source === 'none';
  const waiting = noRecord && mother?.online && !mother.reportError;
  const photo = getCrewPhoto(profile.code);
  const [first, ...rest] = profile.name.split(' ');
  const body = [
    t('profile.ageN', { n: profile.age }),
    profile.heightCm ? `${profile.heightCm} cm` : null,
    profile.massKg ? `${profile.massKg} kg` : null,
  ].filter(Boolean).join(' · ');

  return (
    <header className="pf-head" data-tone={health.status}>
      <span className="pf-photo">
        {photo
          ? <img src={photo} alt={t('profile.photoOf', { name: profile.name })} draggable="false" />
          : <Avatar code={profile.code} size={96} title={t('profile.avatarOf', { name: profile.name })} />}
      </span>

      <div className="pf-who">
        <h1 className="pf-name">
          <span className="pf-name-first">{first}</span>{' '}
          <span className="pf-name-last">{rest.join(' ')}</span>
        </h1>
        <p className="pf-role"><span>{localized(profile.role, lang)}</span> · <span className="pf-code">{profile.code}</span></p>
        <p className="pf-body" data-testid="profile-body">{body}</p>
        <p className="pf-loc">
          <NavIcon name="base" className="pf-loc-icon" />
          <span data-testid="profile-location">{location ? zoneName(habitat, location.code) : t('profile.locationUnknown')}</span>
        </p>
      </div>

      <div className="pf-status" data-testid="profile-status" data-status={health.status}>
        <span className="pf-status-head">
          <span className="pf-status-label">{t('profile.fieldStatus')}</span>
          <StatusTag status={health.status} />
          {health.sol != null ? <span className="pf-status-sol">{t('common.solN', { n: health.sol })}</span> : null}
        </span>
        <span className="pf-status-text">
          {noRecord
            ? (waiting ? t('common.loading') : t('profile.statusNone'))
            : (health.message || t('profile.statusNoMessage'))}
        </span>
      </div>

      {actions ? <div className="pf-head-actions">{actions}</div> : null}
    </header>
  );
}

function Field({ label, children, wide = false, ...rest }) {
  return (
    <div className={wide ? 'pf-field pf-field-wide' : 'pf-field'} {...rest}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** PERSONAL DATA popup body: nationality, home module, location, education, crew note. */
export default function PersonalData({ profile, habitat }) {
  const { t, lang } = useI18n();
  const location = findLocation(habitat, profile.crewCode);
  return (
    <dl className="pf-fields">
      <Field label={t('profile.fieldAge')}>{profile.age}</Field>
      <Field label={t('profile.fieldBody')}>
        {profile.heightCm ? `${profile.heightCm} cm` : '—'} · {profile.massKg ? `${profile.massKg} kg` : '—'}
      </Field>
      <Field label={t('profile.fieldNationality')}>{nationalityText(profile.nationality, lang)}</Field>
      <Field label={t('profile.fieldCode')}>{profile.code}</Field>
      <Field label={t('profile.fieldHome')}>{zoneName(habitat, profile.homeZone) ?? '—'}</Field>
      <Field label={t('profile.fieldLocation')}>{location ? zoneName(habitat, location.code) : t('profile.locationUnknown')}</Field>
      <Field label={t('profile.fieldEducation')} wide>{localized(profile.education, lang)}</Field>
      {profile.bio ? <Field label={t('profile.fieldBio')} wide>{localized(profile.bio, lang)}</Field> : null}
    </dl>
  );
}

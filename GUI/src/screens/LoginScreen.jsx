import React, { useEffect, useState } from 'react';
import { version } from '../../package.json';
import { Avatar, Badge, ConnectionBadge, LangFlags } from '../components/index.js';
import { CREW_PROFILES, localize } from '../data/crewProfiles.js';
import { getCrewPhoto } from '../data/crewPhotos.js';
import { demoReport } from '../data/demoReports.js';
import { useI18n } from '../i18n/index.js';
import './login.css';

export const APP_VERSION = version;

/**
 * Latest sol known before login. useMother() already loads the report of its default subject
 * (HAB-C1) once online; offline / while connecting the terminal shows the built-in demo record,
 * exactly like the top bar after login.
 */
export function loginSol(mother) {
  return mother?.report?.as_of?.sol ?? (mother?.online ? undefined : demoReport(CREW_PROFILES[0].code)?.as_of?.sol);
}

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <time className="topbar-clock" dateTime={now.toISOString()}>{now.toISOString().slice(11, 19)} UTC</time>;
}

function CrewCard({ profile, lang, label, onLogin }) {
  const photo = getCrewPhoto(profile.code);
  return (
    <li className="login-cell">
      <button type="button" className="login-row login-card" data-code={profile.code} aria-label={label} onClick={() => onLogin(profile.code)}>
        <span className="login-photo">
          {photo
            ? <img src={photo} alt="" draggable="false" />
            : <Avatar code={profile.code} size={160} title={profile.name} className="login-avatar" />}
        </span>
        <span className="login-who">
          <span className="login-name">{profile.name}</span>
          <span className="login-role">{localize(profile.role, lang)}</span>
          <span className="login-body">{profile.heightCm} cm · {profile.massKg} kg</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Crew identification for a touch tablet: one big photo card per crew member (tap = log in).
 * Works offline: the crew list is local (fictional profiles).
 * props: mother (useMother() state: link badge and sol), onLogin(code).
 */
export default function LoginScreen({ mother, onLogin }) {
  const { t, lang } = useI18n();
  const sol = loginSol(mother);

  return (
    <div className="login">
      <header className="login-top">
        <h1 className="login-brand">
          {t('common.appName')} <span className="login-version">v{APP_VERSION}</span>
        </h1>
        <div className="login-status">
          <span className="topbar-row login-statusline">
            <span className="topbar-sol" data-testid="login-sol">{sol != null ? t('common.solN', { n: sol }) : t('common.solUnknown')}</span>
            <ConnectionBadge mode={mother?.mode} error={mother?.error} />
            <UtcClock />
          </span>
          <LangFlags />
        </div>
      </header>

      <p className="login-prompt">
        <span>&gt; {t('login.prompt')}<span className="cursor" /></span>
        <Badge kind="fictional" />
      </p>

      <div className="login-crewbox">
        <ul className="login-crew" aria-label={t('login.crewList')}>
          {CREW_PROFILES.map(profile => (
            <CrewCard
              key={profile.code}
              profile={profile}
              lang={lang}
              label={t('login.openFor', { name: profile.name })}
              onLogin={onLogin}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

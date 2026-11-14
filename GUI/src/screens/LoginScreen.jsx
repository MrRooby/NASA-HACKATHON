import React from 'react';
import { Avatar, Badge, Button, ConnectionBadge, Panel } from '../components/index.js';
import { CREW_PROFILES, localize } from '../data/crewProfiles.js';
import { LANGS, useI18n } from '../i18n/index.js';
import './login.css';

/**
 * Crew identification. Works offline: the crew list is local (fictional profiles).
 * props: mother (useMother() state, for the connection line), onLogin(code).
 */
export default function LoginScreen({ mother, onLogin }) {
  const { t, lang, setLang } = useI18n();
  const mode = mother?.mode === 'online' || mother?.mode === 'connecting' ? mother.mode : 'offline';
  const linkLine = { online: t('login.boot4Online'), connecting: t('login.boot4Connecting'), offline: t('login.boot4Offline') }[mode];

  return (
    <div className="login">
      <div className="login-boot">
        <h1 className="login-brand">{t('common.appName')} // {t('common.habitatCode')}</h1>
        <p>{t('login.boot1')}</p>
        <p>{t('login.boot2')}</p>
        <p>{t('login.boot3')}</p>
        <p className={`login-link login-link-${mode}`}>{linkLine}</p>
        <p>{t('login.boot5')}</p>
      </div>

      <Panel
        className="login-panel"
        title={t('login.title')}
        meta={<><Badge kind="fictional" /><ConnectionBadge mode={mother?.mode} error={mother?.error} /></>}
      >
        <p className="login-prompt">&gt; {t('login.prompt')}<span className="cursor" /></p>

        <ul className="login-crew" aria-label={t('login.crewList')}>
          {CREW_PROFILES.map(profile => (
            <li key={profile.code}>
              <button
                type="button"
                className="login-row"
                data-code={profile.code}
                aria-label={t('login.openFor', { name: profile.name })}
                onClick={() => onLogin(profile.code)}
              >
                <Avatar code={profile.code} size={56} title={profile.name} />
                <span className="login-who">
                  <span className="login-name">{profile.name}</span>
                  <span className="login-role">{localize(profile.role, lang)}</span>
                </span>
                <span className="login-ids">
                  <span className="login-code">{profile.code}</span>
                  <span className="login-callsign">{t('login.callsign')}: {profile.callsign}</span>
                </span>
                <span className="login-go" aria-hidden="true">[ {t('login.open')} ]</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="login-note">{t('login.fictionalNote')}</p>
        <p className="login-note">{t('login.offlineNote')}</p>
      </Panel>

      <div className="login-foot">
        <span className="row" role="group" aria-label={t('settings.langTitle')}>
          {LANGS.map(code => (
            <Button key={code} small active={lang === code} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code}
            </Button>
          ))}
        </span>
        <span>{t('common.disclaimer')}</span>
      </div>
    </div>
  );
}

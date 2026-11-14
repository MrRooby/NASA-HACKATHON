import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import AstronautViewer from './AstronautViewer.jsx';
import thresholdConfig from '../../config/thresholds.json';

const initialBiometrics = [
  { id: 'sbp', label: 'Blood pressure', full: 'Systolic blood pressure', configId: 'bp_systolic', value: 128, unit: 'mmHg', delta: +6, trend: [118,121,119,124,122,128] },
  { id: 'dbp', label: 'Diastolic pressure', full: 'Diastolic blood pressure', configId: 'bp_diastolic', value: 82, unit: 'mmHg', delta: +2, trend: [78,80,79,81,80,82] },
  { id: 'hr', label: 'Heart rate', full: 'Resting heart rate', configId: 'heart_rate_resting', value: 68, unit: 'bpm', delta: -1, trend: [70,68,71,69,67,68] },
  { id: 'glucose', label: 'Glucose', full: 'Fasting blood glucose', configId: 'glucose_fasting', value: 92, unit: 'mg/dL', delta: +2, trend: [88,90,89,93,90,92] },
  { id: 'temperature', label: 'Temperature', full: 'Body temperature (oral)', configId: 'body_temperature', value: 36.8, unit: '°C', delta: 0.1, trend: [36.6,36.7,36.7,36.8,36.7,36.8] },
  { id: 'sleep', label: 'Sleep', full: 'Sleep duration', configId: 'sleep_hours', value: 6.2, unit: 'h', delta: -0.6, trend: [7.4,6.8,6.5,6.1,5.9,6.2] },
  { id: 'mood', label: 'Mood', full: 'Mood self-rating', configId: 'mood', value: 4, unit: '/5', delta: 0, trend: [4,4,3,4,4,4] },
  { id: 'rad', label: 'Radiation', full: 'Cumulative career effective dose', configId: 'radiation_career_mSv', value: 252, unit: 'mSv', delta: +1, trend: [239,242,244,247,250,252] },
];

const thresholdById = Object.fromEntries(thresholdConfig.indicators.map(indicator => [indicator.id, indicator]));

function evaluateValue(configId, value) {
  const indicator = thresholdById[configId];
  if (!indicator || value === '' || value == null) return { status: 'ok', message: '', action: '' };
  const numericValue = Number(value);
  const band = indicator.bands?.find(candidate =>
    (candidate.min == null || numericValue >= candidate.min) &&
    (candidate.max == null || numericValue < candidate.max)
  );
  return band || { status: 'caution', message: 'Outside configured range.', action: 'Re-measure and review with the flight surgeon.' };
}

function enrichBiometric(biometric) {
  const assessment = evaluateValue(biometric.configId, biometric.value);
  const indicator = thresholdById[biometric.configId];
  const trend = biometric.trend.length >= 30
    ? biometric.trend
    : Array.from({ length: 30 }, (_, index) => {
      const sourceIndex = Math.floor(index * (biometric.trend.length - 1) / 29);
      const wave = ((index * 17 + biometric.id.length) % 5 - 2) * 0.08;
      return Number((biometric.trend[sourceIndex] + wave).toFixed(2));
    });
  return {
    ...biometric,
    trend,
    status: assessment.status,
    message: assessment.message,
    action: assessment.action,
    ref: indicator?.bands?.find(band => band.status === 'ok')?.min != null
      ? `${indicator.bands.find(band => band.status === 'ok').min}–${indicator.bands.find(band => band.status === 'ok').max ?? '∞'}`
      : 'See guidance',
    escalate: assessment.escalate === true,
    basis: assessment.basis,
    context: indicator?.spaceflight_context,
  };
}

const systemProtocols = [
  { id: 'CVS', label: 'CARDIOVASCULAR',  status: 'caution', note: 'SBP +6 mmHg above personal baseline. Recheck required.' },
  { id: 'SLP', label: 'SLEEP/RECOVERY', status: 'caution', note: 'Sleep avg below 8 h target × 3 consecutive days.' },
  { id: 'PSY', label: 'BEHAVIORAL',     status: 'ok',      note: 'Self-assessment scores within nominal range.' },
  { id: 'RAD', label: 'RADIATION',      status: 'ok',      note: 'Career dose at 42 % TLD. ALARA compliance active.' },
  { id: 'GI',  label: 'GI / NUTRITION', status: 'ok',      note: 'No symptoms logged. Caloric target met.' },
];

function protocolStatus(biometrics, ids) {
  const statuses = biometrics.filter(item => ids.includes(item.id)).map(item => item.status);
  if (statuses.includes('alert')) return 'alert';
  if (statuses.includes('caution')) return 'caution';
  return 'ok';
}

function buildProtocols(biometrics) {
  const statuses = {
    CVS: protocolStatus(biometrics, ['sbp', 'dbp', 'hr']),
    SLP: protocolStatus(biometrics, ['sleep']),
    PSY: protocolStatus(biometrics, ['mood']),
    RAD: protocolStatus(biometrics, ['rad']),
    GI: protocolStatus(biometrics, ['glucose']),
  };
  return systemProtocols.map(protocol => ({ ...protocol, status: statuses[protocol.id] }));
}

const eventLog = [
  { ts: '14:32:11', code: 'SYNC_OK',       msg: 'Telemetry commit to local datastore.' },
  { ts: '09:15:04', code: 'CHECKIN_OK',    msg: 'Daily biometric intake FD-142 recorded.' },
  { ts: '09:15:02', code: 'SBP_CAUTION',   msg: 'Systolic pressure exceeded personal baseline by 6 mmHg.' },
  { ts: '08:40:17', code: 'SLEEP_CAUTION', msg: 'Sleep duration below mission target (6.2 h vs 8.0 h).' },
  { ts: '00:03:28', code: 'SESSION_START',  msg: 'Local session initialized. Offline-first mode active.' },
];

const STATUS = { ok: 'NOM', caution: 'CAU', alert: 'ALT' };

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

function MET({ now }) {
  const epoch = new Date('2026-07-26T00:00:00Z');
  const diff = Math.floor((now - epoch) / 1000);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600).toString().padStart(2,'0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2,'0');
  const s = (diff % 60).toString().padStart(2,'0');
  return <>{d}:{h}:{m}:{s}</>;
}

function Sparkline({ values, status }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 28 - ((v - min) / (max - min || 1)) * 24;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className={`spark ${status}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} />
      <circle cx={(values.length-1)/(values.length-1)*100} cy={28-((values[values.length-1]-min)/(max-min||1))*24} r="2.5" />
    </svg>
  );
}

function StatusTag({ status }) {
  return <span className={`stag stag-${status}`}>[{STATUS[status]}]</span>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [biometrics, setBiometrics] = useState(() => initialBiometrics.map(enrichBiometric));
  const [mission, setMission] = useState('ISS-EXP74');
  const [toast, setToast] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const now = useClock();

  const cauCount = biometrics.filter(b => b.status !== 'ok').length;
  const protocols = buildProtocols(biometrics);

  const updateBio = (id, value) => {
    setBiometrics(cur => cur.map(b => b.id === id
      ? enrichBiometric({ ...b, value: value === '' ? '' : Number(value) })
      : b
    ));
  };

  const submitCheckIn = (e) => {
    e.preventDefault();
    setToast('[OK] DATA COMMITTED TO LOCAL STORE // FD-142 INTAKE COMPLETE');
    setActivePage('dashboard');
    setTimeout(() => setToast(''), 4000);
  };

  const queueReport = () => {
    const report = {
      createdAt: new Date().toISOString(),
      mission,
      flightDay: 142,
      indicators: biometrics.map(({ id, value, status, message, action, escalate }) => ({
        id, value, status, message, action, escalate,
      })),
      disclaimer: 'Demonstration data only. Not for clinical use.',
    };
    window.localStorage.setItem('orbit-health-report', JSON.stringify(report));
    setReportSent(true);
    setToast('[QUEUED] HEALTH SUMMARY SAVED LOCALLY // ASYNC TRANSMISSION PENDING');
    setTimeout(() => setToast(''), 4000);
  };

  const navItems = [
    ['dashboard', 'Overview', '01'],
    ['checkin', 'Daily check-in', '02'],
    ['trends', 'Health trends', '03'],
    ['protocols', 'Guidance', '04'],
  ];

  if (!authenticated) return <AuthScreen onComplete={() => setAuthenticated(true)} />;

  return (
    <div className="shell">
      {/* ── TOP TELEMETRY BAR ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-sig">ORBIT HEALTH</span>
          <span className="brand-ver">CREW WELLNESS</span>
        </div>

        <div className="topbar-fields">
          <div className="tfield">
            <span className="tfield-key">MISSION</span>
            <select className="tfield-val tfield-select" value={mission} onChange={e => setMission(e.target.value)}>
              <option value="ISS-EXP74">ISS-EXP74</option>
              <option value="ARTEMIS-II">ARTEMIS-II</option>
              <option value="MARS-DEMO">MARS-DEMO</option>
            </select>
          </div>
          <div className="tfield">
            <span className="tfield-key">CREW_ID</span>
            <span className="tfield-val">JC-74</span>
          </div>
          <div className="tfield">
            <span className="tfield-key">FD</span>
            <span className="tfield-val">142</span>
          </div>
          <div className="tfield">
            <span className="tfield-key">MET</span>
            <span className="tfield-val tfield-clock"><MET now={now} /></span>
          </div>
          <div className="tfield">
            <span className="tfield-key">UTC</span>
            <span className="tfield-val tfield-clock">{now.toISOString().slice(11,19)}</span>
          </div>
          <div className="tfield">
            <span className="tfield-key">SYS</span>
            <span className={`tfield-val stag stag-${cauCount > 0 ? 'caution' : 'ok'}`}>
              [{cauCount > 0 ? `${cauCount} CAU` : 'NOMINAL'}]
            </span>
          </div>
          <div className="tfield">
            <span className="tfield-key">LINK</span>
            <span className="tfield-val link-local">● LOCAL</span>
          </div>
        </div>

        <button className="topbar-logout" onClick={() => setAuthenticated(false)}>SIGN OUT</button>
      </header>

      <div className="layout">
        {/* ── LEFT NAV ── */}
        <nav className="sidenav">
          <div className="sidenav-label">YOUR HEALTH</div>
          {navItems.map(([id, label, code]) => (
            <button
              key={id}
              className={`snav-btn${activePage === id ? ' active' : ''}`}
              onClick={() => setActivePage(id)}
            >
              <span className="snav-code">{code}</span>
              <span className="snav-label">{label}</span>
              {id === 'dashboard' && cauCount > 0 && <span className="snav-badge">{cauCount}</span>}
            </button>
          ))}

          <div className="sidenav-divider" />
          <div className="sidenav-label">CREW</div>
          <div className="crew-block">
            <div className="crew-row"><span className="crew-key">ID</span><span className="crew-val">JC-74</span></div>
            <div className="crew-row"><span className="crew-key">NAME</span><span className="crew-val">J. CZUBA</span></div>
            <div className="crew-row"><span className="crew-key">ROLE</span><span className="crew-val">MS</span></div>
            <div className="crew-row"><span className="crew-key">LAST LOG</span><span className="crew-val">09:15 UTC</span></div>
          </div>

          <div className="sidenav-divider" />
          <div className="sidenav-label">AT A GLANCE</div>
          <div className="status-matrix">
            {protocols.map(s => (
              <div key={s.id} className={`sm-row sm-${s.status}`}>
                <span className="sm-led" />
                <span className="sm-id">{s.id}</span>
                <span className="sm-status">{STATUS[s.status]}</span>
              </div>
            ))}
          </div>
        </nav>

        {/* ── MAIN ── */}
        <main className="main">
          {activePage === 'dashboard' && (
            <Dashboard
              biometrics={biometrics}
              cauCount={cauCount}
              mission={mission}
              onCheckIn={() => setActivePage('checkin')}
              onReport={queueReport}
              reportSent={reportSent}
            />
          )}
          {activePage === 'checkin' && <CheckIn onSubmit={submitCheckIn} onUpdate={updateBio} biometrics={biometrics} />}
          {activePage === 'trends'   && <Telemetry biometrics={biometrics} />}
          {activePage === 'protocols' && <Protocols protocols={protocols} />}

          {toast && <div className="toast-bar"><span className="toast-caret">&gt;_</span>{toast}</div>}
        </main>
      </div>

      <footer className="sysbar">
        <span>Demo data · calibrated to NASA research</span>
        <span>Orbit Health · NASA Space Apps 2026</span>
        <span>For demonstration only</span>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   AUTH SCREEN
══════════════════════════════════════════════════ */
function AuthScreen({ onComplete }) {
  const now = useClock();
  const [form, setForm] = useState({ email: 'astronaut@nasa.demo', password: 'mission-control' });
  const [showPw, setShowPw] = useState(false);
  const update = (k, v) => setForm(c => ({ ...c, [k]: v }));

  return (
    <div className="auth-shell">
      <div className="auth-scanlines" aria-hidden />

      <header className="auth-topbar">
        <span className="brand-sig">ORBIT HEALTH</span>
        <div className="auth-topbar-fields">
          <span>UTC {now.toISOString().slice(11,19)}</span>
          <span className="link-local">● OFFLINE MODE</span>
          <span>BUILD 0.1-DEMO</span>
        </div>
      </header>

      <div className="auth-layout">
        {/* LEFT: system info */}
        <div className="auth-info">
          <div className="auth-info-block">
            <div className="eyebrow">SYSTEM IDENTIFICATION</div>
            <h1 className="auth-title-h1">ORBIT<br/>HEALTH<br/>MONITOR</h1>
            <div className="auth-spec-table">
              <div className="spec-row"><span>DESIGNATION</span><span>CREW HEALTH OPS v0.1</span></div>
              <div className="spec-row"><span>PROGRAM</span><span>NASA SPACE APPS 2026</span></div>
              <div className="spec-row"><span>MODE</span><span>OFFLINE / LOCAL STORE</span></div>
              <div className="spec-row"><span>ENCRYPTION</span><span>AES-256-GCM [DEMO]</span></div>
              <div className="spec-row"><span>DATA LINK</span><span>ASYNC / 14 MIN DELAY</span></div>
            </div>
          </div>

          <div className="auth-info-diagram">
            <div className="orbit-container">
              <div className="orbit-track t1">
                <div className="orbit-dot d1" />
              </div>
              <div className="orbit-track t2">
                <div className="orbit-dot d2" />
              </div>
              <div className="orbit-core">HM</div>
            </div>
            <div className="orbit-labels">
              <div className="ol-item">◈ SELF-ASSESS</div>
              <div className="ol-item">◈ STAY READY</div>
              <div className="ol-item">◈ CONNECT HOME</div>
            </div>
          </div>
        </div>

        {/* RIGHT: login */}
        <div className="auth-panel">
          <div className="auth-panel-header">
            <span className="eyebrow">WELCOME BACK</span>
            <span className="auth-secure-tag">⌁ LOCAL SESSION</span>
          </div>

          <form className="auth-form" onSubmit={e => { e.preventDefault(); onComplete(); }}>
            <div className="auth-field-group">
              <label className="auth-label">CREW EMAIL</label>
              <div className="auth-input-row">
                <span className="auth-input-prefix">@</span>
                <input
                  type="email"
                  className="auth-input"
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label className="auth-label">PASSCODE</label>
              <div className="auth-input-row">
                <span className="auth-input-prefix">▪</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  className="auth-input"
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button type="button" className="auth-toggle-pw" onClick={() => setShowPw(c => !c)}>
                  {showPw ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit">
              SIGN IN TO YOUR HEALTH SPACE
            </button>
          </form>

          <div className="auth-divider"><span>OR</span></div>

          <button className="auth-demo-btn" onClick={onComplete}>
            Continue with demo profile
          </button>

          <div className="auth-disclaimer">
            <span className="auth-disc-code">[NOTICE]</span>
            Demo software only. Does not diagnose illness or replace a certified flight surgeon.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════ */
function HumanBody({ biometrics }) {
  const [selected, setSelected] = useState('heart');
  const statusFor = ids => {
    const statuses = biometrics.filter(item => ids.includes(item.id)).map(item => item.status);
    return statuses.includes('alert') ? 'alert' : statuses.includes('caution') ? 'caution' : 'ok';
  };
  const regions = {
    brain: { label: 'Mind & sleep', detail: 'Mood and sleep help track fatigue and behavioral health.', ids: ['mood', 'sleep'] },
    heart: { label: 'Heart & circulation', detail: 'Blood pressure and resting heart rate are compared with configured flight thresholds.', ids: ['sbp', 'dbp', 'hr'] },
    metabolism: { label: 'Metabolism', detail: 'Fasting glucose is a simple signal for energy and metabolic changes.', ids: ['glucose'] },
    temperature: { label: 'Temperature', detail: 'Body temperature can indicate illness or a change from personal baseline.', ids: ['temperature'] },
    radiation: { label: 'Radiation exposure', detail: 'Cumulative dose is tracked as a mission resource, not a diagnosis.', ids: ['rad'] },
  };
  const current = regions[selected];
  return (
    <section className="data-panel body-panel">
      <div className="panel-header"><span className="panel-title">Your body today</span><span className="panel-meta">Select a region</span></div>
      <div className="body-content">
        <div className="body-figure">
          <div className="body-aura" />
          <svg viewBox="0 0 180 360" role="img" aria-label="Interactive human body map">
            <circle className={`body-head body-zone-${statusFor(['mood', 'sleep'])}`} cx="90" cy="38" r="24" />
            <path className="body-neck" d="M78 58h24v24H78z" />
            <path className={`body-torso body-zone-${statusFor(['sbp', 'dbp', 'hr', 'glucose', 'temperature'])}`} d="M57 77 Q90 63 123 77 L137 176 Q116 194 90 188 Q64 194 43 176 Z" />
            <path className="body-limb" d="M58 84 L28 166 L42 171 L72 111 M122 84 L152 166 L138 171 L108 111" />
            <path className="body-limb" d="M70 181 L62 294 L78 294 L90 204 L102 294 L118 294 L110 181" />
            {[
              ['brain', 'hotspot-brain', ['mood', 'sleep']],
              ['heart', 'hotspot-heart', ['sbp', 'dbp', 'hr']],
              ['metabolism', 'hotspot-metabolism', ['glucose']],
              ['temperature', 'hotspot-temperature', ['temperature']],
              ['radiation', 'hotspot-radiation', ['rad']],
            ].map(([id, className, ids]) => (
              <circle key={id} className={`body-hotspot ${className} body-zone-${statusFor(ids)}${selected === id ? ' selected' : ''}`} onClick={() => setSelected(id)} role="button" tabIndex="0" onKeyDown={event => event.key === 'Enter' && setSelected(id)} aria-label={regions[id].label} />
            ))}
          </svg>
        </div>
        <div className="body-copy">
          <div className="body-status"><span className={`body-status-dot body-zone-${statusFor(current.ids)}`} /><span>{current.label}</span></div>
          <p>{current.detail}</p>
          <span className="body-hint">Educational information, not a diagnosis.</span>
        </div>
      </div>
      <div className="model-panel">
        <div className="model-panel-header">
          <span className="panel-title">[ 3D CREW MODEL ]</span>
          <span className="panel-meta">Interactive visualization</span>
        </div>
        <AstronautViewer />
      </div>
    </section>
  );
}

function Dashboard({ biometrics, cauCount, mission, onCheckIn, onReport, reportSent }) {
  const alerts = biometrics.filter(b => b.status !== 'ok');
  return (
    <div className="page-grid">
      {/* PAGE HEADER */}
      <div className="page-header" style={{gridColumn:'1/-1'}}>
        <div>
          <div className="eyebrow">TODAY · FLIGHT DAY 142 · {mission}</div>
          <h1 className="page-h1">Your health overview</h1>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={onCheckIn}>Start daily check-in</button>
          <button className={`btn-secondary${reportSent ? ' sent' : ''}`} onClick={onReport}>
            {reportSent ? 'Report queued' : 'Share with flight surgeon'}
          </button>
        </div>
      </div>

      {/* SYSTEM ALERT BANNER */}
      {cauCount > 0 && (
        <div className="alert-banner" style={{gridColumn:'1/-1'}}>
          <span className="alert-banner-code">[CAUTION]</span>
          <span>{cauCount} subsystem(s) require attention — review recommended actions below.</span>
          <span className="alert-banner-time">LAST SYNC 14:32 UTC</span>
        </div>
      )}

      <HumanBody biometrics={biometrics} />

      {/* BIOMETRIC TABLE */}
      <section className="data-panel bio-table-panel">
        <div className="panel-header">
          <span className="panel-title">[ BIOMETRIC TELEMETRY ]</span>
          <span className="panel-meta">FD-142 · 14:32 UTC</span>
        </div>
        <table className="bio-table">
          <thead>
            <tr>
              <th>PARAM</th>
              <th>FULL NAME</th>
              <th className="num">VALUE</th>
              <th className="num">UNIT</th>
              <th className="num">REF RANGE</th>
              <th className="num">Δ</th>
              <th>STATUS</th>
              <th>7-DAY TREND</th>
            </tr>
          </thead>
          <tbody>
            {biometrics.map(b => (
              <tr key={b.id} className={`bio-row bio-row-${b.status}`}>
                <td className="bio-id">{b.label}</td>
                <td className="bio-full">{b.full}</td>
                <td className="num bio-val">{b.value}</td>
                <td className="num bio-unit">{b.unit}</td>
                <td className="num bio-ref">{b.ref}</td>
                <td className={`num bio-delta ${b.delta > 0 ? 'pos' : b.delta < 0 ? 'neg' : ''}`}>
                  {b.delta > 0 ? '+' : ''}{b.delta}
                </td>
                <td><StatusTag status={b.status} /></td>
                <td className="bio-spark"><Sparkline values={b.trend} status={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* RECOMMENDED ACTIONS */}
      <section className="data-panel actions-panel">
        <div className="panel-header">
          <span className="panel-title">[ RECOMMENDED ACTIONS ]</span>
          <span className="panel-meta">{alerts.length} OPEN</span>
        </div>
        {alerts.length === 0
          ? <div className="no-actions">[ALL SYSTEMS NOMINAL — NO ACTIONS REQUIRED]</div>
          : alerts.map((b, i) => (
            <div className="action-entry" key={b.id}>
              <div className="ae-top">
                <span className="ae-index">A{(i+1).toString().padStart(2,'0')}</span>
                <span className={`ae-sys stag stag-${b.status}`}>{b.label}</span>
                <span className="ae-protocol">NASA PROTOCOL</span>
              </div>
              <div className="ae-desc">
                {b.action || 'Re-measure and review the result with the flight surgeon.'}
              </div>
              <div className="ae-ref">
                {b.basis === 'team_assumption' ? 'TEAM ASSUMPTION' : 'CONFIGURED REFERENCE'} ·
                {b.escalate ? ' ESCALATION RECOMMENDED' : ' REVIEW AFTER RECHECK'}
              </div>
            </div>
          ))
        }
      </section>

      {/* EVENT LOG */}
      <section className="data-panel log-panel">
        <div className="panel-header">
          <span className="panel-title">[ SYSTEM EVENT LOG ]</span>
          <span className="panel-meta">FD-142</span>
        </div>
        <div className="event-log">
          {eventLog.map((ev, i) => (
            <div className="log-entry" key={i}>
              <span className="log-ts">{ev.ts}</span>
              <span className={`log-code ${ev.code.includes('CAUTION') ? 'caution' : ev.code.includes('OK') ? 'ok' : ''}`}>
                {ev.code}
              </span>
              <span className="log-msg">{ev.msg}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="data-note" style={{gridColumn:'1/-1'}}>
        [i] CHECK-IN DATA STORED LOCALLY ON THIS DEVICE. REPORTS QUEUE FOR ASYNC TRANSMISSION TO FLIGHT SURGEON.
        DEMO DATA ONLY — NOT FOR CLINICAL OR DIAGNOSTIC USE.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CHECK-IN / DATA INTAKE
══════════════════════════════════════════════════ */
function CheckIn({ onSubmit, onUpdate, biometrics }) {
  const [vals, setVals] = useState({
    systolic: 128, diastolic: 82, hr: 68, glucose: 92, temperature: 36.8,
    sleep: 6.2, mood: 4, symptoms: 'NONE'
  });
  const set = (k, v) => {
    setVals(c => ({ ...c, [k]: v }));
    const metricId = {
      systolic: 'sbp',
      diastolic: 'dbp',
      hr: 'hr',
      glucose: 'glucose',
      temperature: 'temperature',
      sleep: 'sleep',
      mood: 'mood',
    }[k];
    if (metricId) onUpdate(metricId, v);
  };

  const fields = [
    { section: '01 · CARDIOVASCULAR', tag: 'DEVICE INPUT', items: [
      { key: 'systolic',  label: 'SYSTOLIC PRESSURE',  unit: 'mmHg', type: 'number' },
      { key: 'diastolic', label: 'DIASTOLIC PRESSURE', unit: 'mmHg', type: 'number' },
      { key: 'hr',        label: 'RESTING HEART RATE', unit: 'bpm',  type: 'number' },
      { key: 'glucose', label: 'FASTING GLUCOSE', unit: 'mg/dL', type: 'number' },
      { key: 'temperature', label: 'BODY TEMPERATURE', unit: '°C', type: 'number', step: 0.1 },
    ]},
    { section: '02 · RECOVERY & PSYCH', tag: 'SELF REPORT', items: [
      { key: 'sleep', label: 'SLEEP DURATION', unit: 'h', type: 'number', step: 0.1 },
    ]},
  ];

  return (
    <div className="page-grid">
      <div className="page-header" style={{gridColumn:'1/-1'}}>
        <div>
          <div className="eyebrow">DAILY BIOMETRIC INTAKE · FD-142 · EST. 4 MIN</div>
          <h1 className="page-h1">LOG ENTRY / DATA INTAKE</h1>
        </div>
        <div className="checkin-status-pill">
          <span className="csp-label">SESSION</span>
          <span className="csp-val">ACTIVE</span>
        </div>
      </div>

      <form className="intake-form" style={{gridColumn:'1/-1'}} onSubmit={onSubmit}>
        {fields.map(section => (
          <div className="data-panel intake-section" key={section.section}>
            <div className="panel-header">
              <span className="panel-title">[ {section.section} ]</span>
              <span className="panel-meta source-tag">{section.tag}</span>
            </div>
            <div className="intake-grid">
              {section.items.map(f => (
                <div className="intake-field" key={f.key}>
                  <label className="intake-label">{f.label}</label>
                  <div className="intake-input-row">
                    <input
                      className="intake-input"
                      type={f.type}
                      step={f.step}
                      value={vals[f.key]}
                      onChange={e => set(f.key, e.target.value)}
                    />
                    <span className="intake-unit">{f.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Mood */}
        <div className="data-panel intake-section">
          <div className="panel-header">
            <span className="panel-title">[ 02 · PSYCHOLOGICAL SELF-SCORE ]</span>
            <span className="panel-meta source-tag">SELF REPORT</span>
          </div>
          <div className="intake-grid">
            <div className="intake-field">
              <label className="intake-label">PSYCH SELF-SCORE (1–5)</label>
              <div className="mood-row">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`mood-btn${vals.mood === n ? ' sel' : ''}`}
                    onClick={() => set('mood', n)}
                  >{n}</button>
                ))}
              </div>
              <span className="intake-hint">1 = SEVERE DISTRESS · 5 = FULLY NOMINAL</span>
            </div>
            <div className="intake-field">
              <label className="intake-label">SYMPTOM LOG</label>
              <select
                className="intake-select"
                value={vals.symptoms}
                onChange={e => set('symptoms', e.target.value)}
              >
                <option value="NONE">NONE</option>
                <option value="HEADACHE">HEADACHE</option>
                <option value="DIZZINESS">DIZZINESS</option>
                <option value="FATIGUE">FATIGUE</option>
                <option value="OTHER">OTHER / ADD NOTE</option>
              </select>
            </div>
          </div>
        </div>

        <div className="intake-footer">
          <span className="intake-autosave">⌁ AUTO-SAVE ACTIVE · LOCAL STORE</span>
          <div>
            <button type="button" className="btn-secondary">SAVE DRAFT</button>
            <button type="submit" className="btn-primary">COMMIT LOG ENTRY →</button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TELEMETRY / TRENDS
══════════════════════════════════════════════════ */
function Telemetry({ biometrics }) {
  const [range, setRange] = useState('7D');

  return (
    <div className="page-grid">
      <div className="page-header" style={{gridColumn:'1/-1'}}>
        <div>
          <div className="eyebrow">PERSONAL BASELINE ANALYSIS · FD-142</div>
          <h1 className="page-h1">TELEMETRY TRENDS</h1>
        </div>
        <div className="range-toggle">
          {['7D','30D','MIS'].map(r => (
            <button key={r} className={range === r ? 'sel' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="telemetry-grid" style={{gridColumn:'1/-1'}}>
        {biometrics.map(b => (
          <div className="data-panel tel-card" key={b.id}>
            <div className="panel-header">
              <span className="panel-title">[ {b.label} · {b.full} ]</span>
              <StatusTag status={b.status} />
            </div>
            <div className="tel-chart">
              <Sparkline values={b.trend} status={b.status} />
              <div className="tel-chart-labels">
                <span>{range === '7D' ? '7D AGO' : range === '30D' ? '30D AGO' : 'MIS START'}</span>
                <span>NOW</span>
              </div>
            </div>
            <div className="tel-row">
              <div className="tel-stat">
                <span className="tel-key">CURRENT</span>
                <span className="tel-val">{b.value} <small>{b.unit}</small></span>
              </div>
              <div className="tel-stat">
                <span className="tel-key">REF RANGE</span>
                <span className="tel-val">{b.ref}</span>
              </div>
              <div className="tel-stat">
                <span className="tel-key">Δ 24H</span>
                <span className={`tel-val ${b.delta > 0 ? 'pos' : b.delta < 0 ? 'neg' : ''}`}>
                  {b.delta > 0 ? '+' : ''}{b.delta} {b.unit}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="data-note" style={{gridColumn:'1/-1'}}>
        [i] TRENDS COMPARE SIMULATED MISSION DATA TO PERSONAL BASELINE PROFILE.
        THRESHOLDS ARE DEMONSTRATIVE — CONSULT QUALIFIED FLIGHT SURGEON FOR CLINICAL INTERPRETATION.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PROTOCOLS
══════════════════════════════════════════════════ */
const hazards = [
  { id: 'RAD', name: 'RADIATION',               ref: 'NASA-STD-3001 §6.1' },
  { id: 'ISL', name: 'ISOLATION & CONFINEMENT', ref: 'NASA-STD-3001 §6.6' },
  { id: 'DST', name: 'DISTANCE FROM EARTH',     ref: 'NASA-STD-3001 §6.4' },
  { id: 'GRV', name: 'ALTERED GRAVITY',         ref: 'NASA-STD-3001 §6.2' },
  { id: 'ENV', name: 'CLOSED ENVIRONMENT',      ref: 'NASA-STD-3001 §6.5' },
];

function Protocols({ protocols }) {
  return (
    <div className="page-grid">
      <div className="page-header" style={{gridColumn:'1/-1'}}>
        <div>
          <div className="eyebrow">MISSION HEALTH PROTOCOLS · HRP-47072</div>
          <h1 className="page-h1">HEALTH PROTOCOLS & GUIDANCE</h1>
        </div>
        <button className="btn-secondary">↓ EXPORT GUIDE</button>
      </div>

      <section className="data-panel proto-table-panel" style={{gridColumn:'1/-1'}}>
        <div className="panel-header">
          <span className="panel-title">[ SYSTEM PROTOCOL MATRIX ]</span>
          <span className="panel-meta">REF: HRP-47072</span>
        </div>
        <table className="proto-table">
          <thead>
            <tr>
              <th>SYS ID</th>
              <th>SUBSYSTEM</th>
              <th>STATUS</th>
              <th>FINDING</th>
              <th>RECOMMENDED ACTION</th>
              <th>REF</th>
            </tr>
          </thead>
          <tbody>
            {protocols.map(p => (
              <tr key={p.id} className={`proto-row proto-${p.status}`}>
                <td className="proto-id">{p.id}</td>
                <td className="proto-sys">{p.label}</td>
                <td><StatusTag status={p.status} /></td>
                <td className="proto-note">{p.note}</td>
                <td className="proto-action">
                  {p.id === 'CVS' ? 'Rest 5 min, re-measure with arm cuff.' :
                   p.id === 'SLP' ? 'Schedule 8 h recovery window before next critical task.' :
                   p.id === 'RAD' ? 'Continue ALARA practices. No intervention required.' :
                   'No intervention required.'}
                </td>
                <td className="proto-ref">
                  {p.id === 'CVS' ? 'HRP-47072 §3.1' :
                   p.id === 'SLP' ? 'HRP-47072 §4.3' :
                   p.id === 'RAD' ? 'NASA-STD-3001 §6.1' :
                   'HRP-47072 §6.0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="data-panel hazard-panel">
        <div className="panel-header">
          <span className="panel-title">[ SPACEFLIGHT HAZARD REGISTRY ]</span>
          <span className="panel-meta">NASA-STD-3001</span>
        </div>
        <div className="eyebrow" style={{marginBottom:'14px'}}>
          FIVE HAZARDS OF HUMAN SPACEFLIGHT — FOUNDATIONAL MONITORING FRAMEWORK
        </div>
        <table className="hazard-table">
          <thead>
            <tr><th>#</th><th>HAZARD ID</th><th>DESIGNATION</th><th>STANDARD REFERENCE</th></tr>
          </thead>
          <tbody>
            {hazards.map((h, i) => (
              <tr key={h.id}>
                <td className="haz-num">H{(i+1).toString().padStart(2,'0')}</td>
                <td className="haz-id">{h.id}</td>
                <td className="haz-name">{h.name}</td>
                <td className="haz-ref">{h.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

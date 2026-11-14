import { useState } from 'react';
import { BUILTIN_THEMES, applyTheme } from '../theme/index.js';
import { Badge, BigNumber, IconButton, Pager, PixelFrame, RangeBar, Sparkline, StatusMark } from '../ui/index.js';
import { ICON_GROUPS, ORGAN_ICON, PixelAvatar, PixelIcon } from './index.js';

const CREW = ['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4', 'HAB-C9'];
const STATUSES = ['ok', 'caution', 'alert', 'no_data'];
const TREND = [1.9, 2.1, 2.0, 1.8, 1.7, 1.75, 1.6, 1.73];
const LOG = Array.from({ length: 11 }, (_, i) => ({ id: i, icon: ['water_cup', 'dipstick', 'bp', 'pvt'][i % 4], text: `Task ${i + 1}` }));

const page = {
  position: 'fixed', inset: 0, overflow: 'auto', background: 'var(--bg)', color: 'var(--fg)',
  fontFamily: 'var(--font-pixel, monospace)', padding: 24,
  '--font-pixel': "'Pixelify Sans', monospace", '--font-mono': "'JetBrains Mono', monospace",
};
const row = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' };
const cell = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 120, fontSize: 13, color: 'var(--dim)' };
const h2 = { fontSize: 20, margin: '24px 0 10px', letterSpacing: '0.06em', color: 'var(--accent-bright)' };

/** Dev-only review page: every sprite at 32/64 px, crew portraits and the cockpit primitives. */
export function PixelGallery({ initialTheme }) {
  const [theme, setTheme] = useState(initialTheme || BUILTIN_THEMES[0].id);
  const [animate, setAnimate] = useState(true);
  const pick = id => {
    setTheme(id);
    applyTheme(BUILTIN_THEMES.find(t => t.id === id));
  };
  return (
    <div style={page} data-gallery>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>PIXEL LIBRARY</h1>
        <div style={row}>
          {BUILTIN_THEMES.map(t => (
            <IconButton key={t.id} size="sm" layout="row" label={t.name} active={t.id === theme} onClick={() => pick(t.id)} />
          ))}
          <IconButton size="sm" layout="row" icon="heart" label="ANIMATE" active={animate} onClick={() => setAnimate(a => !a)} />
        </div>
      </div>

      {Object.entries(ICON_GROUPS).map(([group, names]) => (
        <section key={group}>
          <h2 style={h2}>{group.toUpperCase()}</h2>
          <div style={row}>
            {names.map(name => (
              <div key={name} style={cell}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                  <PixelIcon name={name} size={32} />
                  <PixelIcon name={name} size={64} animate={animate} />
                </div>
                <span>{name}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <h2 style={h2}>STATUS CORNER · ORGAN_ICON · FALLBACK</h2>
      <div style={row}>
        {STATUSES.map(s => <div key={s} style={cell}><PixelIcon name="kidneys" size={64} status={s} /><span>{s}</span></div>)}
        {Object.entries(ORGAN_ICON).map(([organ, icon]) => <div key={organ} style={cell}><PixelIcon name={icon} size={48} /><span>{organ}</span></div>)}
        <div style={cell}><PixelIcon name="no-such-icon" size={64} /><span>unknown</span></div>
      </div>

      <h2 style={h2}>CREW</h2>
      <div style={row}>
        {CREW.map(code => (
          <div key={code} style={cell}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}><PixelAvatar code={code} size={32} /><PixelAvatar code={code} size={96} /></div>
            <span>{code}</span>
          </div>
        ))}
      </div>

      <h2 style={h2}>UI PRIMITIVES</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        <PixelFrame title="Status marks" icon="alert">
          <div style={{ display: 'grid', gap: 10 }}>
            {['sm', 'md', 'lg'].map(size => (
              <div key={size} style={row}>{STATUSES.map(s => <StatusMark key={s} status={s} size={size} />)}</div>
            ))}
            <div style={row}>{STATUSES.map(s => <StatusMark key={s} status={s} label={false} />)}</div>
          </div>
        </PixelFrame>
        <PixelFrame title="Kidneys" icon="kidneys" status="caution" actions={<Badge kind="synthetic" />}>
          <BigNumber value={1.73} unit="L/d" status="caution" label="Urine volume" icon="urine" size="lg" />
          <RangeBar value={1.73} min={0} max={4} low={2} high={3} status="caution" unit="L/d" />
          <Sparkline values={TREND} low={2} high={3} status="caution" width={260} height={40} />
        </PixelFrame>
        <PixelFrame title="Range bars" icon="bp">
          <div style={{ display: 'grid', gap: 12 }}>
            <RangeBar value={118} min={80} max={180} low={90} high={130} unit="mmHg" />
            <RangeBar value={200} min={80} max={180} low={90} high={130} status="alert" />
            <RangeBar value={50} min={80} max={180} low={90} high={130} status="caution" />
            <RangeBar value={0.4} high={34} unit="ppm" />
            <RangeBar value={null} low={2} high={3} />
            <RangeBar value={97} low={95} compact />
          </div>
        </PixelFrame>
        <PixelFrame title="Alert panel" icon="radiation" status="alert" actions={<Badge kind="live" />}>
          <div style={row}>
            <BigNumber value={62} unit="bpm" label="HR" icon="hr" />
            <BigNumber value={null} unit="%" label="SpO2" icon="spo2" size="sm" />
          </div>
          <div style={row}><Sparkline values={[3]} /><Sparkline values={[]} /><Sparkline values={[1, 3, 2, 5, 4, 6]} width={120} /></div>
          <div style={row}>{['synthetic', 'simulated', 'demo', 'todo', 'live'].map(k => <Badge key={k} kind={k} />)}</div>
        </PixelFrame>
        <PixelFrame title="Actions" icon="kidneys">
          <div style={row}>
            <IconButton icon="water_cup" label="Log water" />
            <IconButton icon="dipstick" label="Urine" active />
            <IconButton icon="test_tube" label="Blood" status="caution" />
            <IconButton icon="satellite" label="Report" size="lg" />
            <IconButton icon="pvt" label="Disabled" disabled />
            <IconButton icon="back" label="Crew" layout="row" size="sm" />
          </div>
        </PixelFrame>
        <PixelFrame title="Pager" icon="calendar">
          <Pager items={LOG} pageSize={4} label="Tasks" render={item => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}><PixelIcon name={item.icon} size={24} />{item.text}</div>
          )} />
        </PixelFrame>
      </div>
    </div>
  );
}

export default PixelGallery;

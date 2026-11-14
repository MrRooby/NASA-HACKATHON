import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { PixelIcon } from '../pixel/index.js';
import { GridRects } from '../pixel/grid.jsx';
import { Badge, BigNumber, RangeBar, StatusMark } from '../ui/index.js';
import { latestMeasurement, listMeasurements, recordMeasurement } from '../shared/measurements.js';
import { limbsFromReport } from '../home/limbData.js';
import { thresholdById } from '../checkin/thresholdLogic.js';
import { bandsRange, normalRange, rateField, worst } from './rating.js';
import { BRISTOL_SPRITES, dropletSprite } from './sprites.js';

// Inline input card of one organ action (catalog.js): a compact stepper / icon picker / tapper
// instead of a long form. Saves through recordMeasurement(code, kind, values, sol) and shows a
// SAVED confirmation plus the rating of the value (StatusMark + RangeBar).

const decimals = step => (String(step).split('.')[1] || '').length;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SAVED_MS = 2600;

function useSavedFlash() {
  const [saved, setSaved] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = entry => {
    setSaved(entry);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(null), SAVED_MS);
  };
  return [saved, flash];
}

function SavedNote({ saved }) {
  const t = useT();
  if (!saved) return null;
  return (
    <span className="act-saved" role="status" data-testid="saved">
      <PixelIcon name="check" size={20} /> {t('organs.saved')}
    </span>
  );
}

/** Rating line: status mark + range bar (+ short config message). */
function Rating({ rating, value, unit }) {
  if (!rating?.status) return null;
  const bands = rating.bands;
  const range = bands ? bandsRange(bands, value) : null;
  const normal = bands ? normalRange(bands) : null;
  return (
    <div className="act-rating" data-status={rating.status}>
      <StatusMark status={rating.status} size="sm" />
      {range ? <RangeBar value={value} min={range[0]} max={range[1]} low={normal?.[0]} high={normal?.[1]} status={rating.status} unit={unit} compact /> : <span />}
      {rating.basis === 'team_assumption' ? <Badge kind="todo" title="team assumption" className="act-basis" /> : null}
    </div>
  );
}

function Stepper({ field, value, onChange, label }) {
  const t = useT();
  const digits = decimals(field.step);
  const number = Number(value);
  const valid = value !== '' && Number.isFinite(number) && number >= field.min && number <= field.max;
  const bump = dir => {
    const base = Number.isFinite(number) ? number : field.initial;
    onChange(clamp(Number((base + dir * field.step).toFixed(digits)), field.min, field.max));
  };
  return (
    <div className="act-stepper" data-invalid={valid ? undefined : 'true'}>
      <span className="act-field-label">{label}</span>
      <div className="act-stepper-row">
        <button type="button" className="act-step" onClick={() => bump(-1)} aria-label={t('organs.less', { what: label })}>−</button>
        <input
          className="act-input"
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          aria-label={label}
          aria-invalid={!valid}
          onChange={event => onChange(event.target.value === '' ? '' : event.target.value)}
        />
        <button type="button" className="act-step" onClick={() => bump(1)} aria-label={t('organs.more', { what: label })}>+</button>
        <span className="act-unit">{field.unit}</span>
      </div>
      {!valid && <span className="act-error" role="alert">{t('organs.outOfRange', { min: field.min, max: field.max, unit: field.unit })}</span>}
    </div>
  );
}

function NumberCard({ action, code, sol }) {
  const t = useT();
  const last = latestMeasurement(code, action.kind);
  const [values, setValues] = useState(() => Object.fromEntries(action.fields.map(field => [field.key, last?.values?.[field.key] ?? field.initial])));
  const [mode, setMode] = useState(() => last?.values?.mode ?? action.modes?.[0]?.value ?? null);
  const [saved, flash] = useSavedFlash();
  const valid = action.fields.every(field => {
    const n = Number(values[field.key]);
    return values[field.key] !== '' && Number.isFinite(n) && n >= field.min && n <= field.max;
  });
  const ratings = action.fields.map(field => rateField(field, Number(values[field.key])));
  const save = () => {
    if (!valid) return;
    const out = Object.fromEntries(action.fields.map(field => [field.key, Number(values[field.key])]));
    if (mode) out.mode = mode;
    flash(recordMeasurement(code, action.kind, out, sol));
  };
  return (
    <div className="act-body act-body--number">
      {action.modes && (
        <div className="act-modes" role="group" aria-label={t('organs.mode')}>
          {action.modes.map(option => (
            <button key={option.value} type="button" className="act-option act-option--row" aria-pressed={mode === option.value} onClick={() => setMode(option.value)}>
              <PixelIcon name={option.icon} size={24} /> <span>{t(`organs.opt_${action.id}_${option.value}`)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="act-fields">
        {action.fields.map((field, index) => (
          <div key={field.key} className="act-field">
            <Stepper field={field} value={values[field.key]} label={t(`organs.field_${field.key}`)} onChange={value => setValues(current => ({ ...current, [field.key]: value }))} />
            <Rating rating={ratings[index]} value={Number(values[field.key])} unit={field.unit} />
          </div>
        ))}
      </div>
      <Footer onSave={save} disabled={!valid} saved={saved} rating={worstRating(ratings)} />
    </div>
  );
}

const worstRating = ratings => {
  const status = worst(ratings.map(rating => rating?.status));
  return ratings.find(rating => rating?.status === status) || null;
};

function Footer({ onSave, disabled, saved, rating }) {
  const t = useT();
  const advice = rating && rating.status !== 'ok' ? rating.action || rating.message : null;
  return (
    <div className="act-footer">
      <button type="button" className="act-save" onClick={onSave} disabled={disabled}>
        <PixelIcon name="check" size={24} /> {t('organs.save')}
      </button>
      <SavedNote saved={saved} />
      {advice ? <span className="act-advice" data-status={rating.status}>{advice}</span> : null}
    </div>
  );
}

function OptionArt({ option }) {
  if (option.icon) return <PixelIcon name={option.icon} size={40} />;
  if (option.swatch) {
    const drop = dropletSprite(option.swatch);
    return <svg width={28} height={35} viewBox="0 0 8 10" shapeRendering="crispEdges" aria-hidden="true"><GridRects rows={drop.rows} pal={drop.pal} /></svg>;
  }
  if (option.bristol) {
    const art = BRISTOL_SPRITES[option.bristol];
    return <svg width={42} height={24} viewBox="0 0 14 8" shapeRendering="crispEdges" aria-hidden="true"><GridRects rows={art.rows} pal={art.pal} /></svg>;
  }
  return null;
}

function PickCard({ action, code, sol }) {
  const t = useT();
  const last = latestMeasurement(code, action.kind);
  const [value, setValue] = useState(last?.values?.[action.field] ?? null);
  const [saved, flash] = useSavedFlash();
  const option = action.options.find(item => item.value === value) || null;
  const rating = option
    ? (action.configId ? rateField({ configId: action.configId }, value) : option.status ? { status: option.status, basis: option.basis } : null)
    : null;
  const save = () => {
    if (option == null) return;
    const values = { ...(action.extra || {}), [action.field]: value };
    if (option.sg != null) values.sg = option.sg;
    flash(recordMeasurement(code, action.kind, values, sol));
  };
  return (
    <div className="act-body act-body--pick">
      <div className="act-options" role="radiogroup" aria-label={t(`organs.act_${action.id}`)} data-count={action.options.length}>
        {action.options.map(item => (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={value === item.value}
            className="act-option"
            data-status={value === item.value ? item.status : undefined}
            onClick={() => setValue(item.value)}
            title={t(`organs.opt_${action.id}_${item.value}`)}
          >
            <OptionArt option={item} />
            <span className="act-option-label">{item.label ?? t(`organs.opt_${action.id}_${item.value}`)}</span>
          </button>
        ))}
      </div>
      <Rating rating={rating} value={null} />
      <Footer onSave={save} disabled={option == null} saved={saved} rating={rating} />
    </div>
  );
}

function CupsCard({ action, code, sol }) {
  const t = useT();
  const [saved, flash] = useSavedFlash();
  const [, setTick] = useState(0);
  const total = listMeasurements({ code, kind: 'water', sol }).reduce((sum, entry) => sum + (Number(entry.values?.ml) || 0), 0);
  const cups = Math.round(action.target / action.cupMl);
  const filled = Math.floor(total / action.cupMl);
  const rating = rateField({ bands: action.bands }, total);
  const add = () => {
    flash(recordMeasurement(code, 'water', { ml: action.cupMl }, sol));
    setTick(n => n + 1);
  };
  return (
    <div className="act-body act-body--cups">
      <div className="act-cups" role="group" aria-label={t('organs.act_water')}>
        {Array.from({ length: Math.max(cups, filled) }, (_, index) => (
          <button
            key={index}
            type="button"
            className="act-cup"
            data-filled={index < filled ? 'true' : 'false'}
            onClick={add}
            aria-label={t('organs.addCup', { ml: action.cupMl })}
          >
            <PixelIcon name="water_cup" size={36} />
          </button>
        ))}
      </div>
      <div className="act-total">
        <BigNumber value={total / 1000} digits={2} unit={t('organs.litersToday', { target: action.target / 1000 })} status={rating.status} size="sm" />
      </div>
      <Rating rating={rating} value={total} unit="mL" />
      <div className="act-footer">
        <button type="button" className="act-save" onClick={add}><PixelIcon name="water_cup" size={24} /> {t('organs.addCup', { ml: action.cupMl })}</button>
        <SavedNote saved={saved} />
      </div>
    </div>
  );
}

const LIMBS = [
  { value: 'left_arm', icon: 'arm' }, { value: 'right_arm', icon: 'arm' },
  { value: 'left_leg', icon: 'leg' }, { value: 'right_leg', icon: 'leg' },
];

function CheckCard({ action, code, sol, report }) {
  const t = useT();
  const suspect = useMemo(() => limbsFromReport(report).limbs.find(limb => limb.status === 'alert' || limb.status === 'caution')?.limb ?? null, [report]);
  const [limb, setLimb] = useState(suspect ?? 'left_leg');
  const [findings, setFindings] = useState([]);
  const [saved, flash] = useSavedFlash();
  const toggle = value => setFindings(current => (current.includes(value) ? current.filter(item => item !== value) : [...current, value]));
  const status = findings.length >= 2 ? 'alert' : findings.length === 1 ? 'caution' : 'ok';
  const save = () => flash(recordMeasurement(code, 'symptoms', { area: 'limb', limb, findings, count: findings.length }, sol));
  return (
    <div className="act-body act-body--check">
      <div className="act-options act-options--limbs" role="radiogroup" aria-label={t('organs.whichLimb')}>
        {LIMBS.map(item => (
          <button key={item.value} type="button" role="radio" aria-checked={limb === item.value} className="act-option" onClick={() => setLimb(item.value)}
            data-suspect={item.value === suspect ? 'true' : undefined}>
            <PixelIcon name={item.icon} size={32} />
            <span className="act-option-label">{t(`organs.limb_${item.value}`)}</span>
          </button>
        ))}
      </div>
      <div className="act-options act-options--findings" role="group" aria-label={t('organs.findings')}>
        {action.findings.map(item => (
          <button key={item.value} type="button" aria-pressed={findings.includes(item.value)} className="act-option" onClick={() => toggle(item.value)}
            data-status={findings.includes(item.value) ? 'caution' : undefined}>
            <PixelIcon name={item.icon} size={32} />
            <span className="act-option-label">{t(`organs.finding_${item.value}`)}</span>
          </button>
        ))}
      </div>
      <Footer onSave={save} saved={saved} rating={{ status, action: status !== 'ok' ? t('organs.limbAdvice') : '' }} />
    </div>
  );
}

const DEVICE_ICON = { left_arm: 'arm', right_arm: 'arm', left_leg: 'leg', right_leg: 'leg', head_eeg: 'brain' };

function BandsCard({ report }) {
  const t = useT();
  const { limbs, headEeg } = limbsFromReport(report);
  const devices = [
    ...limbs.map(limb => ({ id: limb.limb, device: limb.device, status: limb.status, pct: limb.circulationPct })),
    { id: 'head_eeg', device: headEeg, status: headEeg?.status ?? 'no_data', pct: null },
  ];
  return (
    <div className="act-body act-body--bands">
      <div className="act-bands">
        {devices.map(item => {
          const battery = item.device?.battery_pct;
          const state = item.device?.state ?? 'missing';
          return (
            <div key={item.id} className="act-band" data-status={item.status}>
              <PixelIcon name={DEVICE_ICON[item.id]} size={36} status={item.status} />
              <span className="act-band-name">{t(`organs.limb_${item.id}`)}</span>
              <StatusMark status={item.status} size="sm" />
              <span className="act-band-state" data-state={state}>{t(`organs.band_${state === 'connected' ? 'on' : 'off'}`)}</span>
              <RangeBar value={battery ?? null} min={0} max={100} low={20} high={100} unit="%" compact status={battery == null ? 'no_data' : battery < 20 ? 'caution' : 'ok'} />
              <span className="act-band-num">{battery != null ? `${Math.round(battery)}%` : '—'}</span>
              {item.pct != null && <span className="act-band-flow" data-status={item.status}>{t('organs.flow', { pct: Math.round(item.pct) })}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DoseCard({ action, report }) {
  const t = useT();
  const card = (report?.organs || []).find(item => item.organ === 'exposure');
  const check = (card?.checks || []).find(item => item.code === 'dose_career');
  const dose = typeof check?.value === 'number' ? check.value : null;
  const rating = rateField({ configId: 'radiation_career_mSv' }, dose);
  const pct = dose != null ? Math.round((dose / action.limit) * 100) : null;
  const marsRate = 0.64; // mSv/sol on the Mars surface, MSL RAD (config environments: mars_surface)
  return (
    <div className="act-body act-body--dose">
      <div className="act-dose-top">
        <BigNumber value={dose} digits={0} unit="mSv" status={rating.status} label={t('organs.doseCareer')} icon="radiation" size="md" />
        <BigNumber value={pct} unit={t('organs.ofLimit', { limit: action.limit })} status={rating.status} label={t('organs.doseShare')} size="md" />
      </div>
      <RangeBar value={dose} min={0} max={action.limit} low={0} high={thresholdById.radiation_career_mSv?.bands?.[0]?.max ?? 300} status={rating.status ?? 'no_data'} unit="mSv" />
      <div className="act-dose-facts">
        <span><PixelIcon name="sun" size={24} /> {t('organs.doseMars', { rate: marsRate })}</span>
        <span><PixelIcon name="structure" size={24} /> {t('organs.doseTube')}</span>
      </div>
    </div>
  );
}

function InfoCard({ action, sol }) {
  const t = useT();
  const nextDraw = action.every && typeof sol === 'number' ? Math.ceil((sol + 1) / action.every) * action.every : null;
  return (
    <div className="act-body act-body--info">
      {action.todo && <p className="act-todo"><Badge kind="todo" /> {t('organs.todoNote')}</p>}
      {nextDraw != null && <p className="act-next"><PixelIcon name="calendar" size={24} /> {t('organs.nextDraw', { sol: nextDraw, every: action.every })}</p>}
      <ol className="act-steps">
        {action.steps.map((step, index) => (
          <li key={index} className="act-step-tile">
            <span className="act-step-n">{index + 1}</span>
            <PixelIcon name={step.icon} size={40} />
            <span className="act-step-label">{t(`organs.step_${action.id}_${index + 1}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const BODIES = { number: NumberCard, pick: PickCard, cups: CupsCard, check: CheckCard, bands: BandsCard, dose: DoseCard, info: InfoCard };

/** <ActionCard action code sol report onClose />: the input card of one organ action. */
export function ActionCard({ action, code, sol, report, onClose }) {
  const t = useT();
  const Body = BODIES[action?.type];
  if (!Body) return null;
  return (
    <section className="act-card" data-action={action.id} aria-label={t(`organs.act_${action.id}`)}>
      <header className="act-head">
        <PixelIcon name={action.icon} size={32} />
        <h3 className="act-title">{t(`organs.act_${action.id}`)}</h3>
        <button type="button" className="act-close" onClick={onClose} aria-label={t('organs.close')}>
          <PixelIcon name="cross" size={20} />
        </button>
      </header>
      <Body key={`${code}-${action.id}`} action={action} code={code} sol={sol} report={report} />
    </section>
  );
}

export default ActionCard;

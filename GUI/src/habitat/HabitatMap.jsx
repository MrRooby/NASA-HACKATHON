import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { getProfile } from '../data/crewProfiles.js';
import { getCrewPhoto } from '../data/crewPhotos.js';
import { useT } from '../i18n/index.js';
import { ROOMS } from './layout.js';
import {
  BRACKET_PATHS, CORRIDOR_PATHS, DASHED_PATHS, FRAME_RECT, INNER_WALL_PATH, VIEW_BOX, VIEW_H, VIEW_W, WALL_PATHS,
} from './geometry.js';
import './habitatMap.css';

const STATUSES = ['ok', 'caution', 'alert', 'no_data'];
const STATUS_WORD_KEYS = {
  ok: 'common.statusOk',
  caution: 'common.statusCaution',
  alert: 'common.statusAlert',
  no_data: 'common.statusNoData',
};

/** Any unknown status is drawn as no_data. */
export const mapStatus = status => (STATUSES.includes(status) ? status : 'no_data');

const GRID = 51.2;
const DOT_R = 11;
const DOT_HIT_R = 17;
const DOT_STEP = 34;
const CARD_PHOTO_W = 84;
const CARD_PHOTO_H = 98;
const CARD_PAD = 10;
const MARK_H = 20;

const toLookup = rooms => (Array.isArray(rooms)
  ? Object.fromEntries(rooms.map(room => [room.id, room]))
  : rooms || {});

function RoomLabel({ def, text, simulatedText }) {
  const { x, y, rotate, wrap, small, align = 'middle', lineHeight = 24 } = def.label;
  const lines = wrap ? String(text).split(' ') : [text];
  return (
    <g transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined} aria-hidden="true">
      {lines.map((line, index) => (
        <text key={index} className={small ? 'hmap-label is-small' : 'hmap-label'} x={x} y={y + index * lineHeight} textAnchor={align} dominantBaseline="central">
          {line}
        </text>
      ))}
      {simulatedText && (
        <text
          className="hmap-sim"
          x={x}
          y={y + (lines.length - 1) * lineHeight + 21}
          textAnchor={align}
          dominantBaseline="central"
        >
          {simulatedText}
        </text>
      )}
    </g>
  );
}

const SLOT_STEP = 26;
const SLOT_CLEAR = 38;   // distance kept from walls
const LABEL_CLEAR = 16;  // distance kept from room names and sub-zone marks

/**
 * Free spots inside each room: grid points in the room shape, clear of its walls and its texts.
 * Needs the browser geometry API (isPointInFill); returns null where it is missing (tests).
 */
function measureSlots(svg) {
  if (!svg || typeof svg.getScreenCTM !== 'function') return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inverse = ctm.inverse();
  const toMap = (x, y) => new DOMPoint(x, y).matrixTransform(inverse);
  const out = {};
  for (const room of svg.querySelectorAll('.hmap-room')) {
    const shape = room.querySelector('.hmap-room-fill');
    if (!shape || typeof shape.isPointInFill !== 'function') return null;
    const boxes = [...room.querySelectorAll('.hmap-label, .hmap-mark')].map(el => {
      const r = el.getBoundingClientRect();
      const a = toMap(r.left, r.top);
      const b = toMap(r.right, r.bottom);
      return { x0: Math.min(a.x, b.x) - LABEL_CLEAR, y0: Math.min(a.y, b.y) - LABEL_CLEAR,
        x1: Math.max(a.x, b.x) + LABEL_CLEAR, y1: Math.max(a.y, b.y) + LABEL_CLEAR };
    });
    const point = svg.createSVGPoint();
    const inside = (x, y) => {
      point.x = x;
      point.y = y;
      return shape.isPointInFill(point);
    };
    const bb = shape.getBBox();
    const slots = [];
    for (let y = bb.y + SLOT_CLEAR; y <= bb.y + bb.height - SLOT_CLEAR; y += SLOT_STEP) {
      for (let x = bb.x + SLOT_CLEAR; x <= bb.x + bb.width - SLOT_CLEAR; x += SLOT_STEP) {
        if (boxes.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) continue;
        let clear = inside(x, y);
        for (let k = 0; clear && k < 8; k += 1) {
          const angle = (k * Math.PI) / 4;
          clear = inside(x + SLOT_CLEAR * Math.cos(angle), y + SLOT_CLEAR * Math.sin(angle));
        }
        if (clear) slots.push({ x, y });
      }
    }
    out[room.dataset.room] = slots;
  }
  return out;
}

/** n spots spread over the room: the one nearest the middle first, then each farthest from the rest. */
function pickSpread(slots, n) {
  if (!n) return [];
  const cx = slots.reduce((sum, p) => sum + p.x, 0) / slots.length;
  const cy = slots.reduce((sum, p) => sum + p.y, 0) / slots.length;
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const chosen = [slots.reduce((best, p) => (d2(p, { x: cx, y: cy }) < d2(best, { x: cx, y: cy }) ? p : best))];
  const nearest = slots.map(p => d2(p, chosen[0]));
  while (chosen.length < n) {
    let index = 0;
    for (let i = 1; i < slots.length; i += 1) if (nearest[i] > nearest[index]) index = i;
    chosen.push(slots[index]);
    for (let i = 0; i < slots.length; i += 1) nearest[i] = Math.min(nearest[i], d2(slots[i], slots[index]));
  }
  // left to right, so the order of people stays readable
  return chosen.sort((a, b) => a.x - b.x || a.y - b.y);
}

/** Crew members in a room as dots; hover (or focus) shows name and photo, a tap opens the person. */
function CrewDots({ def, occupants, slots, onHover, onOpen }) {
  const cols = def.crew.cols ?? 4;
  const spread = slots && slots.length >= occupants.length ? pickSpread(slots, occupants.length) : null;
  return occupants.map((code, index) => {
    const x = spread ? spread[index].x : def.crew.x + DOT_R + 2 + (index % cols) * DOT_STEP;
    const y = spread ? spread[index].y : def.crew.y + DOT_R - 2 + Math.floor(index / cols) * DOT_STEP;
    const person = getProfile(code);
    const show = () => onHover({ code, x, y });
    const hide = () => onHover(null);
    const open = event => {
      if (!person || !onOpen) return; // no profile to open: the tap selects the room
      event.stopPropagation();
      onOpen(person.code);
    };
    return (
      <g
        key={code}
        className="hmap-crew"
        data-crew={code}
        role={person && onOpen ? 'button' : undefined}
        tabIndex={person && onOpen ? 0 : undefined}
        aria-label={person?.name ?? code}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={open}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); }
        }}
      >
        <circle className="hmap-crew-hit" cx={x} cy={y} r={DOT_HIT_R} />
        <circle className="hmap-crew-dot" cx={x} cy={y} r={DOT_R} />
      </g>
    );
  });
}

/** Name and photo of the crew member under the pointer, kept inside the map. */
function CrewCard({ hover }) {
  const person = getProfile(hover.code);
  if (!person) return null;
  const [first, ...rest] = person.name.split(' ');
  const last = rest.join(' ');
  const textW = Math.max(first.length * 14.5, last.length * 12.2);
  const w = CARD_PAD * 3 + CARD_PHOTO_W + textW;
  const h = CARD_PHOTO_H + CARD_PAD * 2;
  const x = Math.min(Math.max(8, hover.x + DOT_HIT_R + 6), VIEW_W - w - 8);
  const y = Math.min(Math.max(8, hover.y - h / 2), VIEW_H - h - 8);
  const photo = getCrewPhoto(person.code);
  const tx = x + CARD_PAD * 2 + CARD_PHOTO_W;
  return (
    <g className="hmap-card" data-card={hover.code} pointerEvents="none" aria-hidden="true">
      <rect className="hmap-card-box" x={x} y={y} width={w} height={h} />
      {photo ? (
        <image href={photo} x={x + CARD_PAD} y={y + CARD_PAD} width={CARD_PHOTO_W} height={CARD_PHOTO_H} preserveAspectRatio="xMidYMid slice" />
      ) : null}
      <text className="hmap-card-first" x={tx} y={y + h / 2 - 14} dominantBaseline="central">{first}</text>
      <text className="hmap-card-last" x={tx} y={y + h / 2 + 16} dominantBaseline="central">{last}</text>
    </g>
  );
}

function SubZoneMarks({ def, subZones, t }) {
  const flagged = subZones.filter(sub => sub.status === 'caution' || sub.status === 'alert');
  return flagged.map((sub, index) => {
    const x = def.marks?.x ?? def.crew.x;
    const y = (def.marks?.y ?? def.crew.y + 40) + index * MARK_H;
    return (
      <g key={sub.code} className={`hmap-mark is-${sub.status}`} data-subzone={sub.code} data-status={sub.status} aria-hidden="true">
        <rect x={x} y={y} width={9} height={9} />
        <text x={x + 15} y={y + 5} dominantBaseline="central">{t(`base.zone_${sub.code}`)}</text>
      </g>
    );
  });
}

/**
 * Habitat plan as an inline SVG (viewBox 0 0 2048 599), redrawn from the team's reference.
 * Colours come from the theme variables only, so the map follows the active theme.
 *
 * props:
 *   rooms      state per room, as an array or an object keyed by room id:
 *              { id, status: 'ok'|'caution'|'alert'|'no_data', occupants: ['C1', ...],
 *                simulated: bool, subZones: [{ code, status }] }
 *              Rooms without state are drawn as no_data.
 *   selectedId id of the selected room (or null)
 *   onSelect   (roomId) => void — click, Enter or Space on a room
 *   onCrewOpen (crewCode 'HAB-Cx') => void — click on a crew dot
 */
export default function HabitatMap({ rooms, selectedId = null, onSelect, onCrewOpen, className }) {
  const t = useT();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const hatchId = `hmap-hatch-${uid}`;
  const gridId = `hmap-grid-${uid}`;
  const lookup = toLookup(rooms);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const [slots, setSlots] = useState(null);
  // free spots per room, measured once the room names are drawn (again when the language or the marks change)
  const marksKey = (Array.isArray(rooms) ? rooms : Object.values(rooms || {}))
    .map(room => (room?.subZones || []).filter(sub => sub.status === 'caution' || sub.status === 'alert').length).join();
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const measure = () => {
      let next = null;
      try { next = measureSlots(svg); } catch { next = null; }
      if (next && Object.values(next).some(list => list.length)) setSlots(next);
    };
    measure();
    if (!svg || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [t, marksKey]);

  const activate = id => onSelect?.(id);
  const onKeyDown = (event, id) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate(id);
    }
  };

  return (
    <svg
      ref={svgRef}
      className={['hmap', className].filter(Boolean).join(' ')}
      viewBox={VIEW_BOX}
      role="group"
      aria-label={t('base.mapAria')}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id={hatchId} width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="hmap-hatch-line" x1="0" y1="0" x2="0" y2="5.5" />
        </pattern>
        <pattern id={gridId} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <path className="hmap-grid-line" d={`M${GRID} 0 L0 0 L0 ${GRID}`} />
        </pattern>
        {ROOMS.map(def => (
          <clipPath key={def.id} id={`hmap-clip-${uid}-${def.id}`}>
            <path d={def.path} />
          </clipPath>
        ))}
      </defs>

      <g className="hmap-backdrop" aria-hidden="true">
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={`url(#${gridId})`} />
        <rect
          className="hmap-frame"
          x={FRAME_RECT.left}
          y={FRAME_RECT.top}
          width={FRAME_RECT.right - FRAME_RECT.left}
          height={FRAME_RECT.bottom - FRAME_RECT.top}
        />
        {BRACKET_PATHS.map(d => <path key={d} className="hmap-bracket" d={d} />)}
      </g>

      <g className="hmap-rooms">
        {ROOMS.map(def => {
          const state = lookup[def.id] || {};
          const status = mapStatus(state.status);
          const simulated = state.simulated ?? def.simulated;
          const occupants = state.occupants || [];
          const selected = selectedId === def.id;
          const name = t(def.labelKey);
          const aria = [
            name,
            t(STATUS_WORD_KEYS[status]),
            simulated ? t('base.simulated') : null,
            occupants.length ? t('base.crewHere', { codes: occupants.join(', ') }) : null,
          ].filter(Boolean).join(' · ');
          return (
            <g
              key={def.id}
              className={[
                'hmap-room', `is-${status}`, selected && 'is-selected', simulated && 'is-simulated',
              ].filter(Boolean).join(' ')}
              role="button"
              tabIndex={0}
              aria-label={aria}
              aria-pressed={selected}
              data-room={def.id}
              data-status={status}
              onClick={() => activate(def.id)}
              onKeyDown={event => onKeyDown(event, def.id)}
            >
              <path className="hmap-room-fill" d={def.path} />
              <path className="hmap-room-edge" d={def.path} clipPath={`url(#hmap-clip-${uid}-${def.id})`} />
              <RoomLabel
                def={def}
                text={t(def.mapLabelKey || def.labelKey)}
              />
              <CrewDots def={def} occupants={occupants} slots={slots?.[def.id]} onHover={setHover} onOpen={onCrewOpen} />
              <SubZoneMarks def={def} subZones={state.subZones || []} t={t} />
            </g>
          );
        })}
      </g>

      <g className="hmap-structure" aria-hidden="true">
        {CORRIDOR_PATHS.map(d => <path key={d} className="hmap-corridor" d={d} />)}
        {WALL_PATHS.map(d => <path key={d} className="hmap-wall" d={d} fill={`url(#${hatchId})`} fillRule="evenodd" />)}
        <path className="hmap-inner-wall" d={INNER_WALL_PATH} />
        {DASHED_PATHS.map(d => <path key={d} className="hmap-dashed" d={d} />)}
      </g>
      {hover ? <CrewCard hover={hover} /> : null}
    </svg>
  );
}

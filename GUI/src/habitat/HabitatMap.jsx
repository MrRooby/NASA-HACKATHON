import React, { useId } from 'react';
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
const CREW_W = 26;
const CREW_H = 17;
const CREW_GAP = 4;
const MARK_H = 20;

const toLookup = rooms => (Array.isArray(rooms)
  ? Object.fromEntries(rooms.map(room => [room.id, room]))
  : rooms || {});

function RoomLabel({ def, text, simulatedText }) {
  const { x, y, rotate, wrap, align = 'middle', lineHeight = 24 } = def.label;
  const lines = wrap ? String(text).split(' ') : [text];
  return (
    <g transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined} aria-hidden="true">
      {lines.map((line, index) => (
        <text key={index} className="hmap-label" x={x} y={y + index * lineHeight} textAnchor={align} dominantBaseline="central">
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

function CrewMarkers({ def, occupants }) {
  const cols = def.crew.cols ?? 4;
  return occupants.map((code, index) => {
    const x = def.crew.x + (index % cols) * (CREW_W + CREW_GAP);
    const y = def.crew.y + Math.floor(index / cols) * (CREW_H + CREW_GAP);
    return (
      <g key={code} className="hmap-crew" data-crew={code} aria-hidden="true">
        <rect x={x} y={y} width={CREW_W} height={CREW_H} />
        <text x={x + CREW_W / 2} y={y + CREW_H / 2 + 0.5} textAnchor="middle" dominantBaseline="central">{code}</text>
      </g>
    );
  });
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
 */
export default function HabitatMap({ rooms, selectedId = null, onSelect, className }) {
  const t = useT();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const hatchId = `hmap-hatch-${uid}`;
  const gridId = `hmap-grid-${uid}`;
  const lookup = toLookup(rooms);

  const activate = id => onSelect?.(id);
  const onKeyDown = (event, id) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate(id);
    }
  };

  return (
    <svg
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
                simulatedText={simulated ? t('base.simulated') : null}
              />
              <CrewMarkers def={def} occupants={occupants} />
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
    </svg>
  );
}

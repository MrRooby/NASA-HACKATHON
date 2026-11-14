import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ALIASES, AVATARS, ICON_GROUPS, ORGAN_ICON, PIXEL_ICONS, PixelAvatar, PixelIcon, SPRITES, avatarKey, getSprite,
  iconForMeasurement, iconForReadingCategory,
} from './index.js';
import { gridRuns } from './grid.jsx';
import habitat from '../test/fixtures/habitat_sol142.json';

// DESIGN.md §5: the stable icon names every screen relies on.
const CONTRACT = [
  'brain eye heart lungs blood kidneys urine stomach bone muscle arm leg limb radiation',
  'bp hr spo2 thermometer glucose water_cup sleep mood_1 mood_2 mood_3 mood_4 mood_5 scale syringe test_tube dipstick pill dumbbell treadmill grip eye_chart camera',
  'pvt gonogo dsst questionnaire chat',
  'pressure o2 co2 humidity dust radiation_sensor airlock water_tank light noise structure power reactor plant thermometer_room wind sun',
  'satellite alert caution ok no_data check cross clock calendar gear crew base back next prev',
].join(' ').split(' ');

const svgOf = ui => render(ui).container.querySelector('svg');

describe('sprite data', () => {
  it('covers exactly the DESIGN.md icon names', () => {
    expect([...PIXEL_ICONS].sort()).toEqual([...CONTRACT].sort());
    expect(Object.values(ICON_GROUPS).flat()).toEqual(PIXEL_ICONS);
  });

  it.each([...Object.entries(SPRITES), ...Object.entries(AVATARS)])('%s is rectangular and uses only palette chars', (name, sprite) => {
    const width = sprite.rows[0].length;
    expect(sprite.rows.length).toBeGreaterThanOrEqual(16);
    for (const row of sprite.rows) {
      expect(row.length, name).toBe(width);
      for (const ch of row) {
        if (ch !== '.') expect(sprite.pal, `${name}: '${ch}'`).toHaveProperty(ch);
      }
    }
    for (const colour of Object.values(sprite.pal)) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('aliases point at real sprites', () => {
    for (const [alias, name] of Object.entries(ALIASES)) expect(SPRITES[name], alias).toBeDefined();
  });

  it('merges horizontal runs of one colour', () => {
    expect(gridRuns(['.aab', 'bb..'], { a: '#000', b: '#fff' })).toEqual([
      { x: 1, y: 0, w: 2, c: 'a' }, { x: 3, y: 0, w: 1, c: 'b' }, { x: 0, y: 1, w: 2, c: 'b' },
    ]);
  });
});

describe('<PixelIcon>', () => {
  it.each(CONTRACT)('renders "%s" as a crisp svg with rects', name => {
    const svg = svgOf(<PixelIcon name={name} />);
    expect(svg).toHaveAttribute('data-icon', name);
    expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(5);
  });

  it.each(Object.entries(ORGAN_ICON))('organ %s → %s exists', (organ, icon) => {
    expect(getSprite(icon)).not.toBeNull();
    expect(svgOf(<PixelIcon name={icon} />).getAttribute('data-icon')).toBe(icon);
  });

  it('falls back to the "?" tile for unknown or missing names', () => {
    for (const name of ['no-such-icon', undefined, null, '']) {
      const svg = svgOf(<PixelIcon name={name} />);
      expect(svg).toHaveAttribute('data-icon', 'unknown');
      expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    }
  });

  it('resolves aliases', () => {
    expect(svgOf(<PixelIcon name="temp" />)).toHaveAttribute('data-icon', 'temp');
    expect(getSprite('temp')).toBe(SPRITES.thermometer);
  });

  it('sizes, titles and hides from assistive tech without a title', () => {
    const plain = svgOf(<PixelIcon name="heart" size={48} />);
    expect(plain).toHaveAttribute('width', '48');
    expect(plain).toHaveAttribute('aria-hidden', 'true');
    const titled = render(<PixelIcon name="heart" title="Heart" />);
    expect(titled.getByRole('img', { name: 'Heart' })).toBeInTheDocument();
  });

  it('adds a shape-coded status corner without touching the sprite', () => {
    const base = svgOf(<PixelIcon name="kidneys" />).querySelector('.px-sprite').innerHTML;
    for (const status of ['ok', 'caution', 'alert', 'no_data']) {
      const svg = svgOf(<PixelIcon name="kidneys" status={status} />);
      expect(svg.querySelector('.px-mark')).toHaveAttribute('data-mark', status);
      expect(svg.querySelector('.px-sprite').innerHTML).toBe(base);
    }
    expect(svgOf(<PixelIcon name="kidneys" />).querySelector('.px-mark')).toBeNull();
  });

  it('animates heart, alert and radiation with their own animation', () => {
    expect(svgOf(<PixelIcon name="heart" animate />)).toHaveClass('px-anim-beat');
    expect(svgOf(<PixelIcon name="alert" animate />)).toHaveClass('px-anim-blink');
    expect(svgOf(<PixelIcon name="radiation" animate />)).toHaveClass('px-anim-spin');
    expect(svgOf(<PixelIcon name="heart" />).getAttribute('class')).not.toMatch(/px-anim/);
  });
});

describe('<PixelAvatar>', () => {
  it.each(['HAB-C1', 'HAB-C2', 'HAB-C3', 'HAB-C4', 'C1', 'c4'])('draws a portrait for %s', code => {
    const svg = svgOf(<PixelAvatar code={code} />);
    expect(svg.getAttribute('data-avatar')).toBe(avatarKey(code));
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(20);
  });

  it('portraits are distinct and unknown codes get a silhouette', () => {
    const drawings = ['C1', 'C2', 'C3', 'C4'].map(code => AVATARS[code].rows.join(''));
    expect(new Set(drawings).size).toBe(4);
    expect(svgOf(<PixelAvatar code="HAB-X9" />)).toHaveAttribute('data-avatar', 'unknown');
    expect(svgOf(<PixelAvatar code={null} />)).toHaveAttribute('data-avatar', 'unknown');
  });
});

describe('domain lookups', () => {
  it('maps measurement kinds to icons with a generic fallback', () => {
    expect(iconForMeasurement('bp')).toBe('bp');
    expect(iconForMeasurement('hr')).toBe('hr');
    expect(iconForMeasurement('spo2')).toBe('spo2');
    expect(iconForMeasurement('glucose')).toBe('glucose');
    expect(iconForMeasurement('temp')).toBe('thermometer');
    expect(iconForMeasurement('sleep')).toBe('sleep');
    expect(iconForMeasurement('mood')).toBe('mood_3');
    expect(iconForMeasurement('mood_5')).toBe('mood_5');
    expect(iconForMeasurement('water')).toBe('water_cup');
    expect(iconForMeasurement('urine_sample')).toBe('dipstick');
    expect(iconForMeasurement('weight')).toBe('scale');
    expect(iconForMeasurement('something_new')).toBe('questionnaire');
    expect(iconForMeasurement(undefined)).toBe('questionnaire');
  });

  it('maps every habitat reading in the fixture to an existing icon', () => {
    const readings = [];
    const walk = node => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        if (node.channel && node.category) readings.push(node);
        Object.values(node).forEach(walk);
      }
    };
    walk(habitat);
    expect(readings.length).toBeGreaterThan(20);
    for (const r of readings) expect(getSprite(iconForReadingCategory(r.category, r.channel)), r.channel).not.toBeNull();
  });

  it('prefers the channel over the category', () => {
    expect(iconForReadingCategory('air', 'ppco2')).toBe('co2');
    expect(iconForReadingCategory('air', 'o2_fraction')).toBe('o2');
    expect(iconForReadingCategory('air', 'pm2_5')).toBe('dust');
    expect(iconForReadingCategory('radiation', 'dose_rate')).toBe('radiation_sensor');
    expect(iconForReadingCategory('humidity')).toBe('humidity');
    expect(iconForReadingCategory('noise_light', 'noise_leq')).toBe('noise');
    expect(iconForReadingCategory('unknown_category')).toBe('gear');
  });
});

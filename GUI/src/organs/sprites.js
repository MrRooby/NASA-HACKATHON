// Organ-screen pixel art that is not a general icon: urine droplets, Bristol stool forms,
// the ECG trace. Same format as src/pixel/sprites.js (one string per row, '.' transparent).

/** Droplet of a given colour (urine colour chart, falling drops in the kidney scene). */
export function dropletSprite(fill, shade = 'rgba(0,0,0,0.28)') {
  return {
    pal: { f: fill, s: shade, w: '#ffffff', k: '#1b1e28' },
    rows: [
      '...kk...',
      '..kffk..',
      '..kffk..',
      '.kfwffk.',
      'kfwffffk',
      'kfwffffk',
      'kffffsfk',
      'kfffssfk',
      '.kfssfk.',
      '..kkkk..',
    ],
  };
}

const STOOL = { k: '#2a1a10', b: '#7a4a24', h: '#a4703a', w: '#6b8fb0' };

/** Bristol Stool Form Scale, types 1..7 (Lewis & Heaton 1997), 14 × 8 px each. */
export const BRISTOL_SPRITES = {
  1: { pal: STOOL, rows: [
    '..............',
    '.kk...kk...kk.',
    'khbk.khbk.khbk',
    'kbbk.kbbk.kbbk',
    '.kk...kk...kk.',
    '....kk...kk...',
    '...khbk.khbk..',
    '....kk...kk...',
  ] },
  2: { pal: STOOL, rows: [
    '..............',
    '..kk.kk.kk.kk.',
    '.khbkhbkhbkhbk',
    'kbbbbbbbbbbbbk',
    'kbbbbbbbbbbbbk',
    '.kbbkbbkbbkbk.',
    '..kk.kk.kk.k..',
    '..............',
  ] },
  3: { pal: STOOL, rows: [
    '..............',
    '..kkkkkkkkkk..',
    '.khhhhkhhhhhk.',
    'kbbbbbkbbbkbbk',
    'kbbkbbbbkbbbbk',
    '.kbbbbbbbbbbk.',
    '..kkkkkkkkkk..',
    '..............',
  ] },
  4: { pal: STOOL, rows: [
    '..............',
    '..kkkkkkkkkk..',
    '.khhhhhhhhhhk.',
    'kbbbbbbbbbbbbk',
    'kbbbbbbbbbbbbk',
    '.kbbbbbbbbbbk.',
    '..kkkkkkkkkk..',
    '..............',
  ] },
  5: { pal: STOOL, rows: [
    '..............',
    '.kkk....kkk...',
    'khhbk..khhbk..',
    'kbbbk..kbbbkk.',
    '.kkk.kk.kkkhbk',
    '....khbk..kbbk',
    '....kbbk...kk.',
    '.....kk.......',
  ] },
  6: { pal: STOOL, rows: [
    '..............',
    '...k.k..k.k...',
    '.kkhkbkkhkbkk.',
    'khbbhbbhbbhbbk',
    'kbbhbbbbhbbbbk',
    '.kbkbbkbbkbkk.',
    '..k..kk..k....',
    '..............',
  ] },
  7: { pal: STOOL, rows: [
    '..............',
    '..............',
    '......hh......',
    '...hhbbbbhh...',
    '.hbbbbwbbbbbh.',
    'hbbwbbbbbbwbbh',
    '.hhbbbbbbbbhh.',
    '...hhhhhhhh...',
  ] },
};

/** Monitor-style ECG trace, 48 × 12, one 'g' pixel per column (P wave, QRS, T wave). */
export const ECG_ROWS = [
  '...........g.......................g............',
  '...........g.......................g............',
  '..........g.g.....................g.g...........',
  '..........g.g.....................g.g...........',
  '..........g.g.....................g.g...........',
  '..........g.g.....................g.g...........',
  '...gg.....g.g...ggg......gg.......g.g...ggg.....',
  '..g..g....g.g..g...g....g..g......g.g..g...g....',
  'gg....ggggg..g.g....gggg....ggggg.g..g.g....gggg',
  '.............g.g..................g..g.g........',
  '.............gg....................gg...........',
  '................................................',
];

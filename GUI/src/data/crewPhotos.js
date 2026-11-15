// Crew photos (600×700, cropped the same way) in src/assets/crew/<name>.webp.
// Which photo belongs to which crew member is set in PHOTO_FOR_CREW below; a member without
// a photo gets the pixel avatar instead. Bundled with the app, so they work offline.
const files = import.meta.glob('../assets/crew/*.webp', { eager: true, query: '?url', import: 'default' });

/** photo name (file name without .webp) -> URL */
export const CREW_PHOTOS = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.match(/([^/]+)\.webp$/)[1], url]),
);

/** crew code -> photo name (change the assignment here); members without one get the pixel avatar. */
export const PHOTO_FOR_CREW = {
  'HAB-C1': 'fartek',
  'HAB-C3': 'konrad',
  'HAB-C4': 'kinga',
  'HAB-C6': 'hartek',
  'HAB-C7': 'jan',
  'HAB-C8': 'kamil',
};

/** URL of the crew member's photo, or null. Accepts 'HAB-C1' or 'C1'. */
export function getCrewPhoto(code) {
  if (!code) return null;
  const full = /^C\d+$/.test(code) ? `HAB-${code}` : code;
  const name = PHOTO_FOR_CREW[full];
  return (name && CREW_PHOTOS[name]) || null;
}

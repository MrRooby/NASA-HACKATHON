import React from 'react';
import { Avatar } from '../components/index.js';
import { getCrewPhoto } from '../data/crewPhotos.js';

// Photos dropped into ./photos as <crew code>.<jpg|jpeg|png|webp> (see photos/README.md).
const files = import.meta.glob('./photos/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });
const PHOTOS = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.replace(/^.*\/|\.\w+$/g, ''), url]));

/**
 * Crew portrait in a 6:7 frame (width : height), the format of the crew photos. With a photo in
 * ./photos it shows the photo (cover); until then the pixel avatar, centred in the same frame.
 * props: code ('HAB-C1'), title (accessible name), className.
 */
export default function CrewPortrait({ code, title, className = '' }) {
  // A photo dropped into ./photos wins; otherwise the shared crew photo (src/data/crewPhotos.js).
  const photo = PHOTOS[code] || getCrewPhoto(code);
  return (
    <span className={`crew-portrait ${className}`.trim()} data-code={code}>
      {photo ? <img src={photo} alt={title} /> : <Avatar code={code} size={48} title={title} />}
    </span>
  );
}

// FICTIONAL crew of the "Polska Misja Marsjańska" (Polish Mars Mission), habitat
// MARS-LT-ELYSIUM. No real persons; every record carries fictional: true and the UI
// shows a FICTIONAL badge next to it. `code` matches the MOTHER subject codes (HAB-C1..C4).

export const MISSION = {
  fictional: true,
  name: { en: 'Polish Mars Mission', pl: 'Polska Misja Marsjańska' },
  shortName: 'PMM-1',
  habitatCode: 'MARS-LT-ELYSIUM',
  habitat: {
    en: 'Sealed lava-tube habitat, Elysium Mons region',
    pl: 'Uszczelniona jaskinia lawowa, rejon Elysium Mons',
  },
  missionSols: 600,
};

export const CREW_PROFILES = [
  {
    fictional: true,
    code: 'HAB-C1',
    crewCode: 'C1',
    name: 'Aleksander Polkowski',
    callsign: 'HETMAN',
    age: 47,
    nationality: 'PL',
    role: { en: 'Commander', pl: 'Dowódca' },
    education: {
      en: 'Air Force Academy in Dęblin, test pilot; MSc in aerospace engineering, Warsaw University of Technology',
      pl: 'Lotnicza Akademia Wojskowa w Dęblinie, pilot doświadczalny; mgr inż. lotnictwa i kosmonautyki, Politechnika Warszawska',
    },
    bio: {
      en: 'Runs the morning briefing to the minute and holds the habitat record for the longest speech over a freeze-dried pierogi dinner.',
      pl: 'Prowadzi poranną odprawę co do minuty i dzierży rekord habitatu w długości przemówienia nad liofilizowanymi pierogami.',
    },
    homeZone: 'module_M1',
  },
  {
    fictional: true,
    code: 'HAB-C2',
    crewCode: 'C2',
    name: 'Bogusław Grzegrzułkiewicz',
    callsign: 'ŚRUBA',
    age: 39,
    nationality: 'PL',
    role: { en: 'Systems engineer', pl: 'Inżynier systemów' },
    education: {
      en: 'PhD in automation and robotics, AGH University of Krakow; life-support systems course, Silesian University of Technology',
      pl: 'Dr inż. automatyki i robotyki, AGH w Krakowie; kurs systemów podtrzymywania życia, Politechnika Śląska',
    },
    bio: {
      en: 'Has repaired the CO2 scrubber three times with cable ties and a firm word. Mission Control stopped trying to spell his surname on sol 4.',
      pl: 'Trzykrotnie naprawił skruber CO2 opaskami zaciskowymi i dobrym słowem. Kontrola misji przestała literować jego nazwisko w 4. solu.',
    },
    homeZone: 'module_M1',
  },
  {
    fictional: true,
    code: 'HAB-C3',
    crewCode: 'C3',
    name: 'Roman Czarny',
    callsign: 'BAZALT',
    age: 34,
    nationality: 'PL',
    role: { en: 'Geologist', pl: 'Geolog' },
    education: {
      en: 'PhD in planetary geology, University of Wrocław; speleology instructor, Tatra caving club',
      pl: 'Dr geologii planetarnej, Uniwersytet Wrocławski; instruktor taternictwa jaskiniowego',
    },
    bio: {
      en: 'Spends the longest hours in the deep tunnels and names every rock sample after a Tatra peak. The sample locker is already out of peaks.',
      pl: 'Spędza najwięcej godzin w głębokich tunelach i każdą próbkę skały nazywa imieniem tatrzańskiego szczytu. W szafce z próbkami szczyty już się skończyły.',
    },
    homeZone: 'module_M2',
  },
  {
    fictional: true,
    code: 'HAB-C4',
    crewCode: 'C4',
    name: 'Grażyna Brzęczyszczykiewicz',
    callsign: 'ZNACHOR',
    age: 42,
    nationality: 'PL',
    role: { en: 'Mission physician', pl: 'Lekarz misji' },
    education: {
      en: 'MD, Medical University of Gdańsk; specialist in emergency medicine; aerospace medicine course, Military Institute of Aviation Medicine',
      pl: 'Lek. med., Gdański Uniwersytet Medyczny; specjalistka medycyny ratunkowej; kurs medycyny lotniczej i kosmicznej, WIML',
    },
    bio: {
      en: 'The only flight surgeon within 225 million km. Prescribes sleep, water and the treadmill, in that order, and checks who skipped which.',
      pl: 'Jedyny lekarz w promieniu 225 milionów km. Przepisuje sen, wodę i bieżnię, w tej kolejności, i sprawdza, kto co opuścił.',
    },
    homeZone: 'module_M2',
  },
];

export const CREW_CODES = CREW_PROFILES.map(profile => profile.code);

/** getProfile('HAB-C1') or getProfile('C1') -> profile; null for anyone outside the habitat crew. */
export function getProfile(code) {
  if (!code) return null;
  return CREW_PROFILES.find(profile => profile.code === code || profile.crewCode === code) || null;
}

/** localize(profile.role, 'pl') -> text in that language (English when missing). */
export const localize = (field, lang) => (field && typeof field === 'object' ? field[lang] ?? field.en ?? '' : field ?? '');

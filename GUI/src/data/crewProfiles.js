// FICTIONAL crew of the "Polska Misja Marsjańska" (Polish Mars Mission), habitat
// MARS-LT-ELYSIUM. No real persons; every record carries fictional: true and the UI
// shows a FICTIONAL badge next to it. `code` matches the MOTHER subject codes (HAB-C1..C10).
// C5..C10: names from the team, role / age / home module drawn at random and kept in sync with
// DATABASE/synthetic/crew_ext.py (age inside the subject's age band in the database).

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
    sex: 'male',
    heightCm: 182,
    massKg: 84,
    model: 'crew_C1', // public/models/crew_C1.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C2',
    crewCode: 'C2',
    name: 'Bogusława Grzegrzułkiewicz',
    age: 39,
    nationality: 'PL',
    role: { en: 'Systems engineer', pl: 'Inżynier systemów' },
    education: {
      en: 'PhD in automation and robotics, AGH University of Krakow; life-support systems course, Silesian University of Technology',
      pl: 'Dr inż. automatyki i robotyki, AGH w Krakowie; kurs systemów podtrzymywania życia, Politechnika Śląska',
    },
    bio: {
      en: 'Has repaired the CO2 scrubber three times with cable ties and a firm word. Mission Control stopped trying to spell her surname on sol 4.',
      pl: 'Trzykrotnie naprawiła skruber CO2 opaskami zaciskowymi i dobrym słowem. Kontrola misji przestała literować jej nazwisko w 4. solu.',
    },
    homeZone: 'module_M1',
    sex: 'female',
    heightCm: 168,
    massKg: 64,
    model: 'crew_C2', // public/models/crew_C2.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C3',
    crewCode: 'C3',
    name: 'Roman Czarny',
    age: 52,
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
    sex: 'male',
    heightCm: 189,
    massKg: 79,
    model: 'crew_C3', // public/models/crew_C3.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C4',
    crewCode: 'C4',
    name: 'Grażyna Brzęczyszczykiewicz',
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
    sex: 'female',
    heightCm: 165,
    massKg: 58,
    model: 'crew_C4', // public/models/crew_C4.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C5',
    crewCode: 'C5',
    name: 'Żytomira Będzisławska',
    age: 55,
    nationality: 'PL',
    role: { en: 'Pilot / flight engineer', pl: 'Pilot / inżynier lotu' },
    education: {
      en: 'MSc in aviation, Rzeszów University of Technology; airline captain, 12,000 flight hours',
      pl: 'Mgr inż. lotnictwa, Politechnika Rzeszowska; kapitan linii lotniczych, 12 000 godzin nalotu',
    },
    bio: {
      en: 'Earned her nickname after a grease fire in the ascent-vehicle simulator. Says Mars has the worst crosswinds she has ever flown, and she has landed in Gdańsk in November.',
      pl: 'Przezwisko dostała po pożarze smaru w symulatorze pojazdu wznoszenia. Twierdzi, że Mars ma najgorsze boczne wiatry, w jakich latała, a lądowała w Gdańsku w listopadzie.',
    },
    homeZone: 'module_M1',
    sex: 'female',
    heightCm: 171,
    massKg: 66,
    model: 'crew_C5', // public/models/crew_C5.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C6',
    crewCode: 'C6',
    name: 'Jędżej Podolski',
    age: 51,
    nationality: 'PL',
    role: { en: 'ISRU & power engineer', pl: 'Inżynier ISRU i energetyki' },
    education: {
      en: 'PhD in power engineering, Gdańsk University of Technology; electrolyser operator at a chemical plant in Puławy',
      pl: 'Dr inż. energetyki, Politechnika Gdańska; operator elektrolizera w zakładach chemicznych w Puławach',
    },
    bio: {
      en: 'Runs MOXIE and the reactor like a family allotment: every kilogram of oxygen goes into a notebook with a pencil tied to it.',
      pl: 'Prowadzi MOXIE i reaktor jak działkę: każdy kilogram tlenu wpisuje do zeszytu z ołówkiem na sznurku.',
    },
    homeZone: 'module_M2',
    sex: 'male',
    heightCm: 177,
    massKg: 88,
    model: 'crew_C6', // public/models/crew_C6.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C7',
    crewCode: 'C7',
    name: 'Światosław Ryt',
    age: 53,
    nationality: 'PL',
    role: { en: 'EVA specialist', pl: 'Specjalista EVA' },
    education: {
      en: 'MSc in mechanical engineering, Warsaw University of Technology; former Tatra mountain rescuer; technical diving instructor',
      pl: 'Mgr inż. mechaniki, Politechnika Warszawska; były ratownik TOPR; instruktor nurkowania technicznego',
    },
    bio: {
      en: 'Has more hours outside the airlock than the rest of the crew combined. Brings back one interesting pebble per EVA, which the geologist then confiscates.',
      pl: 'Ma więcej godzin poza śluzą niż reszta załogi razem. Z każdego wyjścia przynosi jeden ciekawy kamyk, który geolog potem konfiskuje.',
    },
    homeZone: 'module_M2',
    sex: 'male',
    heightCm: 185,
    massKg: 82,
    model: 'crew_C7', // public/models/crew_C7.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C8',
    crewCode: 'C8',
    name: 'Andrzej Świętopełek',
    age: 54,
    nationality: 'PL',
    role: { en: 'Habitat botanist', pl: 'Botanik habitatu' },
    education: {
      en: 'DSc in horticulture, Warsaw University of Life Sciences; greenhouse research station in Skierniewice',
      pl: 'Dr hab. ogrodnictwa, SGGW w Warszawie; stacja badawcza szklarni w Skierniewicach',
    },
    bio: {
      en: 'Talks to the lettuce in the Tree of Light farm and claims it grows 8 % faster. Nobody has dared to run the control group.',
      pl: 'Rozmawia z sałatą w farmie Drzewo Światła i twierdzi, że rośnie o 8 % szybciej. Nikt nie odważył się zrobić grupy kontrolnej.',
    },
    homeZone: 'module_M1',
    sex: 'male',
    heightCm: 174,
    massKg: 77,
    model: 'crew_C8', // public/models/crew_C8.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C9',
    crewCode: 'C9',
    name: 'Kunekunda Krzeszowska',
    age: 52,
    nationality: 'PL',
    role: { en: 'Psychologist', pl: 'Psycholog' },
    education: {
      en: 'PhD in psychology, Jagiellonian University; isolation studies at the Arctowski Polish Antarctic Station',
      pl: 'Dr psychologii, Uniwersytet Jagielloński; badania izolacji na Polskiej Stacji Antarktycznej im. Arctowskiego',
    },
    bio: {
      en: 'Reads the crew\'s mood from the way they stir their coffee. Runs the cognitive tests and is the only one who never complains about the PVT.',
      pl: 'Odczytuje nastrój załogi z tego, jak miesza kawę. Prowadzi testy kognitywne i jako jedyna nigdy nie narzeka na PVT.',
    },
    homeZone: 'module_M1',
    sex: 'female',
    heightCm: 163,
    massKg: 55,
    model: 'crew_C9', // public/models/crew_C9.glb, generated for this body
  },
  {
    fictional: true,
    code: 'HAB-C10',
    crewCode: 'C10',
    name: 'Czesława Życińska',
    age: 41,
    nationality: 'PL',
    role: { en: 'Robotics engineer', pl: 'Inżynier robotyki' },
    education: {
      en: 'PhD in robotics, Poznań University of Technology; student Mars rover team, European Rover Challenge winner',
      pl: 'Dr inż. robotyki, Politechnika Poznańska; studenckie koło łazików marsjańskich, zwycięstwo w European Rover Challenge',
    },
    bio: {
      en: 'Sends the tunnel-mapping rovers where nobody else fits. Named all six after her aunts; the youngest aunt is the fastest.',
      pl: 'Wysyła łaziki mapujące tam, gdzie nikt się nie mieści. Wszystkie sześć nazwała imionami swoich ciotek; najmłodsza ciotka jest najszybsza.',
    },
    homeZone: 'module_M2',
    sex: 'female',
    heightCm: 160,
    massKg: 52,
    model: 'crew_C10', // public/models/crew_C10.glb, generated for this body
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

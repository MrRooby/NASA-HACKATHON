// Ekran PROFIL (src/screens/ProfileScreen.jsx, src/profile/*) i codzienny check-in
// (src/checkin/CheckIn.jsx). Klucze takie same jak w en/profile.js.
export default {
  title: 'Profil załoganta',
  tilesLabel: 'Akcje profilu',
  back: 'Wróć',

  // nagłówek
  avatarOf: 'Awatar: {name}',
  photoOf: 'Zdjęcie: {name}',
  ageN: 'Wiek {n}',
  fieldStatus: 'Zdrowie',
  locationUnknown: 'Nieznane',
  statusNone: 'Brak danych o zdrowiu.',
  statusNoMessage: 'Brak komunikatu.',
  wearableData: 'Czujniki',

  // profil innej osoby
  readOnly: 'Przeglądasz: {name} — tylko do odczytu',
  backToOwn: 'Mój profil',
  unknownPerson: 'Brak akt dla {code}.',

  // [ DANE OSOBOWE ]
  dataTitle: 'Dane osobowe',
  fieldAge: 'Wiek',
  fieldBody: 'Wzrost · waga',
  fieldCode: 'Kod załoganta',
  fieldNationality: 'Narodowość',
  fieldHome: 'Moduł mieszkalny',
  fieldLocation: 'Aktualne położenie',
  fieldEducation: 'Wykształcenie',
  fieldBio: 'Notka o załogancie',

  // [ NOTATKI ]
  notesTitle: 'Notatki',
  notesHint: 'Zapis w bazie danych habitatu · jeszcze niepodłączone',
  notesPrivate: 'Wpisy w pamiętniku są prywatne. Czyta je tylko autor.',
  notesEmpty: 'Brak wpisów',
  notesInputLabel: 'Nowy wpis',
  notesPlaceholder: 'Zapisz notatkę z tego sola…',
  notesDisabledPlaceholder: 'Brak połączenia z bazą danych habitatu',
  notesSave: 'Zapisz wpis',

  // [ TESTY PSYCHOLOGICZNE ]
  testsTitle: 'Testy psych.',
  testsHint: 'Kwestionariusze jeszcze niepodłączone',
  testsBattery: 'Bateria kognitywna: PVT · Go/No-Go · DSST',
  testsOpenBattery: 'Testy kognitywne',
  testsColLast: 'Ostatni',
  testsColNext: 'Następny',
  testsReference: 'Źródło',
  testsDuration: '~{n} min',
  testsStart: 'Start',

  // [ POWIADOMIENIA ]
  notificationsTitle: 'Powiadomienia',
  notificationsEmpty: 'Brak aktywnych powiadomień dla tej osoby',

  // [ CODZIENNY CHECK-IN ]
  checkinTitle: 'Codzienny check-in',
  tileToDo: 'Do zrobienia',
  tileDoneAt: 'Zrobione {time} UTC',
  checkinSteps: 'Kroki check-inu',
  checkinStepHeart: 'Serce',
  checkinStepBody: 'Ciało',
  checkinStepMind: 'Psychika',
  checkinLess: 'Zmniejsz: {label}',
  checkinMore: 'Zwiększ: {label}',
  checkinSystolic: 'Ciśnienie skurczowe',
  checkinDiastolic: 'Ciśnienie rozkurczowe',
  checkinHeartRate: 'Tętno spoczynkowe',
  checkinGlucose: 'Glukoza na czczo',
  checkinTemperature: 'Temperatura ciała',
  checkinSleep: 'Długość snu',
  checkinMood: 'Nastrój (1–5)',
  checkinMoodHint: '1 = dyskomfort · 5 = w normie',
  checkinSymptoms: 'Objawy',
  checkinSymptomNone: 'Brak',
  checkinSymptomHeadache: 'Ból głowy',
  checkinSymptomDizziness: 'Zawroty głowy',
  checkinSymptomFatigue: 'Zmęczenie',
  checkinSymptomOther: 'Inne',
  checkinCommit: 'Zatwierdź wpis',
  checkinCommitted: 'Zatwierdzono {time} UTC.',
  checkinAttention: 'Do sprawdzenia: {n}.',

  // [ RAPORT DLA FLIGHT SURGEONA ]
  reportTitle: 'Raport dla flight surgeona',
  reportTile: 'Raport dla lekarza',
  reportHint: 'Asynchroniczne podsumowanie dla Ziemi: odczyty z check-inu i stan narządów z MOTHER. W kolejce na tym terminalu.',
  reportReadings: 'Odczyty',
  reportAttention: 'Poza normą',
  reportMother: 'Podsumowanie MOTHER',
  reportMotherAttached: 'Dołączone',
  reportMotherMissing: 'Brak łącza',
  reportLast: 'Ostatnio w kolejce',
  reportShare: 'Wyślij do flight surgeona',
  reportQueued: 'Raport w kolejce',
  reportQueuedDetail: 'W kolejce na tym terminalu. Transmisja na Ziemię jeszcze niezaimplementowana.',
  reportFailed: 'Raport nie trafił do kolejki.',
};

// Ekran bazy (interaktywna mapa habitatu). Te same klucze co w en/base.js.
// Nazwy kanałów i opisy stref przychodzą z MOTHER po angielsku i nie są tłumaczone.
export default {
  title: 'Baza',

  // Nagłówek
  overall: 'HABITAT',
  offlineNote: 'Brak połączenia z MOTHER · wbudowany habitat, sol {n}',
  loadError: 'Nie wczytano danych habitatu: {message}',
  refreshing: 'ODŚWIEŻANIE…',
  disclaimer: 'Progi są demonstracyjne, to nie limity operacyjne.',

  // Mapa
  mapTitle: 'MAPA HABITATU',
  mapAria: 'Mapa habitatu: wybierz pomieszczenie',
  mapHint: 'DOTKNIJ POMIESZCZENIA',
  simulated: 'SYMULOWANE',
  crewHere: 'załoga: {codes}',
  legendCrew: '● = CZŁONEK ZAŁOGI, DOTKNIJ, BY OTWORZYĆ',

  // Pomieszczenia (pełne nazwy) i krótsze napisy na mapie
  roomAirlock1: 'ŚLUZA 1',
  roomAirlock2: 'ŚLUZA 2',
  roomService: 'SERWIS / MAGAZYN',
  roomMedbay: 'SZPITAL',
  roomRecreation: 'STREFA REKREACYJNA',
  roomLab: 'LAB',
  roomQuartersNorth: 'STREFA MIESZKALNA N',
  roomQuartersSouth: 'STREFA MIESZKALNA S',
  roomTechnical: 'STREFA TECHNICZNA',
  roomReactor: 'REAKTOR',
  mapQuartersNorth: 'STREFA MIESZKALNA',
  mapQuartersSouth: 'STREFA MIESZKALNA',

  // Strefy z bazy danych, które nie są osobnym pomieszczeniem
  zone_gym: 'SIŁOWNIA',
  zone_farm: 'FARMA',
  zone_surface: 'POWIERZCHNIA',
  zone_cupola_1: 'KOPUŁA 1',
  zone_cupola_2: 'KOPUŁA 2',
  zone_cupola_3: 'KOPUŁA 3',
  zone_cupola_4: 'KOPUŁA 4',

  // Wybrane pomieszczenie
  zone: 'STREFA',
  statusNow: 'TERAZ',
  crewPresent: 'OBECNA ZAŁOGA',
  crewNone: 'NIKT',
  openProfile: 'Otwórz profil: {name}',
  readingsOf: 'Odczyty: {name}',
  noReadings: 'Brak odczytów w tym solu.',
  noZoneData: 'Ta strefa nie przysłała danych w tym solu.',
  simulatedZone: 'brak w bazie danych',

  // Tabela odczytów
  colRange: 'MIN – MAX SOLA',
  colNormal: 'NORMA',
  colTime: 'CZAS (UTC)',
  unrated: 'INFO',
  unratedHint: 'Kanał informacyjny: bez progu, nie jest oceniany',
  peakNow: 'SZCZYT {peak} · {now}',
  faultEarlier: 'AWARIA WCZEŚNIEJ W TYM SOLU · {now}',
  nowOk: 'TERAZ OK',
  nowCaution: 'TERAZ UWAGA',
  nowAlert: 'TERAZ ALARM',
  outsideNormal: 'POZA ZAKRESEM NORMY (INFORMACYJNIE)',
  qualitySuspect: 'CZUJNIK NIEPEWNY',
  qualityFault: 'AWARIA CZUJNIKA',
  qualityOther: 'JAKOŚĆ: {quality}',

  // Grupy odczytów
  group_pressure: 'CIŚNIENIE',
  group_air: 'SKŁAD POWIETRZA',
  group_temperature: 'TEMPERATURA',
  group_humidity: 'WILGOTNOŚĆ',
  group_contamination: 'ZANIECZYSZCZENIA POWIETRZA',
  group_radiation: 'PROMIENIOWANIE',
  group_integrity: 'ŚLUZA / SZCZELNOŚĆ',
  group_water: 'WODA',
  group_lightNoise: 'ŚWIATŁO I HAŁAS',
  group_structure: 'KONSTRUKCJA',
  group_power: 'ZASILANIE',
  group_systems: 'PODTRZYMYWANIE ŻYCIA (ECLSS)',
  group_reactor: 'REAKTOR',
  group_stores: 'ZAPASY',
  group_exterior: 'POGODA',
  group_other: 'POZOSTAŁE',

  // Otoczenie i zdarzenia
  exterior: 'OTOCZENIE',
  eventLog: 'DZIENNIK ZDARZEŃ',
  eventCount: 'NIERUTYNOWE: {n}',
  noEvents: 'Brak nierutynowych zdarzeń w tym solu.',
  eventOpen: 'TRWA',
  evaRoutine: 'RUTYNOWE, NIEWYMIENIONE: {starts} WYJŚĆ EVA · {ends} POWROTÓW EVA',

  // Touch layout
  solPrev: 'Poprzedni sol',
  solNext: 'Następny sol',
  events: 'ZDARZENIA',
  exteriorCount: 'STREF: {n} · UWAGA: {flagged}',
  back: 'WSTECZ',
  colGroup: 'GRUPA',
  colSensors: 'CZUJNIKI',
  colQuality: 'JAKOŚĆ',
  trendTitle: 'OSTATNIE {n} SOLI',
  trendOf: 'Trend: {name}',
  noHistory: 'Brak historii: MOTHER jest offline.',
  noTrend: 'Brak trendu dla wartości tekstowej.',
  historyLoading: 'WCZYTYWANIE…',
};

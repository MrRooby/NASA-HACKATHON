// Ekran startowy (dane z opasek + powiadomienia). Zawiera też teksty wspólnej listy
// powiadomień i komunikaty o telemetrii używane przez ekran danych z czujników.
// Klucze jak w en/home.js. Teksty z backendu (nagłówki, zalecenia) zostają po angielsku.
export default {
  title: 'Start',

  wearPanel: 'Dane z opasek',
  notifPanel: 'Powiadomienia',

  limbLeftArm: 'Lewa ręka',
  limbRightArm: 'Prawa ręka',
  limbLeftLeg: 'Lewa noga',
  limbRightLeg: 'Prawa noga',

  circulation: 'Krążenie',
  circulationUnit: '% pozostałych kończyn',
  heartRate: 'Tętno',
  spo2: 'SpO2',
  perfusionIndex: 'Indeks perfuzji',
  skinTemp: 'Temp. skóry',
  band: 'Opaska',
  bandNone: 'brak danych opaski',
  battery: 'Bateria',

  overall: 'Stan ogólny',
  fullScan: 'Pełny skan ciała',
  openScan: 'Otwórz pełny skan ciała',
  figureHint: 'Kliknij sylwetkę, aby otworzyć pełny skan ciała',

  awaiting: 'OCZEKIWANIE NA TELEMETRIĘ…',
  connecting: 'NAWIĄZYWANIE ŁĄCZA — DANE DEMO',
  linkLost: 'UTRATA ŁĄCZA — DANE DEMO',
  linkLostStale: 'UTRATA ŁĄCZA — OSTATNIE ODEBRANE DANE',
  noRecord: 'BRAK KARTY ZDROWIA DLA {code}',
  telemetryFault: 'BŁĄD TELEMETRII',

  notifEmpty: 'BRAK AKTYWNYCH POWIADOMIEŃ',
  notifListLabel: 'Aktywne powiadomienia',
  notifSourceOrgan: 'Zdrowie',
  notifSourceDevice: 'Opaska',
  notifSourceHabitat: 'Habitat',
  notifSourceEvent: 'Zdarzenie',
  notifCountAlert: '{n} ALRT',
  notifCountCaution: '{n} CAUT',
  notifCountInfo: '{n} INFO',
  notifCountNone: 'BEZ UWAG',
  notifHabitatDemo: 'Habitat: dane demo',
  notifHabitatLoading: 'Habitat: oczekiwanie na dane…',
};

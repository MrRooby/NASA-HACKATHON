// Home screen (wearable data + notifications). Also holds the texts of the shared
// NotificationList and of the telemetry notices used by the wearables screen.
// Keep the same keys in pl/home.js. Backend texts (headlines, actions) stay English.
export default {
  title: 'Home',

  wearPanel: 'Wearable data',
  notifPanel: 'Notifications',

  limbLeftArm: 'Left arm',
  limbRightArm: 'Right arm',
  limbLeftLeg: 'Left leg',
  limbRightLeg: 'Right leg',

  circulation: 'Circulation',
  circulationUnit: '% of other limbs',
  heartRate: 'Heart rate',
  spo2: 'SpO2',
  perfusionIndex: 'Perfusion index',
  skinTemp: 'Skin temp',
  band: 'Band',
  bandNone: 'no band data',
  battery: 'Battery',

  overall: 'Overall status',
  fullScan: 'Full body scan',
  openScan: 'Open the full body scan',
  figureHint: 'Click the figure for the full body scan',

  awaiting: 'AWAITING TELEMETRY…',
  connecting: 'ESTABLISHING LINK — SHOWING DEMO DATA',
  linkLost: 'LINK LOST — SHOWING DEMO DATA',
  linkLostStale: 'LINK LOST — SHOWING LAST RECEIVED DATA',
  noRecord: 'NO HEALTH RECORD FOR {code}',
  telemetryFault: 'TELEMETRY FAULT',

  notifEmpty: 'NO ACTIVE NOTIFICATIONS',
  notifListLabel: 'Active notifications',
  notifSourceOrgan: 'Health',
  notifSourceDevice: 'Wearable',
  notifSourceHabitat: 'Habitat',
  notifSourceEvent: 'Event',
  notifCountAlert: '{n} ALRT',
  notifCountCaution: '{n} CAUT',
  notifCountInfo: '{n} INFO',
  notifCountNone: 'ALL CLEAR',
  notifHabitatDemo: 'Habitat: demo data',
  notifHabitatLoading: 'Habitat: awaiting data…',
};

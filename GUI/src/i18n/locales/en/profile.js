// PROFILE screen (src/screens/ProfileScreen.jsx, src/profile/*) and the daily check-in
// (src/checkin/CheckIn.jsx). Keep the same keys in pl/profile.js.
export default {
  title: 'Crew profile',
  tilesLabel: 'Profile actions',
  back: 'Back',

  // header
  avatarOf: 'Avatar of {name}',
  photoOf: 'Photo of {name}',
  ageN: 'Age {n}',
  fieldStatus: 'Health',
  locationUnknown: 'Unknown',
  statusNone: 'No health record available.',
  statusNoMessage: 'No message.',
  wearableData: 'Wearables',

  // someone else's profile
  readOnly: 'Viewing {name} — read only',
  backToOwn: 'My profile',
  unknownPerson: 'No crew file for {code}.',

  // [ PERSONAL DATA ]
  dataTitle: 'Personal data',
  fieldAge: 'Age',
  fieldBody: 'Height · weight',
  fieldCode: 'Crew code',
  fieldNationality: 'Nationality',
  fieldHome: 'Home module',
  fieldLocation: 'Current location',
  fieldEducation: 'Education',
  fieldBio: 'Crew note',

  // [ NOTES ]
  notesTitle: 'Notes',
  notesHint: 'Will be stored in the base database · not connected yet',
  notesPrivate: 'Diary entries are private. Only the author can read them.',
  notesEmpty: 'No entries',
  notesInputLabel: 'New entry',
  notesPlaceholder: 'Write a note for this sol…',
  notesDisabledPlaceholder: 'Not connected to the base database',
  notesSave: 'Save entry',

  // [ PSYCH TESTS ]
  testsTitle: 'Psych tests',
  testsHint: 'Questionnaires not connected yet',
  testsBattery: 'Cognitive battery: PVT · Go/No-Go · DSST',
  testsOpenBattery: 'Cognitive tests',
  testsColLast: 'Last',
  testsColNext: 'Next',
  testsReference: 'Ref',
  testsDuration: '~{n} min',
  testsStart: 'Start',

  // [ NOTIFICATIONS ]
  notificationsTitle: 'Notifications',
  notificationsEmpty: 'No active notifications for this crew member',

  // [ DAILY CHECK-IN ]
  checkinTitle: 'Daily check-in',
  tileToDo: 'To do',
  tileDoneAt: 'Done {time} UTC',
  checkinSteps: 'Check-in steps',
  checkinStepHeart: 'Heart',
  checkinStepBody: 'Body',
  checkinStepMind: 'Mind',
  checkinLess: 'Decrease {label}',
  checkinMore: 'Increase {label}',
  checkinSystolic: 'Systolic pressure',
  checkinDiastolic: 'Diastolic pressure',
  checkinHeartRate: 'Resting heart rate',
  checkinGlucose: 'Fasting glucose',
  checkinTemperature: 'Body temperature',
  checkinSleep: 'Sleep duration',
  checkinMood: 'Mood (1–5)',
  checkinMoodHint: '1 = distress · 5 = nominal',
  checkinSymptoms: 'Symptoms',
  checkinSymptomNone: 'None',
  checkinSymptomHeadache: 'Headache',
  checkinSymptomDizziness: 'Dizziness',
  checkinSymptomFatigue: 'Fatigue',
  checkinSymptomOther: 'Other',
  checkinCommit: 'Commit entry',
  checkinCommitted: 'Committed {time} UTC.',
  checkinAttention: 'To check: {n}.',
  checkinAllNormal: 'All normal.',

  // [ FLIGHT SURGEON REPORT ]
  reportTitle: 'Flight surgeon report',
  reportTile: 'Surgeon report',
  reportHint: 'Async summary for Earth: check-in readings plus MOTHER organ status. Queued on this terminal.',
  reportReadings: 'Readings',
  reportAttention: 'Outside normal',
  reportMother: 'MOTHER summary',
  reportMotherAttached: 'Attached',
  reportMotherMissing: 'No link',
  reportLast: 'Last queued',
  reportShare: 'Share with flight surgeon',
  reportQueued: 'Report queued',
  reportQueuedDetail: 'Queued on this terminal. Transmission to Earth not implemented yet.',
  reportFailed: 'The report was not queued.',
};

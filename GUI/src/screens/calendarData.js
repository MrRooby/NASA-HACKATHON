import { addDays, isoDate, startOfWeek } from './calendar.js';

/**
 * Demo adapter for the future calendar API.
 * Expected replacement shape:
 * { events: [{ id, date, title, kind }], status: [{ date, baseStatus, crewWellbeing }] }
 */
export const CALENDAR_DATA_SOURCE = 'demo';

const EVENT_TEMPLATES = [
  { offset: 0, title: 'Kontrola systemów habitatu', kind: 'base' },
  { offset: 1, title: 'Trening ARED', kind: 'crew' },
  { offset: 2, title: 'Przegląd zapasów', kind: 'base' },
  { offset: 3, title: 'Badanie dobrostanu załogi', kind: 'crew' },
  { offset: 5, title: 'Okno komunikacyjne', kind: 'mission' },
  { offset: 6, title: 'Planowanie kolejnego tygodnia', kind: 'mission' },
];

function demoStatus(date, offset) {
  return {
    date: isoDate(date),
    baseStatus: [88, 92, 85, 90, 94, 89, 91][offset],
    crewWellbeing: [82, 86, null, 79, 88, 84, 87][offset],
  };
}

export function getCalendarData(referenceDate) {
  const rangeStart = addDays(startOfWeek(referenceDate), -42);
  const events = [];
  const status = [];
  for (let offset = 0; offset <= 84; offset += 1) {
    const date = addDays(rangeStart, offset);
    const dayOffset = ((offset % 7) + 7) % 7;
    const template = EVENT_TEMPLATES.find(event => event.offset === dayOffset);
    if (template) events.push({ ...template, id: `${isoDate(date)}-${offset}`, date: isoDate(date) });
    status.push(demoStatus(date, dayOffset));
  }
  const todayKey = isoDate(new Date());
  const nextWeekKey = isoDate(addDays(startOfWeek(new Date()), 9));
  const crowdedKey = isoDate(addDays(startOfWeek(referenceDate), 3));
  const testEvents = [
    'Kontrola szczelności śluzy',
    'Kalibracja sensorów',
    'Przegląd zapasów tlenu',
    'Raport medyczny załogi',
    'Ćwiczenia awaryjne',
    'Synchronizacja komunikacji',
    'Inspekcja modułu mieszkalnego',
  ];
  const nextWeekEvents = ['Test łazika', 'Okno komunikacyjne', 'Pomiar promieniowania', 'Odprawa załogi'];
  const crowdedEvents = Array.from({ length: 17 }, (_, index) => `Zadanie operacyjne ${index + 1}`);
  const generatedEvents = events.slice();
  const generatedWithoutTestDays = generatedEvents.filter(event => event.date !== todayKey && event.date !== nextWeekKey && event.date !== crowdedKey);
  events.length = 0;
  events.push(...generatedWithoutTestDays.concat(testEvents.map((title, index) => ({
    id: `${todayKey}-test-${index}`,
    date: todayKey,
    title,
    kind: ['base', 'mission', 'base', 'crew', 'mission', 'crew', 'base'][index],
  })),
  nextWeekEvents.map((title, index) => ({
    id: `${nextWeekKey}-test-${index}`,
    date: nextWeekKey,
    title,
    kind: ['mission', 'crew', 'base', 'mission'][index],
  })),
  crowdedEvents.map((title, index) => ({
    id: `${crowdedKey}-test-${index}`,
    date: crowdedKey,
    title,
    kind: ['base', 'crew', 'mission'][index % 3],
  }))));
  return {
    source: CALENDAR_DATA_SOURCE,
    events,
    status,
    error: null,
  };
}

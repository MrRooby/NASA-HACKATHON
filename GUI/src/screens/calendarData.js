import { addDays, isoDate, startOfWeek } from './calendar.js';

/**
 * Demo adapter for the future calendar API.
 * Expected replacement shape:
 * { events: [{ id, date, title, kind }], status: [{ date, baseStatus, crewWellbeing }] }
 */
export const CALENDAR_DATA_SOURCE = 'demo';

const EVENT_TEMPLATES = [
  { offset: 0, title: 'Kontrola systemów habitatu', titleKey: 'calendar.evHabitatCheck', kind: 'base' },
  { offset: 1, title: 'Trening ARED', titleKey: 'calendar.evAred', kind: 'crew' },
  { offset: 2, title: 'Przegląd zapasów', titleKey: 'calendar.evSupplies', kind: 'base' },
  { offset: 3, title: 'Badanie dobrostanu załogi', titleKey: 'calendar.evWellbeing', kind: 'crew' },
  { offset: 5, title: 'Okno komunikacyjne', titleKey: 'calendar.evCommWindow', kind: 'mission' },
  { offset: 6, title: 'Planowanie kolejnego tygodnia', titleKey: 'calendar.evWeekPlan', kind: 'mission' },
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
  // Demo titles are Polish source text; titleKey shows them in the UI language.
  const TITLE_KEYS = {
    'Kontrola systemów habitatu': 'calendar.evHabitatCheck',
    'Trening ARED': 'calendar.evAred',
    'Przegląd zapasów tlenu': 'calendar.evOxygenStock',
    'Przegląd zapasów': 'calendar.evSupplies',
    'Badanie dobrostanu załogi': 'calendar.evWellbeing',
    'Okno komunikacyjne': 'calendar.evCommWindow',
    'Planowanie kolejnego tygodnia': 'calendar.evWeekPlan',
    'Kontrola szczelności śluzy': 'calendar.evAirlockLeak',
    'Kalibracja sensorów': 'calendar.evSensorCal',
    'Raport medyczny załogi': 'calendar.evMedReport',
    'Ćwiczenia awaryjne': 'calendar.evDrill',
    'Synchronizacja komunikacji': 'calendar.evCommSync',
    'Inspekcja modułu mieszkalnego': 'calendar.evHabInspect',
    'Test łazika': 'calendar.evRoverTest',
    'Pomiar promieniowania': 'calendar.evRadiation',
    'Odprawa załogi': 'calendar.evBriefing',
  };
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
    titleKey: TITLE_KEYS[title],
    kind: ['base', 'mission', 'base', 'crew', 'mission', 'crew', 'base'][index],
  })),
  nextWeekEvents.map((title, index) => ({
    id: `${nextWeekKey}-test-${index}`,
    date: nextWeekKey,
    title,
    titleKey: TITLE_KEYS[title],
    kind: ['mission', 'crew', 'base', 'mission'][index],
  })),
  crowdedEvents.map((title, index) => ({
    id: `${crowdedKey}-test-${index}`,
    date: crowdedKey,
    title,
    titleKey: 'calendar.evTask',
    titleParams: { n: index + 1 },
    kind: ['base', 'crew', 'mission'][index % 3],
  }))));
  return {
    source: CALENDAR_DATA_SOURCE,
    events,
    status,
    error: null,
  };
}

// Demo scenario layered over the live MOTHER data (the database is read-only):
// on the last sol of the mission the commander, Aleksander Polkowski (HAB-C1), is in the reactor
// bay after a shield fault and has taken a severe radiation dose.
//
// Everything is applied in one place (src/api.js wraps the three endpoints) so every screen
// (home, map, crew, notifications) tells the same story. Earlier sols are left untouched.

export const SCENARIO = {
  crew: 'HAB-C1',
  crewShort: 'C1',
  room: 'reactor',
  fromSol: 600, // the last sol in the database
  doseCareerMsv: 712.4, // 119 % of the 600 mSv NASA career limit
  doseAcuteMsv: 386, // last 24 h; NASA 30-day limit for blood-forming organs is 250 mGy-Eq
  shieldDoseRate: 4860, // µGy/h at the reactor shield boundary (normal ≤ 25)
};

const LIMIT_CAREER_MSV = 600;

// Off in unit tests (they check the raw API data); its own tests turn it on.
let enabled = import.meta.env?.MODE !== 'test';
export const setScenarioEnabled = on => { enabled = Boolean(on); };

const activeSol = sol => enabled && Number.isFinite(Number(sol)) && Number(sol) >= SCENARIO.fromSol;

const HEADLINE = `Severe radiation dose: ${SCENARIO.doseAcuteMsv} mSv in 24 h in the reactor bay.`;
const ACTION = 'Leave the reactor bay now. Medbay: blood count and anti-nausea treatment; report to the flight surgeon.';

/** /api/organs/{code}: the commander's exposure card turns red. */
export function scenarioReport(report) {
  if (!report || report?.subject?.code !== SCENARIO.crew || !activeSol(report?.as_of?.sol)) return report;
  const organs = (report.organs || []).map(organ => {
    if (organ.organ !== 'exposure') return organ;
    const checks = (organ.checks || []).map(check => (check.code === 'dose_career'
      ? {
        ...check,
        value: SCENARIO.doseCareerMsv,
        status: 'alert',
        message: `${Math.round(SCENARIO.doseCareerMsv)} mSv = ${Math.round((SCENARIO.doseCareerMsv / LIMIT_CAREER_MSV) * 100)}% of the NASA career limit.`,
        action: ACTION,
      }
      : check));
    checks.unshift({
      organ: 'exposure',
      code: 'dose_acute',
      label: 'Radiation dose, last 24 h',
      value: SCENARIO.doseAcuteMsv,
      unit: 'mSv',
      status: 'alert',
      message: `${SCENARIO.doseAcuteMsv} mSv in 24 h, above the 30-day limit of 250 mSv.`,
      action: ACTION,
      formula: 'dosimeter dose over the last 24 h',
      reference: 'NASA-STD-3001 Vol 1 [4030]',
      basis: 'source',
      inputs: {},
    });
    const metrics = (organ.metrics || []).map(metric => (/radiation dose/i.test(metric.name)
      ? { ...metric, value: SCENARIO.doseCareerMsv, status: 'alert' }
      : metric));
    metrics.unshift({ name: 'Radiation dose, last 24 h', value: SCENARIO.doseAcuteMsv, unit: 'mSv', status: 'alert' });
    return { ...organ, status: 'alert', headline: HEADLINE, why: 'Shield fault in the reactor bay.', action: ACTION, checks, metrics };
  });
  return { ...report, organs, overall_status: 'alert', top_message: HEADLINE };
}

/** /api/organs: the crew overview row of the commander. */
export function scenarioOverview(list) {
  if (!Array.isArray(list)) return list;
  return list.map(row => (row?.subject?.code === SCENARIO.crew
    ? { ...row, overall_status: 'alert', top_message: HEADLINE, organs: { ...(row.organs || {}), exposure: 'alert' } }
    : row));
}

/** /api/habitat: the commander stands in the reactor bay, with a radiation event of the sol. */
export function scenarioHabitat(data) {
  if (!data || !Array.isArray(data.zones) || !activeSol(data?.as_of?.sol)) return data;
  const zones = data.zones.map(zone => (zone.occupants?.includes(SCENARIO.crewShort)
    ? { ...zone, occupants: zone.occupants.filter(code => code !== SCENARIO.crewShort) }
    : zone));
  zones.push({
    code: SCENARIO.room, label: 'Reactor', type: 'reactor', module_id: null, pressurized: true,
    // status comes from the simulated reactor readings on the map, so the zone itself stays neutral
    status: 'ok', now_status: 'ok', occupants: [SCENARIO.crewShort], readings: [],
  });
  const at = data.as_of?.occupants_at ?? data.as_of?.last_reading_utc ?? null;
  const events = [{
    code: 'evt-reactor-dose', type: 'radiation_exposure', start_utc: at, end_utc: null, sol: data.as_of.sol,
    zone: SCENARIO.room, crew: SCENARIO.crewShort, severity: 'critical', source_flag: 'simulated',
  }, ...(data.events || [])];
  return { ...data, zones, events, overall_status: 'alert' };
}

/** Simulated reactor readings: the shield boundary dose rate is far above its limit. */
export function scenarioRoomReadings(roomId, readings, sol) {
  if (roomId !== SCENARIO.room || !activeSol(sol)) return readings;
  return readings.map(reading => (reading.channel === 'shield_dose_rate'
    ? {
      ...reading, value: SCENARIO.shieldDoseRate, max: SCENARIO.shieldDoseRate,
      outside_normal: true, status: 'alert', worst_status: 'alert',
    }
    : reading));
}

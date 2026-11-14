// Built-in DEMO organ reports for the habitat crew, shown while MOTHER is unreachable.
// Recorded GET /api/organs/{code} responses of the team's synthetic dataset:
// HAB-C1..C3 at the latest sol, HAB-C4 at sol 142 (left-leg perfusion alert), so the
// offline demo also shows an alert. Every report returned here carries `demo: true`.
import habC1 from './demo/organs_HAB-C1.json';
import habC2 from './demo/organs_HAB-C2.json';
import habC3 from './demo/organs_HAB-C3.json';
import habC4 from './demo/organs_HAB-C4.json';

const REPORTS = { 'HAB-C1': habC1, 'HAB-C2': habC2, 'HAB-C3': habC3, 'HAB-C4': habC4 };

export const DEMO_CODES = Object.keys(REPORTS);

const normalise = code => {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  if (REPORTS[upper]) return upper;
  return REPORTS[`HAB-${upper}`] ? `HAB-${upper}` : null;
};

/** demoReport('HAB-C4') or demoReport('C4') -> organ report with `demo: true`; null for anyone else. */
export function demoReport(code) {
  const key = normalise(code);
  return key ? { ...REPORTS[key], demo: true } : null;
}

/** Crew overview in the shape of GET /api/organs, built from the demo reports. */
export function demoOverview() {
  return DEMO_CODES.map(code => {
    const report = REPORTS[code];
    return {
      subject: report.subject,
      overall_status: report.overall_status,
      top_message: report.top_message,
      organs: Object.fromEntries((report.organs || []).map(card => [card.organ, card.status])),
      demo: true,
    };
  });
}

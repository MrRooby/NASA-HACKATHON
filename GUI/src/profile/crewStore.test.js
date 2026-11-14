import { describe, expect, it, vi } from 'vitest';
import {
  NOT_CONNECTED,
  PSYCH_TEST_CATALOG,
  STORAGE_UNAVAILABLE,
  SURGEON_REPORT_KEY,
  addNote,
  listNotes,
  listPsychResults,
  listPsychTests,
  listSurgeonReports,
  queueSurgeonReport,
  submitPsychResult,
} from '../data/crewStore.js';

describe('crewStore: notes / diary (skeleton)', () => {
  it('lists no notes and says the store is not connected', async () => {
    const result = await listNotes('HAB-C1');
    expect(result.items).toEqual([]);
    expect(result.connected).toBe(false);
    expect(result.endpoint).toMatch(/\/api\/crew\/\{code\}\/notes/);
  });

  it('rejects a new note with NOT_CONNECTED and stores the text nowhere', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await expect(addNote('HAB-C1', { text: 'Dear diary, sol 142.', sol: 142 })).rejects.toMatchObject({ code: NOT_CONNECTED });
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect((await listNotes('HAB-C1')).items).toEqual([]);
  });
});

describe('crewStore: psychological tests (skeleton)', () => {
  it('has the five catalogue entries, all unavailable, with EN and PL texts', () => {
    expect(PSYCH_TEST_CATALOG.map(test => test.id)).toEqual([
      'mood_state', 'symptom_checklist', 'pvt', 'sleep_quality', 'team_cohesion',
    ]);
    for (const test of PSYCH_TEST_CATALOG) {
      expect(test.available).toBe(false);
      expect(test.name.en).toBeTruthy();
      expect(test.name.pl).toBeTruthy();
      expect(test.purpose.en).toBeTruthy();
      expect(test.purpose.pl).toBeTruthy();
      expect(test.cadence.everySols).toBeGreaterThan(0);
      expect(test.cadence.label.en).toBeTruthy();
      expect(test.cadence.label.pl).toBeTruthy();
      expect(test.durationMin).toBeGreaterThan(0);
      expect(test.reference).toBeTruthy();
    }
  });

  it('lists the catalogue as a static, not connected source', async () => {
    const result = await listPsychTests();
    expect(result.items).toBe(PSYCH_TEST_CATALOG);
    expect(result.connected).toBe(false);
    expect(result.source).toBe('static-catalog');
  });

  it('has no results and rejects a submission with NOT_CONNECTED', async () => {
    const results = await listPsychResults('HAB-C2');
    expect(results.items).toEqual([]);
    expect(results.connected).toBe(false);
    await expect(submitPsychResult('HAB-C2', 'pvt', { sol: 142, answers: [] })).rejects.toMatchObject({ code: NOT_CONNECTED });
    expect(window.localStorage.length).toBe(0);
  });
});

describe('crewStore: flight-surgeon report queue', () => {
  const report = { sol: 142, indicators: [{ id: 'sbp', value: 128, status: 'caution' }] };

  it('starts empty', async () => {
    const result = await listSurgeonReports('HAB-C1');
    expect(result.items).toEqual([]);
    expect(result.source).toBe('localStorage');
  });

  it('round-trips a report through localStorage under orbit-health-report', async () => {
    const queued = await queueSurgeonReport('HAB-C1', report);
    expect(queued.transport).toBe('localStorage');
    expect(queued.connected).toBe(false);
    expect(queued.report).toMatchObject({ ...report, crewCode: 'HAB-C1' });
    expect(Number.isNaN(Date.parse(queued.queuedAt))).toBe(false);

    const stored = JSON.parse(window.localStorage.getItem(SURGEON_REPORT_KEY));
    expect(SURGEON_REPORT_KEY).toBe('orbit-health-report');
    expect(stored).toEqual(queued.report);

    expect((await listSurgeonReports('HAB-C1')).items).toEqual([queued.report]);
  });

  it('lists a report only for the person who queued it', async () => {
    await queueSurgeonReport('HAB-C1', report);
    expect((await listSurgeonReports('HAB-C2')).items).toEqual([]);
    expect((await listSurgeonReports()).items).toHaveLength(1);
  });

  it('keeps the createdAt of the report when it has one', async () => {
    const queued = await queueSurgeonReport('HAB-C3', { ...report, createdAt: '2039-05-26T21:00:00.000Z' });
    expect(queued.queuedAt).toBe('2039-05-26T21:00:00.000Z');
  });

  it('ignores corrupt stored data', async () => {
    window.localStorage.setItem(SURGEON_REPORT_KEY, '{not json');
    expect((await listSurgeonReports('HAB-C1')).items).toEqual([]);
  });

  it('rejects when the report cannot be stored, instead of pretending it was queued', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    await expect(queueSurgeonReport('HAB-C1', report)).rejects.toMatchObject({ code: STORAGE_UNAVAILABLE });
  });

  it('needs a crew code', async () => {
    await expect(queueSurgeonReport('', report)).rejects.toMatchObject({ code: 'INVALID' });
  });
});

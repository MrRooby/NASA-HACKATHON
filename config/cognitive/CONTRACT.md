# Cognitive tests: shared contract (v1.0)

MVP tests: **PVT-B** (`pvt`), **Go/No-Go** (`gonogo`) and **DSST** (`dsst`). These are performance indicators compared with the person's own baseline, **not a medical diagnosis**.

The source of truth for metrics is `MOTHER/mother/cognitive_scoring.py`. Fixtures in `config/cognitive/fixtures/*.json` hold trials and the exact expected output. Both the Python implementation and the JS port (`GUI/src/cognitive/tests/*/scoring.js`) must reproduce them within 1e-6. The full specification is in `/home/harry/.claude/plans/popatrz-na-notatk-o-immutable-candy.md` (§2, §3, §5).

## 1. Protocols (what the GUI runs)

| test_id | protocol | parameters |
|---|---|---|
| `pvt` | `pvtb-1.0` | 180 s; ISI uniform 1000–4000 ms **measured from the previous response and including the 1000 ms RT feedback** (Basner 2011: "1–4 s (including a 1 s RT feedback interval)"), so the blank wait after feedback is 0–3000 ms; the first trial has no feedback and waits the whole ISI; red ms counter; Space/tap; timeout 30 000 ms → lapse (`timeout:true`, `rt_ms:null`). Response before the stimulus → `false_start` (`rt_ms:null`), then ISI restarts. Response: rt<100 → `false_start`, 100≤rt<355 → `response`, rt≥355 → `lapse`. 3 practice trials (`is_practice:true`). |
| `gonogo` | `gonogo-1.0` | 10 practice + 120 trials (90 GO = circle, 30 NO-GO = square, same colour). Stimulus 500 ms; response window 0–800 ms from onset; ITI 1000 ± 250 ms. Sequence: first 3 trials GO, ≤2 NO-GO in a row, 7–8 NO-GO per quarter. Events: `hit`, `omission`, `commission`, `correct_rejection`. GO responses with rt<150 → `hit` with `anticipation:true`. |
| `dsst` | `dsst-1.0` | 90 s; 9 own SVG symbols ↔ digits 1–9, key always visible; stimulus sets A–D (different symbol→digit permutations); 9 practice trials. Blocks of 9 (permutation of all 9 symbols), never the same symbol twice in a row. Input: `Digit1-9`/`Numpad1-9` (`event.code`) or a 3×3 on-screen keypad. Events: `correct`, `error`. Answers after 90 s are not recorded. |

The stimulus set rotates A→B→C→D by `session_no` (`'ABCD'[(session_no-1) % 4]`). Seed: FNV-1a 32-bit of `${subject_code}|${test_id}|${stimulus_set}|${session_no}`, fed into mulberry32.

## 2. Trial object (GUI → API → DB `astro_cognitive.test_trial`)

```json
{ "idx": 0, "is_practice": false, "stimulus": "go", "condition": null,
  "isi_ms": 2310, "t_onset_ms": 12345.67, "t_response_ms": 12601.2, "rt_ms": 255.53,
  "expected": "3", "actual": "3", "event_type": "hit",
  "timeout": false, "anticipation": false, "valid": true, "focus_lost": false, "ts_source": "e" }
```
- `stimulus`: PVT `"counter"`, Go/No-Go `"go"|"nogo"`, DSST symbol id such as `"A3"` (set + digit).
- `ts_source`: `"e"` = `event.timeStamp`, `"h"` = `performance.now()` in the handler.
- Missing fields default to: `is_practice` false, `valid` true, `timeout`/`anticipation`/`focus_lost` false, other fields null.

## 3. API (MOTHER, all JSON, `Cache-Control: no-store`)

### `POST /api/cognitive/sessions`
Header `X-Requested-With: awernasa` is required (403 without it). The body is at most 1 MB (413 if larger).
```json
{
  "client_session_uuid": "8c7d…-uuid4",
  "subject_code": "SYN-01", "mission_code": "SYN-ISS-180",
  "test_id": "pvt", "protocol_version": "pvtb-1.0", "app_version": "0.2.0",
  "stimulus_set": "A", "seed": 123456789, "session_no": 1,
  "battery_uuid": null, "battery_position": null,
  "is_practice": false, "status": "complete", "status_reason": null,
  "started_at": "2026-11-14T08:01:02.123Z", "completed_at": "2026-11-14T08:04:10.000Z", "tz_offset_min": 60,
  "duration_s": 180,
  "device": { "device_class": "keyboard", "user_agent": "…", "screen_w": 1920, "screen_h": 1080, "dpr": 1,
              "refresh_hz": 60.0, "frame_jitter_ms": 1.2, "timer_resolution_ms": 0.1, "focus_lost_ms": 0 },
  "context": { "sleep_h": 7.5, "sleep_quality": 7, "fatigue": 3, "kss": 3, "stress": 2, "caffeine_3h": false },
  "client_metrics": { "pvt_median_rt_ms": 281.0 },
  "trials": [ … ], "events": [ { "seq": 0, "t_ms": 1234.5, "kind": "blur", "detail": null } ]
}
```
- `status` from the client is one of `complete|interrupted|aborted`. The server may downgrade a session to `invalid` (from scoring) or set `quality` to `low`.
- `mission_code` is optional. If it is missing, the server uses the person's newest participation (`astro_api.subjects`).
- Validation (422):
  - unknown `test_id` or `protocol_version`;
  - `event_type` not allowed for the test (see `EVENT_TYPES`);
  - `rt_ms` outside 0–30000;
  - duplicate `idx`;
  - more than 400 trials or 500 events;
  - `started_at` more than 5 min in the future or more than 30 days old;
  - context scales outside their ranges (fatigue/stress/sleep_quality 1–10, kss 1–9, sleep_h 0–24).
- Unknown subject, or subject without a participation in the mission: 404.
- Missing writer credentials or DB down: 503 with `hint`.
- The **server re-scores** with `cognitive_scoring.score(test_id, trials, duration_s)` and never stores `client_metrics`. If any client metric differs by more than 1 %, it logs a `scoring_mismatch` event.
- Response 201 for a new session, or 200 with the identical body when `client_session_uuid` already exists:
```json
{ "session_id": 17, "client_session_uuid": "…", "duplicate": false, "test_id": "pvt",
  "status": "complete", "quality": "ok", "is_practice": false,
  "metrics": { "pvt_median_rt_ms": 281.0, … }, "scoring_version": "1.0" }
```

### `GET /api/cognitive/{subject_code}`
```json
{ "schema_version": "cog-1.0", "subject": { "code": "SYN-01", "data_kind": "synthetic" },
  "disclaimer": "Performance indicator compared with your own baseline - not a diagnosis.",
  "tests": [
    { "test_id": "pvt", "label": "Reaction time (PVT)", "status": "ok|caution|alert|no_data",
      "headline": "Reaction time +4% vs your baseline.",
      "baseline": { "n": 3, "needed": 3, "ready": true },
      "latest": { "session_id": 17, "started_at": "…", "session_no": 5, "quality": "ok",
                  "metrics": { … }, "z": { "pvt_median_rt_ms": -0.4 }, "pct_change": { "pvt_median_rt_ms": 4.1 } },
      "trend": [ { "started_at": "…", "value": 281.0 } ],
      "next": { "session_no": 6, "stimulus_set": "B" } }
  ],
  "composite_z": -0.3 }
```
- Order of `tests` is always pvt, gonogo, dsst.
- The trend is the last 12 values of the key metric: `pvt_median_rt_ms`, `gonogo_commission_rate`, `dsst_throughput_per_min`.
- Until a baseline exists, `status` is `no_data` and the headline is "Building your baseline (n/3)".

### `GET /api/cognitive/protocols`
Returns the protocol table above as JSON (the GUI also keeps an offline copy).

## 4. Status rules (MOTHER; `basis: team_assumption` unless marked)

| key metric | rule | ok | caution | alert |
|---|---|---|---|---|
| PVT `pvt_median_rt_ms` | % change vs baseline (source basner_2024) | <10 | 10–20 | ≥20 |
| PVT `pvt_lapses` | absolute | 0–2 | 3–5 | ≥6 |
| Go/No-Go `gonogo_commission_rate` | absolute | <0.15 | 0.15–0.30 | ≥0.30 |
| DSST `dsst_throughput_per_min` | performance z vs baseline | ≥ −1 | (−2, −1) | ≤ −2 |

- A test's status is the worst of its rules.
- Baseline uses the first 3–5 sessions with `is_practice=0`, `status='complete'`, `quality='ok'` and the same `test_id` + `device_class`. The first session per test is always marked `is_practice=1`.
- `composite_z` is the mean of the performance z of the 3 key metrics. It is null unless all 3 tests have a baseline.

## 5. Database (MariaDB)

- New database `astro_cognitive`, created by `DATABASE/schema/013_cognitive_core.sql`, with tables `test_definition`, `test_session`, `test_trial`, `test_metric`, `test_event`.
  - FK types: `astro_core.subject.id` is `INT UNSIGNED`, `astro_core.mission.id` is `SMALLINT UNSIGNED`, `astro_core.import_batch.id` is `INT UNSIGNED`.
- Views in `astro_api` (`014`): `cognitive_sessions`, `cognitive_trials`, `cognitive_metrics`, `cognitive_latest`.
- Users (`015_users_cognitive.sh`): `cognitive_writer` with password from env `COGNITIVE_WRITER_PASSWORD`.
- `016_cognitive_seed.sql`:
  - adds `'cognitive'` to `astro_core.indicator.category`;
  - inserts `data_source` `mother_app_cognitive` (data_kind `real_analog`, access_status `generated`);
  - upserts indicators.
- Mirror of complete, non-practice, `quality='ok'` sessions into `astro_core.observation`:

  | indicator code | value | category | unit | sample_type |
  |---|---|---|---|---|
  | `pvt_reaction_ms` | `pvt_median_rt_ms` (already exists; keep category `fitness`) | — | ms | `manual_device` |
  | `pvt_lapses` | count | cognitive | count | `manual_device` |
  | `gonogo_commission_rate` | 0–1 | cognitive | ratio | `manual_device` |
  | `dsst_throughput_per_min` | per minute | cognitive | per min | `manual_device` |

  - Other columns:
    - `anchor='launch'`;
    - `day_offset` = `(date(started_at) - mission.start_date).days` (`anchor='none'` when `start_date` is NULL);
    - `measured_at=started_at` (UTC);
    - `source_id='mother_app_cognitive'` (synthetic data uses the generator's source);
    - `import_batch_id` = one `import_batch` row per session (adapter `mother_cognitive`, `file_name='session:<uuid>'`, `file_sha256=sha256(uuid)`, `status='ok'`). This row also refreshes MOTHER's dashboard cache, which watches `import_log`.
  - MOTHER maps `pvt_reaction_ms` to its internal id `reaction_time_ms` (`db_mission.DB_TO_MOTHER`).

## 6. File ownership (parallel work, do not edit files you don't own)

| owner | files |
|---|---|
| DB | `DATABASE/schema/013–016*`, `DATABASE/schema/COGNITIVE.md`, `DATABASE/schema/README.md`, `DATABASE/docker-compose.yml`, `DATABASE/.env.example`, `DATABASE/synthetic/cognitive_generate.py`, `DATABASE/etl/load_cognitive.py`, `DATABASE/tests/**`, `DATABASE/README.md` |
| MOTHER | `MOTHER/**` (except `cognitive_scoring.py`, which is frozen: report problems instead of editing), `config/thresholds.json`, `config/inflight_measurements.json`, `config/sources.json` (+ identical copies in `MOTHER/config/shared/`), `.github/workflows/ci.yml` |
| GUI | `GUI/**` |
| frozen | `config/cognitive/**`, `MOTHER/mother/cognitive_scoring.py` |

**Never `git commit`, `git push`, `git checkout` or `git stash`**. Leave all changes uncommitted in the working tree.

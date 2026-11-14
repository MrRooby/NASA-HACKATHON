# Cognitive tests schema

Contract: [`config/cognitive/CONTRACT.md`](../../config/cognitive/CONTRACT.md). The MVP tests are PVT-B (`pvt`),
Go/No-Go (`gonogo`) and DSST (`dsst`). They are performance indicators compared with a person's own baseline, **not a
diagnosis**. The source of truth for every metric is `MOTHER/mother/cognitive_scoring.py` (`scoring_version` is stored
with each metric).

## Files

| File | Content |
|---|---|
| `013_cognitive_core.sql` | database `astro_cognitive`: `test_definition` (seeded pvt/gonogo/dsst), `test_session`, `test_trial`, `test_metric`, `test_event` |
| `014_cognitive_api_views.sql` | `astro_api.cognitive_sessions`, `cognitive_trials`, `cognitive_metrics`, `cognitive_latest` |
| `015_users_cognitive.sh` | grants for `astro_etl` / `admin` and the `cognitive_writer` user (password from `COGNITIVE_WRITER_PASSWORD`) |
| `016_cognitive_seed.sql` | `indicator.category += 'cognitive'`, `data_source` `mother_app_cognitive`, the four mirrored indicators |

Each file is mounted explicitly in `docker-compose.yml`; they run on the first start of an empty volume. On an existing
volume apply them by hand as root (013, 014, then `bash 015_users_cognitive.sh` with `COGNITIVE_WRITER_PASSWORD` and
`MARIADB_ROOT_PASSWORD` set, then 016). They are idempotent apart from 013's `CREATE TABLE`.

## Tables

* `test_session`: one row per run. `client_session_uuid` is `UNIQUE` (idempotent POST). FKs: `subject_id`
  (`INT UNSIGNED`), `mission_id` (`SMALLINT UNSIGNED`, nullable), `test_id`. `status` is
  `complete|interrupted|aborted|invalid`, `quality` is `ok|low`. Device and context fields come from the POST payload;
  context scales have CHECKs (fatigue/stress/sleep_quality 1-10, kss 1-9, sleep_h 0-24). `device_class` also allows
  `unknown` (default) when the client sends no device block. `source_id` and `import_batch_id` are plain columns
  (no FK) so the writer stays decoupled from `astro_core` maintenance.
* `test_trial`: `(session_id, idx)` key, the trial object of CONTRACT section 2. `rt_ms` is a `DOUBLE`, so scoring can be
  reproduced exactly from the database. `event_type` allows exactly the union of `EVENT_TYPES`.
* `test_metric`: `(session_id, metric_code)` with `value DOUBLE NULL` (NULL = not computable) and `scoring_version`.
* `test_event`: client events (blur, visibility, `scoring_mismatch`, ...).
* Deleting a session cascades to trials, metrics and events.

## Views (`astro_api`)

All expose `subject_code`, `mission_code`, `test_id` and `session_uuid`. `cognitive_latest` returns the latest
`complete`, non-practice session per (subject, test). `astro_reader` reads them through its existing `SELECT` on
`astro_api.*`.

## Users

| User | Rights |
|---|---|
| `astro_etl` | `SELECT, INSERT, UPDATE, DELETE` on `astro_cognitive.*` |
| `admin` | `ALL` on `astro_cognitive.*` |
| `cognitive_writer` (MOTHER) | `SELECT, INSERT` on `test_session` and `test_metric`; `INSERT` on `test_trial`, `test_event`; `SELECT` on `test_definition`; `SELECT` on `astro_core.subject/mission/indicator/participation`; `INSERT` on `astro_core.observation` and `import_batch`; `SELECT` on `astro_api.subjects` and `cognitive_*`. No `UPDATE`/`DELETE`. |

## Mirror into `astro_core.observation`

Complete, non-practice, `quality='ok'` sessions are mirrored (CONTRACT section 5, `sample_type='manual_device'`,
`anchor='launch'`, `day_offset` = days since `mission.start_date`):

| indicator | value | category |
|---|---|---|
| `pvt_reaction_ms` | `pvt_median_rt_ms` | `fitness` (pre-existing indicator, unchanged) |
| `pvt_lapses` | count | `cognitive` |
| `gonogo_commission_rate` | 0-1 | `cognitive` |
| `dsst_throughput_per_min` | per minute | `cognitive` |

The new indicators use `clinical_use='research'` and body system `behavioral` (016 inserts that body system if
`load.py` has not run yet; same values).

## Synthetic demo

```bash
python3 DATABASE/synthetic/cognitive_generate.py --seed 42 --out data/synthetic/cognitive_demo
python3 DATABASE/etl/load_canonical.py data/synthetic/demo        # mission SYN-ISS-180, SYN-01..04, source synthetic_v1
python3 DATABASE/etl/load_cognitive.py data/synthetic/cognitive_demo
```

* The generator is deterministic (same `--seed` gives byte-identical `meta.json`, `sessions.csv`, `trials.csv`).
  Schedule per subject and test: session 1 is practice (day -14), sessions 2-4 are the baseline (days -10, -7, -3),
  then PVT every 7 days and Go/No-Go + DSST every 14 days through the 180-day mission. Learning effect over the first
  four sessions. Trials follow the protocol rules (PVT-B ISI 1-4 s counted from the response incl. the 1 s feedback, ~65 trials in 180 s; Go/No-Go 10 practice + 90 GO / 30 NO-GO, first
  3 GO, at most 2 NO-GO in a row, 7-8 NO-GO per quarter; DSST 9-symbol permutation blocks, never the same symbol twice,
  answers after 90 s dropped).
* Scenario: SYN-04 degrades between day 90 and day 120 (PVT median about +15 %, lapses >= 6, Go/No-Go commission rate
  up, DSST throughput down), mirroring the mood scenario of `generate.py`.
* PVT model: ex-Gaussian (mu ~ N(238, 10) per person, sigma 25, tau 40 growing +30 % over the session, tail truncated at
  1.5 tau) plus explicit attention lapses (2 % healthy, 12 % degraded). These are team assumptions; the plan's mu of
  245 +- 15 with tau 45 gave 5-10 lapses per session for healthy people at the 355 ms threshold.
* `load_cognitive.py` replaces the mission's synthetic sessions on every run (`is_synthetic=1`), re-scores each session
  with `cognitive_scoring.score` (status and quality come from scoring), and writes one `import_batch` (adapter
  `cognitive_synthetic`) whose observations are removed on the next run.

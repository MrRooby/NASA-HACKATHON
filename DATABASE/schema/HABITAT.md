# HABITAT w bazie danych

Miejsce w bazie na dane z habitatu w tunelu lawowym na Marsie. Projekt opiera się na planie modułu HABITAT (`HABITAT/README.md` na gałęzi `FARTEK-HABITAT`). Wersja schematu: **HABITAT 0.1** (2026-11-14). Status: **tabele i widoki działają, danych jeszcze nie ma** (czekają na generator demo HABITAT).

## Gdzie co jest

| Baza | Co | Kto pisze | Kto czyta |
|---|---|---|---|
| `astro_habitat` | tabele: habitat, strefy, załoga, katalog kanałów, limity, odczyty, agregaty godzinowe, zdarzenia, lokalizacja załogi, scenariusze | `habitat_writer` (producent HABITAT), `astro_etl`, `admin` | wszyscy przez widoki |
| `astro_api` | widoki `habitat_*` | (definicje w `006_habitat_api_views.sql`) | MOTHER, GUI (`astro_reader`) |

Pliki:

| Plik | Zawartość |
|---|---|
| [`004_habitat_core.sql`](004_habitat_core.sql) | tabele `astro_habitat` |
| [`005_habitat_seed.sql`](005_habitat_seed.sql) | dane startowe z planu HABITAT: habitat, 14 stref, załoga C1–C4, **84 kanały**, 36 limitów, 14 scenariuszy (idempotentne) |
| [`006_habitat_api_views.sql`](006_habitat_api_views.sql) | 10 widoków `astro_api.habitat_*` |
| [`003_users.sh`](003_users.sh) | użytkownik `habitat_writer` (hasło `HABITAT_WRITER_PASSWORD` w `DATABASE/.env`) |

Przy świeżej bazie (`docker compose down -v && up -d`) pliki 004–006 wykonują się automatycznie.

## Zasada: HABITAT produkuje, MOTHER ocenia

- HABITAT **zapisuje odczyty i zdarzenia** i oznacza tylko **jakość odczytu** (`quality`: `ok` / `suspect` / `sensor_fault`).
- Statusu `ok / caution / alert` **nie ma w tabelach HABITAT**. Ocenia MOTHER, korzystając z `config/thresholds.json` (kanał → `channel.threshold_ref`) i z limitów w `channel_limit` (SMAC, woda, mocz, mikroby: wszystko, czego nie ma w `thresholds.json`).
- Widoki pokazują tylko informacyjne `range_flag` (`below_normal` / `in_normal` / `above_normal`) względem zakresu nominalnego kanału.
- Każdy wiersz ma pochodzenie `source_flag` (`nasa` / `simulated` / `team_assumption`), a każdy kanał i limit ma `basis` i `sources`. UI powinien to pokazywać (oznaczenia [NASA] / [ZAŁ] z planu).

## Model

```
habitat (MARS-LT-ELYSIUM) ──< zone (14) ──< reading >── channel (84) ──< channel_limit (36)
      │                        │       └──< reading_hourly
      ├──< crew (C1..C4) ──────┼──< crew_location (przedziały: kto, gdzie, od-do)
      │      └─ subject_id ──> astro_core.subject   (dane zdrowotne tej osoby)
      ├──< event (scrubber_fault, spe_onset, eva_start, ...)
      └──< scenario (H1..H14)
habitat.environment_code ──> astro_core.environment ('mars_surface')
reading/event.import_batch_id ──> astro_core.import_batch
```

| Tabela | Jeden wiersz to… | Klucz / unikalność |
|---|---|---|
| `habitat` | habitat: lokalizacja [ZAŁ], atmosfera nominalna (56,5 kPa, 34 % O2, PIO2 ≈ 128 mmHg), początek sola 1, długość sola, 600 soli | `code` |
| `zone` | strefa (§2 planu): `surface`, `airlock_A/B`, `cupola_1..4`, `tunnel_common`, `module_M1/M2`, `farm`, `ambulatory`, `gym`, `lab`; z ciśnieniem tak/nie i współczynnikiem osłony dawki [ZAŁ] | `(habitat, code)` |
| `crew` | członek załogi C1–C4, moduł domowy, opcjonalnie powiązanie z osobą w `astro_core.subject` | `(habitat, code)` |
| `channel` | kanał danych (§3 planu): jednostka, typ wartości, kadencja realna i demo, strefy, `redundant` (A/B), `per_crew`, `threshold_ref`, zakres nominalny, `basis`, źródła | `code` = `channel` z rekordu HABITAT |
| `channel_limit` | limit spoza `thresholds.json`: poziom (`caution`/`alert`/`emergency`), granice, okno uśredniania (SMAC 1 h / 7 d), metryka, płeć | — |
| `reading` | jeden odczyt (§6.1 planu) | `(habitat, channel, zone, sensor, ts, crew)` |
| `reading_hourly` | agregat godzinowy serii: n, średnia, min, max, liczba `suspect`/`fault` | jw. + godzina |
| `event` | zdarzenie (§6.2 planu) z `details` JSON | `(habitat, event_code)` |
| `crew_location` | pobyt osoby w strefie od–do (z kanału `crew_location`) | `(habitat, crew, from_utc)` |
| `scenario` | scenariusz anomalii H1–H14 (§5 planu) i oczekiwana reakcja MOTHER | `(habitat, code)` |

### Rekord HABITAT → tabela `reading`

Rekord z planu (§6.1) mapuje się 1:1:

| Pole HABITAT | Kolumna | Uwagi |
|---|---|---|
| `timestamp_utc` | `ts_utc` | UTC, ms |
| `sol` | `sol` | ≤ 0 przed przylotem załogi (pre-crew checkout) |
| `zone` | `zone_code` | musi istnieć w `zone` (FK) |
| `module_id` | — | wynika ze strefy (`zone.module_id`) |
| `crew_id` | `crew_code` | tylko kanały `per_crew`; musi istnieć w `crew` (FK) |
| `channel` | `channel_code` | musi istnieć w `channel` (FK) |
| `sensor` | `sensor` | `A` / `B`; `''` gdy kanał nieredundantny (zamiast `null`) |
| `value` | `value_num` albo `value_text` | liczby → `value_num`; `categorical`/`boolean` (np. `leak`, `positive`) → `value_text` |
| `unit` | `unit` | ma być równa `channel.unit` (import powinien sprawdzać) |
| `quality` | `quality` | |
| `source_flag` | `source_flag` | |

Zapis idempotentny: `INSERT … ON DUPLICATE KEY UPDATE` po kluczu `uq_reading`. Rekord zdarzenia (§6.2) mapuje się na `event` tak samo (`event_id` → `event_code`, `details` jako JSON).

### Wolumen

Kanały 1-min w 14 strefach przez 600 soli to rząd **100+ mln odczytów**, dlatego dane 1-min trafiają do bazy tylko w oknach scenariuszy (decyzja niżej). Trendy i ekspozycja stoją na `reading_hourly`.

## Widoki `astro_api.habitat_*`

| Widok | Do czego |
|---|---|
| `habitat_zones` | habitat i strefy (mapa habitatu w GUI) |
| `habitat_channels` | katalog kanałów z limitami w jednej kolumnie tekstowej |
| `habitat_channel_limits` | limity w postaci tabeli (dla MOTHER) |
| `habitat_crew` | załoga i powiązanie z osobą w części zdrowotnej (`subject_code`) |
| `habitat_latest` | ostatni odczyt każdej serii (kafelki GUI) + `range_flag` |
| `habitat_hourly` | szeregi godzinowe (wykresy, trendy, np. powolny spadek O2) |
| `habitat_sensor_agreement` | zgodność sensorów A/B (różnica i %) |
| `habitat_events` | zdarzenia, czas trwania, czy trwa |
| `habitat_crew_exposure_hourly` | **ekspozycja osoby**: średnia ważona minutami pobytu w strefach (CO2, O2, T, RH, hałas, światło, dawka, PM). Np. „C2: 60 min, średnio 2,8 mmHg CO2 (M1 + siłownia)” |
| `habitat_crew_readings` | odczyty osobowe (mocz, nawodnienie, kał, dawka osobista) z `subject_code` |
| `habitat_scenarios` | scenariusze H1–H14 do testów E2E |

## Decyzje (2026-11-14)

- **PIO2 a `cabin_ppo2`: zostaje jak jest.** Nominalne 128 mmHg przy 8,2 psia wpada w `caution` (127–145) z `config/thresholds.json`, a `ppo2_inspired` zachowuje `threshold_ref = cabin_ppo2`. Świadomie nie dodajemy osobnego profilu progów: mały margines tlenu w atmosferze eksploracyjnej jest faktem i UI może go tak pokazywać. Limity 127 (1 h) i 122 z NASA-STD-3001 są w `channel_limit`.
- **Wolumen: pełne dane 1-min tylko w oknach scenariuszy, reszta jako agregaty godzinowe.** Generator demo HABITAT zapisuje:
  - do `reading`: kanały 1-min **tylko w oknach scenariuszy H1–H14** (kilka soli wokół zdarzenia) i dla „teraz” (ostatnie godziny), oraz zawsze kanały zdarzeniowe, dzienne, tygodniowe i rzadsze (mocz, woda, mikroby, śluzy, zdarzenia);
  - do `reading_hourly`: **całą misję** (sol 1–600) dla wszystkich kanałów ciągłych, także w oknach scenariuszy (agregat z danych 1-min);
  - okna scenariuszy zapisuje w `scenario.start_sol` / `end_sol`, żeby GUI wiedziało, gdzie są dane 1-min.

## Do decyzji zespołu
- **Osoby C1–C4 a `astro_core.subject`:** `crew.subject_id` jest puste. Gdy powstanie symulowana misja marsjańska w części zdrowotnej, wystarczy przypisać osoby, a widoki połączą dane habitatu z danymi zdrowotnymi.
- **`HABITAT/channels.json`** (plan §6.3): katalog kanałów jest teraz w `005_habitat_seed.sql`. Gdy zespół HABITAT utworzy JSON, warto ładować katalog z niego, żeby było jedno źródło prawdy.
- **Format dostarczania danych z generatora:** bezpośredni zapis do bazy jako `habitat_writer` albo pliki CSV/JSON + importer. Schemat obsługuje oba warianty.

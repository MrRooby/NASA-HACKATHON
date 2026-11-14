# HABITAT w bazie danych

Miejsce w bazie na dane z habitatu w tunelu lawowym na Marsie. Projekt opiera się na planie modułu HABITAT (`HABITAT/README.md` na gałęzi `FARTEK-HABITAT`). Wersja schematu: **HABITAT 0.1** (2026-11-14). Status: **działa, w bazie są dane demo** z generatora `habitat_sim_v1` (symulacja, `source_flag = simulated`).

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

## Generator demo i import

```bash
python3 DATABASE/synthetic/habitat_generate.py --seed 7          # -> data/synthetic/habitat_demo/ (~40 s, deterministyczny)
uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_habitat.py   # ~5 min; zastępuje poprzednią symulację
```

| Co | Ile | Uwagi |
|---|---|---|
| Serie ciągłe | 125 (strefa × kanał × sensor A/B) | atmosfera, PM, hałas, światło, obecność, dawka, konstrukcja, ciepło, woda, zasilanie, otoczenie |
| `reading_hourly` | ~1,9 mln | sol −2…600; w oknach scenariuszy agregat z danych 1-min; dawka osobista per osoba |
| `reading` | ~400 tys. | 1-min w oknach scenariuszy (H1, H2, H3, H6, H8, H9, H11, H12, H14) i ostatnie 6 h misji; zawsze: mocz (każda wizyta + doba), woda pitna, kał, mikroby, VOC, śluzy, statusy, lokalizacja |
| `event` | ~520 | EVA (co 7 soli, para załogi), cykle śluz, zdarzenia scenariuszy, sejsmika, zrzuty odpadów, tryby habitatu |
| `crew_location` | ~13 tys. | harmonogram dnia: sen w module, praca (lab/farma/ambulatorium/tunel), lunch w parku, 1,5 h siłowni, EVA |

Model (wszystko **[ZAŁ]**, kalibrowane na źródłach z planu): atmosfera 56,5 kPa / PIO2 ≈ 128,4 mmHg; CO2 rośnie z liczbą osób w strefie; dawka na powierzchni ≈ 10 µGy/h (Curiosity RAD w bazie: 0,24 mGy/d) × `zone.dose_shielding_factor`; mocz: mniejsza objętość, niższe pH i cytrynian w pierwszych ~30 solach (Renal ER 2024); płeć załogi C1 M, C2 F, C3 M, C4 F (dla progów wapnia).

Scenariusze w danych (sprawdzone w widokach):

| Scenariusz | Sol | Co widać |
|---|---|---|
| H14 pre-crew checkout | −2…0 | `habitat_mode`, test ciśnienia, brak załogi |
| H6 pył po EVA | 94 | PM10 w śluzie A do ~0,29 mg/m³ |
| H1 awaria scrubbera M1 | 142 | CO2 w M1 > 3 mmHg przez 12 h, szczyt ~7,6; ekspozycja tylko C1 i C2 |
| H2 awaria generatora O2 | 210 | PIO2 spada do ~123 mmHg |
| H4 odwodnienie C2 | 250–255 | mocz 0,55–0,7 L/d, wyższy ciężar właściwy, ketony + |
| H13 blackout łączności | 280–293 | zdarzenie `comm_blackout` |
| H3 powolny spadek O2 | 300–341 | PIO2 spada ~0,07 mmHg/sol, poniżej 127 od ~sol 320, naprawa sol 341 |
| H5 wapń w moczu C3 | 360–420 | 240 → ~400 mg/d (próg M: 300) |
| H11 wyciek kopuła 2 | 380 | `leak_detector = leak`, `pressure_decay_rate` 0,45 kPa/h |
| H7 TOC w wodzie M2 | 400–440 | TOC do ~1,5 mg/L (limit 3) |
| H12 marsotrzęsienie | 430 | M 3,1, skok `strain` i `wall_convergence` |
| H8 SPE podczas EVA | 470 | protony ~2800 pfu, dawka ×60, przerwane EVA C1+C4, schron 36 h, `quality = suspect` na sensorze B |
| H9 globalna burza pyłowa | 500–540 | tau do ~7,7, spadek mocy solarnej i UV, brak EVA |
| H10 wyciek NH3 | 555 | NH3 w laboratorium do ~38 ppm |

## Do decyzji zespołu
- **Osoby C1–C4 a `astro_core.subject`:** `crew.subject_id` jest puste. Gdy powstanie symulowana misja marsjańska w części zdrowotnej, wystarczy przypisać osoby, a widoki połączą dane habitatu z danymi zdrowotnymi.
- **`HABITAT/channels.json`** (plan §6.3): katalog kanałów jest teraz w `005_habitat_seed.sql`. Gdy zespół HABITAT utworzy JSON, warto ładować katalog z niego, żeby było jedno źródło prawdy.
- **Format dostarczania danych z generatora:** bezpośredni zapis do bazy jako `habitat_writer` albo pliki CSV/JSON + importer. Schemat obsługuje oba warianty.

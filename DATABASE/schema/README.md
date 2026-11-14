# Schemat bazy: jakie dane są dostępne i gdzie (dla backendu)

Wersja schematu i kontraktu **0.2** (2026-11-14). Co się zmieniło: sekcja „Historia zmian” w [`api_contract.md`](api_contract.md). Pełny opis modelu: [`../DATABASE_PLAN.md`](../DATABASE_PLAN.md).

> **Status:** schemat uruchomiony na MariaDB 11.4.13 (docker, `DATABASE/docker-compose.yml`), 2026-11-14: tabele, widoki i uprawnienia działają; danych jeszcze nie importowano. Nazwy widoków i kolumn są uzgodnione i można na nich budować backend.

## Pliki w tym katalogu

| Plik | Co zawiera | Dla kogo |
|---|---|---|
| [`api_contract.md`](api_contract.md) | **Kontrakt odczytu:** 19 widoków, każda kolumna z typem, informacją o NULL, opisem i proponowanym endpointem | backend, frontend |
| [`api_contract.json`](api_contract.json) | Ten sam kontrakt w formie do odczytu maszynowego (np. do generowania modeli Pydantic/TypeScript) | backend |
| [`001_core.sql`](001_core.sql) | Tabele `astro_core` (zapis tylko przez import) | baza / import |
| [`002_api_views.sql`](002_api_views.sql) | Widoki `astro_api`: **jedyne miejsce, z którego czyta backend** | baza, backend (do wglądu) |
| [`007_mars_crew_link.sql`](007_mars_crew_link.sql) | Powiązanie załogi habitatu z osobami misji Mars i widoki dawka–krew / nawodnienie–nerki | baza, backend |
| [`008_wearables_core.sql`](008_wearables_core.sql), [`009_wearables_api_views.sql`](009_wearables_api_views.sql) | Urządzenia, próbki, agregaty i widoki opasek oraz snu | wearables, backend |
| [`010_medical_core.sql`](010_medical_core.sql), [`011_medical_api_views.sql`](011_medical_api_views.sql) | Zdarzenia medyczne, załączniki, opinie, transmisje i eskalacje | medyczny, backend |
| [`012_users_extra.sql`](012_users_extra.sql) | Uprawnienia ETL i administratora do nowych baz modułowych | wdrożenie |
| [`003_users.sh`](003_users.sh) | Użytkownicy `astro_etl` (zapis) i `astro_reader` (odczyt); hasła ze zmiennych środowiskowych | wdrożenie |
| [`../mariadb.cnf`](../mariadb.cnf) | Ustawienia serwera, na których polega kontrakt (UTC, `group_concat_max_len`) | wdrożenie |
| [`../.env.example`](../.env.example) | Wzór pliku `.env` z hasłami i danymi połączenia | backend, wdrożenie |

## Najważniejsze zasady

1. **Backend czyta wyłącznie z bazy `astro_api`** jako użytkownik `astro_reader`, który ma tylko `SELECT` na widokach. Do `astro_core` nie ma dostępu i nie powinien go mieć: tabele mogą się zmieniać, a kontrakt widoków zostaje.
2. **Backend niczego nie zapisuje** w wersji 0.1. Dane trafiają do bazy tylko przez import (pliki CSV). Zapis danych z aplikacji (check-iny, wearables) to otwarta decyzja (patrz niżej).
3. **Każda odpowiedź API musi przenosić `data_kind` / `is_synthetic`.** UI musi odróżniać dane z lotu, bed rest (analog naziemny) i dane symulacyjne.
4. **Dane są pseudonimowe.** Nie łączymy kodów osób z prawdziwymi nazwiskami i nie dodajemy żadnych danych osobowych.

## Połączenie

| Zmienna | Wartość domyślna | Uwagi |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | |
| `DB_PORT` | `3306` | |
| `DB_NAME` | `astro_api` | |
| `DB_USER` | `astro_reader` | tylko `SELECT` na `astro_api.*` |
| `DB_PASSWORD` | z `DATABASE/.env` | plik poza gitem |

Ustawienia serwera, na których polega kontrakt, są w [`../mariadb.cnf`](../mariadb.cnf): `default-time-zone = '+00:00'` (wszystkie czasy w UTC) oraz `group_concat_max_len = 65536` (kolumny z listami nie będą obcinane).

## Gdzie jest jaka informacja

| Potrzebujesz… | Widok | Filtr |
|---|---|---|
| listy źródeł danych i ich zawartości | `sources` | `data_kind` |
| co zawiera konkretne źródło | `source_data_map` | `source_id` |
| listy misji i środowisk | `missions` | `environment` |
| listy osób (np. ze źródła albo misji) | `subjects` | `source_id`, `mission_code`, `is_synthetic` |
| jakie dane ma konkretna osoba | `subject_data_map` | `subject_code` |
| słownika wskaźników (nazwa, jednostka, część ciała) | `indicators` | `category`, `body_region` |
| norm według płci, wieku i środowiska | `reference_ranges` | `indicator_code`, `sex` |
| klasyfikacji pomiarów (np. T-score → osteopenia) | `classifications` | `subject_code`, `indicator_code` |
| wszystkich pomiarów osoby | `observations` | `subject_code`, `indicator_code`, `phase` |
| wyników poza normą | `observations` | `ref_flag IN ('below','above','critical_low','critical_high')` |
| pomiarów z niespójną normą (do przeglądu) | `observations` | `ref_conflict = 1` |
| trendu wskaźnika (średnia z powtórzeń) | `observations_mean` | `subject_code`, `indicator_code` |
| wartości wyjściowej sprzed misji | `baseline` | `subject_code` |
| zmiany względem baseline'u (np. utrata kości %) | `change_from_baseline` | `subject_code`, `indicator_code` |
| **kafelków dashboardu** (ostatni wynik, kolor, komunikat, akcja) | `latest` | `subject_code` |
| **koloru części ciała na sylwetce** | `body_system_status` | `subject_code` |
| serii dziennych ze średnią 7-dniową | `daily_series` | `subject_code`, `indicator_code`, zakres dat |
| promieniowania i warunków kabiny | `environment_daily` | `environment`, `indicator_code` |
| danych zbiorczych z publikacji | `cohort_stats` | `indicator_code`, `mission_type` |
| historii importów (np. do cache/ETag) | `import_log` | `status = 'ok'` |

## Proponowane endpointy (REST, tylko GET)

| Endpoint | Widok(i) |
|---|---|
| `GET /api/sources` | `sources` |
| `GET /api/sources/{source_id}` | `sources` + `source_data_map` |
| `GET /api/missions` | `missions` |
| `GET /api/subjects?source_id=&mission_code=&is_synthetic=` | `subjects` |
| `GET /api/subjects/{subject_code}` | `subjects` + `subject_data_map` |
| `GET /api/subjects/{subject_code}/latest` | `latest` |
| `GET /api/subjects/{subject_code}/body` | `body_system_status` |
| `GET /api/subjects/{subject_code}/observations?indicator_code=&phase=&from_day=&to_day=` | `observations` |
| `GET /api/subjects/{subject_code}/trend/{indicator_code}` | `observations_mean` + `change_from_baseline` |
| `GET /api/subjects/{subject_code}/baseline` | `baseline` |
| `GET /api/subjects/{subject_code}/daily/{indicator_code}?from=&to=` | `daily_series` |
| `GET /api/indicators`, `GET /api/indicators/{indicator_code}` | `indicators` |
| `GET /api/reference-ranges?indicator_code=&sex=&age=` | `reference_ranges` |
| `GET /api/subjects/{subject_code}/classifications` | `classifications` |
| `GET /api/environments/{environment}/daily?indicator_code=&from=&to=` | `environment_daily` |
| `GET /api/literature/cohorts?indicator_code=&mission_type=` | `cohort_stats` |
| `GET /api/meta/imports` | `import_log` |

Osoba ma unikalny `subject_code`, ale może brać udział w kilku misjach (dane symulacyjne). Endpointy osoby powinny więc przyjmować opcjonalne `?mission_code=`. Bez niego zwracają wszystkie misje.

## Konwencje danych

**Identyfikatory:** `snake_case`, po angielsku. Kod osoby ma format `<ŹRÓDŁO>-<GRUPA>-<KOD>` (`I4-C001`, `MR035G-C3A-224`, `SYN-01`). Kody wskaźników są takie same jak `id` w `config/thresholds.json`, jeśli wskaźnik tam występuje.

**Czas:**

| Kolumna | Znaczenie |
|---|---|
| `anchor` + `day_offset` | czas względem startu (`launch`) albo lądowania (`landing`): `L-92` → (`launch`, −92), `R+45` → (`landing`, 45) |
| `phase` | `pre` / `in` / `post` / `none`, wyliczana z dwóch powyższych |
| `mission_day` | dzień od startu; dla pomiarów po lądowaniu = długość misji + `day_offset`; NULL, gdy długość misji jest nieznana (bed rest) |
| `timepoint_label` | oryginalna etykieta do wyświetlenia (`L-92`, `R+45`, `PRE_TEST:7`, `FD30`) |
| `measured_at` / `measured_date` | czas UTC; tylko dla serii (wearables, dane symulacyjne, środowisko) |

Do sortowania chronologicznego używaj **`time_order`**. Działa także wtedy, gdy długość misji jest nieznana (bed rest). `mission_day` służy tylko do wyświetlania.

**Statusy i kolory:**

| Wartość | Znaczenie | Kolor w UI |
|---|---|---|
| `ok` | w normie | zielony |
| `caution` | wymaga uwagi | żółty |
| `alert` | alarm | czerwony |
| `no_data` (tylko `body_system_status`) / `null` | brak danych albo reguły | szary |
| `escalate = true` | zalecana eskalacja do flight surgeona / Mission Control | ikona / baner |

W `latest` **`status` to najgorszy z trzech ocen**: progu bezwzględnego (`threshold`), progu względem baseline'u osoby, np. BMD ≥ 95 % wartości sprzed lotu (`baseline_threshold`), oraz normy laboratoryjnej (`lab_reference`: poza normą = `caution`, poza wartością krytyczną = `alert`). `status_basis` mówi, która ocena zdecydowała. **Reguły kroczące** (np. „średni sen z 3 dni < 6 h”) liczy moduł MEDICAL-DIAGNOSIS na podstawie `daily_series`. Widok `latest` pokazuje tylko statusy wynikające z progów bezwzględnych i norm.

**Normy:** `ref_min`/`ref_max` to norma dobrana do płci, wieku i środowiska osoby (z tabeli norm). Gdy takiej nie ma, to norma z pliku źródłowego. `ref_basis` mówi, skąd pochodzi.

**Pozostałe:**
- Wartości liczbowe są zawsze w jednostce z kolumny `unit` (jednostka kanoniczna wskaźnika).
- Wartości logiczne przychodzą z MariaDB jako `0/1`. W JSON-ie zamieniaj je na `true/false`.
- Kolumny z listami (`categories`, `sources`, `timepoints`, `baseline_timepoints`) to napisy rozdzielone `", "`. Rozdziel je na tablicę po stronie backendu.
- `null` oznacza brak danych, nigdy zero.

## Cache

Dane zmieniają się tylko po imporcie. Jako klucza cache albo `ETag` używaj `SELECT MAX(finished_at) FROM astro_api.import_log WHERE status = 'ok'`.

## Alternatywa bez serwera: eksport JSON

Gdy GUI działa offline, te same dane są dostępne jako pliki generowane przez `etl/export.py` (struktura w `DATABASE_PLAN.md` §8.4). Pliki mają te same nazwy pól co kolumny widoków w [`api_contract.md`](api_contract.md), więc modele danych backendu i frontendu mogą być wspólne.

## Otwarte decyzje, które dotyczą backendu

- [ ] Zapis danych z aplikacji (check-in astronauty, wearables). Propozycja: osobny użytkownik `astro_app_writer` z prawem `INSERT` tylko do `astro_core.observation`, zawsze z `source_id = 'app_checkin'` i `sample_type = 'self_report'` / `'wearable'`. Wymaga rozszerzenia kontraktu do wersji 0.2.
- [ ] REST czy pliki JSON dla GUI (albo oba warianty).
- [ ] Paginacja `observations` i `daily_series` (zestaw `stress` to ok. 1,5 mln wierszy): proponujemy `limit` + kursor po (`subject_code`, `mission_day`, `observation_id`).

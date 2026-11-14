# Kontrakt dostępu do danych: `astro_api`

Wersja kontraktu **0.2** (2026-11-14) · Wersja do odczytu maszynowego: [`api_contract.json`](api_contract.json) (ta sama treść).

> **Status:** projekt. SQL widoków nie był jeszcze uruchomiony na serwerze. Nazwy widoków i kolumn są już ustalone, a typy podane jako **typy logiczne** (JSON). Zmiany kontraktu podnoszą numer wersji.

## Typy

| Typ logiczny | W MariaDB | W JSON |
|---|---|---|
| `string` | VARCHAR/ENUM/TEXT | JSON string |
| `integer` | INT/BIGINT | JSON number (całkowita) |
| `number` | DOUBLE | JSON number |
| `boolean` | TINYINT(1) 0/1 | JSON true/false |
| `date` | DATE | 'YYYY-MM-DD' |
| `datetime` | DATETIME(3) UTC | ISO 8601 'YYYY-MM-DDTHH:MM:SS.sssZ' |
| `enum` | ENUM | JSON string z listy values |

`?` w kolumnie **NULL** = kolumna może być pusta (`null`).

## Historia zmian

**0.2** (2026-11-14)

- Nowy widok classifications (klasy T-score/Z-score wg WHO/ISCD).
- latest: status = najgorszy z progu bezwzględnego, progu względem baseline'u i normy laboratoryjnej; status_basis ma nową wartość 'baseline_threshold'; nowe kolumny time_order, baseline_value, pct_of_baseline; escalate obejmuje wartości krytyczne.
- latest: poprawione wybieranie ostatniego pomiaru dla bed restu (sortowanie po time_order zamiast mission_day).
- change_from_baseline: metryka zależna od progu (pct_of_baseline albo pct_change); nowe kolumny pct_change, baseline_metric, baseline_action, time_order.
- daily_series: średnia z 7 dni kalendarzowych liczona osobno dla każdej misji; nowa kolumna n_days_7d.
- observations, observations_mean: nowe kolumny time_order, ref_critical_low, ref_critical_high.
- reference_ranges: nowe kolumny low_inclusive, high_inclusive.
- Wszystkie GROUP BY wymieniają komplet kolumn (zgodność z ONLY_FULL_GROUP_BY).
- Użytkownicy bazy tworzeni skryptem 003_users.sh z haseł w .env (zamiast 003_users.sql z hasłami w repo).

**0.1** (2026-11-14)

- Pierwsza wersja: 18 widoków.

## Spis widoków

| Grupa | Widok | Jeden wiersz = | Proponowany endpoint |
|---|---|---|---|
| Katalogi | [`sources`](#sources) | jedno źródło danych lub literatury | `GET /api/sources, GET /api/sources/{source_id}` |
| Katalogi | [`missions`](#missions) | jedna misja / kampania | `GET /api/missions` |
| Katalogi | [`subjects`](#subjects) | jedna osoba w jednej misji | `GET /api/subjects?source_id=&mission_code=&is_synthetic=, GET /api/subjects/{subject_code}` |
| Katalogi | [`indicators`](#indicators) | jeden wskaźnik | `GET /api/indicators, GET /api/indicators/{indicator_code}` |
| Mapy pokrycia | [`source_data_map`](#source_data_map) | źródło × wskaźnik | `GET /api/sources/{source_id}/indicators` |
| Mapy pokrycia | [`subject_data_map`](#subject_data_map) | osoba × misja × źródło × wskaźnik | `GET /api/subjects/{subject_code}/indicators` |
| Dane referencyjne | [`reference_ranges`](#reference_ranges) | jedna norma / klasa | `GET /api/reference-ranges?indicator_code=&sex=&age=` |
| Dane referencyjne | [`reference_match`](#reference_match) | jeden pomiar → wybrana norma | `(wewnętrzny; dane są już w widoku observations)` |
| Dane referencyjne | [`classifications`](#classifications) | jeden pomiar × pasująca klasa | `GET /api/subjects/{subject_code}/classifications` |
| Dane | [`observations`](#observations) | jeden pomiar (jedno powtórzenie) | `GET /api/subjects/{subject_code}/observations?indicator_code=&phase=&from_day=&to_day=` |
| Dane | [`observations_mean`](#observations_mean) | osoba × wskaźnik × punkt czasowy (średnia z powtórzeń) | `GET /api/subjects/{subject_code}/trend/{indicator_code}` |
| Ocena | [`baseline`](#baseline) | osoba × misja × wskaźnik | `GET /api/subjects/{subject_code}/baseline` |
| Ocena | [`change_from_baseline`](#change_from_baseline) | osoba × wskaźnik × punkt czasowy | `GET /api/subjects/{subject_code}/trend/{indicator_code}` |
| Ocena | [`latest`](#latest) | osoba × misja × wskaźnik (ostatni pomiar) | `GET /api/subjects/{subject_code}/latest` |
| Ocena | [`body_system_status`](#body_system_status) | osoba × misja × układ ciała | `GET /api/subjects/{subject_code}/body` |
| Dane | [`daily_series`](#daily_series) | osoba × wskaźnik × dzień | `GET /api/subjects/{subject_code}/daily/{indicator_code}?from=&to=` |
| Dane | [`environment_daily`](#environment_daily) | środowisko × miejsce × wskaźnik × źródło × dzień | `GET /api/environments/{environment}/daily?indicator_code=` |
| Literatura | [`cohort_stats`](#cohort_stats) | badanie × wskaźnik | `GET /api/literature/cohorts?indicator_code=&mission_type=` |
| Diagnostyka | [`import_log`](#import_log) | jeden import pliku | `GET /api/meta/imports` |

## `sources`

**Do czego:** Lista źródeł i ile danych każde wnosi; strona „Data sources”.  
**Jeden wiersz =** jedno źródło danych lub literatury  
**Klucz logiczny:** `source_id`  
**Typowe filtry:** `data_kind`, `access_status`  
**Endpoint (propozycja):** `GET /api/sources, GET /api/sources/{source_id}`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `source_id` | `string` |  | Id źródła (slug), np. osdr_osd575 |
| `title` | `string` |  | Nazwa źródła |
| `publisher` | `string` | ? | Wydawca (NASA OSDR, NASA LSDA, WHO…) |
| `data_kind` | enum: `real_spaceflight`, `real_analog`, `real_environment`, `literature_aggregate`, `reference_literature`, `synthetic` |  | Rodzaj danych — UI musi pokazać etykietę |
| `access_status` | enum: `files_public`, `metadata_public`, `request_required`, `unknown`, `generated` |  | Dostępność plików |
| `url` | `string` | ? | Link do źródła |
| `doi` | `string` | ? | DOI |
| `license` | `string` | ? | Licencja |
| `retrieved_at` | `date` | ? | Data pobrania |
| `n_subjects` | `integer` |  | Liczba osób z tego źródła |
| `n_missions` | `integer` |  | Liczba misji/kampanii |
| `n_indicators` | `integer` |  | Liczba różnych wskaźników w pomiarach |
| `n_observations` | `integer` |  | Liczba pomiarów osób |
| `n_cohorts` | `integer` |  | Liczba grup z publikacji (dane zbiorcze) |
| `n_env_observations` | `integer` |  | Liczba pomiarów środowiska |
| `last_import_at` | `datetime` | ? | Koniec ostatniego udanego importu |

## `missions`

**Do czego:** Wybór kontekstu misji; przełącznik środowisk.  
**Jeden wiersz =** jedna misja / kampania  
**Klucz logiczny:** `mission_code`  
**Typowe filtry:** `environment`, `is_synthetic`, `source_id`  
**Endpoint (propozycja):** `GET /api/missions`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `mission_code` | `string` |  | Kod misji, np. I4, MR035G-C3A, SYN-ISS-180 |
| `mission_name` | `string` |  | Nazwa |
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` |  | Środowisko |
| `environment_label` | `string` |  | Nazwa środowiska |
| `is_analog` | `boolean` |  | Analog naziemny (bed rest) |
| `start_date` | `date` | ? | Start / początek (tylko gdy publicznie znany) |
| `end_date` | `date` | ? | Lądowanie / koniec |
| `duration_days` | `integer` | ? | Długość w dniach |
| `is_synthetic` | `boolean` |  | Misja symulacyjna |
| `source_id` | `string` |  | Źródło |
| `n_subjects` | `integer` |  | Liczba uczestników |

## `subjects`

**Do czego:** Lista osób; profil osoby; przełącznik astronauty.  
**Jeden wiersz =** jedna osoba w jednej misji  
**Klucz logiczny:** `subject_code`, `mission_code`  
**Typowe filtry:** `source_id`, `mission_code`, `sex`, `age_band`, `is_synthetic`, `data_kind`  
**Endpoint (propozycja):** `GET /api/subjects?source_id=&mission_code=&is_synthetic=, GET /api/subjects/{subject_code}`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Pseudonim osoby, np. I4-C001, SYN-01 |
| `source_subject_code` | `string` |  | Kod w pliku źródłowym |
| `sex` | enum: `F`, `M`, `U` |  | Płeć (U = nieznana) |
| `age_band` | `string` | ? | Przedział wieku, np. 30-39; NULL = nieznany |
| `is_synthetic` | `boolean` |  | Osoba symulacyjna |
| `source_id` | `string` |  | Źródło |
| `source_title` | `string` |  | Nazwa źródła |
| `data_kind` | enum: `real_spaceflight`, `real_analog`, `real_environment`, `literature_aggregate`, `reference_literature`, `synthetic` |  | Rodzaj danych |
| `mission_code` | `string` |  | Misja |
| `mission_name` | `string` |  | Nazwa misji |
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` |  | Środowisko misji |
| `role` | enum: `crew`, `bed_rest_subject`, `control`, `synthetic_crew` |  | Rola w misji |
| `group_label` | `string` | ? | Grupa badania (np. countermeasure) |
| `n_observations` | `integer` |  | Liczba pomiarów |
| `n_indicators` | `integer` |  | Liczba wskaźników |
| `n_timepoints` | `integer` |  | Liczba punktów czasowych |
| `categories` | `string` | ? | Kategorie danych, lista rozdzielona ', ' |

## `indicators`

**Do czego:** Słownik wskaźników, legenda, opisy edukacyjne, mapowanie na sylwetkę.  
**Jeden wiersz =** jeden wskaźnik  
**Klucz logiczny:** `indicator_code`  
**Typowe filtry:** `category`, `body_system`, `body_region`  
**Endpoint (propozycja):** `GET /api/indicators, GET /api/indicators/{indicator_code}`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `indicator_code` | `string` |  | Kod wskaźnika |
| `label` | `string` |  | Nazwa (EN) |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `body_system` | `string` | ? | Układ ciała |
| `body_region` | `string` | ? | Region klikalnej sylwetki (heart, bones, head…) |
| `unit` | `string` |  | Jednostka kanoniczna |
| `value_type` | enum: `numeric`, `ordinal`, `text` |  | Typ wartości |
| `scope` | enum: `subject`, `environment` |  | Dotyczy osoby czy środowiska |
| `threshold_id` | `string` | ? | Id progów bezwzględnych w config/thresholds.json |
| `baseline_threshold_id` | `string` | ? | Id progów % baseline'u w config/thresholds.json |
| `description` | `string` | ? | Opis |
| `n_subjects` | `integer` |  | Liczba osób z pomiarami |
| `n_observations` | `integer` |  | Liczba pomiarów |
| `sources` | `string` | ? | Źródła, lista rozdzielona ', ' |

## `source_data_map`

**Do czego:** Co dokładnie zawiera źródło.  
**Jeden wiersz =** źródło × wskaźnik  
**Klucz logiczny:** `source_id`, `indicator_code`  
**Typowe filtry:** `source_id`, `category`  
**Endpoint (propozycja):** `GET /api/sources/{source_id}/indicators`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `source_id` | `string` |  | Źródło |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa wskaźnika |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `unit` | `string` |  | Jednostka |
| `n_subjects` | `integer` |  | Liczba osób |
| `n_observations` | `integer` |  | Liczba pomiarów |
| `n_timepoints` | `integer` |  | Liczba różnych punktów czasowych |
| `timepoints` | `string` |  | Punkty czasowe (alfabetycznie), lista ', '; może być obcięta (group_concat_max_len) |
| `min_value` | `number` | ? | Najmniejsza wartość |
| `max_value` | `number` | ? | Największa wartość |

## `subject_data_map`

**Do czego:** Jakie dane ma osoba i kiedy były mierzone.  
**Jeden wiersz =** osoba × misja × źródło × wskaźnik  
**Klucz logiczny:** `subject_code`, `mission_code`, `source_id`, `indicator_code`  
**Typowe filtry:** `subject_code`, `mission_code`, `category`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/indicators`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `source_id` | `string` |  | Źródło |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa wskaźnika |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `unit` | `string` |  | Jednostka |
| `n_values` | `integer` |  | Liczba wartości (z powtórzeniami) |
| `n_timepoints` | `integer` |  | Liczba punktów czasowych |
| `timepoints` | `string` |  | Punkty czasowe chronologicznie, lista ', ' |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |

## `reference_ranges`

**Do czego:** Tabela norm wg płci, wieku, populacji, środowiska; audyt; klasyfikacje (T-score).  
**Jeden wiersz =** jedna norma / klasa  
**Klucz logiczny:** `indicator_code`, `range_kind`, `class_label`, `sex`, `age_min`, `age_max`, `population`, `environment`, `source_id`  
**Typowe filtry:** `indicator_code`, `sex`, `range_kind`, `population`  
**Endpoint (propozycja):** `GET /api/reference-ranges?indicator_code=&sex=&age=`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `range_kind` | enum: `reference_interval`, `classification` |  | Zakres normy czy klasyfikacja |
| `class_label` | `string` |  | Nazwa klasy ('' dla zakresu normy) |
| `sex` | enum: `F`, `M`, `any` |  | Płeć, której dotyczy norma |
| `age_min` | `integer` |  | Wiek od (włącznie) |
| `age_max` | `integer` |  | Wiek do (włącznie) |
| `population` | `string` |  | Populacja (general_adult, postmenopausal…) |
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` | ? | Środowisko; NULL = dowolne |
| `low_value` | `number` | ? | Dolna granica |
| `high_value` | `number` | ? | Górna granica |
| `low_inclusive` | `boolean` |  | Czy dolna granica należy do przedziału |
| `high_inclusive` | `boolean` |  | Czy górna granica należy do przedziału |
| `critical_low` | `number` | ? | Wartość krytyczna dolna |
| `critical_high` | `number` | ? | Wartość krytyczna górna |
| `unit` | `string` |  | Jednostka (= kanoniczna) |
| `condition_note` | `string` | ? | Warunki pomiaru |
| `source_id` | `string` |  | Źródło normy |
| `source_title` | `string` |  | Nazwa źródła |
| `basis` | enum: `source`, `team_assumption` |  | Ze źródła czy założenie zespołu |
| `priority` | `integer` |  | Priorytet przy remisie |
| `notes` | `string` | ? | Uwagi |

## `reference_match`

**Do czego:** Która norma została dobrana do pomiaru (płeć, wiek, środowisko).  
**Jeden wiersz =** jeden pomiar → wybrana norma  
**Klucz logiczny:** `observation_id`  
**Typowe filtry:** `observation_id`  
**Endpoint (propozycja):** `(wewnętrzny; dane są już w widoku observations)`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `observation_id` | `integer` |  | Id pomiaru |
| `reference_range_id` | `integer` |  | Id normy |
| `ref_low` | `number` | ? | Dolna granica |
| `ref_high` | `number` | ? | Górna granica |
| `ref_critical_low` | `number` | ? | Krytyczna dolna |
| `ref_critical_high` | `number` | ? | Krytyczna górna |
| `ref_sex` | enum: `F`, `M`, `any` |  | Płeć normy |
| `ref_age_min` | `integer` |  | Wiek od |
| `ref_age_max` | `integer` |  | Wiek do |
| `ref_population` | `string` |  | Populacja |
| `ref_source_id` | `string` |  | Źródło normy |

## `classifications`

**Do czego:** Klasyfikacje pomiarów (np. T-score: normal / osteopenia / osteoporosis wg WHO). Tylko dla osób ze znanym przedziałem wieku.  
**Jeden wiersz =** jeden pomiar × pasująca klasa  
**Klucz logiczny:** `observation_id`, `class_label`  
**Typowe filtry:** `subject_code`, `indicator_code`, `class_label`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/classifications`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `observation_id` | `integer` |  | Id pomiaru |
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `indicator_code` | `string` |  | Wskaźnik |
| `phase` | enum: `pre`, `in`, `post`, `none` |  | Faza |
| `timepoint_label` | `string` | ? | Etykieta czasu |
| `time_order` | `integer` | ? | Klucz chronologii |
| `replicate` | `integer` |  | Nr powtórzenia |
| `value` | `number` |  | Wartość |
| `unit` | `string` |  | Jednostka |
| `class_label` | `string` |  | Klasa |
| `population` | `string` |  | Populacja, dla której klasyfikacja obowiązuje |
| `ref_sex` | enum: `F`, `M`, `any` |  | Płeć |
| `ref_age_min` | `integer` |  | Wiek od |
| `ref_age_max` | `integer` |  | Wiek do |
| `ref_source_id` | `string` |  | Źródło klasyfikacji |
| `basis` | enum: `source`, `team_assumption` |  | Ze źródła czy założenie zespołu |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |

## `observations`

**Do czego:** Główne źródło dla tabel i wykresów; wartości poza normą; konflikty norm.  
**Jeden wiersz =** jeden pomiar (jedno powtórzenie)  
**Klucz logiczny:** `observation_id`  
**Typowe filtry:** `subject_code`, `mission_code`, `source_id`, `indicator_code`, `category`, `phase`, `ref_flag`, `ref_conflict`, `is_synthetic`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/observations?indicator_code=&phase=&from_day=&to_day=`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `observation_id` | `integer` |  | Id pomiaru |
| `subject_code` | `string` |  | Osoba |
| `sex` | enum: `F`, `M`, `U` |  | Płeć osoby |
| `subject_is_synthetic` | `boolean` |  | Osoba symulacyjna |
| `mission_code` | `string` |  | Misja |
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` |  | Środowisko |
| `source_id` | `string` |  | Źródło |
| `data_kind` | enum: `real_spaceflight`, `real_analog`, `real_environment`, `literature_aggregate`, `reference_literature`, `synthetic` |  | Rodzaj danych |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `body_system` | `string` | ? | Układ ciała |
| `phase` | enum: `pre`, `in`, `post`, `none` |  | Faza: pre / in / post (wyliczana) |
| `anchor` | enum: `launch`, `landing`, `none` |  | Punkt odniesienia czasu |
| `day_offset` | `integer` | ? | Dni względem anchor (L-92 → -92, R+45 → 45) |
| `time_is_approx` | `boolean` |  | Czas przybliżony (np. kontrola '6MO') |
| `time_order` | `integer` | ? | Klucz chronologii (launch: day_offset; landing: 100000+day_offset; serie: 200000+numer dnia) — sortuj po nim |
| `mission_day` | `integer` | ? | Dzień liczony od startu (dla landing: duration_days + day_offset); NULL gdy długość misji nieznana |
| `timepoint_label` | `string` | ? | Oryginalna etykieta czasu |
| `measured_at` | `datetime` | ? | Czas pomiaru UTC (serie) |
| `replicate` | `integer` |  | Nr powtórzenia (triplikaty DXA: 1..3) |
| `value` | `number` | ? | Wartość liczbowa w jednostce kanonicznej |
| `value_text` | `string` | ? | Wartość tekstowa |
| `unit` | `string` |  | Jednostka |
| `ref_min` | `number` | ? | Dolna granica normy (tabela norm, a gdy brak — z pliku) |
| `ref_max` | `number` | ? | Górna granica normy |
| `ref_critical_low` | `number` | ? | Wartość krytyczna dolna (z tabeli norm) |
| `ref_critical_high` | `number` | ? | Wartość krytyczna górna |
| `ref_basis` | enum: `reference_table`, `source_file` | ? | Skąd norma |
| `reference_range_id` | `integer` | ? | Id dobranej normy |
| `ref_sex` | enum: `F`, `M`, `any` | ? | Płeć dobranej normy |
| `ref_age_min` | `integer` | ? | Wiek od |
| `ref_age_max` | `integer` | ? | Wiek do |
| `file_ref_min` | `number` | ? | Norma z pliku źródłowego (dolna) |
| `file_ref_max` | `number` | ? | Norma z pliku (górna) |
| `ref_conflict` | `boolean` | ? | 1 = norma z pliku ≠ norma z tabeli (do przeglądu) |
| `ref_flag` | enum: `critical_low`, `below`, `in_range`, `above`, `critical_high` | ? | Położenie względem normy |
| `sample_type` | enum: `lab_serum`, `lab_whole_blood`, `lab_plasma`, `dxa_scan`, `self_report`, `wearable`, `manual_device`, `derived` |  | Rodzaj próbki/pomiaru |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |
| `raw_name` | `string` | ? | Surowa nazwa w źródle |
| `raw_value` | `string` | ? | Surowa wartość |
| `raw_unit` | `string` | ? | Surowa jednostka |

## `observations_mean`

**Do czego:** Wykresy trendów (szczególnie DXA z triplikatami).  
**Jeden wiersz =** osoba × wskaźnik × punkt czasowy (średnia z powtórzeń)  
**Klucz logiczny:** `subject_code`, `mission_code`, `source_id`, `indicator_code`, `anchor`, `day_offset`, `measured_date`  
**Typowe filtry:** `subject_code`, `indicator_code`, `phase`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/trend/{indicator_code}`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` |  | Środowisko |
| `source_id` | `string` |  | Źródło |
| `data_kind` | enum: `real_spaceflight`, `real_analog`, `real_environment`, `literature_aggregate`, `reference_literature`, `synthetic` |  | Rodzaj danych |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `body_system` | `string` | ? | Układ ciała |
| `phase` | enum: `pre`, `in`, `post`, `none` |  | Faza |
| `anchor` | enum: `launch`, `landing`, `none` |  | Anchor |
| `day_offset` | `integer` | ? | Dni względem anchor |
| `time_order` | `integer` | ? | Klucz chronologii |
| `mission_day` | `integer` | ? | Dzień od startu |
| `timepoint_label` | `string` | ? | Etykieta czasu |
| `measured_date` | `date` | ? | Data (serie) |
| `value` | `number` |  | Średnia z powtórzeń |
| `value_sd` | `number` | ? | Odchylenie standardowe powtórzeń |
| `n_replicates` | `integer` |  | Liczba powtórzeń |
| `unit` | `string` |  | Jednostka |
| `ref_min` | `number` | ? | Norma dolna |
| `ref_max` | `number` | ? | Norma górna |
| `ref_critical_low` | `number` | ? | Wartość krytyczna dolna |
| `ref_critical_high` | `number` | ? | Wartość krytyczna górna |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |

## `baseline`

**Do czego:** Wartość wyjściowa osoby sprzed misji.  
**Jeden wiersz =** osoba × misja × wskaźnik  
**Klucz logiczny:** `subject_code`, `mission_code`, `indicator_code`  
**Typowe filtry:** `subject_code`, `indicator_code`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/baseline`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `indicator_code` | `string` |  | Wskaźnik |
| `unit` | `string` |  | Jednostka |
| `baseline_value` | `number` |  | Średnia przedlotowa (phase = pre) |
| `n_pre_timepoints` | `integer` |  | Liczba punktów przedlotowych |
| `baseline_timepoints` | `string` |  | Użyte punkty, lista ', ' |

## `change_from_baseline`

**Do czego:** Zmiana względem baseline'u i status progów typu „% wartości sprzed lotu” (BMD, VO2max, masa).  
**Jeden wiersz =** osoba × wskaźnik × punkt czasowy  
**Klucz logiczny:** `subject_code`, `mission_code`, `indicator_code`, `timepoint_label`, `day_offset`  
**Typowe filtry:** `subject_code`, `indicator_code`, `baseline_status`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/trend/{indicator_code}`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `body_system` | `string` | ? | Układ ciała |
| `phase` | enum: `pre`, `in`, `post`, `none` |  | Faza |
| `timepoint_label` | `string` | ? | Etykieta czasu |
| `day_offset` | `integer` | ? | Dni względem anchor |
| `mission_day` | `integer` | ? | Dzień od startu |
| `time_order` | `integer` | ? | Klucz chronologii |
| `value` | `number` |  | Wartość (średnia z powtórzeń) |
| `unit` | `string` |  | Jednostka |
| `baseline_value` | `number` |  | Baseline |
| `delta` | `number` |  | Różnica bezwzględna |
| `pct_of_baseline` | `number` | ? | Procent baseline'u (100 = bez zmian) |
| `pct_change` | `number` | ? | Zmiana procentowa (0 = bez zmian) |
| `baseline_threshold_id` | `string` | ? | Id progów względem baseline'u |
| `baseline_metric` | enum: `pct_of_baseline`, `pct_change` | ? | Która metryka była oceniana (zależy od progu) |
| `baseline_status` | enum: `ok`, `caution`, `alert` | ? | Status wg progów względem baseline'u |
| `baseline_message` | `string` | ? | Komunikat |
| `baseline_action` | `string` | ? | Zalecane działanie |
| `escalate` | `boolean` | ? | Eskalacja do flight surgeona |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |

## `latest`

**Do czego:** Dashboard: kafelki z kolorem, komunikatem i akcją.  
**Jeden wiersz =** osoba × misja × wskaźnik (ostatni pomiar)  
**Klucz logiczny:** `subject_code`, `mission_code`, `indicator_code`  
**Typowe filtry:** `subject_code`, `status`, `category`, `body_system`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/latest`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `category` | enum: `vitals`, `lab_cbc`, `lab_cmp`, `lab_cardio`, `lab_cytokine`, `bone_dxa`, `body_composition`, `fitness`, `sleep`, `mood`, `nutrition`, `environment`, `radiation` |  | Kategoria |
| `body_system` | `string` | ? | Układ ciała |
| `timepoint_label` | `string` | ? | Etykieta czasu |
| `mission_day` | `integer` | ? | Dzień od startu |
| `time_order` | `integer` | ? | Klucz chronologii |
| `measured_date` | `date` | ? | Data |
| `value` | `number` |  | Wartość |
| `unit` | `string` |  | Jednostka |
| `ref_min` | `number` | ? | Norma dolna |
| `ref_max` | `number` | ? | Norma górna |
| `baseline_value` | `number` | ? | Baseline osoby (średnia sprzed misji) |
| `pct_of_baseline` | `number` | ? | Procent baseline'u |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |
| `status` | enum: `ok`, `caution`, `alert` | ? | Najgorszy z: próg bezwzględny, próg względem baseline'u, norma laboratoryjna; NULL = brak reguły i normy |
| `status_basis` | enum: `threshold`, `baseline_threshold`, `lab_reference` | ? | Która ocena dała status |
| `message` | `string` | ? | Komunikat dla astronauty (z progów) |
| `action` | `string` | ? | Zalecane działanie (z progów) |
| `escalate` | `boolean` |  | Eskalacja do flight surgeona (próg z eskalacją albo wartość krytyczna) |

## `body_system_status`

**Do czego:** Klikalna sylwetka: kolor części ciała.  
**Jeden wiersz =** osoba × misja × układ ciała  
**Klucz logiczny:** `subject_code`, `mission_code`, `body_system`  
**Typowe filtry:** `subject_code`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/body`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `body_system` | `string` |  | Układ ciała |
| `body_system_label` | `string` |  | Nazwa układu |
| `body_region` | `string` |  | Region sylwetki |
| `status` | enum: `ok`, `caution`, `alert`, `no_data` |  | Najgorszy status wśród wskaźników układu |
| `n_indicators` | `integer` |  | Liczba wskaźników z danymi |
| `n_alert` | `integer` |  | Liczba alertów |
| `n_caution` | `integer` |  | Liczba ostrzeżeń |
| `escalate` | `boolean` |  | Czy którykolwiek wymaga eskalacji |

## `daily_series`

**Do czego:** Wykresy serii dziennych (wearables, dane symulacyjne) ze średnią 7-dniową; dane dla reguł kroczących.  
**Jeden wiersz =** osoba × wskaźnik × dzień  
**Klucz logiczny:** `subject_code`, `mission_code`, `indicator_code`, `measured_date`  
**Typowe filtry:** `subject_code`, `indicator_code`, `measured_date`  
**Endpoint (propozycja):** `GET /api/subjects/{subject_code}/daily/{indicator_code}?from=&to=`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `subject_code` | `string` |  | Osoba |
| `mission_code` | `string` |  | Misja |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `unit` | `string` |  | Jednostka |
| `measured_date` | `date` |  | Dzień (UTC) |
| `mission_day` | `integer` | ? | Dzień od startu |
| `value` | `number` |  | Średnia dzienna |
| `value_min` | `number` |  | Minimum dnia |
| `value_max` | `number` |  | Maksimum dnia |
| `n_samples` | `integer` |  | Liczba pomiarów w dniu |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |
| `value_7d_mean` | `number` |  | Średnia z 7 dni kalendarzowych (bieżący + 6 poprzednich; luki nie wydłużają okna) |
| `n_days_7d` | `integer` |  | Ile dni z danymi było w oknie 7 dni (do oceny wiarygodności średniej) |

## `environment_daily`

**Do czego:** Panel promieniowania i warunków kabiny.  
**Jeden wiersz =** środowisko × miejsce × wskaźnik × źródło × dzień  
**Klucz logiczny:** `environment`, `location`, `indicator_code`, `source_id`, `measured_date`  
**Typowe filtry:** `environment`, `indicator_code`, `measured_date`  
**Endpoint (propozycja):** `GET /api/environments/{environment}/daily?indicator_code=`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` |  | Środowisko |
| `location` | `string` |  | Miejsce ('' = całe środowisko) |
| `indicator_code` | `string` |  | Wskaźnik |
| `indicator_label` | `string` |  | Nazwa |
| `unit` | `string` |  | Jednostka |
| `source_id` | `string` |  | Źródło |
| `measured_date` | `date` |  | Dzień (UTC) |
| `value_mean` | `number` |  | Średnia |
| `value_min` | `number` |  | Minimum |
| `value_max` | `number` |  | Maksimum |
| `n_samples` | `integer` |  | Liczba próbek |
| `is_synthetic` | `boolean` |  | Dane symulacyjne |

## `cohort_stats`

**Do czego:** Dane zbiorcze z publikacji (np. BP przed/w trakcie/po locie); kalibracja generatora.  
**Jeden wiersz =** badanie × wskaźnik  
**Klucz logiczny:** `source_id`, `source_row`, `indicator_code`  
**Typowe filtry:** `mission_type`, `indicator_code`  
**Endpoint (propozycja):** `GET /api/literature/cohorts?indicator_code=&mission_type=`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `source_id` | `string` |  | Źródło |
| `source_row` | `integer` |  | Wiersz w pliku źródłowym |
| `study_title` | `string` |  | Tytuł badania |
| `mission_type` | `string` | ? | ISS, STS, Soyuz, HDT… |
| `environment` | enum: `earth`, `iss`, `cislunar`, `lunar_surface`, `mars_transit`, `mars_surface`, `leo_free_flyer`, `analog_hdt` | ? | Środowisko |
| `n` | `integer` | ? | Liczba osób |
| `n_male` | `integer` | ? | Mężczyźni |
| `n_female` | `integer` | ? | Kobiety |
| `age_mean` | `number` | ? | Średni wiek |
| `bmi_mean` | `number` | ? | Średnie BMI |
| `countermeasure` | `string` | ? | Countermeasure |
| `indicator_code` | `string` |  | Wskaźnik |
| `unit` | `string` |  | Jednostka |
| `pre_mean` | `number` | ? | Średnia przed lotem |
| `pre_sd` | `number` | ? | SD przed lotem |
| `in_mean` | `number` | ? | Średnia w locie |
| `in_sd` | `number` | ? | SD w locie |
| `post_mean` | `number` | ? | Średnia po locie |
| `post_sd` | `number` | ? | SD po locie |

## `import_log`

**Do czego:** Diagnostyka importów, wersjonowanie danych.  
**Jeden wiersz =** jeden import pliku  
**Klucz logiczny:** `batch_id`  
**Typowe filtry:** `source_id`, `status`  
**Endpoint (propozycja):** `GET /api/meta/imports`

| Kolumna | Typ | NULL | Opis |
|---|---|---|---|
| `batch_id` | `integer` |  | Id importu |
| `source_id` | `string` |  | Źródło |
| `adapter` | `string` |  | Adapter |
| `file_name` | `string` |  | Plik |
| `file_sha256` | `string` |  | Suma SHA-256 pliku |
| `started_at` | `datetime` |  | Start |
| `finished_at` | `datetime` | ? | Koniec |
| `status` | enum: `running`, `ok`, `failed` |  | Status |
| `rows_read` | `integer` | ? | Wierszy przeczytanych |
| `rows_upserted` | `integer` | ? | Wierszy zapisanych |
| `rows_rejected` | `integer` | ? | Wierszy odrzuconych |
| `notes` | `string` | ? | Uwagi / powody odrzuceń |

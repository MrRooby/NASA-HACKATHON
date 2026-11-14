# DATABASE: MariaDB 11.4 (astro_core / astro_api)

Model i kontrakt danych: [`DATABASE_PLAN.md`](DATABASE_PLAN.md), [`schema/README.md`](schema/README.md). Dane habitatu (baza `astro_habitat`, widoki `astro_api.habitat_*`): [`schema/HABITAT.md`](schema/HABITAT.md). Testy kognitywne (baza `astro_cognitive`, widoki `astro_api.cognitive_*`): [`schema/COGNITIVE.md`](schema/COGNITIVE.md).

## Uruchomienie

```bash
cd DATABASE
cp .env.example .env      # uzupełnić hasła (w tym COGNITIVE_WRITER_PASSWORD dla MOTHER); DB_BIND_IP = `tailscale ip -4` tej maszyny
docker compose up -d
```

- Port jest wystawiony **tylko na adresie Tailscale** (`DB_BIND_IP`, obecnie `100.118.238.112:3306`). Nie działa na `localhost` ani w sieci LAN, więc backend na tej samej maszynie też łączy się przez adres Tailscale.
- `schema/001_core.sql` … `016_cognitive_seed.sql` wykonują się automatycznie **tylko przy pierwszym starcie** (pusty wolumen `astro_mariadb_data`). Po zmianie schematu: `docker compose down -v && docker compose up -d` (**kasuje dane**).
- Wspólny demo-zestaw Marsa generuje `python3 DATABASE/synthetic/generate.py --dataset mars --seed 42 --out data/synthetic/mars_demo`, a ładuje go `uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_canonical.py data/synthetic/mars_demo`. Powiązanie C1–C4 z SYN-02, SYN-01, SYN-03, SYN-04 tworzy `007_mars_crew_link.sql`.
- Połączenie backendu: `mariadb -h 100.118.238.112 -u astro_reader -p astro_api` (tylko odczyt: widoki `astro_api` i tabele wymienione w `schema/012_users_extra.sql`).

## Import danych

```bash
# z katalogu głównego repo; hasło astro_etl i DB_HOST z DATABASE/.env
uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load.py        # config/ + data/nasa
uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_extra.py  # data/env + data/lsda (po scripts/fetch_data.py)
```

## Dane symulacyjne (demo)

```bash
python3 DATABASE/synthetic/generate.py --dataset demo --seed 42      # -> data/synthetic/demo/ (deterministyczne)
uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_canonical.py data/synthetic/demo
```

Osoby `SYN-01`…`SYN-04` w misji `SYN-ISS-180` (fikcyjny start 2030-01-01): codzienne tętno, BP, temperatura, SpO2, sen, nastrój, ćwiczenia, kalorie; co tydzień masa i glukoza; VO2max, siła, DXA, krew; kabina co godzinę. Scenariusze S1–S12 z `DATABASE_PLAN.md` §10.5, oczekiwane wyniki w `data/synthetic/demo/expected.json`. Wszystko ma `is_synthetic = 1`. **To nie są prawdziwe dane astronautów.**

Testy kognitywne (próby PVT-B / Go/No-Go / DSST dla SYN-01…04 w `SYN-ISS-180`; SYN-04 pogarsza się w drugiej połowie misji):

```bash
python3 DATABASE/synthetic/cognitive_generate.py --seed 42             # -> data/synthetic/cognitive_demo/ (meta.json, sessions.csv, trials.csv)
uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_cognitive.py data/synthetic/cognitive_demo
```

Najpierw `load_canonical.py data/synthetic/demo` (misja, osoby, źródło `synthetic_v1`). Ładowanie jest idempotentne (kasuje i wstawia ponownie syntetyczne sesje tej misji oraz ich lustro w `observation`).

`load_extra.py` przyjmuje listę kroków (`noaa eda radlab cdaweb lsda`); bez argumentów wykonuje wszystkie. Brakujące pliki pomija.

Import jest idempotentny, więc można go powtarzać. `load.py` ładuje słowniki z `config/`, Inspiration4 (CBC, CMP, panel kardio, cytokiny) i kohorty BP z Mendeley. `load_extra.py` ładuje środowisko (NOAA, kabina ISS z OSDR EDA, dawki RadLab/SRAG, Curiosity RAD) i DXA z bed restu (LSDA MR035G: C3A, C3B, MEDES). Log każdego pliku jest w widoku `astro_api.import_log`.

## Podgląd danych

- **W przeglądarce (Adminer):** http://100.118.238.112:8080. System: MySQL/MariaDB, serwer: `mariadb`, użytkownik/hasło: `admin` / `admin` (pełny dostęp do `astro_core` i `astro_api`) albo `astro_reader` (tylko odczyt, hasło z `.env`). Do podglądu tabel źródłowych użyj `astro_etl` i bazy `astro_core`.
- **Klient desktopowy** (DBeaver, DataGrip, VS Code SQLTools): host `100.118.238.112`, port `3306`, te same dane logowania.

## Aktualizacja uprawnień na działającej bazie

Pliki ze `schema/` wykonują się tylko przy pierwszym starcie pustego wolumenu. Na bazie zainicjalizowanej wcześniej uprawnienia (w tym odczyt `astro_reader` dla tabel czytanych przez MOTHER) dogrywa się bez kasowania danych, bo `012_users_extra.sql` jest idempotentny:

```bash
docker exec -i astro-mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"' < DATABASE/schema/012_users_extra.sql
```

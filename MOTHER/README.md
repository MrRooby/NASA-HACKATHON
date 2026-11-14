# MOTHER: backend (API) projektu

MOTHER to „mózg” projektu. Czyta bazę danych zespołu, analizuje zdrowie załogi i udostępnia wynik **wyłącznie jako API JSON**. Nie ma własnych stron. **Interfejs użytkownika to aplikacja `GUI/`** (React + ludzik 3D), która pobiera dane z MOTHER.

API zawsze zwraca **aktualną zawartość bazy**. Gdy ktoś doda dane, MOTHER sam przelicza wynik, niczego nie trzeba przebudowywać.

## Co potrzebujesz (raz)

1. **Tailscale** zalogowany do sieci zespołu: https://tailscale.com/download. Jeśli nie widzisz bazy, poproś właściciela bazy o zatwierdzenie konta.
2. **Python 3.10+**: https://www.python.org/downloads/. Przy instalacji zaznacz „Add python.exe to PATH”.
3. **Użytkownik i hasło do bazy** od właściciela bazy.

## Uruchomienie

1. Pobierz folder `MOTHER` z brancha `konrad`. Najprościej: na GitHubie przełącz branch na `konrad` → **Code → Download ZIP**, rozpakuj i wejdź do folderu `MOTHER`.
2. **Windows:** kliknij dwukrotnie `start.bat`. **Mac/Linux:** w terminalu w folderze `MOTHER` wpisz `./start.sh`.
3. Za pierwszym razem program zapyta o dane bazy. Przy wartościach w [nawiasach] naciśnij Enter. Wpisz **użytkownika i hasło** od właściciela bazy (hasła nie będzie widać podczas pisania).
4. API działa pod **http://localhost:8000** (`/api/status`, dokumentacja: `/api/docs`). Pierwsze `/api/dashboard` trwa ~40 s, bo MOTHER analizuje całą misję. Kolejne są natychmiastowe.
5. Interfejs: uruchom aplikację z folderu `GUI/` (`npm run dev`, zob. `GUI/README.md`). Łączy się z MOTHER przez `/api`.

Zamknięcie: zamknij czarne okno albo naciśnij Ctrl+C.
Zmiana hasła: `start.bat --setup` (albo `./start.sh --setup`).

## Gdy coś nie działa

| Komunikat | Co zrobić |
|---|---|
| „Database not reachable” / „Cannot reach the team database” | Włącz Tailscale i sprawdź, czy jesteś w sieci zespołu. Uruchom ponownie z `--setup` i wpisz hasło jeszcze raz. |
| „Python 3.10 or newer is required” | Zainstaluj Pythona (krok 2 wyżej) i uruchom `start` jeszcze raz. |
| GUI pokazuje „OFFLINE · demo data” | MOTHER nie działa albo nie widzi bazy. Uruchom `start` ponownie i sprawdź `http://localhost:8000/api/status`. |

## API (używa go GUI)

Kontrakt kart narządów: [`UI_CONTRACT.md`](UI_CONTRACT.md). Wszystkie adresy:

| Adres | Co zwraca |
|---|---|
| `http://localhost:8000/api/dashboard` | pełna analiza MOTHER: każdy dzień misji, każdy astronauta, wnioski, ryzyka, sylwetka, EVA, zadania |
| `http://localhost:8000/api/data-map` | inwentarz bazy według części ciała i czujników + graf zależności |
| `http://localhost:8000/api/habitat` | strefy habitatu z pomiarami czujników dla jednego sola (`?sol=142`), zdarzenia, kto gdzie przebywa; opis w `UI_CONTRACT.md` |
| `http://localhost:8000/api/status` | czy baza jest osiągalna i czy analiza jest gotowa |
| `http://localhost:8000/api/docs` | automatyczna dokumentacja API |

## Bezpieczeństwo

- Hasło zapisuje się tylko lokalnie w `MOTHER/.env`, a ten plik **nie trafia do gita**.
- Serwer działa tylko na Twoim komputerze (`127.0.0.1`). Nikt z zewnątrz się do niego nie podłączy.
- MOTHER **tylko czyta** bazę i niczego w niej nie zmienia.
- Dane syntetyczne są w API oznaczone (`data_kind: "synthetic"`), a GUI musi je tak pokazywać. To demo edukacyjne, nie porada medyczna.

---

### Dla programistów: co jest w środku

| Moduł | Rola |
|---|---|
| `mother/server.py` | serwer API (FastAPI): tylko `/api/*`, cache odświeżany po każdym imporcie do bazy (`import_log`) |
| `mother/db_mission.py`, `db_source.py` | odczyt misji, środowiska, laboratoriów z widoków `astro_api` |
| `mother/ingest.py` | bramka jakości: wartości niemożliwe fizycznie nie wywołują alarmów |
| `mother/rules.py` | progi z `config/thresholds.json` (jedyne źródło statusu ALERT) |
| `mother/analytics.py` | norma osobista (FD8–28), EWMA, CUSUM, obwiednia w stylu NASA IMS, trendy Theil–Sen |
| `mother/knowledge.py` + `config/knowledge_graph.json` | zagrożenia → ryzyka → części ciała; syndromy (CO2+ból głowy, SANS, infekcja…), EVA GO/NO-GO |
| `mother/forecast.py`, `scheduler.py` | prognozy (dawka, kości, masa) i zadania dla astronauty |

Migawki offline jako JSON (ten sam kształt co `/api/dashboard` i `/api/data-map`): `python -m mother.export_demo` (symulator, bez bazy) i `python -m mother.data_map` (z bazy). Wynik trafia do `exports/`.
`config/shared/` to kopia wspólnego `config/` z repo, dzięki niej sam folder `MOTHER` działa samodzielnie. W pełnym repo używany jest oryginał z `config/`.

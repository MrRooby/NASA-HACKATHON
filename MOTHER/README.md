# MOTHER: jak uruchomić (5 minut)

MOTHER to „mózg” projektu. Czyta bazę danych zespołu, analizuje zdrowie załogi i pokazuje wynik na dwóch stronach:

- **Dashboard załogi:** sylwetka z kolorami, wskaźniki, wnioski z przyciskiem „Dlaczego?”, EVA GO / NO-GO, prognozy i wyniki krwi. Misję można przewijać dzień po dniu.
- **Mapa danych:** co jest w bazie według części ciała i czujników oraz jak wszystko łączy się z ryzykami NASA. Jest tam przycisk **„Copy list as JSON for the GUI”**.

Strony zawsze pokazują **aktualną zawartość bazy**. Gdy ktoś doda dane, wystarczy odświeżyć stronę (F5), niczego nie trzeba przebudowywać.

## Co potrzebujesz (raz)

1. **Tailscale** zalogowany do sieci zespołu: https://tailscale.com/download. Jeśli nie widzisz bazy, poproś właściciela bazy o zatwierdzenie konta.
2. **Python 3.10+**: https://www.python.org/downloads/. Przy instalacji zaznacz „Add python.exe to PATH”.
3. **Użytkownik i hasło do bazy** od właściciela bazy.

## Uruchomienie

1. Pobierz folder `MOTHER` z brancha `konrad`. Najprościej: na GitHubie przełącz branch na `konrad` → **Code → Download ZIP**, rozpakuj i wejdź do folderu `MOTHER`.
2. **Windows:** kliknij dwukrotnie `start.bat`. **Mac/Linux:** w terminalu w folderze `MOTHER` wpisz `./start.sh`.
3. Za pierwszym razem program zapyta o dane bazy. Przy wartościach w [nawiasach] naciśnij Enter. Wpisz **użytkownika i hasło** od właściciela bazy (hasła nie będzie widać podczas pisania).
4. Przeglądarka otworzy się sama na **http://localhost:8000**. Pierwsze otwarcie dashboardu trwa ~40 s, bo MOTHER analizuje całą misję. Kolejne są natychmiastowe.

Zamknięcie: zamknij czarne okno albo naciśnij Ctrl+C.
Zmiana hasła: `start.bat --setup` (albo `./start.sh --setup`).

## Gdy coś nie działa

| Komunikat | Co zrobić |
|---|---|
| „Database not reachable” / „Cannot reach the team database” | Włącz Tailscale i sprawdź, czy jesteś w sieci zespołu. Uruchom ponownie z `--setup` i wpisz hasło jeszcze raz. |
| „Python 3.10 or newer is required” | Zainstaluj Pythona (krok 2 wyżej) i uruchom `start` jeszcze raz. |
| „MOTHER server is not running” na stronie | Czarne okno zostało zamknięte. Uruchom `start` ponownie. |

## Dla zespołu GUI

Serwer udostępnia dane jako JSON, więc GUI może je czytać bezpośrednio:

| Adres | Co zwraca |
|---|---|
| `http://localhost:8000/api/dashboard` | pełna analiza MOTHER: każdy dzień misji, każdy astronauta, wnioski, ryzyka, sylwetka, EVA, zadania |
| `http://localhost:8000/api/data-map` | inwentarz bazy według części ciała i czujników + graf zależności |
| `http://localhost:8000/api/status` | czy baza jest osiągalna i czy analiza jest gotowa |
| `http://localhost:8000/api/docs` | automatyczna dokumentacja API |

## Bezpieczeństwo

- Hasło zapisuje się tylko lokalnie w `MOTHER/.env`, a ten plik **nie trafia do gita**.
- Serwer działa tylko na Twoim komputerze (`127.0.0.1`). Nikt z zewnątrz się do niego nie podłączy.
- MOTHER **tylko czyta** bazę i niczego w niej nie zmienia.
- Dane syntetyczne są zawsze tak oznaczone na stronach. To demo edukacyjne, nie porada medyczna.

---

### Dla programistów: co jest w środku

| Moduł | Rola |
|---|---|
| `mother/server.py` | lokalny serwer (FastAPI): strony + `/api/*`, cache odświeżany po każdym imporcie do bazy (`import_log`) |
| `mother/db_mission.py`, `db_source.py` | odczyt misji, środowiska, laboratoriów z widoków `astro_api` |
| `mother/ingest.py` | bramka jakości: wartości niemożliwe fizycznie nie wywołują alarmów |
| `mother/rules.py` | progi z `config/thresholds.json` (jedyne źródło statusu ALERT) |
| `mother/analytics.py` | norma osobista (FD8–28), EWMA, CUSUM, obwiednia w stylu NASA IMS, trendy Theil–Sen |
| `mother/knowledge.py` + `config/knowledge_graph.json` | zagrożenia → ryzyka → części ciała; syndromy (CO2+ból głowy, SANS, infekcja…), EVA GO/NO-GO |
| `mother/forecast.py`, `scheduler.py` | prognozy (dawka, kości, masa) i zadania dla astronauty |
| `web/` | strony: `index.html`, `dashboard.html`, `data_map.html` |

Wersje offline (jeden plik HTML z danymi w środku, bez bazy): `python -m mother.export_demo` i `python -m mother.data_map`, wynik trafia do `exports/`.
`config/shared/` to kopia wspólnego `config/` z repo, dzięki niej sam folder `MOTHER` działa samodzielnie. W pełnym repo używany jest oryginał z `config/`.

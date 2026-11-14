# TODO GUI: co jest szkieletem, symulacją albo fikcją

Lista rzeczy, które w GUI wyglądają na gotowe, ale nie mają jeszcze prawdziwych danych. Przy każdej: stan, miejsce w kodzie i to, czego GUI potrzebuje od zespołu bazy i API (MOTHER).

**Stany:**
- **SZKIELET**: jest UI, nie ma danych ani zapisu.
- **LOKALNIE**: działa, ale tylko w przeglądarce (stan Reacta albo localStorage).
- **SYMULOWANE**: liczby generuje GUI.
- **FIKCYJNE**: treść wymyślona na potrzeby demo.
- **BŁĄD DANYCH**: do poprawy po stronie bazy.

| # | Obszar | Stan | Kto ma ruch |
|---|---|---|---|
| a | Notatki / pamiętnik | SZKIELET | baza + API |
| b | Testy psychologiczne | SZKIELET | baza + API + medycyna (treść testów) |
| c | Profile załogi | FIKCYJNE, wpisane w GUI | baza + API |
| d | Codzienny check-in i raport dla flight surgeona | LOKALNIE | baza + API |
| e | Trzy pomieszczenia na mapie bazy | SYMULOWANE | baza (czujniki, strefy) |
| f | Teksty z backendu | tylko po angielsku | API |
| g | Alarm O2 na farmie w każdym solu | BŁĄD DANYCH | baza |
| h | Powiadomienia: potwierdzanie i odrzucanie | BRAK | baza + API |
| i | Logowanie | wybór osoby bez hasła | API |

Cały dostęp GUI do danych z punktów a, b i d idzie przez jeden plik: `src/data/crewStore.js`. Po podłączeniu backendu zmienia się tylko on. Ekrany czytają pole `connected` i same odblokowują formularze.

---

## a) Notatki / pamiętnik

- **Stan:** SZKIELET. Pole tekstowe i `[ SAVE ENTRY ]` są wyłączone, lista jest pusta, panel ma znaczek `NOT CONNECTED · TODO`.
- **W kodzie:** `src/profile/NotesPanel.jsx`, `src/data/crewStore.js` (`listNotes`, `addNote`).
- **Teraz:** `listNotes()` zwraca `{ items: [], connected: false }`, a `addNote()` odrzuca z błędem `NOT_CONNECTED`. Tekst pamiętnika nie jest nigdzie zapisywany, także w localStorage. To celowe, bo to dane osobiste.
- **Potrzebne z bazy:** tabela `crew_note` (`id`, `habitat_id`, `crew_code`, `sol`, `created_utc`, `text`, `visibility`). `visibility`: `private` (tylko autor), `physician` (autor i lekarz misji), `crew`.
- **Potrzebne z API:**
  - `GET /api/crew/{code}/notes` → `[{ id, crew_code, sol, created_utc, text, visibility }]`, najnowsze pierwsze.
  - `POST /api/crew/{code}/notes` z `{ text, sol, visibility }` → zapisany wpis.
- **Do decyzji:** kto czyta cudze notatki. GUI pokazuje dziś pamiętnik tylko autorowi. Zależy od punktu i.

## b) Testy psychologiczne

- **Stan:** SZKIELET. Tabela pięciu testów ze stałego katalogu, „ostatni wynik” i „następny termin” to `—`, `[ START ]` wyłączony.
- **W kodzie:** `src/profile/PsychTestsPanel.jsx`, `src/data/crewStore.js` (`PSYCH_TEST_CATALOG`, `listPsychTests`, `listPsychResults`, `submitPsychResult`).
- **Teraz w katalogu:** kwestionariusz nastroju (typu POMS), lista objawów (typu SCL-90), PVT (czas reakcji), jakość snu, spójność zespołu i konflikty. Wszystkie mają `available: false`. Częstotliwość i czas trwania to **założenie zespołu** (`basis: 'team_assumption'`), nie protokół NASA.
- **Potrzebne z bazy:**
  - `psych_test` (`id`, `code`, `name_en`, `name_pl`, `purpose_en`, `purpose_pl`, `cadence_sols`, `duration_min`, `reference`, `active`).
  - `psych_test_item` (`id`, `test_id`, `position`, `text_en`, `text_pl`, `scale_min`, `scale_max`, `reverse_scored`, `subscale`).
  - `psych_test_result` (`id`, `test_id`, `habitat_id`, `crew_code`, `sol`, `created_utc`, `score`, `subscales` JSON, `status`, `duration_s`).
  - `psych_test_answer` (`result_id`, `item_id`, `value`): odpowiedzi na pojedyncze pytania. Dla PVT zamiast tego surowe czasy reakcji.
- **Potrzebne z API:**
  - `GET /api/psych/tests` (katalog) i `GET /api/psych/tests/{code}` (pytania).
  - `GET /api/crew/{code}/psych/results` → wyniki z `test_id`, `sol`, `score`, `status`.
  - `POST /api/crew/{code}/psych/results` z `{ test_id, sol, answers }` → wynik policzony przez backend.
- **Punktacja:** po stronie MOTHER (sumy podskal, progi ok / caution / alert z polem `basis`, trend względem własnego baseline'u). Dla PVT: średni czas reakcji, liczba przeoczeń > 500 ms, falstarty.
- **Uwaga o licencjach:** POMS i SCL-90-R są płatne. Do demo potrzebne są własne pytania „w stylu” albo narzędzia wolne. PVT można zaimplementować samemu.
- **W GUI zostanie do zrobienia:** ekran przeprowadzania testu (formularz pytań, zadanie PVT). `PsychTestsPanel` ma już na to prop `onStart`.

## c) Profile załogi

- **Stan:** FIKCYJNE i wpisane na sztywno. Imiona, wiek, wykształcenie i notki są wymyślone, UI pokazuje znaczek `FICTIONAL`.
- **W kodzie:** `src/data/crewProfiles.js` (dane), `src/components/Avatar.jsx` (pikselowe awatary zamiast zdjęć), ekrany `src/screens/ProfileScreen.jsx`, `src/screens/CrewScreen.jsx`, `src/screens/LoginScreen.jsx`.
- **Teraz w bazie:** `astro_habitat.crew` ma tylko `code`, `subject_id`, `home_zone_code`, `role`.
- **Potrzebne z bazy:** kolumny albo tabela profilu: `name`, `callsign`, `age` lub `birth_year`, `nationality`, `role_en`, `role_pl`, `education_en`, `education_pl`, `bio_en`, `bio_pl`, `photo_url`, `fictional`.
- **Potrzebne z API:** `GET /api/crew` (lista) albo te pola w `GET /api/subjects`.
- **W GUI zostanie do zrobienia:** `crewProfiles.js` jako zapas offline, dane z API, gdy jest połączenie.

## d) Codzienny check-in i raport dla flight surgeona

- **Stan:** LOKALNIE.
- **W kodzie:** `src/checkin/CheckIn.jsx` (formularz), `src/checkin/thresholdLogic.js` (ocena wg `config/thresholds.json`), `src/profile/SurgeonReportPanel.jsx`, `src/profile/surgeonReport.js`, `src/data/crewStore.js` (`queueSurgeonReport`, `listSurgeonReports`).
- **Teraz:**
  - Check-in startuje z odczytami demo (znaczek `SIMULATED`) i żyje tylko w stanie ekranu. Znika po przejściu na inny ekran.
  - Raport trafia do localStorage pod kluczem `orbit-health-report`. Trzymany jest tylko ostatni, w tej jednej przeglądarce. Nic nie jest wysyłane.
  - Raport zawiera wskaźniki z check-inu ze statusem i zaleceniem oraz podsumowanie narządów z MOTHER, gdy jest połączenie.
- **Potrzebne z bazy:**
  - Zapis check-inu: nowe obserwacje w `astro_core.observation` (źródło „self-report”) albo tabela `crew_checkin` (`crew_code`, `sol`, `created_utc`, `indicator`, `value`, `unit`, `symptoms`).
  - Raport: tabela `surgeon_report` (`id`, `crew_code`, `sol`, `created_utc`, `payload` JSON, `state`). Kolejka na Ziemię już jest: `astro_medical.transmission` (`payload_type = 'report'`, stany `queued` / `held_blackout` / `sent`). Dziś wymaga ona `medical_event_id` albo `attachment_id`, więc raport trzeba podpiąć pod jedno z nich albo poluzować CHECK.
- **Potrzebne z API:**
  - `POST /api/crew/{code}/checkins`, `GET /api/crew/{code}/checkins?sol=N`.
  - `POST /api/crew/{code}/surgeon-reports` → `{ id, state, queued_at, available_at }`.
  - `GET /api/crew/{code}/surgeon-reports` → lista ze stanem (`queued`, `sent`, `acknowledged`) i odpowiedzią lekarza.
- **Opóźnienie łączności:** stan raportu ma uwzględniać czas lotu sygnału (do ok. 20 min w jedną stronę) i okna bez łączności. GUI pokaże „w kolejce → wysłany → odebrany”.

## e) Pomieszczenia symulowane na mapie bazy

- **Stan:** SYMULOWANE w GUI. Dotyczy trzech pomieszczeń: serwis / magazyn, strefa techniczna, reaktor.
- **W kodzie:** `src/habitat/simulatedRooms.js` (stały seed, odczyty z `source_flag: 'gui_simulated'`), rysunek w `src/habitat/geometry.js`.
- **Potrzebne z bazy:** strefy w `astro_habitat.zone` i kanały z odczytami dla tych pomieszczeń (ciśnienie, temperatura, wilgotność, pył, zapasy, parametry reaktora). Wtedy `GET /api/habitat` zwróci je jak pozostałe strefy.
- **W GUI zostanie do zrobienia:** usunąć `simulatedRooms.js` i znaczek `SIMULATED` z tych pomieszczeń.

## f) Teksty z backendu tylko po angielsku

- **Stan:** GUI jest dwujęzyczne (EN / PL), ale wszystko, co przychodzi z MOTHER, jest po angielsku.
- **Dotyczy:** `top_message`, etykiety narządów, `headline`, `action`, `why`, nazwy stref i kanałów, typy zdarzeń. Widać to w powiadomieniach (`src/notifications/buildNotifications.js`), na ekranie załogi i w profilu.
- **Także w GUI:** komunikaty i zalecenia z `config/thresholds.json` (check-in) oraz pole `reference` w katalogu testów są tylko po angielsku.
- **Potrzebne z API:** jedna z dwóch dróg:
  - `?lang=pl` (albo nagłówek `Accept-Language`) w `/api/organs`, `/api/organs/{code}`, `/api/habitat`;
  - albo kody komunikatów z parametrami (`code: 'urine_volume_low'`, `params: { value: 1.73 }`), a tłumaczenie w GUI.

## g) Alarm O2 na farmie w każdym solu

- **Stan:** BŁĄD DANYCH. Strefa `farm` ma status `alert` w każdym sprawdzonym solu (142, 380, 600), więc powiadomienie o farmie wisi zawsze.
- **Przyczyna:** próg alarmu O2 to 34,0001 % (`DATABASE/schema/005_habitat_seed.sql`, wiersz `o2_fraction` / `alert`), a symulowane wartości dochodzą do 34,23–34,26 % (nominał ok. 33,8 %).
- **W GUI:** nic nie zmieniamy, `src/notifications/buildNotifications.js` pokazuje to, co dostaje. Nagrane przykłady: `src/test/fixtures/habitat_sol*.json`.
- **Potrzebne z bazy:** jedna poprawka do wyboru: obniżyć rozrzut O2 na farmie w generatorze danych, żeby szczyty zostawały poniżej 34 %, albo zmienić regułę (np. alarm dopiero po utrzymaniu się przekroczenia przez N minut).

## h) Powiadomienia: brak potwierdzania i odrzucania

- **Stan:** BRAK. Lista jest liczona od zera z dwóch odpowiedzi MOTHER. Nie da się potwierdzić ani ukryć powiadomienia, a po odświeżeniu wraca wszystko.
- **W kodzie:** `src/notifications/buildNotifications.js`, `src/notifications/NotificationList.jsx`. Lista na profilu: `personalNotifications` w `src/screens/ProfileScreen.jsx` (zdrowie osoby i jej moduł).
- **Teraz w bazie:** jest `astro_medical.alert` ze stanami `open` / `acknowledged` / `resolved` / `suppressed`, ale MOTHER go nie wystawia.
- **Potrzebne z API:**
  - `GET /api/alerts?crew=C1&sol=N` ze stałym `id` i stanem,
  - `POST /api/alerts/{id}/ack` z `{ crew_code }`.
- **W GUI zostanie do zrobienia:** przycisk `[ ACK ]`, filtr „pokaż potwierdzone”, licznik tylko otwartych.

## i) Uwierzytelnianie

- **Stan:** logowanie to wybór jednej z czterech osób, bez hasła. Sesja żyje w stanie Reacta i znika po odświeżeniu.
- **W kodzie:** `src/screens/LoginScreen.jsx`, sesja w `src/App.jsx`.
- **Skutek:** każdy może otworzyć profil każdego (tylko do odczytu) i zobaczyć jego stan zdrowia. Przy prawdziwych notatkach i wynikach testów psychologicznych to nie wystarczy.
- **Potrzebne z API:** `POST /api/login` (kod załoganta + PIN albo hasło) → token, `POST /api/logout`, role (`crew`, `physician`, `commander`) i sprawdzanie uprawnień w endpointach z punktów a, b i d.
- **Do decyzji:** co widzi lekarz misji (HAB-C4), a co dowódca. Propozycja: lekarz widzi dane zdrowotne i wyniki testów wszystkich, pamiętnik zostaje prywatny.

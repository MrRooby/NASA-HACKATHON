# CLAUDE.md — NASA Space Apps Challenge 2026: Health Monitoring Software

## Kontekst

Startujemy w **NASA Space Apps Challenge 2026** z wyzwaniem **"Create Health Monitoring Software for Astronauts on Space Missions"** (poziom Intermediate).
Pełny, oryginalny opis wyzwania z linkami do zasobów: [CHALLENGE.md](CHALLENGE.md). To jest źródło prawdy o wymaganiach.
Research danych NASA, harmonogram badań astronautów, progi z norm NASA i mapowanie ryzyko → wskaźnik → rekomendacja: [DATA_SOURCES.md](DATA_SOURCES.md). Pobrane prawdziwe dane (krew Inspiration4, ciśnienie w locie) są w `data/nasa/`.

**Konfiguracja medyczna (`config/`):**
- `thresholds.json`: progi dla 23 wskaźników (przedziały ok / caution / alert, komunikat, akcja, eskalacja), środowiska z dawką promieniowania i opóźnieniem łączności, limity dawek dla narządów.
- `inflight_measurements.json`: badania, które astronauci na ISS na pewno mają w trakcie misji, z częstotliwością. Osobno lista rzeczy niepotwierdzonych.
- `sources.json`: bibliografia, do której odwołują się oba pliki przez `sources: [id]`.
- Każdy przedział progu ma pole `basis`: `source` (wartość z cytowanego źródła) albo `team_assumption` (nasza decyzja; trzeba ją tak opisać w UI i w pitchu).
- Po każdej zmianie w `config/` uruchom `python3 scripts/validate_config.py`. Skrypt sprawdza składnię JSON, czy źródła istnieją i czy przedziały nie mają luk ani nakładek.

**Kluczowy fakt o danych:** publiczne dane per astronauta to tylko badania krwi przed lotem i po locie (Inspiration4). Serie HR, BP, snu i nastroju generujemy syntetycznie, kalibrując na opublikowanych średnich, i oznaczamy w UI jako „simulated”.

**Stan projektu (2026-11-14):** jest tylko analiza wyzwania. Kodu jeszcze nie ma, a stack, skład zespołu i deadline czekają na decyzję (sekcja „Otwarte pytania”). Ten plik aktualizujemy w miarę, jak przychodzą nowe informacje.

## Wyzwanie w jednym zdaniu

Zbudować **wizualne narzędzie**, w którym astronauta na długiej misji sam **zbiera wskaźniki zdrowia, ocenia swój stan i dostaje wskazówki, co z tym zrobić**: profilaktykę, leczenie, a w razie potrzeby eskalację do załogi lub do flight surgeona na Ziemi.

## Wymagania z opisu wyzwania

**Obowiązkowe (rdzeń):**
1. Zbieranie wskaźników zdrowia dowolną metodą wejścia: klawiatura, kliknięcia, obraz z kamery. Każda dana jest OK, jeśli reprezentuje wskaźnik zdrowia (np. glukoza w mg/dL albo obraz USG).
2. Ocena stanu zdrowia przez samego astronautę (self-assessment).
3. Wskazówki dotyczące leczenia i poprawy zdrowia.
4. Wizualna, czytelna prezentacja: **UI to istotna część oceny**.

**Wskaźniki podane wprost w opisie:** ciśnienie krwi, tętno, glukoza, temperatura ciała, liczba godzin snu, nastrój.

**Pytania, na które rozwiązanie powinno odpowiadać** (jury będzie tego szukać):
- Które pomiary da się wykonać w kosmosie?
- Po co dane badanie?
- Jak zagrożenia lotu kosmicznego wpływają na dany wskaźnik?
- Kiedy wynik wymaga uwagi załogi albo flight surgeona na Ziemi?
- Jakie działania zapobiegają stanowi krytycznemu?

**Opcjonalne pomysły podsunięte przez NASA** (każdy z nich to łatwe punkty):
- Interaktywna **sylwetka człowieka**: klikalne części ciała z opisem funkcji i aktualnym statusem zdrowia. Podana jako główny przykład, więc warto ją mieć.
- **Różne środowiska**: statek, stacja kosmiczna, łazik, baza na Księżycu lub Marsie.
- **Przypomnienia i harmonogram**: tool prosi o pomiary lub czynności w ramach rutyny misji.
- **Grywalizacja**: zaangażowanie w zadania prozdrowotne.
- **Dynamiczne wykresy** trendów w czasie.
- **Kolorowanie statusów** (np. zielony / żółty / czerwony).
- **Edukacja**: nie zakładamy, że astronauta wie wszystko. Proste instrukcje pomiaru i wyjaśnienia wskaźników i ryzyk.

## Kontekst merytoryczny (NASA HRP)

**5 zagrożeń lotu kosmicznego (HRP):** promieniowanie kosmiczne · izolacja i zamknięcie · odległość od Ziemi · zmienione pole grawitacyjne · wrogie, zamknięte środowisko.

**Skutki zdrowotne wymienione w opisie:** zmiany odporności, utrata gęstości kości, zdarzenia sercowo-naczyniowe, niedożywienie, problemy behawioralne i psychiczne.

**Implikacje projektowe, które wynikają z kontekstu** (nasze wnioski, nie wymagania; warto je pokazać w prezentacji):
- **Odległość od Ziemi oznacza autonomię.** Opóźnienie łączności z Marsem to kilka do ok. 20 minut w jedną stronę. Aplikacja powinna działać **offline-first**, bez zależności od chmury, a eskalacja do flight surgeona to asynchroniczny raport, nie czat na żywo.
- **Mikrograwitacja** zmienia normy: przesunięcie płynów ku głowie, ryzyko SANS (zmiany w oku i nerwie wzrokowym), utrata kości i mięśni, nietolerancja ortostatyczna po powrocie. Progi „normy” mogą zależeć od środowiska i fazy misji.
- **Izolacja** sprawia, że nastrój, sen i stres to pełnoprawne wskaźniki, nie dodatki.
- **Promieniowanie**: skumulowana dawka to dobry wskaźnik do wizualizacji (zasób CSA o monitorowaniu promieniowania).
- **Trend jest ważniejszy niż pojedynczy pomiar.** Na misji liczy się odchylenie od baseline'u danego astronauty sprzed lotu, a nie tylko od norm populacyjnych.

Wszelkie progi i zalecenia medyczne w aplikacji mają charakter **demonstracyjny**. Trzymamy je w jednym pliku konfiguracyjnym ze źródłem (link do NASA HRP lub literatury) przy każdym progu, a w UI pokazujemy disclaimer.

## Kierunek rozwiązania (propozycja, do potwierdzenia przez zespół)

**MVP, czyli minimum na demo:**
1. Dashboard ze statusem wskaźników: kolorowe kafelki plus sparkline'y.
2. Formularz lub szybki check-in pomiaru (BP, HR, glukoza, temperatura, sen, nastrój).
3. Silnik reguł: wartość → status (OK / uwaga / alarm) → konkretna rekomendacja i ewentualna eskalacja do „Mission Control”.
4. Interaktywna sylwetka: części ciała powiązane ze wskaźnikami i ryzykami (serce → BP/HR, kości → gęstość i ćwiczenia, mózg → nastrój/sen/SANS itd.).
5. Wykresy trendów z danymi demo, wygenerowanymi syntetycznie dla kilkudziesięciu dni misji.

**Rozszerzenia, jeśli starczy czasu:** harmonogram i przypomnienia, grywalizacja (streaki, misje dzienne), przełącznik środowiska (ISS / Księżyc / Mars) zmieniający kontekst i progi, eksport raportu dla flight surgeona, wejście z kamery (np. tętno z kamery albo zdjęcie odczytu urządzenia).

## Zasady pracy w repo

- **Priorytet to działające demo.** Wybieramy prostotę zamiast architektury i nie dodajemy backendu, jeśli nie jest potrzebny.
- **Dane medyczne i progi oddzielamy od komponentów UI**, w jednym module konfiguracyjnym ze źródłami.
- **Dane demo** są syntetyczne i deterministyczne (stały seed), żeby demo zawsze wyglądało tak samo.
- **Język:** treści w aplikacji i materiały zgłoszeniowe po angielsku, bo oceniają międzynarodowi jurorzy. Komunikacja w zespole i ten plik po polsku.
- **Co ma pokazać demo:** typowy dzień astronauty, czyli check-in → wykryta anomalia (np. podwyższone ciśnienie albo słaby sen przez 3 dni) → rekomendacja → raport do Ziemi.

## Zgłoszenie (do zweryfikowania w regulaminie Space Apps 2026)

Z poprzednich edycji pamiętamy, że zwykle wymagane są: strona projektu na spaceappschallenge.org, krótkie demo (wideo ok. 30 s albo kilka slajdów), link do repozytorium lub działającej wersji, lista użytych danych i zasobów NASA oraz informacja o użyciu AI. **Sprawdzić aktualne wymagania i kryteria oceny**: https://www.spaceappschallenge.org/resources/

## Otwarte pytania

- [ ] Deadline zgłoszenia i harmonogram naszego eventu lokalnego
- [ ] Skład zespołu i role (frontend, dane/medycyna, design, pitch)
- [ ] Stack: web (np. React + Vite + biblioteka wykresów) czy coś innego? Platforma demo: przeglądarka, tablet, desktop?
- [ ] Czy organizatorzy dodali nowe zasoby lub dane do zakładki Resources? Opis mówi, że mogą dojść przed hackathonem.
- [ ] Wymagania i kryteria oceny zgłoszenia w 2026

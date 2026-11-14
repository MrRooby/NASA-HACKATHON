# AWERNASA GUI: zasady projektu (v2, „kokpit”)

Ten plik jest jedynym źródłem prawdy o wyglądzie i układzie GUI. Każdy ekran ma się z nim zgadzać.

## 1. Zasady z kokpitów i displayów NASA

Źródła:
- NASA CLDP Human Systems Integration Workshop, *Crew Interfaces* (K. Holden, 2024), https://ntrs.nasa.gov/api/citations/20240003566/downloads/CLD%20HSI%20Workshop%20Crew%20Interfaces.pdf
- ISA-101 *High Performance HMI* (podsumowania: ISA blog, control.com „Going Gray”).
- FAA Human Factors Design Standard, rozdz. 3.1 (displays), https://hfcc.dot.gov/
- DTIC: *Color Display Design Guide* (1978), *MFD design guidelines* (ADA399354), *Color coding in fighter weapons displays* (ADA125321).

| Zasada | Skąd | Jak stosujemy |
|---|---|---|
| **Quiet / dark display:** gdy wszystko jest w normie, ekran jest spokojny; kolor przyciąga uwagę tylko do odchyleń | NASA HSI, ISA-101 | Normalny stan to przygaszony kontur w kolorze OK, nigdy pełne wypełnienie. Wypełnienie i jasność dostają tylko CAUTION i ALERT. |
| **Kolory mają stałe, standardowe znaczenie** | NASA HSI „use standard color meanings”, FAA | Zielony = OK, bursztyn = uwaga, czerwony = alarm, szary = brak danych, akcent motywu = interakcja i zaznaczenie. Kolorów statusu nie używamy do dekoracji. |
| **Kodowanie redundantne:** kolor + kształt + tekst | ISA-101, FAA (daltonizm) | Każdy status ma kolor, kształt znacznika (■ OK, ▲ UWAGA, ◆ ALARM, ○ BRAK) i krótkie słowo. |
| **Gęstość:** domyślnie tylko informacja potrzebna do zadania | NASA HSI „display density” | Najwyżej ok. 7 elementów w grupie. Szczegóły dopiero po kliknięciu. Zero akapitów na ekranach przeglądowych. |
| **Hierarchia: przegląd → system → szczegół** | ISA-101 (poziomy 1–3), „high-level system summary” | Poziom 1: załoga (CREW). Poziom 2: osoba (PERSON). Poziom 3: narząd albo pomieszczenie (panel szczegółów). Najwyżej 2 kliknięcia do każdej informacji. |
| **Pasek statusu z kluczowymi parametrami zawsze widoczny** | NASA HSI „status bar … viewable at all times” | Górny pasek: sol, czas, łącze z MOTHER, status habitatu, liczba alarmów. Boczny panel: aktywności do wykonania. |
| **Bez liczenia w głowie i bez polegania na pamięci** | NASA HSI „cognitive resources” | Wartość zawsze stoi na tle zakresu normy (pasek analogowy ze wskaźnikiem), a trend jest wykresem, nie liczbą. |
| **Wskaźnik analogowy + trend zamiast samej liczby** | ISA-101 | Pasek zakresu (normal band) z markerem wartości, sparkline z ostatnich soli. |
| **Czytelny tekst** | NASA HSI „text too small” (zarzut weryfikacji) | Najmniejszy tekst na ekranie: 13 px. Etykiety 14–16 px, wartości 22–48 px. |
| **Spójne, znane ikony** | NASA HSI „icons” | Ikony pikselowe przedstawiają rzeczy dosłownie (serce, kropla moczu, kość). Ta sama ikona zawsze oznacza to samo. |
| **Informacja zwrotna na każde wejście** | NASA HSI „feedback” | Hover i focus podświetlają, kliknięcie zaznacza (akcent), a zapis pokazuje komunikat „zapisano”. |
| **Bez szukania w menu** | Orion: „no drop-down menus” | Brak menu rozwijanych w nawigacji. Wszystko jest bezpośrednim przyciskiem lub kafelkiem. |

## 2. Twarde reguły dla tego GUI

1. **Zero scrollowania.** `html, body, #root` mają `height: 100%; overflow: hidden`. Żaden element nie scrolluje, także wewnątrz paneli. Za dużo treści rozwiązujemy przez:
   - stronicowanie (`‹ 1/3 ›`),
   - zakładki,
   - skrót „+N”,
   - mniejsze kafelki.
2. **Obrazek zamiast tekstu.** Każdy narząd, pomiar, pomieszczenie i aktywność ma ikonę pikselową. Teksty to etykiety (1–4 słowa) i liczby. Zdania pojawiają się tylko w panelu szczegółów, najwyżej 2 linie, a dłuższy opis jest pod przyciskiem `WHY?`.
3. **Wszystko klikalne prowadzi dalej:**
   - kafelek osoby otwiera osobę;
   - ikona narządu otwiera osobę z tym narządem;
   - zadanie otwiera ekran, na którym się je wykonuje;
   - alarm otwiera jego źródło.
4. **Rozdzielczości docelowe, które muszą się zmieścić bez scrolla:**
   - 1920×1080
   - 1440×900
   - 1366×768
   - 1280×720
   - telefon poziomo 844×390
   - telefon pionowo 390×844

   Poniżej 900 px szerokości boczny panel zamienia się w wysuwaną szufladę z przyciskiem `TASKS (n)` w górnym pasku.
5. **Styl: pixel-art 2026.** Ciemne, matowe panele (bez gradientów i cieni), cienkie ramki 1 px, narożniki w pikselowe schodki (`clip-path`).
   - Nagłówki i etykiety pisze font pikselowy **Pixelify Sans** (`@fontsource/pixelify-sans`, OFL).
   - Liczby pisze **JetBrains Mono** (tabular, bold).
   - Ikony i ilustracje to pixel-art w naturalnych kolorach (serce czerwone, mocz żółty, kości białe). Status nigdy nie zależy tylko od koloru ikony: zawsze jest też znacznik statusu z kształtem i słowem.
   - Animacje są subtelne: puls serca, migający alarm, obrót modeli. Wyłączają się przy `prefers-reduced-motion`.
6. **Kolory** biorą się tylko ze zmiennych CSS motywu: `--bg --panel --raised --border --fg --dim --accent --accent-bright --accent-dim --ok --caution --alert --info`. Wyjątek to palety sprite'ów pixel-art, które mają własne kolory.
7. **Język:** wszystkie napisy przez i18n (EN domyślnie, PL). Pliki `src/i18n/locales/<lang>/<namespace>.js` rejestrują się same. EN i PL muszą mieć identyczne klucze (test parytetu).
8. **Dane syntetyczne** są oznaczone (`SYNTHETIC` / `SIMULATED` / `DEMO`) małą plakietką, bez akapitu.

## 3. Szkielet aplikacji

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ AWERNASA ▸ CREW   [CREW] [BASE]     ◆2 ▲3   HABITAT ◆   SOL 142  20:24 UTC  ● LIVE ⚙ │  56 px
├──────────────────────────────────────────────────────────────┬─────────────────────┤
│                                                              │ ▣ TO DO (sol 142)   │
│                                                              │  [ikona] Zadanie 1  │
│                    EKRAN (main)                              │  [ikona] Zadanie 2  │
│                    overflow: hidden                          │  ...  ‹ 1/2 ›       │
│                                                              ├─────────────────────┤
│                                                              │ ◆ ALERTS            │
│                                                              │  [ikona] alarm 1    │
│                                                              │  ‹ 1/2 ›            │
└──────────────────────────────────────────────────────────────┴─────────────────────┘
                                                                 clamp(300px, 24vw, 400px)
```

- **Trasa** (`src/App.jsx`): `route = { screen, code?, organ?, room?, test? }`, a `navigate(route)` ją zmienia. Ekrany dostają `{ mother, route, navigate }`.
  - `'crew'`: start, przegląd załogi.
  - `'person'`: `code` = HAB-C1..C4, `organ` = id narządu albo null.
  - `'base'`: habitat, `room` = id pomieszczenia albo null.
  - `'test'`: test kognitywny na cały ekran; `code` i `test` = `'quick'|'full'`. Pasek i panel boczny są wtedy ukryte.
- **Synchronizacja z MOTHER:** App ustawia `mother.selectSubject(route.code)`, gdy jest `route.code`. Sol jest wspólny dla wszystkich ekranów (`mother.period`).
- **Boczny panel** jest zawsze widoczny (poza `'test'`): u góry **TO DO** (aktywności do wykonania), pod nim **ALERTS**.
  - Na ekranie osoby oba filtrują się do tej osoby.
  - Na ekranie załogi pokazują całą załogę: każdy wiersz ma mini-awatar osoby.
- **Ustawienia** (motyw, import motywu, język, CRT) otwierają się jako okno na środku ekranu po kliknięciu ⚙. Nie są osobnym ekranem.
- Nie ma ekranu logowania. Start to przegląd załogi.

## 4. Ekrany

### 4.1 CREW: przegląd załogi (start)
```
┌──────────┬──────────┬──────────┬──────────┐
│ C1 ■ OK  │ C2 ■ OK  │ C3 ▲ CAUT│ C4 ◆ ALRT│  ← nazwisko (pixel font), callsign, rola (1 linia)
│          │          │          │          │
│  model   │  model   │  model   │  model   │  ← model 3D obraca się sam (autoRotate), kolory narządów
│  3D      │  3D      │  3D      │  3D      │
│          │          │          │          │
│ 🧠👁❤🫁🩸 │ ...      │          │          │  ← 10 ikon narządów 2×5, każda z ramką statusu,
│ 🫘🍽🦴🦵☢ │          │          │          │    klik = osoba + ten narząd
│ ♥62 O₂97 │          │          │          │  ← 3 mini-wskaźniki: HR, SpO2, sen (ikona + liczba)
│ ⌖ MODULE M2│        │          │          │  ← gdzie jest (strefa z /api/habitat)
└──────────┴──────────┴──────────┴──────────┘
```
- Cały kafelek jest przyciskiem: przejście do `person`. Status kafelka to ramka i nagłówek w kolorze statusu, tylko gdy nie jest OK (zasada „quiet”).
- Telefon pionowo: siatka 2×2 i mniej elementów (bez mini-wskaźników).

### 4.2 PERSON: zarządzanie osobą
```
┌───────────────────────────────┬───────────────────────────────────────┐
│ ‹ CREW  GRAŻYNA B. «ZNACHOR»  │  [PIXEL-ART NARZĄDU 96px]  KIDNEYS    │
│ ◆ ALERT  sol 142  ⌖ MODULE M2 │  ▲ CAUTION  „Stone risk: urine 1.73 L”│
│                               │  ── wskaźniki (pasek normy + marker) ─│
│   model 3D (nie obraca się),  │  ▮▮▮▮▮▯▯ Urine volume 1.73 L/d        │
│   segmenty klikalne,          │  ── trend 14 soli (wykres) ───────────│
│   zaznaczony segment = akcent │  ── CO ZROBIĆ: przyciski-akcje ───────│
│                               │  [💧 LOG WATER] [🧪 URINE SAMPLE] ...  │
│ [🧠][👁][❤][🫁][🩸][🫘][🍽][🦴][🦵][☢]  ← pasek narządów (zawsze widoczny) │
└───────────────────────────────┴───────────────────────────────────────┘
```
- Lewa połowa to model bez obrotu, z kolorami narządów. Kliknięcie segmentu wybiera narząd. Segment może mieć kilka narządów (głowa = mózg + oczy, klatka = serce + płuca), wtedy wybiera pierwszy, a pozostałe pokazuje jako zakładki w panelu.
- Prawa połowa to panel narządu (`src/organs/`):
  - nagłówek z dużym pixel-artem (narząd w naturalnych kolorach, np. mocz jako żółte kropelki) i statusem;
  - wskaźniki: pasek normy z markerem wartości;
  - wykres trendu z ostatnich soli;
  - **akcje** jako duże przyciski z ikonami.
- Akcje według narządu (pomiar zapisuje się do `src/shared/measurements.js`):
  - **mózg:** testy kognitywne (PVT szybki, pełna bateria: PVT, Go/No-Go, DSST), nastrój 1–5 (ikony buziek), sen (godziny), kwestionariusze psychologiczne (szkielet, TODO), rozmowa z psychologiem (PPC);
  - **oczy:** test ostrości, zdjęcie dna oka, ciśnienie w oku (instrukcja pomiaru, TODO pomiar);
  - **serce:** ciśnienie krwi, tętno;
  - **płuca:** SpO2;
  - **krew:** pobranie krwi (harmonogram), glukoza;
  - **nerki i mocz:** woda wypita (kubki), próbka moczu (paski), objętość moczu;
  - **układ pokarmowy:** posiłek / kalorie, glukoza, skala Bristol (ikony);
  - **mięśnie i kości:** trening (ARED / bieżnia, minuty), siła chwytu;
  - **kończyny:** stan opasek, kontrola kończyny przy alarmie;
  - **promieniowanie:** dawka skumulowana jako pasek do limitu kariery, schronienie przy burzy słonecznej;
  - **raport dla flight surgeona:** zawsze dostępny w nagłówku osoby.

### 4.3 BASE: habitat
- Mapa SVG (istniejąca) w górnej części, a pod nią szczegóły wybranego pomieszczenia jako siatka kafelków-wskaźników. Każdy kafelek ma pixel-ikonę kategorii, liczbę, pasek normy i status; za dużo kafelków dzieli się na strony.
- Obok szczegółów: EXTERIOR (kafelki) i EVENTS (lista ze stronicowaniem).

### 4.4 TEST: test kognitywny
Pełny ekran bez paska, bez panelu bocznego i bez nawigacji, jak dotąd (`src/cognitive`). Po zakończeniu wraca do `person` z narządem `brain`.

## 5. Kontrakty modułów

| Moduł | Eksport |
|---|---|
| `src/pixel/` | `<PixelIcon name size title? status? animate? />` (SVG z `shape-rendering="crispEdges"`), `PIXEL_ICONS` (lista nazw), `ORGAN_ICON` (narząd → nazwa ikony), `<PixelAvatar code size />` |
| `src/body/BodyModel.jsx` | `<BodyModel segmentStatus autoRotate interactive selectedSegments onSegmentClick onSegmentHover className />`. Każda instancja ma własny klon sceny i materiałów, więc 4 modele naraz się nie gryzą. |
| `src/tasks/` | `useTasks({ mother, code })` → `{ items, toggleDone }`, `<TaskPanel>`, `<AlertPanel>` |
| `src/organs/` | `ORGANS` (katalog: id, ikona, segmenty, akcje), `<OrganPanel>`, `useOrganTrend(code, organ)` |
| `src/shared/measurements.js` | `recordMeasurement`, `listMeasurements`, `latestMeasurement`, `subscribeMeasurements` |
| `src/ui/` | prymitywy kokpitu: `StatusMark`, `RangeBar` (pasek normy z markerem), `Sparkline`, `Pager` (stronicowanie bez scrolla), `PixelFrame` (panel), `IconButton` |

**Nazwy ikon** (stałe, używane przez wszystkie ekrany):
- **narządy:** `brain eye heart lungs blood kidneys urine stomach bone muscle arm leg limb radiation`
- **pomiary:** `bp hr spo2 thermometer glucose water_cup sleep mood_1 mood_2 mood_3 mood_4 mood_5 scale syringe test_tube dipstick pill dumbbell treadmill grip eye_chart camera`
- **testy:** `pvt gonogo dsst questionnaire chat`
- **habitat:** `pressure o2 co2 humidity dust radiation_sensor airlock water_tank light noise structure power reactor plant thermometer_room wind sun`
- **ogólne:** `satellite (raport na Ziemię) alert caution ok no_data check cross clock calendar gear crew base back next prev`

## 6. Odbiór (każdy ekran)
- Skrypt Playwright sprawdza 6 rozdzielczości z §2.4. Wymagania:
  - `document.documentElement.scrollHeight <= innerHeight` i `scrollWidth <= innerWidth`;
  - żaden element nie ma `scrollHeight > clientHeight + 1` przy `overflow` innym niż `hidden`/`clip`;
  - brak tekstu mniejszego niż 13 px (wyjątek: plakietki `SYNTHETIC`/`SIMULATED`, 11 px).
- Zrzuty ekranu oglądamy ręcznie.
- `npx vitest run` musi być zielony, a `npm run build` musi przechodzić.

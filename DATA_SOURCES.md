# Źródła danych NASA i wiedza o badaniach astronautów

Research z 2026-11-14 (4 równoległych agentów, każdy link sprawdzony curl-em). Elementy oznaczone **⚠ NIEZWERYFIKOWANE** traktujemy ostrożnie.
Pobrane pliki CSV leżą w [`data/nasa/`](data/nasa/).

## TL;DR — co z tego wynika dla nas

1. **Prawdziwe dane astronautów, które da się pobrać, to głównie badania krwi.** Inspiration4 (4 osoby): morfologia + panel metaboliczny z **glukozą**, CRP, cytokiny. Pomiary przed lotem i po locie, w locie brak.
2. **Tętna, ciśnienia, temperatury, snu ani nastroju per astronauta NIE ma publicznie.** Takie dane istnieją (ISS Standard Measures, HERA, CSA Bio-Monitor, wearables z misji komercyjnych), ale wydaje się je tylko na wniosek z IRB. **Generujemy te serie syntetycznie**, kalibrując na opublikowanych średnich, i oznaczamy w UI jako symulowane.
3. **Promieniowanie ma świetne, żywe dane:** Curiosity RAD (Mars, REST bez klucza), ISS RadLab (OSDR API), NOAA SWPC (protony GOES na żywo → alert burzy słonecznej).
4. **Progi do silnika reguł mamy z oficjalnych norm NASA** (NASA-STD-3001): limity promieniowania, CO2, VO2max, gęstości kości, kalorii i snu (tabela w sekcji 4).
5. **Harmonogram badań na ISS jest dobrze opisany** i daje gotowy rytm przypomnień w aplikacji: codziennie / co tydzień / co 2 tygodnie / co ~30 dni (sekcja 1).

---

## 0. Oficjalne zasoby wyzwania (zakładka Resources)

Sprawdzone 2026-11-14 pod `?tab=resources`. Strona ostatnio aktualizowana 2026-11-13; na niej tylko te 5 linków, czyli to samo co w [CHALLENGE.md](CHALLENGE.md). **Warto je cytować w aplikacji i w pitchu, bo jury ich szuka.**

| Zasób | Co z niego bierzemy | Gdzie w repo |
|---|---|---|
| [NASA HRP: 5 Hazards](https://www.nasa.gov/hrp/hazards/) | 5 zagrożeń, utrata kości 1–1,5%/mies., opóźnienie łączności z Marsem do 20 min | sekcje 4–5, `config/sources.json` (`hrp_hazard_gravity`) |
| [NASA HRP: Risks](https://www.nasa.gov/hrp/risks/) | 17 ryzyk językiem przystępnym: utrata kondycji 10–12%, ćwiczenia 1,5 h/dzień, ~70% załóg z obrzękiem tarczy nerwu wzrokowego, wzrost +3% | sekcje 4–5, `hrp_risk_fitness` |
| [NASA HRP: Ongoing Research](https://www.nasa.gov/hrp/ongoing-hrp-research/) | Katalog badań: Artemis II (ARCHeR, Immune Biomarkers, Standard Measures), CIPHER, Standard Measures, Tempus Pro (urządzenie telemedyczne) | sekcje 1, 5 |
| [CSA: Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) | **Neutrony to ~30% całego promieniowania na ISS** i są szczególnie szkodliwe biologicznie. Nowy przyrząd CANS mierzy je w sposób ciągły i autonomiczny. Wcześniejsze kanadyjskie detektory: [MOSFET](https://www.asc-csa.gc.ca/eng/astronauts/space-medicine/mosfet.asp), [EVARM](https://www.asc-csa.gc.ca/eng/iss/evarm.asp), [Radi-N2](https://www.asc-csa.gc.ca/eng/sciences/radi-n2.asp) (bubble detectors) | `csa_radiation` |
| [CSA: Why do we conduct science experiments in space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp) | Ryzyka misji na Księżyc i Marsa w 5 punktach: dłużej w nieważkości, więcej promieniowania, izolacja, opóźnienia łączności, mniejsza możliwość polegania na Ziemi (jedzenie, materiały, **pomoc medyczna**). Zmiany w ciele w kosmosie przypominają przyspieszone starzenie i siedzący tryb życia. Argument „przydatne też na Ziemi”: seniorzy, osteoporoza, choroby serca, cukrzyca typu 2 | `csa_why_science` |

---

## 1. Jakie badania robi się astronautom, jak często i co dają

Oznaczenia: **L-x** = dni przed startem, **FD x** = dzień lotu, **R-x** = dni przed powrotem, **R+x** = dni po powrocie.
Oficjalne dokumenty z pełnym harmonogramem (ISS MORD, MRID) **nie są publiczne**, więc poniższe pochodzi z publikacji i prezentacji NASA.

### Rutyna w locie (ISS, misje ~6 mies.)

| Badanie | Co daje | Sprzęt | Jak często | Astronauta sam? | Źródło |
|---|---|---|---|---|---|
| **Private Medical Conference (PMC)** | Rozmowa z flight surgeonem: objawy, zdarzenia medyczne, przebieg ćwiczeń | Prywatne łącze audio/wideo | **Co tydzień**, częściej przy starcie, lądowaniu i EVA | Częściowo (samoocena) → **wzór dla naszego cotygodniowego raportu** | [BMJ Open 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13289012/) |
| **Private Psychological Conference (PPC)** | 15–20 min z psychologiem. Stałe tematy: sen, zmęczenie, obciążenie pracą, morale, relacje w załodze i z Ziemią, nastrój, rodzina, jedzenie i warunki, przygotowanie do EVA | Wideo | **Co 2 tygodnie** | Tak (ankieta) → **gotowy szablon naszego psych check-inu** | [NTRS 20170003866](https://ntrs.nasa.gov/citations/20170003866), [NTRS 20230010798](https://ntrs.nasa.gov/citations/20230010798) |
| **WinSCAT** (test poznawczy) | Baseline poznawczy na wypadek urazu neurologicznego | Laptop | **Co 30 dni**; przed lotem L-90…L-7, po locie R+30 | Tak | NTRS 20170003866 |
| **NASA Cognition** (10 testów: pamięć, uwaga, czas reakcji/PVT, orientacja przestrzenna, emocje, ryzyko) | Wydolność poznawcza | Laptop/tablet | ~FD30, ~R-30 (+ L-90, R+10, R+30) | Tak → **krótki test czasu reakcji w aplikacji** | [Basner/Smith 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11614644/) |
| **Periodic Fitness Evaluation (PFE)** | Submaksymalny test na rowerze → szacunek VO2max, HR, EKG, ciśnienie | CEVIS + monitor BP/EKG | **FD15, potem co ~30 dni** | Tak (dane ogląda Ziemia) | [Petersen 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4971634/) |
| **Ćwiczenia (przeciwdziałanie)** | Ochrona kości, mięśni, wydolności. Śledzi się czas, HR, obciążenia | ARED (siłowe), bieżnia T2, rower CEVIS | **~1,5–2 h/dzień, 6 dni/tydz.** (zaplanowane 2,5 h/dzień, ~600 min/tydz.) | Tak → **log ćwiczeń** | [Scott 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9898566/) |
| **Masa ciała** | Bilans energetyczny. Typowo −2…5%, głównie w pierwszych 30 dniach | SLAMMD (F=ma), rosyjski BMMD | ⚠ częstotliwość niepotwierdzona | Tak | [Zwart 2014](https://pubmed.ncbi.nlm.nih.gov/25197887/), [NTRS 20140013313](https://ntrs.nasa.gov/citations/20140013313) |
| **Krew i mocz** (morfologia, panel metaboliczny, markery kości, witaminy, żelazo) | Odżywienie, kości, ryzyko kamieni nerkowych, SANS | Zestaw do pobierania, wirówka, zamrażarka MELFI; analiza na Ziemi. Na pokładzie analizator PCBA i paski moczowe (doraźnie) | L-180, L-45, R+0; w locie FD30 i R-30 (Standard Measures) | Pobranie tak, analiza nie | [NTRS 20060049121](https://ntrs.nasa.gov/citations/20060049121) |
| **Oczy / SANS** (OCT, USG gałki ocznej, ciśnienie w oku, ostrość wzroku, od 2025 pole widzenia) | Obrzęk tarczy nerwu wzrokowego, spłaszczenie gałki | OCT Heidelberg, USG, tonometr, tablice | **FD30, FD90, R-30** + przed i po locie (MRI) | Wykonuje załoga z instrukcją z Ziemi. Ostrość wzroku nadaje się do samobadania | [Eye 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13462731/) |
| **Słuch (OOHA)** | Przesunięcie progu słyszenia od hałasu | Oprogramowanie EarQ / KUDUwave, słuchawki | do FD14, potem **co 60 dni** (źródło z 2012) | Tak | [NTRS 20120010555](https://ntrs.nasa.gov/citations/20120010555) |
| **Dozymetria** | Dawka pochłonięta i równoważna | Pasywny dozymetr osobisty (CPD), noszony cały czas; monitory w modułach | Ciągle; odczyt na Ziemi | Noszenie tak, odczytu na bieżąco brak | [Katalog CHeCS, NTRS 20110022379](https://ntrs.nasa.gov/citations/20110022379) |
| **Środowisko** (CO2, O2, hałas, mikroby w powietrzu i wodzie) | CO2: każdy +1 mmHg ≈ 2× większa szansa bólu głowy | CDM, CSA-O2/CP, dozymetr akustyczny, zestawy wody | Ciągle / okresowo | Tak → **łączymy objawy (ból głowy) z CO2** | [Law 2014](https://pubmed.ncbi.nlm.nih.gov/24806559/) |

### Badania naukowe (uzupełniające)

- **Spaceflight Standard Measures** (ISS od 2018) obejmują: aktygrafię z dziennikiem snu (ciągle w locie), ankietę snu i zespołu (co miesiąc), test Cognition, profil komórkowy (hormony stresu, reaktywacja wirusów), biochemię, mikrobiom i grubość ściany tętnicy szyjnej (na Ziemi). Terminy: L-180, L-90, **FD30, R-30**, R+30. Źródła: [NTRS 20180002943](https://ntrs.nasa.gov/citations/20180002943), [NTRS 20230014025](https://ntrs.nasa.gov/citations/20230014025).
- **CIPHER** obejmuje misje 2-miesięczne, 6-miesięczne i roczne, w tym koszulkę mierzącą HR i oddech przez 2 doby. Źródła: [nasa.gov/reference/cipher](https://www.nasa.gov/reference/cipher/), [NTRS 20250000919](https://ntrs.nasa.gov/citations/20250000919) (testy wydolności po lądowaniu: R+0, R+1, R+4, R+8).
- **Fluid Shifts** bada przesunięcie płynów: USG żyły szyjnej i przepływ mózgowy, ~FD45 i FD150. Źródło: [Lee 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8461809/).
- **Gęstość kości (DXA/QCT)** jest obowiązkowa przed i po locie: przed startem w ciągu roku, po powrocie w ciągu miesiąca. Źródło: [Arch Osteoporos 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12799719/).
- **NASA Twins Study:** masa ciała, telomery, tętnice, oczy, ekspresja genów, mikrobiom, kognicja. Źródło: [Science 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC7580864/).
- **CSA Bio-Monitor (Astroskin)**, czyli koszulka z opaską na głowę: EKG, ciśnienie, oddech, temperatura skóry, SpO2, aktywność. Noszona w czasie snu i ćwiczeń. **To najlepszy wzór dla wejścia z wearables.** Źródło: [CSA Astroskin](https://www.asc-csa.gc.ca/eng/sciences/astroskin.asp).
- **Artemis II** (~10 dni):
  - ARCHeR: opaski aktygraficzne, sen i aktywność **na żywo dla załogi i Mission Control**.
  - Immune Biomarkers: ślina w locie na bibułę, bez lodówki.
  - AVATAR: organ-chips z komórek załogi.
  - Źródła: [NASA](https://www.nasa.gov/humans-in-space/artemis-ii-crew-to-advance-human-spaceflight-research/), [CSA](https://www.asc-csa.gc.ca/eng/missions/artemis-ii/scientific-research-during-mission.asp).
- **Poza misjami:** coroczne badanie w JSC Flight Medicine Clinic (podstawa certyfikacji do lotu); emerytowani astronauci dostają zaproszenie na badanie raz w roku.

### Proponowany rytm przypomnień w aplikacji (nasz wniosek z powyższego)

| Rytm | Co |
|---|---|
| Codziennie | Sen (godziny i jakość), log ćwiczeń, objawy (ból głowy ↔ CO2), nastrój i zmęczenie, opcjonalnie BP/HR/temperatura |
| Co tydzień | Raport w stylu PMC wysyłany do flight surgeona (asynchronicznie, z opóźnieniem łączności) |
| Co 2 tygodnie | Psych check-in według tematów PPC |
| Co ~30 dni | Przypomnienie o teście wydolności, test reakcji / Cognition, ankieta snu i zespołu, masa ciała |
| FD30, FD90, R-30 | Przypomnienie o badaniu oczu (SANS) |
| Co 60 dni | Test słuchu |

---

## 2. Dane o ludziach do pobrania

### ✅ Publiczne, gotowe do użycia (pliki w `data/nasa/`)

| Plik | Źródło | Zawartość | Jak użyjemy |
|---|---|---|---|
| `osd575_inspiration4_cmp_long.csv` (+ `_wide`) | [OSDR OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Panel metaboliczny (CMP), 4 osoby (C001–C004), pomiary L-92, L-44, L-3, R+1, R+45, R+82, R+194. 19 analitów: **glukoza mg/dL**, elektrolity (Na, K, Cl, CO2, Ca), nerki (BUN, kreatynina, eGFR), wątroba (ALT, AST, ALP, bilirubina), białko, albumina. **Z normami laboratoryjnymi (RANGE_MIN/MAX)** | Prawdziwe wartości glukozy na start, zakładka „wyniki laboratoryjne”, logika w normie / poza normą |
| `osd569_inspiration4_cbc_long.csv` (+ `_wide`) | [OSDR OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | Morfologia (CBC): 23 parametry (WBC, RBC, hemoglobina, hematokryt, płytki, rozmaz) z normami, te same osoby i terminy | Trendy hemoglobiny i hematokrytu po locie (anemia kosmiczna) |
| `osd575_inspiration4_cardio_panel_wide.csv` | OSD-575 | 9 markerów sercowo-naczyniowych i zapalnych: **CRP**, fibrynogen, haptoglobina, PF4 i inne | „Indeks zapalny” jako wyzwalacz rekomendacji |
| `osd575_inspiration4_immune_cytokines_wide.csv` | OSD-575 | 71 cytokin (IL-6, TNF-α, IFN-γ, IL-10…) | Opcjonalnie: odporność |
| `mendeley_bp_in_spaceflight.csv` (+ `_dictionary`) | [Mendeley Data, DOI 10.17632/pz6nt4cpxs.1](https://data.mendeley.com/datasets/pz6nt4cpxs) (nie NASA, ale oparte na danych LSDA; ⚠ licencja niesprawdzona) | 75 badań: **ciśnienie skurczowe, rozkurczowe i średnie (MAP) przed, w trakcie i po locie** (średnia ± SD), typ misji (ISS, Shuttle, Soyuz, bed rest), BMI, wiek, n | Kalibracja syntetycznych serii BP i alerty „odchylenie od baseline'u” |

**API OSDR (publiczne, bez klucza):**
- Wyszukiwanie: `https://osdr.nasa.gov/osdr/data/search?term=Inspiration4&size=50`
- Lista plików studium: `https://osdr.nasa.gov/osdr/data/osd/files/<n>`
- Metadane: `https://osdr.nasa.gov/osdr/data/osd/meta/<n>`
- Pobieranie pliku: `https://osdr.nasa.gov/geode-py/ws/studies/OSD-<n>/download?source=datamanager&file=<plik>`

**Inne publiczne studia z ludźmi w OSDR (tylko dane molekularne, bez parametrów życiowych; do slajdów „nauka”):**
- OSD-570…574, 630, 656, 687 (Inspiration4 / SOMA omics)
- OSD-174, 530, 542 (JAXA)
- OSD-53 (krew astronautów)
- OSD-316, 359 (kosmonauci)
- OSD-280 (mikrobiom śliny)
- OSD-140 (Mars-520)
- Badania leżenia w łóżku (bed rest): OSD-195, 198, 51, 370
- Portal SOMA: [soma.weill.cornell.edu](https://soma.weill.cornell.edu)

### 🔒 Istnieją, ale dostęp tylko na wniosek (cytujemy jako „docelowe źródło”)

- **NASA Life Sciences Data Archive (LSDA) + LSAH**: [nlsp.nasa.gov/explore/lsdahome](https://nlsp.nasa.gov/explore/lsdahome).
  - Nieudokumentowane, ale publiczne API metadanych: `https://nlsp.nasa.gov/api/v1/data/experiments?limit=5000` (2676 eksperymentów, z czego 306 w pełni publicznych).
  - Historyczne tabele, m.in. HR i BP z Apollo i Shuttle, glukoza i cholesterol z LSAH.
  - ⚠ Pobieranie plików przez API nie zadziałało, prawdopodobnie trzeba to robić ręcznie przez stronę.
  - Dane ISS Standard Measures, HERA i NEK (mood PANAS, sen, kognicja) są dostępne tylko przez Data Request.
- **TRISH EXPAND** (Baylor): wearables z Inspiration4, Ax-1…4, Polaris Dawn, Fram2. Obecnie **nie przyjmuje wniosków**. Źródło: [bcm.edu/…/expand](https://www.bcm.edu/academic-centers/space-medicine/expand).
- **ESA HREDA**: [hreda.esac.esa.int](https://hreda.esac.esa.int). Metadane publiczne, dane na wniosek.
- **CSA Bio-Monitor**: brak otwartego zbioru danych.
- **Analogi** ([CHAPEA](https://www.nasa.gov/humans-in-space/chapea/), HERA): brak publicznych danych. Lista mierzonych parametrów: [NTRS 20220014080](https://ntrs.nasa.gov/citations/20220014080).

---

## 3. Promieniowanie i środowisko (dane na żywo i historyczne)

### Źródła

| Źródło | Dostęp | Co daje | Jak użyjemy |
|---|---|---|---|
| **Curiosity RAD na CDAWeb** (dataset `MSL_RAD_OBS-L2`) | REST, bez klucza. `https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets/MSL_RAD_OBS-L2/data/<start>,<end>/DOSIMETRY_TOTAL_f?format=text` z nagłówkiem `Accept: application/json` | Dawka na powierzchni Marsa w µGy/dzień, co ~17 min, 2011 → teraz (z okresem przelotu) | **Środowisko „Mars”**, prawdziwa seria dawki |
| Curiosity RAD w archiwum PDS PPI | [pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/) | Archiwum PDS3 ASCII | Zapas / dane historyczne |
| **ISS RadLab (OSDR)** | API bez klucza: `https://visualization.osdr.nasa.gov/radlab/api/?spacecraft=ISS&instrument=DosTel&...&format=csv`, dokumentacja: [radlab/gui/data-api](https://visualization.osdr.nasa.gov/radlab/gui/data-api) | Dawka per moduł ISS, lat/lon/wysokość (widać skoki w Anomalii Południowoatlantyckiej). ⚠ jednostka prawdopodobnie µGy/h | **Środowisko „ISS”** i mapa dawki |
| **OSDR Environmental Data App** | [visualization.osdr.nasa.gov/eda/](https://visualization.osdr.nasa.gov/eda/) (JSON wbudowany w strony, np. `dashboard_RR-1`) | Historyczne serie z ISS co 5 min: **CO2 (ppm), temperatura, wilgotność**, dawka GCR/SAA. Przykład z 2014: CO2 mediana ~3200 ppm, 22,6 °C, 43% RH | **Realistyczne dane kabiny**, bo publicznego CO2 na żywo nie ma |
| **NOAA SWPC** | JSON bez klucza: `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json`, `.../products/noaa-scales.json`, `.../products/alerts.json` | Strumień protonów GOES co 5 min, skale burz R/S/G | **Alert burzy słonecznej na żywo** |
| **NASA DONKI** (api.nasa.gov) | Klucz (DEMO_KEY realnie ~10 zapytań/h, darmowy klucz 1000/h): `https://api.nasa.gov/DONKI/notifications?type=SEP&...` | Zdarzenia rozbłysk → CME → SEP z opisami | Historia zdarzenia w alercie. Cache'ować, bo limity |
| **PREDICCS** (UNH) | [prediccs.sr.unh.edu](https://prediccs.sr.unh.edu/) (pliki tekstowe) | Modelowana dawka niemal na żywo dla Ziemi, Księżyca i Marsa | Panel „Księżyc/Mars” |
| LRO CRaTER (PDS PPI) | [pds-ppi…/LRO-L-CRAT-3_4-DDR-PROCESSED-V1.0/](https://pds-ppi.igpp.ucla.edu/data/LRO-L-CRAT-3_4-DDR-PROCESSED-V1.0/) | Zdarzenia cząstek na orbicie Księżyca, dawkę trzeba liczyć samemu | Raczej pominąć |
| TLE ISS | `https://tle.ivanstanojevic.me/api/tle/25544` (bez klucza) | Orbita ISS; satellite.js pozwoli policzyć, kiedy ISS jest w SAA | Bajer wizualny |
| MSL REMS (pogoda na Marsie) | [pds-atmospheres.nmsu.edu/PDS/data/mslrem_1001/](https://pds-atmospheres.nmsu.edu/PDS/data/mslrem_1001/) | Ciśnienie, temperatura, UV na Marsie | Kontekst środowiska „Mars” |

**Progi burzy słonecznej (NOAA S-scale, protony ≥10 MeV):**
- S1 ≥ 10 pfu
- S3 ≥ 1 000 pfu: „unikać EVA”
- S4 ≥ 10 000 pfu: „nieuniknione zagrożenie podczas EVA”
- S5 ≥ 100 000 pfu

Logika: od S1 ostrzeżenie, od S3 zakaz EVA i schronienie. Poza ISS (Księżyc, przelot, Mars) podnosimy wagę alertu, bo nie ma osłony magnetosfery. Źródło: [swpc.noaa.gov/noaa-scales-explanation](https://www.swpc.noaa.gov/noaa-scales-explanation).

### Dawka wg środowiska (do przełącznika środowisk)

| Środowisko | Dawka równoważna | Źródło |
|---|---|---|
| Ziemia (Houston) | 0,001 mSv/dzień | [Artemis I, Nature 2024, Tab. 2](https://www.osti.gov/pages/servlets/purl/2447574) |
| ISS | **0,5–0,68 mSv/dzień** (0,68 wg Artemis I Tab. 2; ok. 0,5 wg LSAH), ~40–90 mSv na 6 mies. | Artemis I; [LSAH 2023](https://www.nasa.gov/wp-content/uploads/2023/10/lsah-newsletter-2023-vol28-issue2.pdf) |
| Orion, cislunar (Artemis I) | 0,96–1,24 mSv/dzień (GCR); 26,7–35,4 mSv za całą misję | Artemis I |
| Niska orbita Księżyca | 1,55 mSv/dzień | Artemis I, Tab. 2 |
| Powierzchnia Księżyca | **0,81 mSv/dzień** (Artemis I, Tab. 2); ~0,5 wg projekcji LSAH. Źródła się różnią, więc podajemy zakres | Artemis I; LSAH |
| Przelot na Marsa | **~1,6–1,8 mSv/dzień**; podróż w obie strony ~660 mSv | Artemis I Tab. 2; [JPL](https://www.jpl.nasa.gov/news/data-from-nasa-rovers-voyage-to-mars-aids-planning/) |
| Powierzchnia Marsa | **~0,65–0,67 mSv/dzień** | [NASA Curiosity](https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/); Artemis I |

**Opóźnienie łączności w jedną stronę:**
- Księżyc: ~1,3 s (telemetria Oriona 5,9–8,6 s)
- Mars: ~3 min (najbliżej) do ~22 min (najdalej)

Źródła: [NASA fact sheet](https://www.nasa.gov/wp-content/uploads/2024/01/mars-communications-disruption-and-delay.pdf), [NTRS 20250003885](https://ntrs.nasa.gov/citations/20250003885).

---

## 4. Normy i progi NASA (do konfiguracji silnika reguł)

Główne dokumenty:
- [NASA-STD-3001 Vol 1 Rev C (Crew Health)](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)
- [NASA-STD-3001 Vol 2 Rev F (środowisko)](https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf)
- [Technical Briefs, krótkie streszczenia per temat](https://www.nasa.gov/ochmo/hsa-standards/ochmo-technical-briefs/), m.in.:
  - [CO2](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)
  - [promieniowanie](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf)
  - [kości](https://www.nasa.gov/wp-content/uploads/2026/02/ochmo-mtb-013-bone-loss.pdf)
  - [SANS](https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf)
  - [sen](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf)
  - [rytm dobowy](https://www.nasa.gov/wp-content/uploads/2026/03/ochmo-mtb-009-circadian-desynchrony.pdf)
  - [żywienie](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-013-food-and-nutrition.pdf)
  - [nietolerancja ortostatyczna](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-019-orthostatic-intolerance.pdf)
  - [choroba lokomocyjna](https://www.nasa.gov/wp-content/uploads/2025/09/ochmo-mtb-004-space-adaptation-sickness-sas.pdf)
  - [zakrzepica](https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf)
  - [zdrowie behawioralne](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf)
  - [hałas](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-035-acoustics.pdf)

### Limity (normy NASA)

| Wskaźnik | Limit | Źródło |
|---|---|---|
| Promieniowanie: limit kariery | < **600 mSv** (efektywna) | Vol 1 [4030] |
| Promieniowanie: jedno zdarzenie SPE | < 250 mSv | Vol 1 [4031] |
| Promieniowanie: limity 30-dniowe dla narządów | Szpik 250 mGy-Eq · układ krążenia 250 · soczewka 1000 · skóra 1500 · OUN 500 mGy | Vol 1 Tab. 4.8-1 |
| **CO2** | średnia 1 h ≤ **3 mmHg**. Średnia 7-dniowa < 2,5 mmHg utrzymuje ryzyko bólu głowy < 1%. Bóle głowy przy 2,8–4,5; zmęczenie i nudności > 4,5. Na ISS 1–9 mmHg | Vol 2 [6004]; TB-004 |
| O2 (ciśnienie wdychanego, PIO2) | cel 145–155 mmHg; dolna granica łagodnej hipoksji 127 (średnia 1 h); minimum 122 | Vol 2 [6003] |
| Temperatura i wilgotność kabiny | strefa komfortu **20–25 °C, 30–60% RH**; wilgotność zawsze ≥ 25% | Vol 2 [6012–6013] |
| Hałas | 24-godzinny ekwiwalent ≈ 70 dBA; NC-40 w kwaterach snu | Vol 2 [6115], [6079] |
| Energia | średnio **3035 kcal/dzień** albo indywidualnie z równań EER; **+200 kcal na godzinę EVA** | Vol 2 [7003–7004] |
| VO2max | ≥ **80% wartości sprzed lotu**; minimum 32,9 ml/kg/min (EVA w mikrograwitacji) i 36,5 (EVA na powierzchni) | Vol 1 [4001–4003] |
| Siła mięśni | ≥ **80%** wartości sprzed lotu | Vol 1 [4024] |
| Gęstość kości (BMD) | ≥ **95%** wartości sprzed lotu (biodro, kręgosłup), ≥ 90% (szyjka kości udowej) | Vol 1 [4027] |
| Sen | planowany okres snu **8,5 h** | Vol 1 [6001] |

### Typowe zmiany w locie (czego się spodziewać, czyli „normalne” odchylenie)

| Wskaźnik | Typowa zmiana | Źródło |
|---|---|---|
| Kości | −1…1,5% BMD/miesiąc bez przeciwdziałania; z ćwiczeniami na ARED biodro −0,64%/mies., kręgosłup −0,47%/mies. | [HRP gravity](https://www.nasa.gov/hrp/hazard-gravity-fields/); [Bone ER](https://humanresearchroadmap.nasa.gov/evidence/reports/Bone%20Fracture%20Evidence%20Report_07-18-2024.pdf) |
| Wydolność (VO2) | −17% do FD14, potem częściowy powrót; po locie −10…30% | [Aerobic/muscle ER](https://humanresearchroadmap.nasa.gov/evidence/reports/Evidence%20report%20aerobic%20and%20muscle_FINAL%204-3-2024.pdf) |
| Mięśnie nóg | objętość ~−20%; siła kolan i kostek −13…14% | jw. |
| Objętość osocza | −4…17% (ok. −15% w < 2 dni) | [Cardio ER](https://humanresearchroadmap.nasa.gov/evidence/reports/Cardio%20Risk%20EB%202022%20FINAL_4-3-2023.pdf) |
| Ciśnienie (doba) | **−8…10 mmHg** w locie; rzut serca +35–41%; **tętno bez zmian** | [Norsk 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4324697/) (nie NASA) |
| Masa ciała | 57% załóg traci 5–10%, 3% > 10% | [Nutrition ER](https://humanresearchroadmap.nasa.gov/evidence/other/Nutrition%20ER_human_adaptation_2020_final.pdf) |
| Sen | **~6 h** średnio (wobec planowanych 8,5 h) | TB-041; [Sleep ER](https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf) |
| SANS | ~70% ma wczesny obrzęk tarczy nerwu wzrokowego; ~15% klinicznie istotny | [SANS ER](https://humanresearchroadmap.nasa.gov/evidence/reports/SANS%20EB%202022%20FINAL_8-15-22.pdf) |
| Choroba lokomocyjna | 70–90% załogi w pierwszych dniach; ból pleców 52% | MTB-004 |
| Wzrost | do +3% (rozciągnięcie kręgosłupa) | [HRP risks](https://www.nasa.gov/hrp/risks/) |

---

## 5. Ryzyka NASA HRP: strony i raporty (Evidence Reports)

- Przegląd: [5 zagrożeń](https://www.nasa.gov/hrp/hazards/) · [17 ryzyk w przystępnej formie](https://www.nasa.gov/hrp/risks/) · [trwające badania](https://www.nasa.gov/hrp/ongoing-hrp-research/) (Artemis II, CIPHER, Standard Measures, Tempus Pro, czyli urządzenie telemedyczne)
- Human Research Roadmap: [humanresearchroadmap.nasa.gov](https://humanresearchroadmap.nasa.gov). Raporty pod `https://humanresearchroadmap.nasa.gov/evidence/…`:

| Ryzyko | Strona | Raport |
|---|---|---|
| Układ krążenia | [?i=179](https://humanresearchroadmap.nasa.gov/Risks/?i=179) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Cardio%20Risk%20EB%202022%20FINAL_4-3-2023.pdf) |
| Złamania kości | [?i=77](https://humanresearchroadmap.nasa.gov/Risks/?i=77) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Bone%20Fracture%20Evidence%20Report_07-18-2024.pdf) |
| Wydolność i mięśnie | [?i=180](https://humanresearchroadmap.nasa.gov/Risks/?i=180) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Evidence%20report%20aerobic%20and%20muscle_FINAL%204-3-2024.pdf) |
| SANS (oczy) | [?i=105](https://humanresearchroadmap.nasa.gov/Risks/?i=105) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/SANS%20EB%202022%20FINAL_8-15-22.pdf) |
| Zdrowie behawioralne i psychiczne | [?i=99](https://humanresearchroadmap.nasa.gov/Risks/?i=99) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-BMED-HFBP-20250210.pdf) |
| Sen, rytm dobowy, obciążenie | [?i=100](https://humanresearchroadmap.nasa.gov/Risks/?i=100) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Sleep.pdf) |
| Zespół | [?i=101](https://humanresearchroadmap.nasa.gov/Risks/?i=101) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Team%202022%20-Evidence%20Report%20FINAL_5-9-2024.pdf) |
| Odporność | [?i=85](https://humanresearchroadmap.nasa.gov/Risks/?i=85) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/IMMUNE%20EB%20Update%202021%20v02%20FINAL_6-15-22.pdf) |
| Kamienie nerkowe | [?i=81](https://humanresearchroadmap.nasa.gov/Risks/?i=81) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/other/2024%20Renal%20Evidence%20Report_Final.pdf) |
| Żywienie i jedzenie | [?i=176](https://humanresearchroadmap.nasa.gov/Risks/?i=176) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/other/Food%20HRP-Evidence%20Report%20FINAL_4-15-24.pdf) |
| Promieniowanie (nowotwory, raport z 2026) | [?i=96](https://humanresearchroadmap.nasa.gov/Risks/?i=96) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/HRP-ER-CANCER-SR-20260811.pdf) |
| Sensomotoryka | [?i=88](https://humanresearchroadmap.nasa.gov/Risks/?i=88) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/SM%20Evidence%20Report%202022_FINAL%206-13-2023.pdf) |
| Mikroorganizmy | [?i=80](https://humanresearchroadmap.nasa.gov/Risks/?i=80) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Host_Micro%20EB_Final%207-6-22.pdf) |
| Stany medyczne w misji | [?i=95](https://humanresearchroadmap.nasa.gov/Risks/?i=95) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Medical.pdf) |
| Leki | [?i=177](https://humanresearchroadmap.nasa.gov/Risks/?i=177) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/other/Pharm%20evidence%20report_12-20-23_FINAL.pdf) |
| Hipoksja i choroba dekompresyjna | [?i=173](https://humanresearchroadmap.nasa.gov/Risks/?i=173) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Evidence%20Report%20Hypoxia%20and%20DCS_FINAL_1-8-2024.pdf) |
| Autonomia od Ziemi (HSIA) | [?i=175](https://humanresearchroadmap.nasa.gov/Risks/?i=175) | [PDF](https://humanresearchroadmap.nasa.gov/evidence/reports/Risk%20of%20Inadequate%20HSIA%20approved%20FINAL_%206-13-2023.pdf) |

---

## 6. Jak to wykorzystać do analizy w aplikacji

**Ryzyko → co śledzić → co zalecić → kiedy eskalować do flight surgeona**

| Ryzyko | Śledzimy | Rekomendacja | Eskalacja |
|---|---|---|---|
| Promieniowanie | Skumulowana dawka vs 600 mSv; dawka dzienna vs norma środowiska; alert SPE (NOAA) | Schronienie, przełożenie EVA | Dawka powyżej normy środowiska, zbliżanie się do limitów 30-dniowych, S3+ przy planowanym EVA |
| CO2 / atmosfera | CO2 1 h i 7 dni; objawy (ból głowy, zmęczenie) | Wentylacja, sprawdzenie nawiewu w kabinie snu | CO2 > 3 mmHg albo > 4,5 z objawami |
| Kości / nerki | Minuty ćwiczeń siłowych, prognozowany spadek BMD, nawodnienie | Więcej ćwiczeń siłowych, picie, witamina D | Prognoza > 5% spadku BMD; ból w okolicy nerek |
| Wydolność / mięśnie | Minuty ćwiczeń vs 1,5 h/dzień; VO2 i siła vs 80% wartości sprzed lotu | Korekta planu treningowego | < 80% baseline'u albo poniżej progu przed EVA |
| Układ krążenia | BP, HR (vs baseline astronauty), arytmie | Nawodnienie, odzież uciskowa przed powrotem | Arytmia, objawy |
| SANS | Ankieta wzroku, przypomnienia o badaniu oczu, bóle głowy, CO2 | Badanie oczu, niski CO2 | Każda zmiana widzenia |
| Sen / rytm dobowy | Godziny snu vs 8,5 h planu (realnie ~6 h), kofeina, światło | Higiena snu: bez kofeiny 6–12 h przed snem | Przewlekle krótki sen |
| Psychika / zespół | Nastrój, obciążenie, konflikty (tematy PPC) | Rozmowa z psychologiem, czas wolny | Utrzymujące się objawy depresyjne |
| Żywienie | kcal vs EER, trend masy ciała | Korekta diety, +200 kcal na godzinę EVA | Spadek masy > 5% (alarm > 10%) |
| Odporność | Temperatura, objawy, wysypki | Higiena | Gorączka, infekcja |
| Choroba lokomocyjna | Nudności w pierwszych dniach, równowaga | Leki, brak EVA do 72 h od startu | Objawy > 72 h |

**Podejście do danych w demo:**
1. **Prawdziwe:** krew Inspiration4 (glukoza, morfologia, CRP) z normami laboratoryjnymi, dawka z Curiosity i ISS, alerty NOAA na żywo.
2. **Syntetyczne, kalibrowane na źródłach:** BP (średnie ± SD z Mendeley), HR (bez zmian w locie, Norsk 2015), sen (~6 h), masa (−2…5% w 30 dni), kości (−0,5…1,5%/mies.), nastrój. Stały seed, w UI etykieta „simulated”.
3. **Analiza względem baseline'u astronauty sprzed lotu**, nie tylko norm populacyjnych. Tak robi NASA (progi typu „≥ 80% / ≥ 95% wartości sprzed lotu”).
4. **Trendy zamiast pojedynczych pomiarów:** średnie kroczące (np. 7-dniowa dla CO2 i snu), nachylenie trendu, przekroczenie progu przez N dni z rzędu.

---

## 7. Niezweryfikowane / luki

- Pełne, oficjalne harmonogramy badań medycznych na ISS (MORD/MRID) nie są publiczne. Częstotliwość ważenia (SLAMMD), obecny rytm testów słuchu, dni pobrań krwi w locie: niepotwierdzone.
- Jednostki w RadLab (`absorbed_dose_rate`, prawdopodobnie µGy/h) i w EDA (`total`, prawdopodobnie mGy/dzień).
- Dawka na powierzchni Księżyca: źródła się różnią (0,5 / 0,81 mSv/dzień). Pomiary chińskiej misji Chang'e-4 celowo pomijamy (zasady Space Apps, zob. RULES-NASA.md §8).
- Wartości dla Marsa w mGy/dzień (0,48 w przelocie, 0,21 na powierzchni) potwierdzone tylko ze źródeł wtórnych; wartości w mSv/dzień mają wiele źródeł.
- Zmiany HR/BP w locie pochodzą z Norsk 2015 (recenzowane, ale nie NASA).
- Licencja zbioru danych Mendeley z ciśnieniem.
- Pobieranie plików z LSDA przez API nie zadziałało.
- Wyniki dozymetrii załogi Artemis II nie zostały jeszcze opublikowane.
- Endpoint DONKI FLR zwrócił 404.

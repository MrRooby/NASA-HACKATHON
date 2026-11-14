# HABITAT: dane z habitatu w tunelu lawowym na Marsie

> Dokument planistyczny dla modułu HABITAT. Opisuje, jakie dane habitat produkuje, skąd wiemy, że są realistyczne, jak często się je zbiera i w jakim formacie trafiają do bazy.
> **Status:** plan, przed generatorem danych demo.
> Oznaczenia: **[NASA]** to wartość ze źródła NASA lub z recenzowanej publikacji, **[ZAŁ]** to założenie zespołu (tak też opisujemy je w UI i w pitchu).

---

## Spis treści
0. [Miejsce HABITAT w systemie](#0-miejsce-habitat-w-systemie)
1. [Założenia scenariusza](#1-założenia-scenariusza)
2. [Strefy i sensory](#2-strefy-i-sensory)
3. [Kanały danych](#3-kanały-danych)
4. [Harmonogram zbierania](#4-harmonogram-zbierania)
5. [Scenariusze anomalii do demo](#5-scenariusze-anomalii-do-demo)
6. [Kontrakt danych HABITAT → DATABASE](#6-kontrakt-danych-habitat--database)
7. [Artykuły bazowe (data/)](#7-artykuły-bazowe-data)
8. [Literatura naukowa](#8-literatura-naukowa)
9. [Luki, niepewności, rzeczy do poprawy](#9-luki-niepewności-rzeczy-do-poprawy)

---

## 0. Miejsce HABITAT w systemie

```
[HABITAT sensory]   ─┐
[WEARABLES]         ─┤
[urządzenia med.]   ─┼──► [DATABASE] ──► [MOTHER: przetwarzanie, reguły, alerty] ──► [GUI na laptopach załogi]
[dane od lekarzy]   ─┘                                   │
                                                         └──► raport do Ziemi (kolejka; opóźnienie / blackout)
```

**HABITAT jest producentem danych.** Czyta albo, w demo, symuluje sensory habitatu i zapisuje odczyty oraz zdarzenia do bazy.

- **HABITAT nie ocenia statusu** (ok / caution / alert). Robi to MOTHER na podstawie `config/thresholds.json`.
- **HABITAT oznacza tylko jakość odczytu** (`quality`), czyli czy sensor działa poprawnie.
- **HABITAT podaje, kto gdzie przebywa** (lokalizacja załogi w strefach). Dzięki temu MOTHER może przypisać ekspozycję konkretnej osobie, np. „C2 spędził 6 h w module z CO2 powyżej 3 mmHg”.

---

## 1. Założenia scenariusza

### 1.1 Habitat: uszczelniony tunel lawowy
Architektura według **Romio 2022** (`data/mars-tunnels-F.R_Paper_IAC-22E5IP7x68266.pdf`):

- **Uszczelnienie.** Segment tunelu lawowego zamykają kopuły nad skylightami (świetlikami w stropie), zintegrowane z MOXIE.
- **Strefy:** nieciśnieniowa, śluzy oraz ciśnieniowa z mieszanką oddechową.
- **W tunelu:** moduły mieszkalne (**49 m², 2 osoby, każdy z własnym ECLSS**, który przerabia odpady na wodę, powietrze i nawóz), pionowe farmy „Tree of Light” wzorowane na EDEN ISS, park, siłownia, ambulatorium, biura, laboratoria.
- **Na powierzchni:** lądowisko w odległości ≥600 m, instalacje ISRU (woda, paliwo, materiały), zasilanie, MOXIE, 2 tunele dostępowe (redundancja).
- **Dlaczego tunel:** skała osłania przed promieniowaniem, temperatura jest stabilna, po uszczelnieniu nie ma pyłu, jest ochrona przed mikrometeorytami.
- **Rozbudowa w 4 fazach:** 0–77 → 77–161 (ok. 10 lat) → 161–284 (ok. 15 lat) → 284–407 osób (ok. 20 lat).

### 1.2 Lokalizacja: rejon Elysium Mons **[ZAŁ, na podstawie Zhu 2025]**
Romio umieszcza tunel przy Arsia Mons (Tharsis). Analiza przydatności **Zhu et al. 2025** (`data/habitat-site.pdf`, Fig. 15) pokazuje jednak, że jaskinie w Tharsis wypadają najsłabiej:

- **Wysoko**, więc atmosfera jest cienka i słabo osłania przed promieniowaniem (indeks RSI niski).
- **Mało płytkiego lodu** wodnego.
- **Za wysoko, żeby wylądować obecną techniką** (EDL działa do ok. −1,4 km).

Wyższy indeks SI mają jaskinie w rejonie **Elysium Mons**, na południowej stronie Tempe Terra i na północnym skraju Arabia Terra. Wybieramy **Elysium Mons**. Łączymy więc architekturę Romio z lokalizacją według Zhu, co jest argumentem do pitcha.

> Do weryfikacji: konkretny kandydat z katalogu NASA **Mars Global Cave Candidate Catalog (MGC³)**, jego współrzędne i wysokość. Do tego czasu przyjmujemy rejon ok. 20–30°N, ok. 140–150°E jako **[ZAŁ]**.

### 1.3 Atmosfera: eksploracyjna NASA **[NASA]**
| Parametr | Wartość | Źródło |
|---|---|---|
| Ciśnienie całkowite | 56,5 kPa = 8,2 psia = 424 mmHg | OCHMO TB-003; NASA-STD-3001 |
| O2 | 34 % | jw. |
| Gaz obojętny (N2) | ≥ 30 % | jw. |
| Wdychane PIO2 = (P − 47) × FiO2 | ≈ 128 mmHg, czyli jak na wysokości ok. 1200 m n.p.m. | wyliczenie z TB-003 |
| Limit łagodnej hipoksji (średnia 1 h) | 127 mmHg | NASA-STD-3001 Vol 2 [6003] |
| Minimum bezwzględne | 122 mmHg | jw. |

**Dlaczego taka atmosfera.** Niskie ciśnienie skraca przygotowanie do EVA, czyli wypłukiwanie azotu przed wyjściem do skafandra, z godzin do minut. Do tego lżejsza konstrukcja i mniejsze wycieki. Górna granica 34 % O2 wynika z ryzyka pożaru.

**Konsekwencja dla danych:** margines tlenu jest mały (128 przy limicie 127 mmHg), więc kanały O2 są krytyczne.

### 1.4 Załoga i oś czasu
- **Załoga:** 4 osoby (C1–C4) w 2 modułach mieszkalnych (M1: C1+C2, M2: C3+C4) **[ZAŁ]**. Taki skład mają analogi NASA CHAPEA i HERA.
- **Misja długa (conjunction class):** 500–600 dni na powierzchni (Cohen 2015; NASA DRA 5.0). **Demo: sol 1–600.**
- **Sol** = 24 h 37 min. Rytm dnia: ok. 16 h aktywności i 8 h snu, jak w HERA.
- **Łączność:** opóźnienie 4–24 min w jedną stronę oraz **blackout ok. 13 dni** przy koniunkcji Słońca (NASA, Mars comm delay).

### 1.5 Zasilanie i otoczenie
- **Zasilanie:** fission jako podstawa (decyzja NASA z 2024 r., jednostka klasy 40 kW). Solar uzupełniająco: ok. 44 % nasłonecznienia Ziemi, spada w burzach pyłowych.
- **Na zewnątrz** (NSSDC, Zhu 2025, Sun 2024):
  - ciśnienie ok. 600–900 Pa;
  - temperatura ok. −90…+15 °C;
  - wiatr 2–30 m/s;
  - burze pyłowe lokalne co roku, globalne co kilka lat marsjańskich.
- **Promieniowanie na powierzchni:** ok. 0,64–0,67 mSv/dzień (MSL-RAD, Hassler 2014). Zdarzenie SEP dodaje ok. 50 µSv; rekord Curiosity z maja 2024 r. to 8,1 mGy.
- **W tunelu** dawka jest znacznie niższa i zależy od położenia względem skylightu (De Angelis 2002; Villar-Millán 2026). Współczynnik osłony w demo to **[ZAŁ]**.

---

## 2. Strefy i sensory

| Strefa (`zone`) | Opis | Co mierzymy |
|---|---|---|
| `surface` | lądowisko, ISRU, MOXIE, zasilanie, stacja pogodowa | otoczenie, dawka zewnętrzna, moc, wydajność MOXIE |
| `airlock_A`, `airlock_B` | 2 śluzy / suitporty | cykle, strata gazu, pył PM i cząstki ultradrobne, stan bariery |
| `cupola_1..4` | kopuły nad skylightami | dawka (najwyższa w tunelu), światło dzienne, temperatura, szczelność złącza kopuła–skała |
| `tunnel_common` | park, komunikacja | atmosfera ogólna, światło, hałas, konstrukcja (SHM), temperatura ściany |
| `module_M1`, `module_M2` | moduły mieszkalne z ECLSS | pełna atmosfera (CO2 lokalnie!), woda, mocz i kał per osoba, światło, hałas snu, moc grzewcza |
| `farm` | Tree of Light | O2/CO2 (rośliny), RH (wysoka), światło, temperatura |
| `ambulatory` | ambulatorium | atmosfera, mikroby powierzchni |
| `gym` | siłownia | atmosfera (CO2 i RH rosną przy wysiłku), obecność |
| `lab` | laboratorium | atmosfera, bariera ochrony planetarnej |

Każda strefa raportuje dodatkowo **obecność** (liczba osób i ich `crew_id`).

---

## 3. Kanały danych

Kolumny: **kanał** (id w danych) | jednostka | instrument (heritage) | kadencja realna | kadencja w demo | norma | próg (`config/thresholds.json` lub źródło) | status.

### 3.1 Powietrze

| Kanał | Jedn. | Instrument | Realnie | Demo | Norma | Próg | Status |
|---|---|---|---|---|---|---|---|
| `pressure_total` | kPa | MCA/SAM (ISS) | ciągle | 1 min | 56,5 ± 0,5 | spadek → szczelność | [NASA] |
| `ppo2_inspired` | mmHg | MCA/SAM | ciągle | 1 min | ≈ 128 | < 127 (1 h) / < 122 | [NASA] ⚠ zob. §9 |
| `o2_fraction` | % | MCA | ciągle | 1 min | 34 | > 34 → ryzyko pożaru | [NASA] |
| `ppco2` | mmHg | MCA/SAM, CDM | ciągle | 1 min, **per moduł** | 1,5–2,5 | 7 d > 2,5; 1 h > 3; > 4,5 objawy | [NASA] `cabin_co2` |
| `temperature_air` | °C | czujniki ECLSS | ciągle | 1 min | 20–25 (komfort 18–24 wg WHO) | < 18 / > 27 | [NASA] `cabin_temperature` |
| `rh` | % | jw. | ciągle | 1 min | 30–60 | < 25 / > 75 | [NASA] `cabin_humidity` |
| `voc_formaldehyde` | ppm | AQM (ISS) | co 73 h | 6 h | 0,008–0,08 | SMAC 7 d: 0,1 | [NASA] |
| `voc_benzene` | ppm | AQM | co 73 h | 6 h | ~0 | SMAC 180 d: 0,07 | [NASA] |
| `nh3` | ppm | — (zdarzeniowo) | zdarzenie | zdarzenie | ~0 | 7 d: 3; 1 h: 30 | [NASA] SMAC |
| `co` | ppm | CSA-CP | zdarzenie | zdarzenie | < det. | 7 d: 55; 1 h: 425 | [NASA] SMAC |
| `hcn`, `hcl` | ppm | CSA-CP | zdarzenie | zdarzenie | < det. | 1 h: 8 / 5 | [NASA] SMAC |
| `pm10` | mg/m³ | APM (demo ISS) | ciągle | 1 min | < 0,05 | pył marsjański 30 d: 0,1 (draft NASA 2026) | [NASA] |
| `pm2_5` | mg/m³ | APM | ciągle | 1 min | < 0,05 | jw. | [NASA] |
| `ultrafine_count` | cząstki/cm³ | — | — | 1 min (przy śluzach) | tło | wzrost po EVA | [ZAŁ] (VanBommel 2026) |

Uwagi:
- **CO2 trzeba mierzyć per moduł.** Na ISS CO2 gromadzi się lokalnie, np. w kabinach snu (Georgescu 2021).
- **Każdy +1 mmHg CO2 mniej więcej podwaja szansę bólu głowy** (Law 2014). CO2 pogarsza też podejmowanie decyzji (Scully 2019).
- **Krytyczne kanały mają podwójne sensory A/B** (`ppco2`, `ppo2_inspired`, `pressure_total`, `dose_rate`) **[ZAŁ, na podstawie Cohen 2015 „dwa z każdego”]**. Gdy A i B się rozjeżdżają, rekord dostaje `quality=suspect`.

### 3.2 Woda

| Kanał | Jedn. | Instrument | Realnie | Demo | Norma | Próg | Status |
|---|---|---|---|---|---|---|---|
| `water_toc` | mg/L | TOCA / MiniTOCA | tygodniowo | tygodniowo (+ dzienna wartość „wirtualna”, oznaczona) | 0,1–0,5 | 3,0 | [NASA] |
| `water_silver` | µg/L | CWQMK | sesje | tygodniowo | 200–400 | < 100 → ryzyko mikrobiologiczne | [NASA] |
| `water_coliform` | wykryto/nie (/100 mL) | zestaw na bakterie z grupy coli | miesięcznie | miesięcznie | nie wykryto | wykryto | [NASA] |
| `water_bacteria` | CFU/mL | Microbial Capture Device | kwartalnie | kwartalnie | < 50 | ≥ 50 | [NASA] |
| `water_recovery` | % | WRS + Brine Processor | ciągle | 1 h | 98 | < 95 | [NASA] |
| `water_tank_level` | L | — | ciągle | 10 min | — | trend spadkowy | [ZAŁ] |

### 3.3 Mocz (per osoba, `crew_id`)

Precedens: **UWMS Optical Sensor** (NASA TM 2023, NTRS 20230007658), czyli czujnik optyczny w toalecie. Analiza moczu w habitacie to **koncept zespołu oparty na prototypie NASA**. NASA nie ma operacyjnego automatycznego analizatora moczu w locie; pomiar wapnia demonstrowało Bisu na Polaris Dawn.

| Kanał | Jedn. | Realnie | Demo | Norma | Próg / sens | Status |
|---|---|---|---|---|---|---|
| `urine_void_volume` | mL | — | każda wizyta | — | — | [ZAŁ] |
| `urine_volume_24h` | L/dobę | — | dziennie | 1,4–2,1 (BVAD) | < 0,8 przez kilka dni → odwodnienie, kamienie | [NASA] norma, [ZAŁ] próg |
| `urine_specific_gravity` | — | — | każda wizyta | wartości kliniczne do sprawdzenia | rośnie przy odwodnieniu | [ZAŁ] |
| `urine_ph` | — | — | każda wizyta | wartości kliniczne do sprawdzenia | kamienie | [ZAŁ] |
| `urine_calcium` | mg/dobę | (Bisu, Polaris Dawn) | dziennie | do sprawdzenia | wzrost → utrata kości i ryzyko kamieni (Smith 2014) | [ZAŁ] |

**Dlaczego to ważne.** Grawitacja Marsa (0,38 g) **nie zatrzymuje utraty kości**: u myszy demineralizacja jest podobna jak w nieważkości (Cohen 2015, za Ellman 2011 i Wagner 2010). Wapń w moczu to więc wczesny sygnał dla prognozy BMD w MOTHER.

### 3.4 Kał (per osoba)

| Kanał | Jedn. | Realnie | Demo | Norma | Status |
|---|---|---|---|---|---|
| `feces_event` | zdarzenie | każde użycie | każde użycie | ok. 1/dobę | [ZAŁ] |
| `feces_mass` | g (mokra) | — | każde użycie | ok. 123 g/dobę (BVAD) | [NASA] norma |
| `feces_bristol` | 1–7 | — | ręczny log | 3–4 | [ZAŁ] |
| `fecal_canister_fill` | % | na wymianę | każde użycie | ok. 13 wypróżnień na pojemnik (ISS) | [NASA] |
| `microbiome_swab` | zdarzenie | FD30, R-30 | sol 30, sol 570 | — | [NASA] Standard Measures |

### 3.5 Mikroby

| Kanał | Jedn. | Realnie | Demo | Próg | Status |
|---|---|---|---|---|---|
| `air_bacteria` | CFU/m³ | kwartalnie | kwartalnie | 1000 | [NASA] |
| `air_fungi` | CFU/m³ | kwartalnie | kwartalnie | 100 | [NASA] |
| `surface_bacteria` | CFU/100 cm² | kwartalnie | kwartalnie | 10 000 | [NASA] |
| `surface_fungi` | CFU/100 cm² | kwartalnie | kwartalnie | 100 | [NASA] |
| `minion_id` | zdarzenie (lista taksonów) | na żądanie | przy anomalii | — | [NASA] (Castro-Wallace 2017) |

### 3.6 Promieniowanie

| Kanał | Jedn. | Instrument | Demo | Norma | Próg | Status |
|---|---|---|---|---|---|---|
| `dose_rate` per strefa | µGy/h | HERA / Timepix (Orion, ISS) | 1 min | powierzchnia ≈ 0,64–0,67 mSv/d; tunel ≪ | > 1,25 × tło z 5 dni → podejrzenie SPE | [NASA] / reguła z arXiv 2502.02469 |
| `dose_personal_cum` | mSv | Crew Active Dosimeter | 1 min (per `crew_id`) | — | limit kariery 600 mSv | [NASA] `radiation_career_mSv` |
| `solar_proton_flux_10MeV` | pfu | NOAA GOES (dane live) | 5 min | < 10 | S3 ≥ 1000 → brak EVA | [NASA/NOAA] `solar_proton_flux_10MeV` |

Strefy dawki: `surface` > `cupola_*` > `tunnel_common` (blisko skylightu) > `module_*` (głąb tunelu). Gradient według Villar-Millán & Viúdez-Moreiras 2026 oraz De Angelis 2002; współczynniki **[ZAŁ]**.

### 3.7 Hałas i oświetlenie

| Kanał | Jedn. | Realnie | Demo | Norma | Status |
|---|---|---|---|---|---|
| `noise_leq` | dBA | 24 h co 60 dni (dozymetr) | 1 min + podsumowanie dzienne | 24 h ≤ 70; NC-50 praca, NC-40 sen | [NASA] `noise_24h` |
| `illuminance` | lux | — | 1 min per strefa | 150–500 (Ziemia), 200–750 (ISS) | [NASA/Sun 2024] |
| `cct` | K | SSLA (ISS) | 1 min per strefa | profil dobowy: rano/dzień chłodne światło, wieczór ciepłe | [NASA] (Brainard 2016, Rahman 2022) |

Światło dzienne ze skylightów i Daylight Harvester (Romio) działa w cyklu sola. W module oświetlenie biodynamiczne **[ZAŁ]**. Łączy się to ze snem i nastrojem w MOTHER.

### 3.8 Obecność i lokalizacja załogi

| Kanał | Jedn. | Demo | Po co |
|---|---|---|---|
| `zone_occupancy` | liczba osób | 1 min per strefa | wentylacja sterowana zapotrzebowaniem (Sun 2024) |
| `crew_location` | `crew_id → zone` | przy zmianie strefy | **przypisanie ekspozycji osobie** (CO2, hałas, dawka, światło) |

### 3.9 Szczelność, śluzy, ochrona planetarna

| Kanał | Jedn. | Demo | Status |
|---|---|---|---|
| `airlock_cycle` | zdarzenie | każdy cykl | [ZAŁ] |
| `airlock_gas_loss` | kg/cykl | każdy cykl | [ZAŁ] (suitport zmniejsza stratę; Cohen 2015) |
| `pressure_decay_rate` | kPa/h | 10 min, per segment | [ZAŁ] |
| `leak_detector` per złącze (kopuła–skała, śluzy, przepusty) | ok / wyciek | 1 min | [ZAŁ] (Cai 2026: złącza i szwy zawodzą najczęściej) |
| `pp_barrier_status` (lab, śluzy) | ok / breach | zmiana stanu | [ZAŁ] (ochrona planetarna, Cohen 2015) |
| `vent_event`, `waste_dump_event` | zdarzenie | zdarzenie | [ZAŁ] |

### 3.10 Konstrukcja tunelu (SHM) i bilans cieplny

| Kanał | Jedn. | Demo | Status |
|---|---|---|---|
| `strain` (sklepienie, ściany, podstawa) | µε | 1 min | [ZAŁ] (Zhou 2025: 5 punktów pomiarowych; naprężenia ok. 150–203 kPa) |
| `wall_convergence` | mm | 10 min | [ZAŁ] |
| `seismic_event` | magnituda / zdarzenie | zdarzenie | [ZAŁ] (marsotrzęsienia; ryzyko zawalenia, Boston 2004) |
| `wall_temperature` | °C | 10 min | [ZAŁ] (stabilna w jaskiniach: Cushing 2007, Horvath 2022) |
| `heating_power` per moduł | W | 1 min | [ZAŁ] (Zhou 2025: szczyt strat ok. 04:00 czasu lokalnego, zimą wyżej) |

### 3.11 Systemy i zasilanie

| Kanał | Jedn. | Demo | Norma | Status |
|---|---|---|---|---|
| `power_fission` | kW | 1 min | ok. 40 (stałe) | [NASA] |
| `power_solar` | kW | 1 min | cykl dzienny, spada w burzy | [ZAŁ] |
| `power_by_subsystem` (HVAC, ECLSS, oświetlenie, farma) | kW | 1 min | — | [ZAŁ] (Sun 2024) |
| `moxie_o2_rate` | g/h | 1 min | ok. 12 g/h na jednostkę (peak MOXIE) × N | [NASA] |
| `subsystem_status` | ok / degraded / fault | zmiana stanu | — | [ZAŁ] |
| `habitat_mode` | `pre_crew_checkout` / `nominal` / `shelter` / `contingency` | zmiana stanu | — | [ZAŁ] (Cohen 2015) |

### 3.12 Otoczenie (stacja pogodowa na powierzchni)

| Kanał | Jedn. | Demo | Zakres | Status |
|---|---|---|---|---|
| `ext_pressure` | Pa | 5 min | 600–900, dobowe ±10 % | [NASA] |
| `ext_temperature` | °C | 5 min | −90…+15 | [NASA] |
| `dust_opacity_tau` | — | 1 h | 0,5–1; burza 5–11 | [NASA] |
| `uv_index` / `uv_flux` | W/m² | 5 min | w burzy spada o ok. 95 % | [NASA] |
| `wind_speed` | m/s | 5 min | 2–30 | [NASA] |

Realne tło do kalibracji: MSL REMS (PDS), MGS TES w rekalibracji Pankine 2023, Mars Dust Activity Database (Battalio), Curiosity RAD przez CDAWeb (zob. `DATA_SOURCES.md` §3).

---

## 4. Harmonogram zbierania

| Rytm | Kanały |
|---|---|
| **Ciągle (1 min)** | ciśnienie, O2, CO2 per moduł, T, RH, PM, dawka per strefa, dawka osobista, hałas, światło, obecność, SHM (strain), moc, MOXIE |
| **5–10 min** | otoczenie, protony NOAA, `pressure_decay_rate`, temperatura ściany, konwergencja |
| **Co godzinę** | odzysk wody, tau pyłu |
| **Co 6 h** (realnie 73 h) | VOC (AQM) |
| **Na zdarzenie** | mocz i kał (każda wizyta), cykle śluz, NH3/CO/HCN/HCl, sejsmika, wycieki, zmiany statusów, `crew_location` |
| **Dziennie** | `urine_volume_24h`, `urine_calcium`, podsumowanie hałasu |
| **Tygodniowo** | TOC, srebro w wodzie |
| **Miesięcznie** | bakterie z grupy coli |
| **Kwartalnie** | mikroby: powietrze, powierzchnie, woda |
| **W konkretnych dniach misji** | wymaz mikrobiomu sol 30 i R-30; zob. też `config/inflight_measurements.json` |

---

## 5. Scenariusze anomalii do demo

Każdy scenariusz to skrypt w generatorze: które kanały się zmieniają, jakie zdarzenie jest emitowane i czego oczekujemy od MOTHER i GUI.

| # | Scenariusz | Kanały | Oczekiwana reakcja MOTHER |
|---|---|---|---|
| 1 | **Awaria scrubbera CO2 w M1** | `ppco2[M1]` rośnie przez godziny do > 3, potem 5–8 | alert; C1 i C2 według `crew_location`; powiązanie z bólem głowy w self-assessmencie |
| 2 | **Awaria generatora O2** | `ppo2_inspired` < 127 | alert; mały margines atmosfery 8,2 psi |
| 3 | **Powolny spadek O2 (lekcja z Biosphere 2)** | `ppo2_inspired` spada o ułamki mmHg dziennie przez tygodnie | wykrycie trendu **przed** przekroczeniem progu |
| 4 | **Odwodnienie C2** | `urine_volume_24h` < 0,8 L kilka dni, `urine_specific_gravity` rośnie | rekomendacja nawodnienia, ryzyko kamieni |
| 5 | **Wapń w moczu rośnie** przy pominiętych ćwiczeniach | `urine_calcium` rośnie | powiązanie z prognozą BMD |
| 6 | **Pył po EVA** | `pm10`, `ultrafine_count` w śluzie i tunelu | alert, procedura czyszczenia |
| 7 | **TOC w wodzie** (DMSD) | `water_toc` rośnie do 1–2 przez tygodnie | ostrzeżenie przed limitem 3 |
| 8 | **SPE podczas EVA** | `solar_proton_flux_10MeV` ≥ 1000, `dose_rate` skok, `quality=suspect` na wrażliwej elektronice (Zhou 2025) | koniec EVA, schron do ok. 36 h, dawka osobista |
| 9 | **Globalna burza pyłowa** (tygodnie) | `dust_opacity_tau` 5–11, `power_solar` spada, fission bez zmian, UV spada | ograniczenie EVA, bilans mocy |
| 10 | **Wyciek NH3 / pożar** | `nh3` > 30 lub `co` > 425 i skok PM | emergency |
| 11 | **Wyciek na złączu kopuła–skała** | `leak_detector[cupola_2]`, `pressure_decay_rate` | lokalizacja wycieku |
| 12 | **Marsotrzęsienie** | `seismic_event`, wzrost `wall_convergence` | inspekcja konstrukcji |
| 13 | **Blackout łączności przy koniunkcji** (ok. 13 dni) | zdarzenie `comm_blackout` | raporty do Ziemi w kolejce |
| 14 | **Pre-crew checkout** (przed solem 1) | `habitat_mode=pre_crew_checkout`, testy szczelności i atmosfery | raport gotowości habitatu |

---

## 6. Kontrakt danych HABITAT → DATABASE

### 6.1 Rekord odczytu
```json
{
  "timestamp_utc": "2039-03-14T07:21:00Z",
  "sol": 142,
  "zone": "module_M1",
  "module_id": "M1",
  "crew_id": null,
  "channel": "ppco2",
  "sensor": "A",
  "value": 2.34,
  "unit": "mmHg",
  "quality": "ok",
  "source_flag": "simulated"
}
```
- **`crew_id`**: wypełnione tylko dla kanałów osobowych (mocz, kał, dawka osobista, `crew_location`).
- **`sensor`**: `A` / `B` dla kanałów redundantnych, w pozostałych `null`.
- **`quality`**: `ok` | `suspect` (niezgodność A/B, zakłócenia EM przy SPE) | `sensor_fault`.
- **`source_flag`**: `nasa` (odtworzenie realnych danych) | `simulated` (generator) | `team_assumption`.

### 6.2 Rekord zdarzenia
```json
{
  "event_id": "evt-000431",
  "event_type": "scrubber_fault",
  "start_utc": "2039-03-14T05:00:00Z",
  "end_utc": null,
  "sol": 142,
  "zone": "module_M1",
  "severity": "major",
  "details": {"subsystem": "CO2_removal_M1"}
}
```
Typy zdarzeń: `eva_start`, `eva_end`, `airlock_cycle`, `spe_onset`, `dust_storm`, `scrubber_fault`, `o2_gen_fault`, `leak`, `seismic`, `fire`, `nh3_leak`, `comm_blackout`, `vent`, `waste_dump`, `mode_change`, `maintenance`.

### 6.3 Katalog kanałów
Osobny plik (do utworzenia, np. `HABITAT/channels.json`). Zawartość: `channel`, `unit`, `cadence`, `zones`, `redundant` (bool), `per_crew` (bool), `threshold_ref` (id w `config/thresholds.json` albo `null`), `source`, `status` (`nasa` / `team_assumption`).

### 6.4 Generator demo (następny krok)
- Stały seed, żeby demo zawsze wyglądało tak samo.
- Tło: rytm dobowy, sezonowy i obecności załogi.
- Skryptowane scenariusze z §5 na stałych solach.
- Wyjście: CSV/JSON albo bezpośrednio do bazy (format uzgodnić z zespołem DATABASE).

---

## 7. Artykuły bazowe (data/)

| Plik | Cytowanie | Co z niego bierzemy |
|---|---|---|
| `mars-tunnels-F.R_Paper_IAC-22E5IP7x68266.pdf` | Romio F.A.P., *Mars Underground: a Landscape Strategy for Long Term Human Colonies on the Red Planet*, IAC-22-E5.IP.7.x68266 (2022) | **architektura**: tunel, kopuły z MOXIE, moduły 49 m² z ECLSS, farmy, fazy rozbudowy |
| `habitat-site.pdf` | Zhu S., Zhao B., Yan Y., Shi X., *Habitat site selection on Mars: Suitability analysis and mapping*, Acta Astronautica 226 (2025) 1–22, doi:10.1016/j.actaastro.2024.11.019 | **lokalizacja** (Elysium zamiast Tharsis), indeksy TSI/RSI/DASI/WISI, osłona atmosferyczna D = P/g (śr. 16,68 g/cm²), dawka 0,64 mSv/d, komfort 18–24 °C |
| `sustainability.pdf` | Sun H. et al., *Designing sustainable built environments for Mars habitation…*, Nexus 1 (2024) 100030, doi:10.1016/j.ynexs.2024.100030 (OA) | **środowisko wewnętrzne a zdrowie**: normy T/RH/lux, światło biodynamiczne, obecność załogi, lokalne CO2, szczelność, energia |
| `FirstMarsHabitatArchitecture.pdf` | Cohen M.M., *First Mars Habitat Architecture*, AIAA-2015-4517 (2015) | **misja 500–600 dni**, 0,38 g nie chroni kości, redundancja, pre-crew checkout, ochrona planetarna, suitporty |
| `aerospace-12-00510.pdf` | Zhong Y. et al., *Advancements in Mars Habitation Technologies and Terrestrial Simulation Projects: A Comprehensive Review*, Aerospace 12 (2025) 510, doi:10.3390/aerospace12060510 (OA) | **analogi**: Biosphere 2 (spadek O2), Lunar Palace 1 (SCL-90 i POMS co tydzień), SAM (symulowane tunele lawowe), MaMBA, CHAPEA, Mars-500, HI-SEAS, Concordia (hipoksja jak na ok. 3800 m) |
| `earth-analogs.pdf` | Cai G. et al., *Earth analog priors for deployable Mars habitats*, npj Space Exploration 2 (2026) 24, doi:10.1038/s44453-026-00034-z | utrzymanie > budowa; **złącza i szwy zawodzą**; brak długoterminowych danych z habitatów (argument do pitcha); TRL platform |
| `cave-dwellers.pdf` | Zhou C. et al., *Zhuque Base for Martian Habitation…*, Research 8 (2025) 0849, doi:10.34133/research.0849 (CC BY) | **monitoring konstrukcji** (5 punktów, GPR/LiDAR/tensometry), **bilans cieplny** (szczyt strat ok. 04:00 LT), **zakłócenia EM** |

---

## 8. Literatura naukowa

Zweryfikowane przez Crossref, NTRS i Europe PMC. OA = open access.

### 8.1 Tunele lawowe i jaskinie
- Léveillé R.J., Datta S. (2010) *Lava tubes and basaltic caves as astrobiological targets on Earth and Mars: A review.* Planet. Space Sci. doi:10.1016/j.pss.2009.06.004
- Sauro F. et al. (2020) *Lava tubes on Earth, Moon and Mars: A review on their size and morphology…* Earth-Sci. Rev. doi:10.1016/j.earscirev.2020.103288 (OA)
- Losarcos, Dombard (2025) *Lava Tubes on Earth, the Moon, and Mars: Detection, Evolution, and Exploration Potential.* Space Sci. Rev. doi:10.1007/s11214-025-01260-9 (OA)
- Boston P.J. et al. (2004) *Extraterrestrial Subsurface Technology Test Bed: Human Use and Scientific Value of Martian Caves.* AIP Conf. Proc. doi:10.1063/1.1649667
- Blamont J. (2014) *A roadmap to cave dwelling on the Moon and Mars.* Adv. Space Res. doi:10.1016/j.asr.2014.08.019
- De Angelis G. et al. (2002) *Lunar Lava Tube Radiation Safety Analysis.* J. Radiat. Res. doi:10.1269/jrr.43.s41 (OA)
- Naito M. et al. (2020) *Radiation dose and its protection in the Moon from GCR and SEP…* J. Radiol. Prot. doi:10.1088/1361-6498/abb120 (OA)
- **Villar-Millán A., Viúdez-Moreiras D. (2026) *The ionizing radiation environment and shielding in pit craters and cave skylights on Mars.* Life Sci. Space Res. doi:10.1016/j.lssr.2026.02.002 (OA)**
- Hassler D.M. et al. (2014) *Mars' surface radiation environment measured with the MSL Curiosity rover.* Science. doi:10.1126/science.1244797
- Cushing G.E. et al. (2007) *THEMIS observes possible cave skylights on Mars.* GRL. doi:10.1029/2007gl030709 (OA)
- Horvath T., Hayne P.O., Paige D.A. (2022) *Thermal and Illumination Environments of Lunar Pits and Caves.* GRL. doi:10.1029/2022gl099710 (OA)
- Sauro F. et al. (2023) *Training astronauts for scientific exploration…: The ESA PANGAEA programme.* Acta Astronaut. doi:10.1016/j.actaastro.2022.12.034 (OA)
- Hidding A.J. … Romio F.A.P. et al. (2026) *Robotic lava tube mapping and multimodal data collection using quadruped and LiDAR.* Front. Robot. AI. doi:10.3389/frobt.2026.1855443 (OA)

### 8.2 ECLSS, monitoring środowiska, toksykologia
- Ewert M.K. et al. (2022) *Life Support Baseline Values and Assumptions Document (BVAD) Rev 2.* NASA/TP, NTRS 20210024855 (OA)
- Norcross J. et al. (2013) *Effects of the 8 psia / 32% O2 Atmosphere on the Human in the Spaceflight Environment.* NASA/TM, NTRS 20130013505 (OA)
- Norcross J. et al. (2015) *Evidence Report: Risk of Hypobaric Hypoxia from the Exploration Atmosphere.* NTRS 20150021491 (OA)
- Law J. et al. (2014) *Relationship between carbon dioxide levels and reported headaches on the ISS.* J. Occup. Environ. Med. doi:10.1097/jom.0000000000000158
- Scully R.R. et al. (2019) *Effects of acute exposures to carbon dioxide on decision making and cognition…* npj Microgravity. doi:10.1038/s41526-019-0071-6 (OA)
- Evans L.A. (2025) *Carbon Dioxide as a Multisystem Threat in Long Duration Spaceflight.* Aerosp. Med. Hum. Perform. doi:10.3357/amhp.6716.2025
- Wallace W.T. et al. (2017) *Monitoring of the Atmosphere on the ISS with the Air Quality Monitor.* ICES, NTRS 20170002579 (OA)
- Darrach M. et al. (2017) *Progress Report on the Spacecraft Atmosphere Monitor's Development Model.* NTRS 20210006143 (OA)
- Mudgett P.D. et al. (2017) *US Navy Submarine Sea Trial of NASA developed Multi-Gas Monitor.* NTRS 20170002603 (OA)
- Morrison C. et al. (2024) *Development of the Miniature Total Organic Carbon Analyzer.* ICES, NTRS 20240004588 (OA)
- Meyer M.E. (2018) *Results of the Aerosol Sampling Experiment on the ISS.* NTRS 20180004817 (OA)
- Limardo J.G. et al. (2013) *Assessment of Crewmember Noise Exposures on the ISS.* doi:10.2514/6.2013-3516
- Wang J.L. et al. (2025) *Potential Health Impacts, Treatments, and Countermeasures of Martian Dust…* GeoHealth. doi:10.1029/2024gh001213 (OA)
- VanBommel S.J. et al. (2026) *Fine and ultrafine Martian dust presents additional risks for future crewed missions to Mars.* PNAS. doi:10.1073/pnas.2620747123 (OA)
- Romoser A.A. et al. (2019) *Spacecraft Maximum Allowable Concentrations for Manganese Compounds in Mars Dust.* Aerosp. Med. Hum. Perform. doi:10.3357/amhp.5264.2019
- National Research Council. *Spacecraft Maximum Allowable Concentrations for Selected Airborne Contaminants.* doi:10.17226/9062 (OA)
- Castro-Wallace S.L. et al. (2017) *Nanopore DNA Sequencing and Genome Assembly on the ISS.* Sci. Rep. doi:10.1038/s41598-017-18364-0 (OA)
- Checinska Sielaff A. et al. (2019) *Characterization of the total and viable bacterial and fungal communities associated with the ISS surfaces.* Microbiome. doi:10.1186/s40168-019-0666-x (OA)

### 8.3 Sieci sensorów, zarządzanie stanem systemu, digital twin
- Figueroa F., Walker M. (2018) *Integrated System Health Management (ISHM) and Autonomy.* AIAA. doi:10.2514/6.2018-1152, czyli model koncepcyjny dla MOTHER
- Brown, Chidambaram, Aaseng (2005) *Applying Health Management Technology to the NASA Exploration System-of-Systems.* doi:10.2514/6.2005-6624
- *Environmental Monitoring as part of Life Support for the Crew Habitat for Lunar and Mars missions* (2010) AIAA ICES. doi:10.2514/6.2010-6092
- Claeys (2024) *HI-SEAS… EMMIHS 2023/2024 Missions.* IAF. doi:10.52202/078364-0042
- Leese et al. (2025) *Outlook on Research on Life Support Systems Together with Digital Twin Modelling.* IAF/IAA. doi:10.52202/083074-0038

> **Luka do pitcha:** nie znaleźliśmy recenzowanych publikacji z danymi sensorów z HI-SEAS, MDRS ani CHAPEA, ani o wykrywaniu anomalii w telemetrii ECLSS. Cai 2026 też zwraca uwagę na brak długoterminowych danych z habitatów. Nasz producent danych z oznaczonymi źródłami trafia właśnie w tę lukę.

### 8.4 Środowisko a zdrowie załogi
- Basner M. et al. (2013) *Mars 520-d mission simulation reveals protracted crew hypokinesis and alterations of sleep duration and timing.* PNAS. doi:10.1073/pnas.1212646110 (OA)
- Brainard G.C. et al. (2016) *The development of lighting countermeasures for sleep disruption and circadian misalignment during spaceflight.* Curr. Opin. Pulm. Med. doi:10.1097/mcp.0000000000000329
- Rahman S.A. et al. (2022) *Effects of dynamic lighting on circadian phase, self-reported sleep and performance during a 45-day space analog mission.* J. Pineal Res. doi:10.1111/jpi.12826 (OA)
- Turroni S. et al. (2017) *Temporal dynamics of the gut microbiota in people sharing a confined environment (MARS500).* Microbiome. doi:10.1186/s40168-017-0256-8 (OA)
- Garrett-Bakelman F.E. et al. (2019) *The NASA Twins Study.* Science. doi:10.1126/science.aau8650
- Overbey E.G. et al. (2024) *The Space Omics and Medical Atlas (SOMA)…* Nature. doi:10.1038/s41586-024-07639-y (OA)
- Krihak M. et al. *Medical Data Architecture (MDA) Project Status.* NTRS 20190000384 (OA), czyli odpowiednik naszego przepływu baza → MOTHER → GUI

### 8.5 Odpady jako dane zdrowotne
- Smith S.M. et al. (2014) *Men and women in space: bone loss and kidney stone risk after long-duration spaceflight.* J. Bone Miner. Res. doi:10.1002/jbmr.2185 (OA)
- Smith S.M. et al. (2012) *Benefits for bone from resistance exercise and nutrition in long-duration spaceflight.* JBMR. doi:10.1002/jbmr.1647 (OA)
- Whitson P.A. et al. (2009) *Effect of Potassium Citrate Therapy on the Risk of Renal Stone Formation During Spaceflight.* J. Urol. doi:10.1016/j.juro.2009.07.010
- **Singh U.N. et al. (2023) *ISS Universal Waste Management System (UWMS) Optical Sensor: Phase 2.* NASA/TM, NTRS 20230007658 (OA)**: toaleta jako sensor
- Chung P.H. et al. (2026) *Variations in Urinary Microbiota on a Short-Duration Space Mission to the ISS.* JU Open Plus. doi:10.1097/ju9.0000000000000409 (OA)
- Hoorn E.J., Gameiro J. (2024) *Cosmic kidney disease: a spaceflight-induced tubulopathy.* Clin. Kidney J. doi:10.1093/ckj/sfae329 (OA)

### 8.6 Top 8 do przeczytania
1. **BVAD 2022**: obciążenia na osobę (O2, CO2, H2O, ciepło) i nastawy atmosfery.
2. **Norcross 2015 i 2013**: atmosfera 8,2 psi / 34 % O2, progi ppO2.
3. **Law 2014 + Scully 2019**: progi CO2 i ich związek ze zdrowiem i decyzjami.
4. **NRC SMAC + Romoser 2019**: limity gazów śladowych i pyłu.
5. **De Angelis 2002 + Villar-Millán 2026 + Hassler 2014**: dawka w tunelu i pod skylightem w porównaniu z powierzchnią.
6. **Sauro 2020 + Horvath 2022**: geometria tuneli i stabilność termiczna.
7. **Wallace 2017 (AQM) + Mudgett 2017 (MGM)**: jak wyglądają realne strumienie danych.
8. **Wang 2025 GeoHealth**: pył marsjański i nadchlorany.

### 8.7 Źródła NASA użyte w tabelach (poza literaturą)
- NASA-STD-3001 Vol 1 i Vol 2; OCHMO TB-002 (ECLSS), TB-003 (atmosfera), TB-004 (CO2); zob. `config/sources.json`.
- AQM: NTRS 20170002579. TOCA: NTRS 20170009165. UWMS: NTRS 20230005900. AHS gaps: NTRS 20230013441. ECLSS Mars: NTRS 20230002103.
- Limity SMAC: NTRS 20090014213 (tabela z 2008 r., do sprawdzenia aktualności).
- Mars power decision 2024; Mars comm delay fact sheet; MOXIE; CHAPEA; HERA; propozycja limitu pyłu marsjańskiego (NASA 2026).
- NSSDC Mars fact sheet; MSL RAD (SwRI; JPL, SPE 2024).

---

## 9. Luki, niepewności, rzeczy do poprawy

**⚠ Konflikt z `config/thresholds.json`:** dla wskaźnika `cabin_ppo2` nominalne PIO2 ≈ 128 mmHg przy atmosferze 8,2 psi wpada w przedział `caution` (127–145). Habitat świeciłby więc na żółto bez przerwy. **Do zrobienia:** progi PIO2 zależne od atmosfery habitatu, np. osobny profil `exploration_atmosphere`. Decyzja należy do zespołu MOTHER/config.

**Niezweryfikowane lub założenia:**
- Konkretny kandydat jaskini z MGC³ w rejonie Elysium Mons (współrzędne, wysokość, możliwość lądowania).
- Współczynnik osłony tunelu dla dawki: brak publikowanej liczby dla Marsa, więc **[ZAŁ]**.
- Interwały próbkowania MCA, ANITA-2 i SAM dla gazów śladowych; próg alarmu SPE w HERA.
- Aktualność tabeli SMAC z 2008 r.
- Kliniczne normy ciężaru właściwego, pH i wapnia w moczu: do uzupełnienia ze źródła klinicznego, np. MedlinePlus.
- Lista sensorów CHAPEA nie została opublikowana.
- Liczby z Mars-500 o spadku spójności grupy pochodzą z przeglądu Zhong 2025, a nie z pracy źródłowej.
- Romio 2022 nie ma DOI w Crossref; cytujemy jako paper IAC.

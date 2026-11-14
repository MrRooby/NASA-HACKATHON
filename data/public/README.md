# data/public: prawdziwe dane publiczne do zasilenia danych demo

Pobrane 2026-11-14. Każdy folder ma `raw/` (oryginały), `processed/` (uporządkowane CSV) i `MANIFEST.md`. W MANIFEST.md są dokładne URL-e, licencje, jednostki, zakresy i zastrzeżenia.

Format „long” w `processed/`: `timestamp_utc, source, …, channel, value, unit`.

| Folder | Rozmiar | Co zawiera | Najlepsze do demo |
|---|---|---|---|
| `mars_surface/` | 28 MB | **Curiosity RAD:** dawka co ok. 17 min w latach 2024–2025 i burza słoneczna z 20.05.2024 (szczyt 8378 µGy/d). **REMS:** pogoda dzienna od sola 1 do 4995 oraz godzinowa z 24 soli. Stałe NSSDC. | `per_sol_summary.csv`, `rad_solar_event_2024-05-15_25.csv`, `rems_pds_hourly_long.csv` |
| `iss_cabin/` | 67 MB | **OSDR EDA:** CO2, temperatura i wilgotność w kabinie ISS z 15 misji (2014–2024), dawka dzienna. **RadLab:** dawka per moduł ISS, przeloty nad SAA, dni burz słonecznych, referencje dla Marsa i Artemis I. | RR-25 (CO2 co 1 min, 66 dni), `daily_summary.csv`, moduły 2019-12-05..07 |
| `space_weather/` | 34 MB | **GOES:** protony co 5 min dla SPE 1989, 2003, 2012, 2017, 2024 i 2026. Rozbłyski X. Snapshoty JSON z NOAA SWPC (atrapa live API). Skale S/R. Lista NOAA 319 SPE. DONKI tylko dla 2024. | `processed/events/*`, `spe_events_summary.csv`, `raw/swpc/*.json` |
| `human/` | 44 MB | Inspiration4 (mocz i surowica), MMASH (HR co minutę, sen, nastrój), LifeSnaps (71 osób, dzienne HR/sen/SpO2/nastrój), NHANES 2017–18 (ciśnienie, glukoza, ACR w moczu), ciśnienie astronautów ISS. | `processed/calibration_reference.csv` (613 wierszy) |
| `indoor_analog/` | 75 MB | **UCI Occupancy:** CO2, światło, temperatura, wilgotność, liczba osób. Jaskinie: Jenolan (CO2, radon), Nullarbor, lawowe jaskinie lodowe Mauna Loa. | `co2_occupancy_analysis.json` (ok. 2,8 ppm/min na osobę, zanik ok. 0,4–0,5/h), `light_hour_of_day_profile.csv` |

## Licencje: na co uważać
- **Mauna Loa lava tubes** (`indoor_analog/processed/cave_maunaloa_lavatube_long__CC-BY-NC-ND.csv` i jego surowe pliki) mają licencję **CC BY-NC-ND 4.0**, która zabrania rozpowszechniania zmodyfikowanych wersji. **Nie commitować do publicznego repo**; dopisać do `.gitignore`.
- **MMASH** ma licencję **ODbL 1.0**: trzeba podać źródło, a dane pochodne zostają na ODbL.
- **REMS daily feed** (CAB/NASA) jest udostępniany „for outreach purposes only”, co wystarcza na demo, ale trzeba to zaznaczyć.
- Pozostałe: NASA (dane publiczne), NOAA i NHANES (public domain), UCI, LifeSnaps i Mendeley (CC BY 4.0), PANGAEA (CC BY 3.0/4.0).

## Znane pułapki
- **Wszystkie dane marsjańskie pochodzą z krateru Gale (ok. −4,5 km, 4,6° S).** Nasz habitat stoi przy Elysium Mons, więc przeliczenia (ciśnienie, osłona tunelu) oznaczamy jako **[ZAŁ]**.
- **Protony GOES zmierzono przy Ziemi (1 AU)** i nie skalują się 1:1 do Marsa. W aplikacji podpisujemy je jako „measured at Earth”.
- **Dane ISS z jednej misji to jeden lokalny czujnik.** Nie używać RR-22 (błędne dane). RR-9 ma przesunięte daty.
- **Glukoza Inspiration4 z R+45 (36–44 mg/dL)** to prawdopodobnie artefakt próbki; nie modelować na jej podstawie.
- **CO2 z Ziemi jest w ppm przy 1 atm.** W habitacie 8,2 psi symulujemy ciśnienie parcjalne w mmHg (3 mmHg ≈ 7070 ppm przy 424 mmHg).

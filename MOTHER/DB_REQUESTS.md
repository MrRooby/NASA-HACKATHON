# Prośby MOTHER do bazy danych (dla Harego)

Wszystko poniżej MOTHER już umie liczyć. Brakuje tylko danych. Kolejność = ważność. Nie trzeba nowych baz: większość pasuje do istniejących tabel.

## Już zrobione, dzięki! ✅
- `astro_habitat.crew.subject_id` jest połączone z SYN-01…04 → MOTHER łączy mocz i dawkę z krwią i parametrami życiowymi tej samej osoby.

## 1. Opaski na 4 kończynach (najważniejsze dla scenariusza z filmu)
Pomysł z MEDICAL-DIAGNOSIS: 4 opaski (2 ręce, 2 nogi), odczyt co ~10 s: tętno, SpO2, temperatura skóry, ruch.
- Proponowany kanał w `astro_habitat.channel` (per_crew = 1): `limb_hr`, `limb_spo2`, `limb_skin_temp`, `limb_motion`.
- W `reading` potrzebna jest informacja, która to kończyna: wystarczy kolumna `sensor` z wartością `left_arm` / `right_arm` / `left_leg` / `right_leg` (kolumna już istnieje).
- Metadane opaski (bateria, łączność): kanały `band_battery_pct`, `band_link` (ok/lost).
- MOTHER porównuje każdą kończynę z pozostałymi. Brak tętna w jednej kończynie przy normalnych pozostałych oznacza utratę krążenia (ucisk, zmiażdżenie).

## 2. Zdarzenia medyczne: AED, leki, procedury
**Co to jest AED:** automatyczny defibrylator zewnętrzny, czyli urządzenie, które ratuje przy zatrzymaniu krążenia (migotanie komór).
- **Nie używa się samo.** Załoga przykleja elektrody, AED samo analizuje rytm serca i mówi „wyładowanie zalecane / niezalecane”. Wyładowanie wyzwala człowiek przyciskiem (w wersji półautomatycznej) albo urządzenie po ostrzeżeniu (w wersji automatycznej).
- **MOTHER nigdy go nie uruchamia.** MOTHER ostrzega wcześniej (np. potas ≥6,0 → „połóż AED obok, monitoruj serce”) i zapisuje, co się stało.
- **Po co w bazie:** żeby było wiadomo, że doszło do zdarzenia sercowego (eskalacja na Ziemię, zakaz EVA, badania kontrolne) i żeby lekarz na Ziemi dostał zapis.
- **Jak:** nie trzeba nowej tabeli. Wystarczą nowe typy w `astro_habitat.event`: `aed_pads_on`, `aed_analysis` (details: `shock_advised` / `no_shock`), `aed_shock` (details: energia J), oraz `medication`, `procedure`.

## 3. Wyniki badań jako zwykłe obserwacje (`astro_core.observation`, nowe kody w `indicator`)
| Kod | Jednostka | Po co |
|---|---|---|
| `ck` (kinaza kreatynowa) | U/L | uszkodzenie mięśni, zespół zmiażdżenia |
| `fev1`, `fvc` (spirometria) | L | płuca |
| `visual_acuity`, `iop` (ciśnienie w oku) | logMAR, mmHg | oczy / SANS |
| `grip_strength` | kg | zanik mięśni |
| `bia_fat_pct`, `bia_water_pct`, `bia_muscle_pct`, `bmr` | %, kcal/d | skład ciała (BIA) |
| `vitamin_d`, `vitamin_b12` | ng/mL, pg/mL | żywienie |
| `cortisol` | µg/dL | stres |
| `sleep_efficiency`, `sleep_deep_min` (z opaski EEG, nie surowe EEG) | %, min | jakość snu |
| `headache`, `vision_change`, `nausea`, `fatigue` | skala | objawy z check-inu |

## 4. Zdjęcia USG i inne załączniki
Tabela `attachment` (id, crew_code, ts_utc, kind = `ultrasound`/`ecg_strip`, file_path, `sent_to_earth_at`, `doctor_opinion`). MOTHER niczego w nich nie analizuje, tylko pokazuje i kolejkuje do wysłania na Ziemię.

## 5. Drobiazgi
- `egfr_aa` (eGFR liczone z uwzględnieniem rasy) od 2021 roku nie jest zalecane w medycynie. MOTHER liczy eGFR sam (CKD-EPI 2021), więc ten kod można usunąć.
- Każdy import jest zapisany w `import_log` dwa razy.
- Konto tylko do odczytu `astro_reader` + zmiana hasła konta administratora bazy (gotowy SQL jest u Konrada).

# Obrazy referencyjne: gdzie stoi nasz habitat

Pobrane 2026-11-14 do szkicowania bazy. Źródła tylko NASA i HiRISE (University of Arizona).

## Lokalizacja: zbocza Elysium Mons
Habitat stoi w **tunelu lawowym na zboczu Elysium Mons**, przy prawdziwym zapadlisku (skylight / pit crater) sfotografowanym przez HiRISE.

| Kandydat | Współrzędne | Co to jest | Plik |
|---|---|---|---|
| **⭐ Główny: pit na płd.-wsch. zboczu Elysium Mons** | **23,210° N, 149,909° E** | Okrągłe zapadlisko ok. **130 m średnicy** w polu lawowym przeciętym liniowymi rowami, które NASA/HiRISE interpretuje jako **zapadnięte tunele lawowe**. Na dnie oświetlonym słońcem widać duże głazy. To jeden z pierwszych pitów znalezionych w rejonie Elysium, bo zwykle występują w Tharsis. | `hirise_ESP_043222_2035_*.jpg` |
| Katena na szczycie Elysium Mons | 24,780° N, 146,685° E | Łańcuch zapadlisk ciągnący się od kaldery na północ. Według HiRISE prawdopodobnie zapadnięty tunel lawowy po odpłynięciu lawy. Leży bardzo wysoko, więc na habitat się nie nadaje; to wzór, jak wygląda „sznur” świetlików nad tunelem. | `hirise_ESP_056026_2050_*.jpg`, `nasa_PIA22728_*.jpg` |
| Hephaestus Fossae (zach. zbocze Elysium) | zob. mapa kontekstowa | Łańcuchy pitów, które nagle zmieniają kierunek. NASA interpretuje je najczęściej jako zapadnięte tunele lawowe. Dobry wzór rysunku sieci tuneli z góry. | `nasa_PIA03842_*.jpg` |
| Cerberus Fossae (Elysium Planitia) | ok. 7° N | Pity powstałe przy uskokach; największy ma ok. 110 × 300 m. Okolica lądowiska InSight. | `hirise_PSP_006234_1870_*.jpg` |

> **Propozycja:** podmienić współrzędne habitatu w bazie (`habitat.latitude_deg/longitude_deg`, teraz 25,0 / 145,0) na **23,21 / 149,91**, czyli realny pit z ESP_043222_2035. Wysokość terenu jest do sprawdzenia (MOLA). To nadal **[ZAŁ]**, bo nikt nie potwierdził, że pod tym pitem jest tunel.

## Tunele z artykułu Romio (Arsia Mons / Tharsis)
Romio projektował kolonię w tunelu na NE od Arsia Mons. My przenieśliśmy ją do Elysium, ale **rysunki tunelu i kolonii są najlepszym wzorem do szkicu.**

**Zdjęcia HiRISE użyte przez Romio** (domena publiczna, podpis: NASA/JPL/University of Arizona):
| Plik | Co | Współrzędne |
|---|---|---|
| `hirise_ESP_016767_1785_romio_tharsis.jpg` | [Possible Skylight on a Lava Tube NE of Arsia Mons](https://www.uahirise.org/ESP_016767_1785) | −1,391° / 236,442° E |
| `hirise_ESP_014380_1775_romio_tharsis.jpg` | [Possible Skylight on a Lava Tube NE of Arsia Mons](https://www.uahirise.org/ESP_014380_1775) | −2,272° / 241,900° E |
| `hirise_ESP_033355_1635_romio_tharsis.jpg` | [Small Pit South of Arsia Mons](https://www.uahirise.org/ESP_033355_1635) | −16,296° / 245,856° E |

**Rysunki z artykułu Romio** w folderze `romio_rysunki_NIE_COMMITOWAC/`. Mają **© IAF, all rights reserved**, więc służą tylko do wewnętrznego szkicu; **nie commitować i nie używać w zgłoszeniu** (`RULES-NASA.md` §9.2):
| Plik | Zawartość |
|---|---|
| `romio_s02_swietliki_i_powstawanie_tunelu.png` | zdjęcia świetlików, mapa skupisk w Tharsis, schemat powstawania tunelu (Fig. 1–3) |
| `romio_s05_lokalizacja_tunelu_Arsia.png` | wybór segmentu tunelu z 4 świetlikami (Fig. 10) |
| `romio_s06_fazy_budowy_przekroj_tunelu.png` | fazy adaptacji tunelu i **przekrój podłużny** ok. 200 m (Fig. 11) |
| `romio_s09_masterplan_powierzchni.png` | **masterplan powierzchni**: lądowisko, tunele, zasilanie, ISRU, kopuły (Fig. 14–15) |
| `romio_s10_tree_of_light_wnetrze.png` | rozkład funkcji według światła i render „Tree of Light” (Fig. 16–17) |
| `romio_s11_moduly_mieszkalne_49m2.png` | **moduły mieszkalne 49 m² w układzie heksagonalnym**, poszerzanie tunelu (Fig. 18–19) |
| `romio_s15_przekroj_i_plan_kolonii.png` | **przekrój i plan kolonii w tunelu** (strefy ciśnieniowe, śluzy, kopuły, farmy) (Fig. 22) |

Do publicznego rysunku bazy: rysujemy **własny** szkic na podstawie tych wzorów, a jako tło bierzemy zdjęcia HiRISE i NASA.

## Jak to przełożyć na rysunek (skala)
- **Świetlik/pit:** ok. 130 m średnicy (ESP_043222_2035). Nad nim stoi **kopuła z MOXIE** (architektura Romio 2022).
- **Tunel:** rowy i łańcuchy pitów na zdjęciach to przebieg tuneli. Tunele na Marsie mogą mieć szerokość od dziesiątek do setek metrów (Sauro et al. 2020; Léveillé & Datta 2010).
- **Moduł mieszkalny:** 49 m² na 2 osoby, czyli np. heksagon o boku ok. 4,3 m. W demo są 2 moduły (M1, M2).
- **Strefy z bazy danych:** `surface`, 2 śluzy (`airlock_A/B`), 4 kopuły (`cupola_1..4`), `tunnel_common`, `module_M1/M2`, `farm`, `ambulatory`, `gym`, `lab`.
- **Na powierzchni:** lądowisko ≥ 600 m od reszty, ISRU, MOXIE, reaktor (fission), 2 tunele dostępowe.

## Wzory architektury (analogi NASA)
| Plik | Co | Uwaga o prawach |
|---|---|---|
| `chapea_mars_dune_alpha_render.png` | render habitatu CHAPEA (Mars Dune Alpha, 4 osoby, 158 m²) | autor ICON/BIG Bjarke Ingels Group, opublikowane przez NASA; **do publicznego użycia sprawdzić prawa**, do szkicowania OK |
| `chapea_mars_dune_alpha_3dprint.jpg` | druk 3D ścian habitatu | jw. (ICON) |
| `chapea_jsc2023e038248.jpg` | zdjęcie NASA JSC z CHAPEA | NASA, domena publiczna |

## Prawa i podpisy
- **HiRISE:** domena publiczna; podpis: *„NASA/JPL/University of Arizona”*. Strony obrazów:
  - https://www.uahirise.org/ESP_043222_2035
  - https://www.uahirise.org/ESP_056026_2050
  - https://www.uahirise.org/PSP_006234_1870
- **NASA Photojournal:**
  - https://photojournal.jpl.nasa.gov/catalog/PIA22728 (NASA/JPL/UArizona)
  - https://photojournal.jpl.nasa.gov/catalog/PIA03842 (NASA/JPL/ASU, THEMIS)
- **Nie używać w materiałach zgłoszeniowych logo NASA** (`RULES-NASA.md` §7).
- Pracy z 2025 r. o kandydacie na jaskinię na zachodnim zboczu Elysium (Astronomical Journal, doi:10.3847/1538-3881/adbe32) **nie cytujemy**. Autorzy mają prawdopodobnie chińską afiliację (`RULES-NASA.md` §8), a te same miejsca pokazują obrazy HiRISE.

## Przydatne do dalszego szukania
- Katalog jaskiń USGS (MGC³): https://www.usgs.gov/center-news/caves-mars, z mapą ponad 1000 kandydatów na wejścia do jaskiń.
- Przeglądarka HiRISE: https://www.uahirise.org, wpisać „pit” albo „skylight” i współrzędne Elysium (ok. 20–30° N, 140–150° E).

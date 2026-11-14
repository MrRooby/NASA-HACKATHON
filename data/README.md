# data/

Publiczne zbiory danych używane przez projekt. Katalogi `env/` i `lsda/` odtwarza skrypt
`scripts/fetch_data.py` (tylko stdlib):

```
python3 -I scripts/fetch_data.py --source all          # noaa|cdaweb|radlab|eda|lsda|lsda_vitals|all
# lsda_vitals: arkusze Excel zapisywane też jako CSV, gdy dostępne xlrd/openpyxl:
uv run --no-project --with xlrd==2.0.1 --with openpyxl==3.1.5 python -I scripts/fetch_data.py --source lsda_vitals [--lsda-ids 178066 'DSO 467']
python3 -I scripts/fetch_data.py --source radlab --force
```

Każdy katalog ma `MANIFEST.json` z URL-ami, datą pobrania, sha256 i liczbą wierszy plików, kolumnami z jednostkami oraz uwagami.
Pobrane pliki to dane, a nie kod: nie wolno ich wykonywać.

| Źródło (`source_id`) | Katalog | Co zawiera | Jednostki | Status |
|---|---|---|---|---|
| `osdr_osd569`, `osdr_osd575`, `mendeley_bp` | `nasa/` | Inspiration4: CBC, CMP, panel kardio, cytokiny; ciśnienie krwi z 75 badań | patrz pliki `*_dictionary` | ✅ (ręcznie, poza skryptem) |
| `noaa_swpc` | `env/noaa_swpc/` | Protony GOES (≥1/5/10/30/50/60/100/500 MeV, okno 7 dni, co 5 min), skale NOAA R/S/G, alerty | strumień: pfu (cm⁻² s⁻¹ sr⁻¹) | ✅ dane na żywo; `goes_integral_protons.csv` dokleja nowe dane przy każdym uruchomieniu |
| `cdaweb_msl_rad` | `env/cdaweb_msl_rad/` | Curiosity RAD: dawka na powierzchni Marsa, surowe pliki miesięczne + `msl_rad_daily.csv` (średnie dzienne) | µGy/dzień (dawka pochłonięta; Si: B i B z korektą MMRTG; plastik tkankopodobny: E) | ✅ 2012-08 → dziś, z przerwami |
| `osdr_radlab` | `env/osdr_radlab/` | ISS DOSTEL1/2 (Columbus): dzienne agregaty dawki (`radlab_dostel_daily.csv`) | µGy/h (moc dawki pochłoniętej, Si), szacunek µGy/dzień | ✅ 2009 → 2024, z przerwami; surowe dane (~90 MB/rok) nie są zapisywane |
| `osdr_eda` | `env/osdr_eda/` | Telemetria misji RR/APEX/VEG: T, RH, CO2 (ISS i kontrola naziemna), dzienne dawki GCR/SAA | °C, % RH, ppm; mGy/dzień (w wodzie), skumulowana: mGy | ✅ 20 misji z telemetrią (2014–2024), 11 z dawkami |
| `lsda_mr035g` | `lsda/mr035g/` | MR035G DXA w bed rest: tylko pliki zbiorcze (kampania 1, C3A/C3B „All”, MEDES „ALL”) | BMD g/cm², BMC g, pole cm², masy g, T/Z-score (SD); jednostek nie podano w plikach, konwencja Hologic | ✅ 49 CSV + 2 ReadMe; pliki pojedynczych osób (C3C–C3H, AG pilot) pominięte |
| `lsda_e066_178066` | `lsda/e066_178066/` | E066 (STS-40/58) **per osoba**: spoczynkowe HR, BP (tekst „SBP/DBP”), MAP, rzut serca, SV, FRC; 6 osób × {przed lotem pionowo, w locie, przed lotem leżąco} + tabela nachyleń regresji | HR ud/min, BP/MAP mmHg, Q L/min, SV mL, FRC L | ✅ **nadaje się do `observation`** (dzień lotu nieznany) |
| `lsda_dso467` | `lsda/dso467/` | DSO 467 baroreflex: SBP/DBP, R-R, HR, waga – średnie ± SE grup (n=11–12), pre / R+0 / R+2 / R+3 / R+8–10 | mmHg, ms, ud/min, kg | ✅ tylko agregaty; wiersz „Maximum slope” w `_5` to błędna kopia wagi |
| `lsda_dso503s` | `lsda/dso503s/` | DSO 503S midodryna: PDF manuskryptu (Tabela I: HR/SBP/DBP n=5, L-10 i R+0, leżąco/tilt) | ud/min, mmHg | ⚠️ dane per osoba tylko jako wykresy TIF (niepobrane) |
| `lsda_mir18_3_1_1` | `lsda/mir18_3_1_1/` | 3.1.1 LBNP (Mir 18/STS-71): harmonogram sesji (xls) + 7 raportów PDF | – | ⚠️ brak liczb per osoba (wykresy uśrednione) |
| `lsda_neemo_actiwatch` | `lsda/neemo_actiwatch/` | NEEMO 5 aktygrafia: tylko harmonogram MD1–MD14 (2003-06-16..29), 4 osoby | – | ⚠️ wyniki snu tylko jako wykresy TIF |
| `lsda_lmlstp3_4` | `lsda/lmlstp3_4/` | LMLSTP 3.4 sen w komorze: średnie ± SEM (n=8) czas, efektywność, latencja, WASO, wybudzenia; baseline vs komora + harmonogramy | h, %, liczba | ✅ tylko agregaty |
| `lsda_lsah_v11_1`, `lsda_lsah_v7_2_2` | `lsda/lsah_v11_1/`, `lsda/lsah_v7_2_2/` | LSAH: średnie wg grup wieku (BMI, % tłuszczu, VO2max, HRmax; SBP/DBP, LDL, słuch) astronauci vs grupa porównawcza | mmHg; reszta w większości bez jednostek w plikach | ✅ tylko agregaty (krzywe referencyjne) |
| `lsda_ar_card3_284080`, `lsda_dso465`, `lsda_dso470`, `lsda_dso331`, `lsda_lsah_v8_1_2` | `lsda/<slug>/` | Tylko metadane: brak plików (AR-CARD3, DSO 331, LSAH 8.1.2), jedyny plik to wykres (DSO 465) lub pusta strona tytułowa PDF (DSO 470) | – | ❌ brak danych liczbowych |

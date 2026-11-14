# MOTHER → UI: karty narządów (kontrakt v1.1)

**Jedno zdanie:** dla każdej osoby MOTHER zwraca **10 kart**. Każda karta ma **1 kolor, 1 zdanie i maks. 3 liczby**. UI nie musi znać bazy danych ani żadnych wzorów.

Podgląd na żywo: uruchom MOTHER (`start.bat`) i aplikację `GUI/`; surowy JSON: **http://localhost:8000/api/organs/HAB-C4?sol=142**.

## 3 adresy, więcej nie trzeba

| Adres | Do czego w UI |
|---|---|
| `GET /api/subjects` | lista osób do wyboru (`code`, `label`, `mission`, `synthetic`) |
| `GET /api/organs` | siatka załogi: każda osoba × 10 statusów (do ekranu „cała załoga”) |
| `GET /api/organs/{code}` | 10 kart jednej osoby (główny ekran). Opcjonalnie `?sol=253` (habitat na Marsie) albo `?day=51` (misja ISS) |

## Kształt odpowiedzi `GET /api/organs/{code}`

```json
{
  "schema_version": "1.1",
  "subject": { "code": "HAB-C2", "label": "Habitat crew C2", "data_kind": "synthetic" },
  "as_of": { "sol": 253 },
  "devices": [
    { "limb": "right_arm", "state": "disconnected", "battery_pct": 3, "status": "alert", "message": "right arm band: disconnected" }
  ],
  "overall_status": "caution",
  "top_message": "Stone risk: urine volume 0.58 L/d (< 2.5).",
  "organs": [
    {
      "organ": "kidneys",
      "label": "Kidneys & urine",
      "status": "caution",
      "headline": "Stone risk: urine volume 0.58 L/d (< 2.5).",
      "metrics": [
        { "name": "Kidney stone risk (24-h urine)", "value": 1, "unit": "risk factors", "status": "caution" },
        { "name": "Hydration", "value": 1.03, "unit": "SG", "status": "caution" }
      ],
      "why": "count of: Ca >250 mg/d, oxalate >40 mg/d, citrate <320 mg/d, volume <2.5 L/d · AUA 2014 kidney stone guideline",
      "action": "Drink to ≥2.5 L urine/day; keep resistive exercise (limits bone calcium loss)."
    }
  ]
}
```

Tablica `organs` ma **zawsze 10 elementów w tej samej kolejności**, nawet gdy dla danego narządu nie ma danych (wtedy `status: "no_data"`). Pole `checks` (pełne szczegóły z wzorami) jest opcjonalne i UI może je ignorować.

## Co pokazać (i niczego więcej nie potrzeba)

| Pole | Gdzie w UI |
|---|---|
| `organ` | który region sylwetki pokolorować (tabela niżej) |
| `status` | kolor: `ok` zielony · `caution` żółty · `alert` czerwony · `no_data` szary |
| `headline` | jedno zdanie na karcie lub w dymku po najechaniu na region |
| `metrics` (0–3) | małe liczby pod zdaniem |
| `action` | przycisk lub tekst „co zrobić” (tylko gdy status ≠ ok) |
| `why` | po kliknięciu „Dlaczego?” (wzór + źródło) |
| `overall_status`, `top_message` | pasek u góry ekranu osoby |
| `devices` | mała lista opasek z problemem (bateria, rozłączona, awaria). To nie narząd: nie zmienia koloru sylwetki |

## 10 kodów narządów → region sylwetki

| `organ` | Na sylwetce | Co MOTHER tam liczy (prawdziwe wzory) |
|---|---|---|
| `brain` | głowa | jakość snu z opaski EEG (sprawność snu, 7 nocy), nastrój |
| `eyes` | oczy | *brak danych (potrzeba: ostrość wzroku, dno oka, ciśnienie w oku)* |
| `heart` | serce | potas (ryzyko arytmii, ERC 2021), wskaźnik wstrząsu HR/SBP, średnie ciśnienie tętnicze |
| `lungs` | płuca | SpO2 |
| `blood` | ramię / kropla krwi | hemoglobina (anemia, WHO), leukocyty, limfocyty (wskaźnik promieniowania), sód, wapń skorygowany (Payne), luka anionowa |
| `kidneys` | nerki | eGFR (CKD-EPI 2021), ostre uszkodzenie nerek (KDIGO), BUN/kreatynina, ryzyko kamieni z moczu dobowego (AUA), nawodnienie, albumina w moczu, infekcja z paska |
| `gut` | brzuch | glukoza, enzymy wątrobowe, ketony i glukoza w moczu, skala Bristol |
| `musculoskeletal` | nogi / kości | VO2max i siła jako % wartości sprzed lotu (NASA ≥80%) |
| `limbs` | 4 kończyny | krążenie w każdej kończynie: perfuzja, tętno i SpO2 z 4 opasek porównane z pozostałymi kończynami (dane `astro_wearables`); zespół zmiażdżenia |
| `exposure` | ikona otoczenia | dawka osobista vs limit NASA 600 mSv, CO2 w strefie, w której ta osoba mieszka |

## Minimalna integracja (pseudokod)

```js
const card = await (await fetch(`/api/organs/${code}`)).json();   // GUI: same origin (nginx/Vite proxy -> MOTHER)
for (const o of card.organs) {
  bodyRegion(o.organ).color = {ok: "green", caution: "yellow", alert: "red", no_data: "grey"}[o.status];
  bodyRegion(o.organ).tooltip = o.headline;
}
topBar.text = card.top_message;
```

## Zasady

- Kontrakt się nie zmienia: nowe badania w bazie pojawią się jako kolejne `metrics`/`checks`, a nie nowe pola. Wersja 1.1 dodała tylko listę `devices`.
- Przykład z bazy: `GET /api/organs/HAB-C4?sol=142` daje kartę `limbs` = `alert` („Left leg: blood flow 25% of the other limbs”), scenariusz W1.
- `data_kind: "synthetic"` oznacza dane syntetyczne i trzeba je tak oznaczyć na ekranie.
- To demo edukacyjne, nie porada medyczna.

---

# MOTHER → UI: habitat (kontrakt 1.0)

`GET /api/habitat` zwraca wszystkie strefy habitatu z pomiarami z jednego sola. Opcjonalnie `?sol=142`; bez parametru jest to ostatni sol z danymi.

```json
{
  "schema_version": "1.0",
  "habitat": { "code": "MARS-LT-ELYSIUM", "name": "...", "atm_pressure_kpa": 56.5, "atm_o2_fraction_pct": 34.0,
               "atm_ppo2_inspired_mmhg": 128.0, "mission_sols": 600, "crew_capacity": 4, "data_kind": "synthetic" },
  "as_of": { "sol": 142, "latest_sol": 600, "from_utc": "...Z", "to_utc": "...Z", "last_reading_utc": "...Z" },
  "overall_status": "alert",
  "zones": [
    { "code": "module_M1", "label": "...", "type": "module", "module_id": "M1", "pressurized": true,
      "status": "alert", "now_status": "ok", "occupants": ["C1", "C2"],
      "readings": [
        { "channel": "ppco2", "label": "CO2 partial pressure", "category": "air", "unit": "mmHg",
          "value": 2.279, "text": null, "ts_utc": "...Z", "min": 1.61, "max": 7.737,
          "normal_min": 1.5, "normal_max": 2.5, "outside_normal": false,
          "status": "ok", "worst_status": "alert", "quality": "ok", "source_flag": "simulated",
          "sensors": { "A": 2.21, "B": 2.35 } }
      ] }
  ],
  "events": [ { "code": "evt-000483", "type": "scrubber_fault", "start_utc": "...Z", "end_utc": "...Z",
                "sol": 142, "zone": "module_M1", "crew": null, "severity": "major", "source_flag": "simulated" } ]
}
```

| Pole | Znaczenie |
|---|---|
| `value` / `text` | ostatni odczyt w tym solu (liczba albo wartość słowna, np. `leak`, `ok`); przy czujnikach A/B średnia, a oba odczyty są w `sensors` |
| `min`, `max` | skrajne wartości w tym solu |
| `status` | ocena ostatniego odczytu: `ok` · `caution` · `alert` · `unrated` (kanał bez progu i bez zakresu normy) |
| `worst_status` | najgorsza ocena w całym solu (awaria, która minęła, nadal oznacza strefę) |
| `outside_normal` | ostatni odczyt poza zakresem normy; dla kanałów informacyjnych (światło, otoczenie, moc) nie podnosi statusu |
| `quality` | `ok` · `suspect` · `sensor_fault` (stan czujnika, nie zdrowia) |
| strefa `status` / `now_status` | najgorszy `worst_status` / `status` jej pomiarów; `no_data`, gdy strefa nie ma pomiarów |
| `occupants` | kody załogi (`C1`…) w strefie w chwili ostatniego odczytu sola |

Zasady oceny: najpierw progi z `astro_habitat.channel_limit` (tylko chwilowe: `value` albo średnia do 1 h), potem zakres normy kanału. Progi na długich średnich, trendach i stosunkach do tła liczy analityka MOTHER, nie ten endpoint. Kanały przypisane do osób (mocz, dawka osobista) są w kartach narządów, nie tutaj.


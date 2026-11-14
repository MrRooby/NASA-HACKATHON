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

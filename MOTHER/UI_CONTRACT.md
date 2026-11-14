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

# Testy poznawcze: `/api/cognitive/*` (kontrakt v1.2)

Pełna specyfikacja: `config/cognitive/CONTRACT.md`. Wynik to **wskaźnik wydajności względem własnego baseline'u, nie diagnoza** (stały `disclaimer` w odpowiedzi). Wszystkie odpowiedzi mają `Cache-Control: no-store`, a `NaN` jest zamieniane na `null`.

| Adres | Opis | Kody |
|---|---|---|
| `GET /api/cognitive/protocols` | tabela protokołów (parametry, wersje, reguły statusów); GUI trzyma też kopię offline | 200 |
| `GET /api/cognitive/{subject}` | raport: zawsze 3 testy w kolejności `pvt`, `gonogo`, `dsst` | 200, 404 nieznana osoba, 503 baza |
| `POST /api/cognitive/sessions` | zapis jednej sesji (nagłówek `X-Requested-With: awernasa`, body do 1 MB) | 201 nowa, 200 ten sam `client_session_uuid`, 403, 413, 404, 422, 503 |

Raport (`GET`): `{schema_version: "cog-1.0", subject, disclaimer, tests: [{test_id, label, status: ok|caution|alert|no_data, headline, baseline: {n, needed, ready}, latest: {session_id, started_at, session_no, quality, metrics, z, pct_change} | null, trend: [{started_at, value}] (ostatnie 12), next: {session_no, stimulus_set}}], composite_z}`.

Zasady statusów (najgorsza reguła wygrywa; `no_data` i „Building your baseline (n/3).” do 3 sesji):

| Test | Reguła | ok | caution | alert |
|---|---|---|---|---|
| PVT | % zmiany mediany RT vs baseline | <10 | 10–20 | ≥20 |
| PVT | `pvt_lapses` | 0–2 | 3–5 | ≥6 |
| Go/No-Go | `gonogo_commission_rate` | <0,15 | 0,15–0,30 | ≥0,30 |
| DSST | z wydajności `dsst_throughput_per_min` | ≥ −1 | (−2, −1) | ≤ −2 |

Baseline: pierwsze 3–5 sesji `is_practice=0`, `complete`, `quality=ok`, ten sam `device_class`. Pierwsza sesja osoby w danym teście jest zawsze treningowa (serwer wymusza `is_practice=1`). `composite_z` to średnia z z trzech testów, `null` dopóki wszystkie trzy nie mają baseline'u.

`POST`: serwer sam liczy metryki z prób (`cognitive_scoring`), a metryki klienta tylko porównuje (rozbieżność >1% zapisuje jako zdarzenie `scoring_mismatch`). Walidacja 422: nieznany `test_id` / `protocol_version`, `event_type` spoza testu, `rt_ms` poza 0–30000, zdublowane `idx`, >400 prób, >500 zdarzeń, `started_at` >5 min w przyszłości lub >30 dni wstecz, skale kontekstu poza zakresem, `duration_s` poza zakresem (PVT 150–240, DSST 85–95). 404: nieznana osoba albo brak udziału w misji. 503: brak `COGNITIVE_DB_USER`/`PASSWORD` albo baza niedostępna (pole `hint`). Odpowiedź: `{session_id, client_session_uuid, duplicate, test_id, status, quality, is_practice, metrics, scoring_version}`.

Wpływ na karty narządów: karta `brain` dostaje (gdy baza ma dane) sprawdzenia: czas reakcji vs własny baseline, `pvt_lapses`, błędne reakcje Go/No-Go, szybkość DSST. Kontrakt kart się nie zmienia (nadal maks. 3 liczby na kartę).

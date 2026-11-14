# Analiza danych NASA NLSP dla projektu monitorowania zdrowia astronautów

Data sprawdzenia: **2026-11-14**  
Rekord wejściowy: [Bone Densitometry Assessment (Flight Analog)](https://nlsp.nasa.gov/explore/data/details/4469ebdc-0a65-55e8-bbff-3cf6b044c4c6?dataType=EXPERIMENTS)  
Id rekordu: `4469ebdc-0a65-55e8-bbff-3cf6b044c4c6`

## 1. Najważniejszy wniosek

Wskazany rekord jest bardzo dobrym źródłem do modułu **kości / skład ciała**, ale nie jest bazą danych z pomiarami astronautów w locie. To zakończone, naziemne badanie analogowe długotrwałego odciążenia organizmu podczas bed rest.

NLSP deklaruje dla rekordu:

- `Data preservation is complete`
- `All datasets are publicly available`
- gatunek: *Homo sapiens*
- typy badania: Flight Analogs Project, NASA Bedrest Studies, Artificial Gravity oraz NASA Ground-Based Investigations
- ośrodek: NASA JSC; badania wykonywane w UTMB / John Sealy Hospital
- identyfikatory: `MR035G`, `MR035L`, `MEDB 1.11`
- kampanie/payloady: `DBLS`, `Campaign 5`, `Pilot`, `Campaign 3`, `Campaign 1`, `WISE`
- DOI rekordu: `10.83263/7myc-5j86`

W samym rekordzie nie ma jednak liczby osób, liczby skanów ani rozmiaru plików. Przed importem trzeba pobrać listę plików/datasetów z interfejsu NLSP i sprawdzić ich format oraz liczbę wierszy.

## 2. Jakie dane zawiera wskazany rekord

### 2.1. Densytometria kości

Badanie używało DXA, a później iDXA. Mierzono:

- całe ciało,
- kręgosłup lędźwiowy,
- bliższe odcinki kości udowych / biodra,
- piętę (calcaneus),
- przedramię / promień i kość łokciową.

Rekord wymienia następujące parametry:

- bone mineral density (BMD) calcaneus,
- BMD forearm,
- BMD left/right trochanter,
- BMD lumbar spine,
- BMD right femoral neck,
- T-score i Z-score dla przedramienia, kręgosłupa, krętarza i szyjki kości udowej.

To pozwala zbudować dane pod:

- wartość bazową przed odciążeniem,
- zmianę BMD w trakcie bed rest,
- odzyskiwanie BMD po zakończeniu,
- porównanie regionów kości o różnej wrażliwości,
- trend i tempo utraty kości.

### 2.2. Skład ciała

Wymienione są pomiary:

- fat mass dla lewej i prawej ręki oraz nogi,
- lean body mass dla lewej i prawej ręki oraz nogi.

To jest przydatne jako uzupełnienie BMD: można analizować jednocześnie utratę mineralizacji i zmianę masy beztłuszczowej / tłuszczowej.

### 2.3. Biomarkery kości i wapnia

Opis badania mówi, że wyniki BMD uzupełniały ocenę markerów metabolizmu kości i wapnia. Rekord nie pokazuje jednak wprost nazw ani wartości tych biomarkerów w polu `parameter_name`. Nie należy zakładać, że są dostępne w plikach bez sprawdzenia datasetów.

Jeżeli są dostępne, priorytetowo szukamy:

- markerów resorpcji kości,
- markerów tworzenia kości,
- wapnia, fosforu i witaminy D,
- PTH,
- markerów nerkowych związanych z ryzykiem kamieni.

### 2.4. Punkty czasowe

Opis podaje, że:

- skany przed i w trakcie bed rest wykonywano w triplikacie,
- badania kontrolne wykonywano po 6 i 12 miesiącach jako pojedyncze skany,
- całe badanie pojedynczego skanu trwało około dwóch godzin.

To daje wartościowy układ longitudinalny, ale dokładne etykiety czasu, daty i kodów osób muszą zostać odczytane z plików.

## 3. Ocena przydatności dla naszego projektu

| Obszar | Ocena | Zastosowanie |
|---|---:|---|
| BMD kości | **bardzo wysoka** | baseline, trend utraty i odzysku kości |
| Biodro / kręgosłup / szyjka kości udowej | **bardzo wysoka** | wskaźniki ryzyka złamania i porównanie regionów |
| Skład ciała | **wysoka** | lean mass / fat mass jako kontekst utraty kości |
| Biomarkery kości | **potencjalnie wysoka** | tylko po potwierdzeniu obecności w plikach |
| Parametry życiowe HR/BP | brak w tym rekordzie | nie używać jako źródła HR/BP |
| Krew: CBC/CMP/cytokiny | brak w tym rekordzie | użyć OSDR Inspiration4 |
| Dane z wearables | brak w tym rekordzie | nie traktować jako źródła ciągłych pomiarów |
| Dane środowiskowe | brak w tym rekordzie | użyć OSDR EDA, RadLab i NOAA |

Najważniejsze ograniczenie: bed rest jest analogiem mikrograwitacji, a nie lotem kosmicznym. Dane są bardzo dobre do modelowania odciążenia szkieletu i countermeasures, ale nie powinny być opisane w aplikacji jako bezpośrednie pomiary astronautów z ISS.

## 4. Co pobrać z NLSP w pierwszej kolejności

### Priorytet A — gotowe do modelowania

1. Tabela BMD wraz z kodem osoby, regionem kości, jednostką i punktem czasowym.
2. T-score i Z-score.
3. Daty / etykiety `pre`, `in-bed-rest`, `6-month follow-up`, `12-month follow-up`.
4. Dane triplikatów, bez uśredniania przed zachowaniem surowych obserwacji.
5. Informacja o kampanii: `DBLS`, `WISE`, `Campaign 1/3/5`, `Pilot`.

### Priorytet B — skład ciała

1. Lean body mass per kończyna i strona ciała.
2. Fat mass per kończyna i strona ciała.
3. Whole-body composition, jeśli występuje w plikach.

### Priorytet C — metabolizm kości

1. Wszystkie kolumny zawierające `bone`, `calcium`, `resorption`, `formation`, `vitamin D`, `PTH`.
2. Jednostki i zakresy referencyjne.
3. Powiązanie biomarkera z tym samym `subject_code` i punktem czasowym co DXA.

## 5. Jak duży może być zbiór

Na podstawie metadanych można potwierdzić wiele kampanii, wiele regionów anatomicznych i powtórzenia pomiarów, ale nie można uczciwie podać liczby rekordów bez pobrania plików. Nie znaleziono w publicznym rekordzie pól `n_subjects`, `n_rows` ani rozmiaru plików.

Szacunek strukturalny (nie liczebność osób):

```text
osoba × kampania × punkt czasowy × region kości × powtórzenie
```

Dlatego zbiór może być znacznie większy niż pojedyncza tabela z kilkoma średnimi, ale jego wartość zależy od tego, czy NLSP udostępnia obserwacje indywidualne, czy tylko raporty zagregowane.

## 6. Inne duże lub szczególnie użyteczne dane w NLSP/LSDA

Portal NLSP obejmuje dane od programu Mercury z 1961 r. po ISS i analogi naziemne. W kontekście naszego projektu należy wyszukiwać rekordy po następujących słowach kluczowych:

### Kości, mięśnie i skład ciała

- `bone density`
- `bone mineral density`
- `densitometry`
- `DXA`, `iDXA`, `QCT`
- `bone calcium`
- `bone metabolism`
- `bed rest`
- `muscle`
- `lean body mass`
- `body composition`

### Krew i biomedycyna

- `hematology`
- `blood`
- `CBC`
- `metabolism`
- `glucose`
- `cytokine`
- `immunology`
- `inflammation`
- `endocrinology`
- `biospecimen`

### Dane przydatne do monitoringu astronauty

- `cardiovascular`
- `blood pressure`
- `heart rate`
- `sleep`
- `actiwatch`
- `chronobiology`
- `cognition`
- `physiology`
- `microbiology`
- `radiation`

Największą wartość dla demo będą miały rekordy, które jednocześnie mają:

1. ludzi jako subjectów,
2. pomiary indywidualne zamiast samych średnich,
3. co najmniej dwa punkty czasowe,
4. kod osoby możliwy do pseudonimizacji,
5. jednostkę i metodę pomiaru,
6. publiczny status plików,
7. dane surowe lub półsurowe możliwe do importu CSV.

## 7. Dostępność danych — klasyfikacja

### Publiczne i możliwe do użycia

Rekord wskazany w tym raporcie ma status `All datasets are publicly available`. Oznacza to, że powinien być pierwszym kandydatem do pobrania i testów ETL, po potwierdzeniu plików w UI.

W projekcie mamy już dodatkowo publiczne dane:

- Inspiration4 CBC — morfologia,
- Inspiration4 CMP — panel metaboliczny,
- Inspiration4 cardio/inflammation — między innymi CRP,
- Inspiration4 cytokines — panel cytokin,
- Mendeley blood pressure — dane kohortowe do kalibracji syntetycznego BP,
- Curiosity RAD — szereg dawki promieniowania,
- ISS RadLab / EDA — środowisko i promieniowanie,
- NOAA SWPC — protony i alerty pogody kosmicznej.

Szczegóły tych źródeł są w [DATA_SOURCES.md](DATA_SOURCES.md).

### Publiczne metadane, ale dane mogą wymagać wniosku

W NLSP/LSDA występują również rekordy, dla których publiczny jest opis badania, lista parametrów lub informacja o archiwum, ale niekoniecznie pliki z obserwacjami. Nie wolno oznaczać ich jako `public_data` tylko na podstawie samego istnienia rekordu.

W bazie warto rozróżniać:

- `metadata_public`,
- `files_public`,
- `request_required`,
- `access_status_unknown`.

### Dane syntetyczne

HR, BP, sen, nastrój i część serii wearable nadal powinny być generowane syntetycznie, jeśli nie ma publicznych obserwacji per astronauta. Każdy taki rekord musi mieć `is_synthetic=1` i opis kalibracji.

## 8. Proponowany import do naszego schematu

Dla danych z tego rekordu proponowany adapter: `nlsp_dxa` albo `nlsp_bone`.

Minimalne mapowanie:

| Pole kanoniczne | Źródło |
|---|---|
| `source_id` | `nlsp_mr035g_mr035l` |
| `subject_code` | kod osoby z pliku; nie używać nazwiska |
| `mission_code` | `DBLS`, `WISE` albo kod kampanii |
| `indicator_code` | np. `bone_mineral_density_lumbar_spine` |
| `timepoint_label` | etykieta z pliku |
| `phase` | `pre`, `in`, `post` albo `follow_up` |
| `value` | BMD / T-score / Z-score / masa |
| `unit` | jednostka z pliku, bez zgadywania |
| `sample_type` | `dxa_scan` / `idxa_scan` |
| `is_synthetic` | `0` |
| `raw_name`, `raw_value`, `raw_unit` | zachować bez zmian |

Nie należy zapisywać nazwisk badanych. Nazwiska badaczy mogą pozostać wyłącznie w metadanych źródła, nie w tabeli `subject`.

## 9. Walidacja przed użyciem w dashboardzie

Przed dodaniem danych do aplikacji trzeba sprawdzić:

- czy pliki zawierają indywidualne obserwacje, a nie wyłącznie średnie,
- czy powtórzenia triplikatów mają osobny identyfikator,
- czy `BMD` ma jednoznaczną jednostkę,
- czy lewa i prawa strona ciała są rozróżnione,
- czy kręgosłup, biodro, szyjka kości udowej i pięta są osobnymi regionami,
- czy punkty po 6 i 12 miesiącach są powiązane z tą samą osobą,
- czy braki i wartości nieoznaczone nie są zamieniane na zero,
- czy kampania i protokół nie są mylone z fazą pomiaru,
- czy rekord ma zgodną liczbę obserwacji po ponownym imporcie.

## 10. Rekomendacja dla demo

Najlepszy zestaw danych do pokazania wartości projektu:

1. **NLSP MR035G/MR035L** — prawdziwy trend BMD i składu ciała z bed rest.
2. **OSDR Inspiration4 CBC/CMP** — prawdziwe badania krwi czterech pseudonimowych osób.
3. **OSDR cardio/cytokines** — rozszerzenie o stan zapalny i odporność.
4. **Dane syntetyczne** — codzienny HR, BP, sen i nastrój, wyraźnie oznaczone jako `synthetic`.
5. **Curiosity RAD / ISS RadLab / NOAA** — środowisko promieniowania i alerty niezależne od danych osobowych.

W ten sposób dashboard ma zarówno dużą liczbę obserwacji biomedycznych, jak i wiarygodne serie środowiskowe, bez sugerowania, że publiczne dane zawierają ciągłe parametry życiowe konkretnych astronautów.

## 11. Publikacje o analizie krwi i predykcji stanu zdrowia

Poniższe artykuły są przydatne jako uzasadnienie wyboru wskaźników i metod w dashboardzie. Nie należy traktować ich progów jako norm dla astronautów bez walidacji na odpowiedniej populacji.

### 11.1. Publikacje bezpośrednio związane z lotami kosmicznymi

| Publikacja | Co analizowano | Wniosek przydatny dla projektu | Ograniczenia |
|---|---|---|---|
| [Trudel et al. 2022, *Nature Medicine*, DOI: 10.1038/s41591-021-01637-7](https://doi.org/10.1038/s41591-021-01637-7) | Hemoglobina, liczba erytrocytów i markery hemolizy podczas długich misji | Wzrost hemolizy i tzw. space anemia uzasadnia śledzenie trendu RBC, HGB, HCT oraz budowę alertu o zmianie względem baseline'u | Mała kohorta lotów; wynik opisuje zjawisko populacyjne, a nie samodzielny test diagnostyczny |
| [Paul et al. 2020, *Frontiers in Immunology*, DOI: 10.3389/fimmu.2020.564950](https://doi.org/10.3389/fimmu.2020.564950) | Neutrophil-to-lymphocyte ratio (NLR) jako wskaźnik odpowiedzi immunologicznej astronautów | NLR można obliczyć z CBC: `neutrophils / lymphocytes`; nadaje się do trendu odporności i sygnału ostrzegawczego, nie do rozpoznania choroby | Przegląd i dane kosmiczne są ograniczone; NLR jest nieswoisty i zależny od infekcji, stresu oraz leków |
| [Bonnefoy et al. 2022, *Frontiers in Physiology*, PMCID: PMC9606754](https://pmc.ncbi.nlm.nih.gov/articles/PMC9606754/) | NLR i platelet-to-lymphocyte ratio (PLR) w długotrwałym bed rest jako analogii lotu | Jednoczesny trend NLR + PLR może rozszerzyć monitoring immunologiczny, gdy nie ma pełnego panelu cytokin | Bed rest nie jest lotem; liczebność i protokół nie uzasadniają uniwersalnych progów klinicznych |
| [Jones et al. 2024, *Nature*, DOI: 10.1038/s41586-024-07648-x](https://doi.org/10.1038/s41586-024-07648-x) | Hematologia, biochemia, cytokiny i inne profile molekularne załogi Inspiration4 | Pokazuje wartość łączenia CBC/CMP/cytokin z pomiarem przed lotem i po locie; bezpośrednio wspiera wykorzystanie danych OSDR Inspiration4 | Tylko cztery osoby i krótki lot; wyniki są eksploracyjne, nie stanowią modelu predykcyjnego dla populacji |
| [Kim et al. 2024, *Nature Communications*, DOI: 10.1038/s41467-024-49211-2](https://doi.org/10.1038/s41467-024-49211-2) | Jednokomórkowe profile immunologiczne, cfRNA, hematologia i biochemia Inspiration4 | Uzasadnia rozdzielenie prostych wskaźników CBC od zaawansowanych omik; dla demo należy użyć CBC/CMP jako warstwy operacyjnej, a omiki jako kontekstu badawczego | Metody omiczne wymagają innego pipeline'u i nie są rutynowym testem pokładowym |
| [Garrett-Bakelman et al. 2019, *Science*, PMCID: PMC7580864](https://pmc.ncbi.nlm.nih.gov/articles/PMC7580864/) | Wielopoziomowe dane Twins Study, w tym krew, immunologia i fizjologia | Wspiera analizę wielowymiarową oraz porównanie intra-individual: astronauta względem własnego baseline'u | Jedna para bliźniąt; nie wolno ekstrapolować efektów na wszystkich astronautów |

### 11.2. Publikacje o predykcji z rutynowych badań krwi

| Publikacja | Zadanie predykcyjne | Co można przenieść do aplikacji | Ograniczenia |
|---|---|---|---|
| [Kim et al. 2022, *BMC Infectious Diseases*, DOI: 10.1186/s12879-022-07223-7](https://doi.org/10.1186/s12879-022-07223-7) | Wykrywanie bakteriemii z CBC i rozmazu z użyciem machine learning; porównanie z CRP i prokalcytoniną | Pokazuje, że połączenie wielu parametrów CBC i markerów zapalenia może wspierać klasyfikację ryzyka; w demo można pokazać wynik jako `screening signal`, nie diagnozę | Wynik dotyczy pacjentów z podejrzeniem infekcji, nie zdrowych astronautów; potrzebna jest walidacja i kalibracja |
| [Ou et al. 2025, *Cardiovascular Diabetology*, DOI: 10.1186/s12933-025-02848-9](https://doi.org/10.1186/s12933-025-02848-9) | Prospektywna ocena ryzyka CVD i śmiertelności z użyciem CRP, glukozy i triglicerydów | Uzasadnia łączenie CRP z markerami metabolicznymi zamiast oceniania pojedynczego analitu; w projekcie można budować wskaźnik trendu zapalno-metabolicznego | Kohorta populacji ogólnej i wieloletnie wyniki nie są bezpośrednio przenośne na misję kosmiczną |
| [Isaac et al. 2016, *Medicine*, DOI: 10.1097/MD.0000000000003832](https://doi.org/10.1097/MD.0000000000003832) | NLR jako predyktor śmiertelności u pacjentów z wieloma chorobami przewlekłymi | Jest dodatkowym uzasadnieniem dla obliczania NLR z CBC i prezentowania go jako cechy wejściowej modelu | Ciężkość chorób i populacja szpitalna powodują silne confounding; nie jest to próg dla astronautów |

### 11.3. Minimalny zestaw cech do naszego modelu

Z obecnych danych Inspiration4 można bezpiecznie obliczyć:

1. **CBC:** HGB, HCT, RBC, WBC, neutrofile, limfocyty, płytki, NLR i PLR.
2. **CMP:** glukozę, sód, potas, wapń, kreatyninę/eGFR, ALT, AST, ALP, bilirubinę, albuminę i białko całkowite.
3. **Stan zapalny/odporność:** CRP, fibrynogen oraz wybrane cytokiny, jeśli jednostki i granice oznaczalności są zgodne.
4. **Cechy longitudinalne:** różnicę względem własnego baseline'u, zmianę procentową, nachylenie trendu oraz liczbę kolejnych pomiarów poza zakresem referencyjnym.

Najbezpieczniejszy model demo to **wykrywanie odchylenia od baseline'u** (ok / caution / alert), a nie diagnozowanie choroby. Model predykcyjny powinien zwracać prawdopodobieństwo lub poziom ryzyka wraz z listą cech, datą pomiaru, flagą `is_synthetic` i komunikatem, że wynik wymaga oceny flight surgeona. Przy czterech osobach z Inspiration4 nie wolno trenować i raportować wiarygodności modelu jako klinicznej; dane te służą do demonstracji pipeline'u, kalibracji oraz testów integracyjnych.

## Źródła

- [Wskazany rekord NLSP — Bone Densitometry Assessment](https://nlsp.nasa.gov/explore/data/details/4469ebdc-0a65-55e8-bbff-3cf6b044c4c6?dataType=EXPERIMENTS)
- [Metadane rekordu NLSP w API](https://nlsp.nasa.gov/api/v1/data/experiments/4469ebdc-0a65-55e8-bbff-3cf6b044c4c6)
- [NASA Life Sciences Portal](https://www.nasa.gov/hrp/nlsp/)
- [NASA Life Sciences Data Archive](https://nlsp.nasa.gov/explore/lsdahome)
- [Istniejąca analiza źródeł projektu](DATA_SOURCES.md)

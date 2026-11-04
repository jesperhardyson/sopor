# Spec: Områdesval i Avesta

Status: utkast, 2026-11-04. Designen finns i `docs/design/sopor-design.pen`, ramarna med "område" och "Områdessök" i namnet.

## Bakgrund

Avesta Vatten och Avfall publicerar hämtschemat som en PDF med tio trakter, en för varje kombination av veckodag och jämn eller udda vecka. PDF:en listar orter och vissa gator per trakt, men det finns ingen publik koppling från adress till trakt. EDP-tjänsten är tom, och begäran om tabellen har inte besvarats. Se `docs/kommuner/hitta-kommunens-data.md`.

Sopor gissar inte vilken trakt en adress hör till, eftersom en felaktig gissning kan få folk att missa sin tömning. Därför väljer användaren sitt område själv.

## Mål

- En Avestabo hittar sin hämtdag utan konto och kan lägga den i kalendern.
- Det ska gå att söka på det man känner till: "Avesta tätort", "Östanfors", "Stallgatan" eller "trakt 7".
- En gatuadress utan träff i områdeslistan leder till områdesvalet, aldrig till "hittades inte".
- Sidan är tydlig med att användaren har valt området själv och varför.
- Lösningen är generell, så att andra kommuner med schema per område kan använda den.

## Utanför

- Att räkna ut område från adress, koordinater eller kartor.
- Att ta ut scheman automatiskt ur PDF:en. Datan läggs in för hand, som för andra statiska källor.
- Att ändra Homeys och Home Assistants flöden utöver en hjälptext.

## Ordval

| Sammanhang | Text |
|---|---|
| Rubriker och knappar | område |
| Det viktigaste på en rad | hämtdagen, till exempel "Tisdag, jämn vecka" |
| Etikett och sökbart ord | "Trakt 7", eftersom Avesta Vatten använder ordet i sitt schema och sina notiser |

Förklaringen är saklig och lägger inte skulden på någon:

> Avesta Vatten publicerar sophämtningen per område, men inte vilka adresser som hör till vilket område.

## Sökregler

Reglerna gäller startsidans sökning och kommunsidan för Avesta. De prövas i den här ordningen, och flera kan ge rader i samma lista.

| Sökning | Exempel | Resultat |
|---|---|---|
| Områdets namn, ort eller "trakt N" | "Avesta tätort", "Östanfors", "trakt 7" | Områdesträff |
| Namn som finns i flera områden | "Backa" | En träff per område, med raden "Backa ingår i området" |
| Gata som står i ett områdes lista, med eller utan nummer och plats | "Stallgatan", "Stallgatan 5", "Stallgatan 5, Avesta" | Områdesträff |
| Gata i ett områdes lista med en annan plats | "Stallgatan 5, Stockholm" | Ingen rad för Avesta |
| Annan känd gata i Avesta, hel gata eller med nummer | "Kungsgatan", "Kungsgatan 12" | Raden "Välj område i Avesta". Finns områdesträffar visas i stället raden "Se alla områden i Avesta" under dem. |
| Okänd gata med Avesta som plats | "Okändgatan 3, Avesta" | Raden "Välj område i Avesta" |
| Halvskrivet ord på startsidan | "Kungsg", "stor" | Ingen rad för Avesta, tills ordet är helt |
| Början av ord på kommunsidan, i filtret på Välj område och i API:t med `kalla=avesta` | "östan" | Områdesträff |
| Gata som inte finns i Avesta | "Hornsgatan 1" | Som i dag |

- På startsidan och i `/api/v1/sok` utan `kalla` måste varje ord i frågan vara ett helt ord i områdets namn eller sökord. Början av ett ord räcker bara när sökningen gäller just källan. Vanliga adresser påverkas inte.
- "Känd gata" avgörs med det befintliga gatuindexet från OpenStreetMap (`data/osm/2084.json`). `candidateSources` matchar början av namn, så regeln behöver en exakt jämförelse av gatudelen från `splitPlace`.
- Gatuindexet är inte komplett. Saknas gatan blir resultatet som för en gata utanför Avesta, om inte frågan nämner Avesta. "Hittades inte"-rutan får därför alltid en länk till områdesvalet när sökningen är avgränsad till Avesta.
- Andra kommuners träffar visas under sina egna rubriker som vanligt.
- Enter öppnar den enda träffen. Är "Välj område i Avesta" enda raden öppnas områdesvalet.
- Husnummer och bokstav påverkar inte vilket område som visas. Områdeslistan innehåller inga nummer.

## Skärmar

- **Välj område** (`/avesta/omraden`, så `omraden` får aldrig användas som adress-id): förklaringen, filterfält, genvägen "Vet du inte vilket område?", alla tio områden och kundtjänstens telefonnummer.
- **Hitta område** (ark): användaren anger senaste tömningen och får det område som hade hämtning den dagen.
  - **Kontroll:** arket visar områdets två senaste tömningar och nästa, och påminner om att en försenad tömning kan ge fel område.
  - **Ingen hämtning den dagen:** "Inget område har hämtning den dagen", med en länk till listan.
  - **Datum utanför schemat:** samma ruta, men med texten att schemat för den perioden saknas.
- **Resultat** (`/avesta/trakt-7`): samma sida som för en adress, med dessa skillnader:
  - Rubriken är områdets namn, och "Byt adress" blir "Byt område".
  - Rutan "Du har valt området själv" visar förklaringen, vad som ingår och gator med en annan hämtdag.
  - "Mina kärl" visas inte, eftersom PDF:en inte anger kärlens storlek.
  - Datumen märks inte som beräknade.
  - Arket för att spara heter "Spara område".

## Datamodell

Regel 1 i `AGENTS.md` gäller: UI:t vet bara att det finns områden, inte att de kallas trakter. Ordet "Trakt 7" är data.

`data/avesta/2026/omraden.json`:

```json
{
  "areas": [
    {
      "id": "trakt-7",
      "name": "Avesta tätort, Östanfors m.fl.",
      "day": "Tisdag, jämn vecka",
      "label": "Trakt 7",
      "schedule": "trakt-7",
      "places": ["Avesta tätort", "Östanfors", "Garpenbergsvägen", "Lycka"],
      "streets": ["Garpenbergsvägen"],
      "searchTerms": ["trakt 7"],
      "otherDays": ["Till exempel Stallgatan och Storbogatan (måndag, udda vecka) och Bodgatan (onsdag, jämn vecka)."]
    }
  ],
  "explanation": "Avesta Vatten publicerar sophämtningen per område, men inte vilka adresser som hör till vilket område.",
  "help": "Osäker? Fråga Avesta Vatten på 0226-64 55 00."
}
```

- `data/avesta/2026/schedules.json` ersätts med PDF:ens riktiga datum och fraktioner från 2026-09-01, och `source` anger PDF:en och dess version. Omärkta datum blir bara matavfall, enligt PDF:ens text. Tidigare datum läggs inte in, eftersom PDF:en inte visar vilka fraktioner som hämtades då.
- `omraden.json` ersätter `addresses.csv` för källor med område.
- PDF:ens förkortningar skrivs ut ("Stallg." blir "Stallgatan"). De som inte går att bekräfta i OpenStreetMap kontrolleras mot kartan för hand och behåller annars PDF:ens stavning. Vid kontrollen 2026-11-04 saknades bland annat Ryttargatan, Gammelsängsvägen, Skultbacken, Skillingränd och Konsjövägen i OSM-datan.
- `Source` får `selection?: 'address' | 'area'`, med `address` som standard.
- Byggskriptet gör ett område till en rad i `addresses.json`: `id`, `street` = områdets namn, `locality` = tom, plus de nya valfria fälten `detail` och `searchTerms`. `detail` blir "Tisdag, jämn vecka · Trakt 7".
- `WasteProvider` får de valfria metoderna `listAreas()` och `areaForDate(date)`. Sökningen använder `searchTerms` utan att de syns i svaret.

## Id och kalender

- Område-id:t följer samma regler som adress-id: `trakt-7` får aldrig ändras eller återanvändas.
- ICS-UID behåller formatet: `trakt-7-2026-11-10@sopor.hardyson.se`.
- Områdets id följer området, inte numret. Byter Avesta Vatten numrering får id:t ett nytt `label`. Delas eller slås ett område ihop får det nya området ett nytt id, och det gamla id:t ligger kvar med ett meddelande om att välja område igen.
- När en adresstabell kommer kan adresser få egna id:n som pekar på samma schema. Befintliga område-id:n ligger kvar.
- `check:ids` skulle stoppa att de påhittade adresserna i `data/avesta/2026/addresses.csv` tas bort. Vakten får ett engångsundantag för just de id:na, eftersom Avesta har varit dold.

## API och integrationer

Inga befintliga fält ändras, och inga integrationer behöver en ny version för att fortsätta fungera.

| Del | Beteende |
|---|---|
| `GET /api/v1/sok` | Hittar områden som träffar. `street` innehåller områdets namn, `locality` är tom och `detail` innehåller hämtdagen. Svaret har inga nya fält. |
| `GET /api/v1/adress/avesta/trakt-7` | Fungerar som för en adress. |
| `GET /api/v1/kallor` | Avesta visas när källan inte längre är dold. |
| `openapi.json` och dokumentationen | Får en förklaring av att en träff kan vara ett område. Kontraktstestet ska fortsätta passera. |
| Homey och Home Assistant | Hittar områden med "Avesta tätort" utan kodändring. |

En adress i Avesta som inte står i områdeslistan ger inga träffar i `/sok`. Homey och Home Assistant får därför en hjälptext när sökningen är tom: "I Avesta söker du på område, till exempel Avesta tätort." Texten släpps med respektive integrations releaseskript.

## Årsbyte

- Schemat täcker bara 2026, så funktionen släpps först när PDF:en för 2027 finns och är inlagd.
- Vid varje nytt år kontrolleras i `docs/kommuner/lagga-till-kommun.md` att områdenas innehåll, veckodagar och nummer är oförändrade innan datumen läggs in.
- Saknas nästa års schema visar sidan den befintliga tomma vyn med `emptyScheduleNote`.

## Tester

- **Domän:** områdessökning med namn, ort, gata, "trakt N", flera träffar och husnummer, samt `areaForDate` för träff, dag utan hämtning och datum utanför schemat.
- **Data:** validering av `omraden.json`, att varje `schedule` finns och att varje hämtdag hör till exakt ett område. Datumen stäms av mot PDF:en, bland annat 10, 24 november och 8, 22 december för trakt 7.
- **Sökning i UI:** varje rad i tabellen under Sökregler, inklusive Enter och kommunsidan.
- **Sidor:** Välj område, arket Hitta område och resultatsidan, med tangentbord och skärmläsare för arket.
- **API:** kontraktstest mot `openapi.json`, `/sok` med område och `/adress` och ICS för `trakt-7`.
- **Integrationer:** Homey och Home Assistant med ett område som träff, och hjälptexten vid tom sökning.
- **Testdata:** tester som läser Avestas datafiler uppdateras till riktiga data. Tester som mockar `fetch` får behålla sina påhittade id:n.

## Lansering

1. Bygg allt med Avesta dold och kontrollera på en förhandsversion.
2. Lägg in schemat för 2027 när PDF:en finns.
3. Ta bort `testData` och `hidden`, uppdatera `CLAUDE.md`, `docs/kommuner/hitta-kommunens-data.md` och kommunsidan för Avesta.
4. Släpp hjälptexten i Homey och Home Assistant.

# Spec: Områdesval i Avesta

Status: utkast, 2026-11-04. Designen finns i `docs/design/sopor-design.pen`, ramarna med "område" och "Områdessök" i namnet.

## Bakgrund

Avesta Vatten och Avfall publicerar hämtschemat som en PDF med tio trakter, en för varje kombination av veckodag och jämn eller udda vecka. PDF:en listar orter och vissa gator per trakt, men det finns ingen publik koppling från adress till trakt. EDP-tjänsten är tom, och begäran om tabellen har inte besvarats. Se `docs/kommuner/hitta-kommunens-data.md`.

Sopor gissar inte vilken trakt en adress hör till, eftersom en felaktig gissning kan få folk att missa sin tömning. Därför väljer användaren sitt område själv.

## Mål

- En Avestabo hittar sin hämtdag utan konto och kan lägga den i kalendern.
- Det ska gå att söka på det man känner till: "Avesta tätort", "Östanfors", "Stallgatan" eller "trakt 7".
- En känd gata i Avesta leder till områdesvalet, även utan ortnamn, så att den som bor där kommer rätt med bara sin adress.
- Den som bor i en annan kommun på en gata med samma namn ser sin egen kommun först.
- Sopor är öppen med vad vi inte vet, överallt där schemat visas: på sidan, i kalendern och i API:t.
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
| Gata med Avesta som plats, känd eller okänd | "Kungsgatan 12, Avesta", "Okändgatan 3, Avesta" | Raden "Kungsgatan 12 · Välj område". Finns områdesträffar visas i stället raden "Se alla områden i Avesta" under dem. |
| Annan känd gata i Avesta, hel gata eller med nummer | "Kungsgatan", "Kungsgatan 12" | Raden "Kungsgatan 12 · Välj område" under rubriken Avesta kommun, efter andra kommuners träffar |
| Gata eller adress som användaren redan valt område för i den här webbläsaren | "Kungsgatan 12" | Raden "Kungsgatan 12 · Trakt 7 · Ditt val", se Eget val |
| Halvskrivet ord på startsidan | "Kungsg", "stor" | Ingen rad för Avesta |
| Början av ord på kommunsidan, i filtret på Välj område och i API:t med `kalla=avesta` | "östan" | Områdesträff |
| Gata som inte finns i Avesta | "Hornsgatan 1" | Som i dag |

- På startsidan och i `/api/v1/sok` utan `kalla` måste varje ord i frågan vara ett helt ord i områdets namn eller sökord. Början av ett ord räcker bara när sökningen gäller just källan. Vanliga adresser påverkas inte.
- Småorden "m", "fl" och "och" går inte att söka på i områden: en fråga med bara sådana ord ger inga områden, men "Norr och Sör Nävde" träffar sitt område. Namnet visas oförändrat.
- "Känd gata" avgörs med det befintliga gatuindexet från OpenStreetMap (`data/osm/2084.json`). `candidateSources` matchar början av namn, så regeln behöver en exakt jämförelse av gatudelen från `splitPlace`.
- Gatuindexet är inte komplett. En gata som saknas där hittas bara om frågan nämner Avesta eller på kommunsidan. "Hittades inte"-rutan får därför alltid en länk till områdesvalet när sökningen är avgränsad till Avesta.
- Raden för gatan är aldrig en träff med schema, och Sopor väljer eller föreslår aldrig ett område utifrån gatunamnet.
- Andra kommuners träffar visas under sina egna rubriker, och Avestas rad för gatan ligger efter dem. Står gatan i områdeslistan är det i stället en vanlig områdesträff.
- Enter öppnar den enda träffen. Är raden för gatan enda raden öppnas områdesvalet. Finns andra träffar öppnar Enter ingenting, utan markerar första raden.
- Raden för gatan tar frågan med till områdesvalet, där gatan visas som stöd och arket Hitta område lyfts fram.
- Husnummer och bokstav påverkar inte vilket område som visas. Områdeslistan innehåller inga nummer.

## Skärmar

- **Välj område** (`/avesta/omraden`, så `omraden` får aldrig användas som adress-id): förklaringen, filterfält, genvägen "Vet du inte vilket område?", alla tio områden och kundtjänstens telefonnummer.
  - **Raderna:** områdets namn med `label` som pill på översta raden, hämtdagen under, och alla orter och gator på nedersta raden, så att man kan känna igen sitt område utan att söka.
  - **Filter:** "Sök område, ort eller gata". Det söker på områdets namn, orter, gator, "trakt N" och hämtdag, till exempel "tisdag" och "jämn vecka".
  - **Känd gata utan områdesträff:** i stället för "Inget område matchar" visas "Kungsgatan finns i Avesta, men schemat visar inte vilket område den hör till", med en länk till Hitta område och hela listan under.
  - **Okänt ord:** "Inget område matchar", som i dag.
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
- **Lägg till i kalender** (ark): för källor med områdesval visas varningen under Öppenhet överst, före valen, med en länk till Hitta område.
- **Byt område:** se Eget val.

## Eget val

Användaren kan koppla sin gata till ett område, men bara i sin egen webbläsare.

- Valet ligger i `localStorage`, med try/catch enligt regel 6 i `AGENTS.md`. Appen fungerar utan lagring, men kommer då inte ihåg valet.
- Inget skickas till servern. Sopor samlar aldrig in val och räknar aldrig ut ett område från andras val, så ett felklick kan inte påverka någon annan.
- Valet sparas när användaren öppnar ett område från raden för gatan. Det gäller gatan med sitt husnummer, så som frågan skrevs, normaliserad.
- Raden i sökningen är alltid märkt "Ditt val", så att den inte ser ut som ett besked från källan. Den har ett sätt att välja ett annat område och ett sätt att glömma valet.
- "Rensa sparade adresser" tar också bort valen.
- "Byt område" från ett sparat område ersätter det sparade området med det nya och behåller namnet användaren gett det. Ett område som inte är sparat förblir osparat.
- Efter bytet visas alltid: "Har du lagt till det gamla området i din kalender? Ta bort det och lägg till det nya." Prenumerationen pekar på områdets id, så vi kan inte ändra den i efterhand och inte se om den finns.

## Öppenhet

Datumen kommer från källan. Det osäkra är om det valda området gäller adressen. Texten ligger per källa i `Source.areaNotice`, så att andra kommuner får sin egen:

> **Kontrollera att området stämmer.** Du har valt området själv, eftersom Avesta Vatten inte publicerar vilka adresser som hör till vilket område. Väljer du fel område kan du missa din tömning.

| Var | Vad |
|---|---|
| Resultatsidan | Rutan "Du har valt området själv" |
| Kalenderarket | Varningen överst, före valen |
| Kalenderfilen | Texten i varje händelses `DESCRIPTION` och i `X-WR-CALDESC`. `UID` ändras inte, och andra källors kalendrar ändras inte. |
| API:t | Fälten `selection` och `notice`, se API och integrationer |

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
- Då behöver ingen spara om sin kalender. En kalender med fel område rättar sig inte själv, eftersom vi inte vet vilken adress den gäller, så områdenas `notice` och kalendertext ändras till att man nu kan söka på sin adress, och kalendern får en händelse om det. Eget val och sparade områden ligger kvar tills användaren byter.
- `check:ids` skulle stoppa att de påhittade adresserna i `data/avesta/2026/addresses.csv` tas bort. Vakten får ett engångsundantag för just de id:na, eftersom Avesta har varit dold.

## API och integrationer

Inga befintliga fält ändras, och inga integrationer behöver en ny version för att fortsätta fungera. Nya fält är tillåtna inom v1, eftersom API:ts stabilitetslöfte säger att fält kan tillkomma och att okända fält ska ignoreras.

| Del | Beteende |
|---|---|
| `GET /api/v1/sok` | Hittar områden som träffar. `street` innehåller områdets namn, `locality` är tom och `detail` innehåller hämtdagen. Gatuindexets rader finns inte i API:t. |
| `GET /api/v1/adress/avesta/trakt-7` | Fungerar som för en adress. |
| Nya fält på adressen, i `/sok` och `/adress` | `selection` är `"address"` eller `"area"`. `notice` är källans text för område och `null` för en adress. |
| `GET /api/v1/kallor` | Avesta visas när källan inte längre är dold. |
| `openapi.json` och dokumentationen | Får en förklaring av att en träff kan vara ett område. Kontraktstestet ska fortsätta passera. |
| Homey och Home Assistant | Hittar områden med "Avesta tätort" utan kodändring. |

En adress i Avesta som inte står i områdeslistan ger inga träffar i `/sok`. Homey och Home Assistant får därför en hjälptext när sökningen är tom: "I Avesta söker du på område, till exempel Avesta tätort." Texten släpps med respektive integrations releaseskript.

Att integrationerna ignorerar `selection` och `notice` provas med tester. Att också visa `notice` där kräver en ny version och görs i lanseringen.

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

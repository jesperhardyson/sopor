# Spec: Örnsköldsvik (Miva)

Status: utkast, 2026-11-16. Efterfrågad i [#139](https://github.com/jesperhardyson/sopor/issues/139). Örnsköldsvik har cirka 56 000 invånare. Källan bryter mot beslut 2 i `docs/plans/2026-11-03-fler-kommuner.md` (ingen skrapning) och byggs som ett undantag, se *Beslut*.

## Bakgrund

Miva sköter sophämtningen i Örnsköldsvik. Sidan [När kommer sopbilen?](https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen) är en Sitevision-app utan inloggning. Den har inget JSON-API. Sidan renderas på servern och lägger appens tillstånd som JSON i sidan, i `AppRegistry.registerInitialState('12.5e486747177feaef88f29850', {…})`. Det är det tillståndet Sopor läser, inte den synliga texten.

Kontrollerat 2026-11-16, med Sopors User-Agent:

```
GET https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen
    ?sv.target=12.5e486747177feaef88f29850&sv.12.5e486747177feaef88f29850.route=/&q=Nygatan
→ {"query":"Nygatan","hits":[{"PickupAddress":"Nygatan 1","PickupCity":"BREDBYN","PickupZipCode":"89530",
    "PickupId":"4334426","ContentTypeName":"Restavfall","ExternalId":"Var 14:e dag", …}, …], "route":"/"}

GET …?sv.target=…&sv.….route=/details/Nygatan 2&city=ÖRNSKÖLDSVIK
→ {"address":"Nygatan 2","city":"Örnsköldsvik","trips":[{"text":"måndag jämna veckor",
    "containers":[{"type":"household","typeText":"Restavfall"},{"type":"food","typeText":"Matavfall"}],
    "pickupDateIso":"2026-11-22T23:00:00.000Z","nextPickupDateIso":"2026-12-06T23:00:00.000Z", …}, …], "route":"/schedule"}
```

Stickprovet: tio breda sökningar ("vägen 1", "Sk", "berg" …) gav 1 088 adresser i 18 orter, och 49 av dem gav scheman.

- **Sökningen matchar var som helst i texten,** oavsett versaler. "Sk" hittar också "Önska" och "Näske 100". Svaren hade 94–126 träffar, så de är troligen avkortade.
- **En träff per kärl,** inte per adress. Adress och ort var unika bland de 1 088 (ingen adress hade två `PickupId`).
- **Ger sökningen exakt en adress** skickas besökaren direkt till schemat: svaret har `route: "/schedule"`, `trips` och `address`, men inga `hits`.
- **Orten i sökningen ger en tom lista** ("Skolgatan 3, Örnsköldsvik"). Det gör också `:`, men inte mellanslag före numret.
- **Schemat slås upp på adress och ort, inte `pickupId`.** Ett påhittat `pickupId` gav rätt schema. Både adressen och orten är versalkänsliga: "nygatan 2" ger en tom lista, och orten måste skrivas med versaler som i sökträffarna ("BREDBYN"), fast schemat själv skriver "Bredbyn". En adress som inte finns ger en tom lista, inte ett fel. `/` i adressen ("Nygatan 5/ He", en av 1 088) ger ett svar utan tillstånd.
- **Två datum per tur:** `pickupDateIso` och `nextPickupDateIso`, i UTC för midnatt svensk tid (`2026-11-22T23:00:00.000Z` är den 23 november).
- **`text` på turen säger veckodag och jämn eller udda vecka,** men stämmer inte för tätare turer. "1 gång per vecka" och "2 gånger per vecka" står också som "tisdag udda veckor". Frekvensen finns bara i sökträffens `ExternalId`:

| `ExternalId` | Antal av 1 113 kärl |
|---|---|
| `Var 14:e dag` | 921 |
| `Var 14:e dag (v 22-39)` | 169 (fritidshus, nästa datum i juni 2027) |
| `1 gång per vecka` | 20 |
| `2 gånger per vecka` | 3 |

- **Tre typer:** `Restavfall` och `Matavfall` i schemat (`household` och `food`), och `Hushållsavfall` i 9 av sökträffarna.
- **Bara villor, radhus och fritidshus** med eget kärl, enligt sidan.
- **Sökträffarna innehåller mer än adresser.** Varje träff är en rå post ur Mivas system (`FetchPlanner`): kundnummer, fastighetsbeteckning, koordinater, `PickupName` (i 21 av 1 113 något annat än adressen) och `PickupEmail` (en riktig e-postadress i 6 av 1 113). De står i sidans källkod för alla som söker.
- **robots.txt** stänger inte sidan. Varje svar tog 1,5–2 sekunder.

## Beslut

- **Undantag från beslut 2 (ingen skrapning).** Tillståndet är JSON med namngivna fält och ISO-datum, inte text som tolkas ur HTML. Det är närmare ett API än en skrapning. Risken är densamma som med andra källor: ändrar Miva appen går källan sönder, och bevakningen rapporterar det. Bara `registerInitialState` för appens id läses. Ingen annan del av sidan används.
- **Regel 4.** Sidan är publik och utan inloggning. Skulle den börja kräva inloggning tas källan bort.
- **Inga personuppgifter går vidare.** Klienten läser bara `PickupAddress`, `PickupCity` och `ExternalId` ur träffarna, och kastar resten direkt efter tolkningen. Inget annat fält sparas, cachas som tolkat svar, loggas eller skickas till webbläsaren. Fixturerna i testerna rensas på samma sätt (påhittade värden i de övriga fälten).
- **Källan:** `{ id: 'miva', name: 'Miva', url: 'https://miva.se', kommuner: [Örnsköldsvik 2284], config: { system: 'miva' } }`. Id:t får aldrig ändras.
- **Adress-id:** `nygatan-2_örnsköldsvik-<hash>`, med `edpAddressId` och `"<PickupAddress>, <ort>"`. Hashen är `idHash` av `"<PickupAddress>, <ORT MED VERSALER>"`, som för Telge: schemat använder inte `pickupId`, och adress och ort var unika, men `queryFromAddressId` kräver en sista del. Formatet får aldrig ändras (regel 3), och tester låser det.
- **Uppslaget** söker på adressdelen av id:t och väljer träffen vars id är detsamma. Ger sökningen direkt ett schema (`route: "/schedule"`) jämförs `address` och `city` i svaret i stället. Schemat hämtas sedan med källans exakta `PickupAddress` och ort. Id utan träff ger 502.
- **Sökningen** tar bort orten (allt efter kommat) och `:`, och grupperar träffarna per adress och ort. Adresser med andra tecken än bokstäver, siffror, mellanslag och bindestreck visas inte, eftersom deras schema inte går att hämta.
- **Datumen,** omräknade till svensk tid:
  - `pickupDateIso` och `nextPickupDateIso` visas som källans egna, `estimated: false`.
  - `Var 14:e dag`: `weekRuleDates` med `every: 2`, veckodag och paritet ur `text`, tolv månader framåt.
  - `Var 14:e dag (v 22-39)`: som ovan, men bara i ISO-veckorna 22–39. `weekRuleDates` får ett nytt val, `inWeeks`.
  - `1 gång per vecka`: `every: 1`.
  - `2 gånger per vecka`: `expandWeekdays` med veckodagarna i de två datumen.
  - Annan eller saknad frekvens, eller en `text` som inte stämmer med datumen: bara källans två datum.
  - Framräknade datum är `estimated: true`, som för EDP, och visas som "ca".
- **Frekvensen per tur** tas från sökträffarna för samma adress. Gick sökningen direkt till schemat finns inga träffar, och då söks gatan utan nummer. Ger också den bara schemat visas bara källans två datum. Har adressens kärl olika frekvens används den tätaste för hela turen. Stickprovet hade ingen adress med blandade frekvenser.
- **Fraktioner** går genom `mapWasteType` med `typeText`: `Restavfall` och `Hushållsavfall` blir `rest`, `Matavfall` blir `mat`. En okänd typ visas med källans text och rapporteras av bevakningen.
- **Text för tomt schema.** Sidan gäller bara småhus, så källan får en `emptyScheduleNote` som säger att flerbostadshus inte finns hos Miva.
- **Kvar för förvaltaren:**
  - Berätta för Miva att Sopor använder sidan, med en kontaktadress, och fråga om de har ett API.
  - Berätta för Miva att sökträffarna visar e-postadresser och namn i sidans källkod. Sopor kontaktar inte Miva själv utan att Jesper har bestämt det.

## Bevakningen

- `checkMivaSource` i `scripts/source-checks.ts`, med samma lägen och samma fallback via sajten som de andra.
- Saknas `registerInitialState` för appens id, eller har tillståndet inte `hits` eller `trips`, rapporteras det som nytt format. Det är så en ändrad app syns.
- Kontrolladressen i `PROBES` är ett adress-id. En ny frekvenstext eller fraktionstyp rapporteras som okänd.

## Test

- Sparade svar i `src/server/__fixtures__/`, rensade enligt ovan: `miva-sok.html` (flera träffar), `miva-sok-en.html` (direkt till schemat), `miva-schema.html` och `miva-schema-tomt.html`.
- Klienten i `src/server/miva.test.ts`: tillståndet ur sidan, adress-id, sökning, uppslag i båda formerna, datum i svensk tid, alla fyra frekvenserna, fraktioner, okänd form och att inga andra fält än de tre finns kvar efter tolkningen.
- `inWeeks` i `src/domain/recurrence.test.ts`, också över vecka 53.
- `handleSearch`, `handleSchedule`, `handleIcs` och API v1 i `src/server/miva-handlers.test.ts`. Ett id utan träff ger 502.
- Bevakningen i `scripts/source-checks.test.ts`.

# Spec: Områdesval i Säter

Status: utkast, 2026-11-04. Bygger på områdesvalet i `docs/specs/2026-11-04-avesta-omradesval.md`. Sökregler, skärmar, id-regler och API är desamma, så här står bara det som skiljer.

## Bakgrund

Säters kommun ansvarar för sophämtningen och Borlänge Energi utför den. Kommunens sida [Hämtningsdagar hushållsavfall](https://sater.se/bygga-bo-miljo/avfall-och-atervinning/hamtningsdagar-sophamtning/) listar områden per veckodag och jämn eller ojämn vecka, och ett veckoschema för fraktionerna. Kopplingen från adress till område finns bara på Mina sidor, som kräver BankID och därför inte används. Borlänge Energis söktjänst har inte Säters adresser, och OpenStreetMap har inga gränser för områdena.

## Mål

- En Säterbo hittar sin hämtdag utan konto och kan lägga den i kalendern.
- Det går att söka på ort, som "Bispberg" eller "Innerstaden", och på de gator kommunen nämner.
- En ort som finns i flera områden visar alla, så att ingen ser bara ett av dem.
- Säter är dold tills schemat för tiden efter vecka 53 finns.

## Skillnader mot Avesta

| Fråga | Avesta | Säter |
|---|---|---|
| Källa | PDF med datum per trakt | Webbsida med listor och ett veckoschema |
| Områden | Tio trakter | Tio kombinationer av veckodag och vecka, utan namn hos kommunen |
| `id` | `trakt-7` | `ojamn-mandag` |
| `name` | Från PDF:en | De två första namnen i kommunens lista utan förbehåll, plus "m.fl." |
| `day` och `label` | "Tisdag, jämn vecka" och "Trakt 7" | "Måndag" och "Ojämn vecka". Säter har inga nummer, och vi hittar inte på några. |
| `testData` | Ja | Nej, datan är riktig. Källan är bara dold. |

## Data

- `data/sater/2026/schedules.json` har vecka 45–53, alltså 2026-11-02 till 2027-01-03, som kommunen har publicerat dem. Tidigare datum läggs inte in, och datum efter vecka 53 räknas inte fram.
- Ojämn vecka har hämtning vecka 53 och skulle få nästa vecka 1. Vad som gäller där är okänt, och det är en anledning till att källan är dold.
- `note` säger att schemat gäller villa och fritidshus, att kärlen ställs ut senast 05.00 och att hämtning sker även på helgdagar om man inte får besked om något annat.

## Sökning

`places` visas på sidan och är också sökord. Därför gäller:

- **Namn med förbehåll söks också utan det.** "Forsbo" är en hel term i ett område och "Forsbo – del av" i ett annat. Exakta träffar utesluter andra områden, så utan åtgärd skulle "Forsbo" dölja det andra området och ge fel hämtdag. Områdena med förbehåll har därför namnet som sökord (`searchTerms`). Det gäller Arkhyttan, Forsbo, Hysta, Landa och Lövåsen (Silvbergs-Lövåsen).
- **Undantag får inte bli sökord.** "Åsen (förutom Falkgränd och Dahlanders väg)" skulle göra Falkgränd sökbar till just det område den inte ingår i. Platsen är därför "Åsen", och undantaget står i `otherDays`.
- **Inkluderade gator är sökord.** "Mora by (inklusive Postvägen)" står kvar, och Postvägen ligger också i `streets`, så att "Postvägen 5" fungerar.
- **Småord går inte att söka på.** Listan i `src/domain/search.ts` utökas med "del", "av", "om" och "by", eftersom de finns i Säters namn.
- **Filtret på Välj område söker också i `label`,** så att "jämn" och "ojämn" fungerar.

## Generella ändringar

- **Kommunens namn i löpande text:** `kommun.replace(/ kommun$/, '')` ger "Välj område i Säters". Namn som slutar på s behåller nu hela namnet ("Säters kommun", "Borås kommun"), och övriga kortas som förut ("Avesta").
- **Rubriken i AreaInfo:** "Vissa gator i tätorten har en annan hämtdag" gäller bara Avesta. Den blir "Vissa gator har en annan hämtdag". Ändringen avviker från designen och behöver godkännas.

## Utanför

- Att räkna ut område från adress, koordinater eller kartor. Mätt 2026-11-04 med områdenas punkter i OpenStreetMap har 31 % av adresserna ett område med annat schema högst 500 meter längre bort än det närmaste. Facit finns bara bakom BankID, så felen går inte att mäta.
- Flerbostadshus och ministationer, som listan inte gäller.

## Tester

`scripts/sater-data.test.ts` kontrollerar datan mot kommunens veckotabell och antalet namn per område, och kör sökreglerna ovan mot det byggda indexet.

## Lansering

1. Be kommunen om schemat efter vecka 53 och om vad sommarhämtningen innebär för schemat.
2. Lägg in `data/sater/2027/` och kontrollera att områdena är oförändrade.
3. Ta bort `hidden`, och uppdatera `CLAUDE.md`, `sources.test.ts` och tabellen i `docs/kommuner/hitta-kommunens-data.md`.
4. Kontrollera flödet på en förhandsversion, eftersom det inte går medan källan är dold.
5. Utöka hjälptexten i Homey och Home Assistant, som bara nämner Avesta.

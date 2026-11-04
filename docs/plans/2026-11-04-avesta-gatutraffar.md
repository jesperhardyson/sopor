# Plan: Gatuträffar, eget val och öppen märkning för områden

Spec: `docs/specs/2026-11-04-avesta-omradesval.md`. Design: ramarna "Gata i Avesta", "Välj område (…)", "Lägg till i kalender (område)" och "Område bytt". Bygger vidare på `docs/plans/2026-11-04-avesta-omradesval.md`, på grenen `feature/avesta-omradesval`.

Avesta förblir `hidden: true` och `testData: true`. Skriv testerna först. Kör `npm run lint && npm test && npm run build` före varje commit. Skriv aldrig en verklig persons adress i kod eller dokument.

## Beslut

- Gatan följer med till områdesvalet i routerns `state`, aldrig i adressen, så att den inte hamnar i serverloggar eller delade länkar.
- Eget val ligger i `localStorage` under `sopor.areaChoices.v1`, med nyckeln källa och normaliserad gata. Inget skickas till servern.
- Texten för öppenhet ligger i `Source.areaNotice`. Kalenderfilen och API:t använder samma text, med titel och brödtext ihopslagna.
- Fälten `selection` och `notice` är obligatoriska i API-svaret. `notice` är `null` för en adress.

## Uppgifter

### 1. Gatuträffar

- `areaPickersFor`: en känd gata ger raden även utan plats, och `AreaPicker` får `street`, frågan utan plats.
- `withPickers`: raden för en kommun utan träffar läggs sist.
- Test: "Kungsgatan 12" ger en picker med `street`, "Kungsgatan 12 Avesta" ger `street` utan platsen, och raden ligger efter andra kommuners träffar. Enter öppnar inget när andra träffar finns.

### 2. Filter och stöd på Välj område

- Hämtdagen blir sökbar i filtret, och platshållaren blir "Sök område, ort eller gata".
- `knownAreaStreet(sourceId, query)` i registret. En känd gata utan områdesträff ger förklaringen och hela listan. Husnumret visas inte, eftersom vi inte vet att numret finns.
- Från raden för gatan: rutan "Du sökte …" ersätter förklaringen, och Hitta område ligger ovanför filtret.
- Test: "tisdag", "jämn vecka", "Kungsgatan", ett okänt ord och `state.street`.

### 3. Eget val och Byt område

- `lib/storage.ts`: `loadChoice`, `rememberChoice`, `forgetChoice`, `moveChoices` och `replaceSaved`. `clearSaved` tar bort valen. Alla tål att lagring saknas.
- Söklistan visar "Ditt val" med "Välj ett annat område" och "Glöm valet", som egna alternativ för tangentbordet.
- Välj område och Hitta område sparar valet och byter ett sparat område. Resultatsidan visar varningen efter ett byte.
- Test: valet sparas, visas, glöms och går att ändra, det sparade området ersätts och behåller ett eget namn, och appen fungerar när `localStorage` kastar fel.

### 4. Öppenhet

- `Source.areaNotice`, som ett test kräver för varje källa med områdesval.
- Varningen i `CalendarSheet` med länk till Hitta område, och `buildIcs({ notice })` i varje händelse och i `X-WR-CALDESC`.
- `selection` och `notice` i `/sok` och `/adress`, samt `openapi.json`.
- Test: ICS för område och oförändrad ögonblicksbild för adress, API-svaret och kontraktstestet. Homey och Home Assistant tål de nya fälten.

### 5. Kontroll

- Lint, tester och bygge, samt Homeys och Home Assistants kontroller.
- Uppdatera `docs/kommuner/lagga-till-kommun.md` med `areaNotice`.
- Flytta in ändringarna i testgrenen och prova hela flödet på dess förhandsadress.

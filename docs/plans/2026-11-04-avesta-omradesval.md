# Områdesval i Avesta: implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development (rekommenderas) eller superpowers:executing-plans för att genomföra planen uppgift för uppgift. Stegen använder kryssrutor (`- [ ]`).

**Mål:** Avestabor ska kunna söka fram och välja sitt hämtområde, se riktiga datum och lägga dem i kalendern, utan att Sopor gissar vilket område en adress hör till.

**Arkitektur:** Ett område blir en post i den statiska källans adressindex, så att resultatsida, kalender och API fungerar som i dag. Nytt är `Source.selection: 'area'`, filen `omraden.json`, områdessökning i domänlagret, en sida för att välja område och ett ark för att hitta området med ett datum.

**Teknik:** TypeScript, React, react-router, Vitest och Testing Library. Home Assistant-texterna ligger i JSON och testas med `uv run pytest`.

**Spec:** `docs/specs/2026-11-04-avesta-omradesval.md`. Design: ramarna med "område" och "Områdessök" i `docs/design/sopor-design.pen`, som läses via Pencil MCP.

## Övergripande krav

- UI-texter, kommentarer och commit-meddelanden skrivs på svenska. Inga rader om AI-attribution i commits.
- Regel 1 i `AGENTS.md`: bara `src/providers/`, `src/server/`, `src/data/` och `scripts/` får känna till trakter. UI:t säger "område", och "Trakt 7" är data.
- Kod som Vercel-funktionerna når (`api/`, `src/server/`, `src/domain/`, `src/sources/`) använder relativa importer med `.js`.
- Färger är tokens från `src/styles/theme.css`, aldrig hårdkodade hex-värden.
- Id som `trakt-7` och formatet `<id>-<datum>@sopor.hardyson.se` ändras aldrig.
- Avesta förblir `hidden: true` och `testData: true` genom hela planen. Flaggorna tas bort först i lanseringen (se Efter planen).
- Kör `npm run lint && npm test && npm run build` före varje commit. Alla ska vara gröna.
- Arbeta på grenen `feature/avesta-omradesval` i worktreen `../sopor-avesta-omradesval`. Kör aldrig `npm ci` genom `node_modules`-symlänken.
- Skriv aldrig en verklig persons adress i kod, testdata eller dokument. Använd Kungsgatan 12 som exempel.

## Datumantagande

PDF:en färgmärker rest, papper och plast först från hösten 2026, och omärkta celler har bara texten "Matavfall hämtas vid varje tillfälle". Datan börjar därför 2026-09-01 (`validFrom`). Omärkta datum blir `["mat"]` och märkta blir `["mat", "<fraktion>"]`. Datum före september läggs inte in, eftersom vi inte vet vilka fraktioner som hämtades då.

## Att bevaka

1. **Datum i framtiden i arket:** ett datum efter i dag ska ge "Datumet har inte varit än" och aldrig föreslå ett område (test i uppgift 7).
2. **Tomt datumfält:** när fältet töms försvinner resultatet utan fel (test i uppgift 7).
3. **`omraden.json` går inte att hämta:** sidan visar `ErrorState` med "Försök igen" i stället för en tom lista (test i uppgift 7).
4. **Enter med flera möjligheter:** "Kungsgatan 12 Avesta" med en träff i Hedemora och raden för Avesta öppnar ingenting automatiskt (test i uppgift 6).
5. **Versaler och plats efter numret:** "AVESTA TÄTORT" ger området, och "Kungsgatan 12 Avesta" ger raden för Avesta (tester i uppgift 1 och 4).

---

### Uppgift 1: Områdessökning och datumuppslag i domänen

**Filer:**
- Skapa: `src/domain/areas.ts`, `src/domain/areas.test.ts`
- Ändra: `src/domain/types.ts`, `src/domain/search.ts`, `src/domain/search.test.ts`

**Gränssnitt:**
- Skapar i `types.ts`: `Address.searchTerms?: string[]` och typen

```ts
export interface Area {
  id: string
  name: string
  day: string
  label: string
  places: string[]
  otherDays: string[]
  /** Områdets hämtdatum, sorterade (YYYY-MM-DD) */
  dates: string[]
}
```

- Skapar i `areas.ts`:

```ts
export type AreaForDate =
  | { kind: 'found'; area: Area; previous: string[]; next: string | null }
  | { kind: 'none' }
  | { kind: 'outside' }
export function areaForDate(date: string, areas: Area[]): AreaForDate
```

`previous` innehåller högst två datum, det valda sist. `outside` gäller datum före det tidigaste eller efter det senaste datumet bland områdena.

- [ ] **Steg 1: Skriv de fallerande testerna**

Skapa två testadresser med `searchTerms`: `trakt-1` med `['trakt 1', 'Stallgatan', 'Askön']` och `trakt-10` med `['trakt 10', 'Horndal tätort']`, plus `trakt-2` och `trakt-4` med `Backa`, och `trakt-7` med namnet `Avesta tätort, Östanfors m.fl.`.

`search.test.ts`:
- `områden hittas på sitt namn`: "Avesta tätort" och "AVESTA TÄTORT" ger `['trakt-7']`
- `områden hittas på sökord`: "Askön" ger `['trakt-1']`
- `ett exakt sökord utesluter längre`: "trakt 1" ger `['trakt-1']`, inte `trakt-10`
- `alla områden med samma namn visas`: "Backa" ger `['trakt-2', 'trakt-4']`
- `gata i listan med nummer`: "Stallgatan 5" och "Stallgatan 5 B" ger `['trakt-1']`
- `orelaterad gata ger inget`: "Kungsgatan 12" ger `[]`
- `ord får inte hämtas från olika sökord`: "Askön Stallgatan" ger `[]`
- `adresser utan sökord fungerar som förut`: befintliga tester ska passera oförändrade

`areas.test.ts`, med `A` som har 13, 27 oktober och 10 november, och `B` som har 14, 28 oktober:
- 2026-10-27 ger `{ kind: 'found', area: A, previous: ['2026-10-13', '2026-10-27'], next: '2026-11-10' }`
- 2026-10-13 ger `previous: ['2026-10-13']`
- 2026-11-10 ger `next: null`
- 2026-10-24 ger `{ kind: 'none' }`
- 2026-10-12 och 2026-11-11 ger `{ kind: 'outside' }`

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/domain/search.test.ts src/domain/areas.test.ts`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera i `areas.ts` och `search.ts`**

För adresser med `searchTerms` matchar en fråga om alla ord börjar ett ord i *samma* term, där namnet räknas som en term. Prova också gatudelen utan husnummer (`splitStreet`), men då bara om den är exakt lika med en term. Finns någon term som är exakt lika med frågan behålls bara de områdena. Adresser utan `searchTerms` matchar som i dag.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Lägg till `matchedTerm(query: string, address: Address): string | null` i `search.ts`**

Test: "Backa" ger `"Backa"`, "Avesta tätort" ger `null` eftersom namnet redan visar det, och en adress utan `searchTerms` ger `null`.

- [ ] **Steg 6: Commit**

```bash
git add src/domain
git commit -m "Områdessökning och uppslag av område från datum"
```

### Uppgift 2: Dataformatet och bygget

**Filer:**
- Ändra: `src/data/static-format.ts`, `src/data/static-format.test.ts`, `scripts/build-data.ts`, `scripts/check-address-ids.ts`, `scripts/check-address-ids.test.ts`, `src/sources/index.ts`

**Gränssnitt:**
- Skapar i `static-format.ts`:

```ts
export interface AreaRow {
  id: string; name: string; day: string; label: string; schedule: string
  places: string[]; streets: string[]; searchTerms: string[]; otherDays: string[]
}
export interface AreasFile { explanation: string; help: string; areas: AreaRow[] }
export function parseAreasFile(json: unknown, file: string): AreasFile
export interface AreasIndexFile { explanation: string; help: string; areas: Area[] }
```

- Ändrar: `AddressIndexFile.addresses` får ett valfritt femte element `{ detail: string; searchTerms: string[] }`.
- Ändrar: `buildMunicipality` tar `areas?: AreasFile` per år och returnerar även `areas?: AreasIndexFile`.
- Skapar i `src/sources/index.ts`: `selection?: 'address' | 'area'`.
- `readYears` läser `omraden.json` när filen finns och använder den i stället för `addresses.csv`.
- `build-data.ts` skriver `public/data/<id>/omraden.json`.

- [ ] **Steg 1: Skriv de fallerande testerna**

- `parseAreasFile` kastar `DataError` för tomt `name`, ett `schedule` som saknas, dubbla id och `id` = `omraden`
- `buildMunicipality`: ett område ger raden `['trakt-7', 'Avesta tätort, Östanfors m.fl.', '', ['2026-trakt-7'], { detail: 'Tisdag, jämn vecka · Trakt 7', searchTerms: [...] }]`
- `searchTerms` i indexet är `places`, `streets` och `searchTerms` utan dubbletter
- två år med samma områdes-id ger ett område med båda årens `dates`
- ett datum i två områdens scheman kastar `DataError` med datumet i meddelandet
- ICS-filen får UID:n `trakt-7-2026-11-10@sopor.hardyson.se`
- `findRemovedIds` tillåter de påhittade id:n som listas i `RETIRED_FAKE_IDS`, men stoppar andra borttagna id:n
- `check-address-ids` behandlar `data/<id>/<år>/omraden.json` som adressfil, så att ett borttaget `trakt-7` stoppas

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/data/static-format.test.ts scripts/check-address-ids.test.ts`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera formatet, bygget och vakten**

`RETIRED_FAKE_IDS` fylls med exakt de id:n som finns i `data/avesta/2026/addresses.csv` på `origin/main` och ligger i `check-address-ids.ts` med kommentaren att de var påhittade och aldrig publicerade.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Commit**

```bash
git add src/data src/sources/index.ts scripts
git commit -m "Dataformat för områden i statiska källor"
```

### Uppgift 3: Avestas riktiga data

**Filer:**
- Skapa: `data/avesta/2026/omraden.json`
- Ändra: `data/avesta/2026/schedules.json`, `scripts/build-data.test.ts`, `src/sources/index.ts`, `src/sources/sources.test.ts`
- Ta bort: `data/avesta/2026/addresses.csv`

**Gränssnitt:**
- Konsumerar: `AreasFile` från uppgift 2. Avesta får `selection: 'area'`.

- [ ] **Steg 1: Skriv de fallerande testerna i `build-data.test.ts`**

Ersätt testet av seed-datan med:
- `readYears` ger tio områden med id `trakt-1` till `trakt-10`
- `trakt-7` har dagen `Tisdag, jämn vecka` och namnet `Avesta tätort, Östanfors m.fl.`
- `trakt-7` har de här datumen i schemat:

| Datum | Fraktioner |
|---|---|
| 2026-10-13 | `mat`, `rest` |
| 2026-10-27 | `mat`, `papper` |
| 2026-11-10 | `mat`, `plast` |
| 2026-11-24 | `mat`, `rest` |
| 2026-12-08 | `mat`, `papper` |
| 2026-12-22 | `mat`, `plast` |

- Stickprov: `trakt-1` 2026-11-02 plast, `trakt-8` 2026-10-14 bara mat, `trakt-10` 2026-10-30 plast
- Varje datum stämmer med områdets veckodag och jämn eller udda ISO-vecka, enligt `isoWeek`
- Inga datum före 2026-09-01

- [ ] **Steg 2: Kör testet och se det falla**

Kör: `npx vitest run scripts/build-data.test.ts`. Förväntat: FAIL.

- [ ] **Steg 3: Skriv in datan från PDF:en**

Källa: [hamtschema-avesta-2026---version-2.pdf](https://avestavatten.se/globalassets/innehall-avestavatten.se/aktivt-pa-avestavatten.se/avfall-och-atervinning/hamtningsschema/hamtschema-avesta-2026---version-2.pdf). Rendera sidan och läs av den visuellt, eftersom textutdraget blandar kolumnerna.

- Områdenas `name` hämtas från listan `AREAS` i designramen "Mobil · Välj område".
- `explanation` och resultatsidans text är specens formulering.
- `help` är `Osäker? Fråga Avesta Vatten på 0226-64 55 00.`
- `searchTerms` innehåller `trakt N`.
- `otherDays` fylls i för trakt 7 enligt specen och lämnas tom för övriga.
- `schedules.json` får `validFrom` `2026-09-01`, `validTo` `2027-01-10`, `source` med PDF:ens namn och version, och `note` `Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.`
- Förkortningar skrivs ut, och namn som inte finns i `data/osm/2084.json` kontrolleras mot kartan eller behåller PDF:ens stavning.

- [ ] **Steg 4: Kör testet och se det passera**

Kör: `npx vitest run scripts/build-data.test.ts`. Förväntat: PASS.

- [ ] **Steg 5: Kör alla tester och rätta det som berodde på den gamla seed-datan**

Kör: `npm test`. Tester som mockar `fetch` får behålla sina påhittade id:n. Rätta bara dem som läser datafilerna eller som ändras av `selection: 'area'`, och uppdatera ICS-snapshoten bara om den faktiskt byggs av datafilerna.

- [ ] **Steg 6: Commit**

```bash
git add data/avesta src/sources scripts src
git commit -m "Avestas riktiga schema och områden för 2026"
```

### Uppgift 4: Provider och register

**Filer:**
- Ändra: `src/providers/types.ts`, `src/providers/static.ts`, `src/providers/static.test.ts`, `src/providers/registry.ts`, `src/providers/registry.test.ts`, `src/data/street-index.ts`, och testfilen för gatuindexet

**Gränssnitt:**
- Konsumerar: `AreasIndexFile`, `Area`.
- Skapar: `WasteProvider.listAreas?(signal?): Promise<AreasIndexFile>`.
- Skapar i `street-index.ts`: `isKnownStreet(shard: StreetShard | null, query: string, sourceId: string): boolean`, som jämför gatudelen av `splitPlace` exakt, utan husnummer.
- Ändrar: `SearchResult` får `areaPickers: AreaPicker[]`, där

```ts
export interface AreaPicker { sourceId: string; kommun: string; hasHits: boolean }
```

- [ ] **Steg 1: Skriv de fallerande testerna**

`static.test.ts`:
- `searchAddresses` och `getAddress` ger `detail` och `searchTerms` från indexet
- `listAreas` hämtar `/data/avesta/omraden.json`

`registry.test.ts`, med en mockad delfil där `kungsgatan` har `avesta` och Avesta som `selection: 'area'`:
- "Kungsgatan" och "Kungsgatan 12" ger en picker med `hasHits: false` på kommunsidan och ingen på startsidan (regeln skärptes efter genomförandet, se specen)
- "Kungsgatan 12 Avesta" och "Okändgatan 3, Avesta" ger en picker
- "Kungsg" och "Hornsgatan 1" ger ingen picker
- "Avesta tätort" med en områdesträff ger `hasHits: true`
- `options.kommun` för en annan kommun ger ingen picker
- En källa utan `selection` ger aldrig en picker

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/providers src/data/street-index`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera**

`searchAll` räknar ut `areaPickers` efter de lokala träffarna. Delfilen hämtas med befintliga `loadShard`, även när inga live-källor är valda. `suggestAll` påverkas inte.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Commit**

```bash
git add src/providers src/data
git commit -m "Providern listar områden och sökningen hittar val av område"
```

### Uppgift 5: API

**Filer:**
- Ändra: `src/server/v1.ts`, `src/server/v1.test.ts`, `src/server/lookup.ts`, `src/server/lookup.test.ts`, `src/server/openapi.test.ts`, `public/api/v1/openapi.json`

**Gränssnitt:**
- Konsumerar: femte elementet i `AddressIndexFile.addresses`.
- Svarsformatet ändras inte.

- [ ] **Steg 1: Skriv de fallerande testerna**

- `/api/v1/sok?q=avesta tätort` ger en träff med `street` = områdets namn, `locality` = `""` och `detail` = `Tisdag, jämn vecka · Trakt 7`
- Svaret saknar nyckeln `searchTerms`
- `/api/v1/sok?q=trakt 7&kalla=avesta` ger samma träff
- `/api/v1/adress/avesta/trakt-7` ger `address.detail` och schemat
- `/api/v1/sok?q=kungsgatan 12&kalla=avesta` ger `addresses: []` och `failed: []`
- Kontraktstestet mot `openapi.json` passerar med en områdesträff

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/server`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera**

`searchStatic` och `lookupStatic` läser femte elementet. Beskrivningen av `street` och `detail` i `openapi.json` får en mening om att en träff kan vara ett område, med områdets namn i `street` och hämtdagen i `detail`.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Commit**

```bash
git add src/server public/api/v1/openapi.json
git commit -m "API:t visar områden som träffar"
```

### Uppgift 6: Sökfältet och kommunsidan

**Filer:**
- Ändra: `src/ui/search/AddressSearch.tsx`, `src/ui/search/AddressSearch.test.tsx`, `src/ui/search/NotFound.tsx`, `src/ui/pages/KommunPage.tsx`, `src/ui/pages/KommunPage.test.tsx`

**Gränssnitt:**
- Konsumerar: `SearchResult.areaPickers`, `matchedTerm`.
- `Item` får varianten `{ kind: 'picker'; picker: AreaPicker }`, som går till `/<sourceId>/omraden`.

Design: "Mobil · Områdessök (träff)", "(flera träffar)" och "Mobil · Adress i Avesta (utan områdesträff)".

- [ ] **Steg 1: Skriv de fallerande testerna**

- En områdesträff visar namn och `detail` med kart-ikonen, plus raden "Se alla områden i Avesta"
- En träff via sökord visar "Backa ingår i området"
- `hasHits: false` visar raden "Välj område i Avesta" med texten "Här finns schemat per område, inte per adress." och träffar i andra kommuner under sina rubriker
- Klick och piltangenter+Enter på raden går till `/avesta/omraden`
- Enter med "Välj område i Avesta" som enda rad öppnar `/avesta/omraden`
- Enter med "Kungsgatan 12 Avesta" och både en Hedemora-träff och raden för Avesta navigerar inte
- Inga träffar och ingen picker på Avestas kommunsida: "hittades inte"-rutan har länken "Välj område i Avesta"
- Avestas kommunsida visar en länk till `/avesta/omraden`

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/ui/search src/ui/pages/KommunPage.test.tsx`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera raderna enligt designen**

En rad med `detail` och utan `locality` får ikonen `Map` från lucide. Tomma resultat med en picker visas som träfflista, inte som "hittades inte". `NotFound` får propen `areaHref?: string`.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Kontrollera i webbläsaren**

Gör Avesta synlig lokalt genom att tillfälligt ta bort `hidden`, starta dev-servern och jämför skärmarna med designen på mobil och desktop. Återställ `hidden` före commit. Förväntat: `git diff src/sources/index.ts` visar inget `hidden`.

- [ ] **Steg 6: Commit**

```bash
git add src/ui
git commit -m "Sökningen visar områden och val av område"
```

### Uppgift 7: Sidan Välj område och arket Hitta område

**Filer:**
- Skapa: `src/ui/pages/AreaPage.tsx`, `src/ui/pages/AreaPage.test.tsx`, `src/ui/sheets/AreaFinderSheet.tsx`, `src/ui/sheets/AreaFinderSheet.test.tsx`
- Ändra: `src/ui/App.tsx`

**Gränssnitt:**
- Konsumerar: `listAreas`, `areaForDate`, `AreasIndexFile`, `Area`.
- Skapar: `AreaRoute`, på `path=":sourceId/omraden"` före `:sourceId/:addressId`.
- Skapar: `AreaFinderSheet({ open, onOpenChange, areas, sourceId, today }: { open: boolean; onOpenChange: (o: boolean) => void; areas: Area[]; sourceId: string; today?: string })`.

Design: "Mobil · Välj område", "Desktop · Välj område", "Mobil · Hitta område (träff)" och "(ingen träff)".

- [ ] **Steg 1: Skriv de fallerande testerna**

`AreaPage.test.tsx`:
- Visar rubriken "Välj ditt område", `explanation`, `help` och alla områden med namn, dag och etikett
- Filtret "Östanfors" visar bara `trakt-7`, och utan träff visas "Inget område matchar"
- En rad länkar till `/avesta/trakt-7`
- "Vet du inte vilket område?" öppnar arket
- En källa utan `selection: 'area'` visar `UnsupportedState`
- När `listAreas` misslyckas visas `ErrorState`, och "Försök igen" hämtar igen

`AreaFinderSheet.test.tsx`, med `today` = 2026-11-04:
- 2026-10-27 visar "Det här bör vara ditt område", områdets namn, "Tömningar 13 okt och 27 okt. Nästa är 10 nov. Stämmer det? En försenad tömning kan ge fel område." och länken "Visa hämtschemat" till `/avesta/trakt-7`
- 2026-10-24 visar "Inget område har hämtning den dagen"
- 2026-08-01 visar "Vi har inget schema för det datumet"
- 2026-11-10 visar "Datumet har inte varit än" och inget område
- När fältet töms försvinner resultatet utan fel
- "Välj område själv" stänger arket

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/ui/pages/AreaPage.test.tsx src/ui/sheets/AreaFinderSheet.test.tsx`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera enligt designen**

Datumfältet är ett `<input type="date">` med `max={today}` och etiketten "Senaste tömning". Filtret använder `searchAddresses` med områdenas termer. Arket bygger på `ResponsiveSheet`. Sidan sätter titeln "Välj område – Sopor".

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Commit**

```bash
git add src/ui
git commit -m "Sidan för att välja område och arket för att hitta det"
```

### Uppgift 8: Resultatsidan och spara

**Filer:**
- Skapa: `src/ui/result/AreaInfo.tsx`
- Ändra: `src/ui/pages/ResultPage.tsx`, `src/ui/pages/ResultPage.test.tsx`, `src/ui/sheets/SaveSheet.tsx`, `src/ui/sheets/sheets.test.tsx`

**Gränssnitt:**
- Konsumerar: `getSource(id).selection`, `listAreas`, `Area`.
- Skapar: `AreaInfo({ area, explanation }: { area: Area; explanation: string })`.

Design: "Mobil · Resultat (område)" och "Desktop · Resultat (område)".

- [ ] **Steg 1: Skriv de fallerande testerna**

- Områdets resultatsida visar "Byt område" med länk till `/avesta/omraden`
- Rubriken "Du har valt området själv" med `explanation` och avslutningen "Jämför gärna med din senaste tömning."
- "Ingår i området" visar `places`, och "Vissa gator i tätorten har en annan hämtdag" visas bara när `otherDays` inte är tom
- Inga rader märks som beräknade
- Om `listAreas` misslyckas visas schemat ändå, utan rutan
- `SaveSheet` för ett område visar "Spara område", "Ge området ett namn" och knappen "Spara område"
- Vanliga adresser visar fortfarande "Byt adress" och "Spara adress"

- [ ] **Steg 2: Kör testerna och se dem falla**

Kör: `npx vitest run src/ui/pages/ResultPage.test.tsx src/ui/sheets/sheets.test.tsx`. Förväntat: FAIL.

- [ ] **Steg 3: Implementera**

`AreaInfo` placeras under sidhuvudet på mobil och överst i vänsterspalten på desktop.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: samma som steg 2. Förväntat: PASS.

- [ ] **Steg 5: Kontrollera hela flödet i webbläsaren**

Med tillfälligt synlig Avesta: sök "Kungsgatan 12, Avesta", välj område, ange 27 oktober 2026, öppna resultatet, spara och ladda ned kalendern. Kontrollera ljust och mörkt läge samt mobil och desktop. Återställ `hidden` före commit.

- [ ] **Steg 6: Commit**

```bash
git add src/ui
git commit -m "Resultatsidan förklarar valet av område"
```

### Uppgift 9: Hjälptext i integrationerna

**Filer:**
- Ändra: `custom_components/sopor/translations/sv.json`, `custom_components/sopor/translations/en.json`, `integrations/homey/locales/sv.json`, `integrations/homey/locales/en.json`, och testerna som läser texterna

**Gränssnitt:**
- Ingen kodändring. Integrationerna använder bara det publika API:t.

- [ ] **Steg 1: Lägg till tester med en områdesträff**

Home Assistant: `street` med områdets namn, tom `locality` och `detail` ger titeln `Avesta tätort, Östanfors m.fl., Avesta kommun, Tisdag, jämn vecka · Trakt 7`. Homey: samma träff går igenom `searchOutcome` som `found`. Båda ska passera utan kodändring.

- [ ] **Steg 2: Kör testerna**

Kör: `cd integrations/homey && npm test` och `cd integrations/home-assistant && uv sync && uv run pytest`. Förväntat: PASS. Stoppa och rapportera om något faller, eftersom API-kontraktet då inte håller.

- [ ] **Steg 3: Lägg till texten**

Lägg till `I Avesta söker du på område, till exempel Avesta tätort.` sist i `not_found` och `not_found_covered` (Home Assistant) och `notFound` och `notFoundCovered` (Homey). På engelska: `In Avesta, search by area, for example Avesta tätort.`

- [ ] **Steg 4: Kör alla kontroller**

Kör: `cd integrations/homey && npm test && npm run typecheck && npm run validate`, och `cd integrations/home-assistant && uv run pytest && uv run ruff check ../../custom_components tests`. Förväntat: gröna.

- [ ] **Steg 5: Commit**

Ändra inga versioner och gör ingen release.

```bash
git add custom_components integrations
git commit -m "Integrationerna förklarar att Avesta söks på område"
```

### Uppgift 10: Dokumentation

**Filer:**
- Ändra: `docs/kommuner/lagga-till-kommun.md`, `docs/kommuner/hitta-kommunens-data.md`, `docs/utveckling.md`, `README.md` om den beskriver Avesta

- [ ] **Steg 1: Uppdatera `lagga-till-kommun.md`**

Lägg till `omraden.json` under Dataformatet. Lägg till under "Uppdatera årets schema": "För källor med område: kontrollera att områdenas innehåll, veckodagar och nummer är oförändrade innan datumen läggs in. Följer ett område inte med ska det få ett nytt id enligt specen."

- [ ] **Steg 2: Uppdatera `hitta-kommunens-data.md` och `utveckling.md`**

Avesta-raden får läget "Områdesval byggt, väntar på schemat för 2027". Lärdomarna får en rad om att områdesval är ett alternativ när kopplingen saknas. `utveckling.md` beskriver `selection: 'area'`.

- [ ] **Steg 3: Kör alla kontroller och commit**

Kör: `npm run lint && npm test && npm run build && npx tsx scripts/check-address-ids.ts`. Förväntat: gröna.

```bash
git add docs README.md
git commit -m "Dokumentation för områdesval"
```

## Efter planen: lansering

Det här görs i en egen pull request när PDF:en för 2027 finns:

1. Lägg in `data/avesta/2027/` och kontrollera områdena enligt checklistan.
2. Ta bort `testData` och `hidden`, och uppdatera `CLAUDE.md`, `sources.test.ts` och `kommun-pages.test.ts`.
3. Kontrollera flödet på pull requestens förhandsadress.
4. Släpp integrationerna med `uv run scripts/release.py <version>` och `npm run release` efter merge. Homeys väntande godkännande kan påverka när den versionen når ut.
5. Godkänn texterna: `emptyScheduleNote`, datum utanför schemat och framtida datum i arket Hitta område.
6. Bekräfta stavningarna med Avesta Vatten.
7. Besluta om raden "Schemat för nästa år" från designen.
8. Besluta om kommunsidans text "Skriv in din adress" i statisk HTML, eftersom man i Avesta väljer område.
9. Håll Homey- och Home Assistant-releaser tills Avesta lanseras.

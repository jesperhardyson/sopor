# Örnsköldsvik (Miva) Implementation Plan

> Genomförd. 2026-11-17 blev `src/server/miva.ts` den allmänna `src/server/fetchplanner.ts` för Falun, och namnen nedan (`mivaState`, `MIVA_URL`, `checkMivaSource` …) heter nu `plannerState`, sidan och app-id:t i källans konfiguration och `checkFetchPlannerSource`. Se `docs/specs/2026-11-17-falun-fev.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En ny live-källa, `miva`, som ger Örnsköldsviks adresser och hämtschema från Sitevision-appen på miva.se.

**Architecture:** En klient i `src/server/miva.ts` hämtar sidan, läser appens tillstånd (JSON i `registerInitialState`) och gör om det till `EdpBuilding` och `Schedule`, som Vakin och Telge. Datum utöver källans två räknas fram med `weekRuleDates` och `expandWeekdays`. Källan kopplas in i `searchLiveSource`, `lookupAddress` och bevakningen som de andra live-källorna.

**Tech Stack:** TypeScript, Vitest, Vercel Functions.

**Spec:** `docs/specs/2026-11-16-ornskoldsvik-miva.md`

## Global Constraints

- Svenska i kommentarer, felmeddelanden och commit-meddelanden. Commits följer Conventional Commits.
- Relativa importer med `.js` i `src/server/`, `src/domain/` och `src/sources/` (regel 2).
- Adress-id:t `nygatan-2_örnsköldsvik-<hash>` får aldrig ändras när det är publicerat, och ett test låser det (regel 3).
- User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)` via `src/server/http.ts`. Bara den publika sidan, utan inloggning (regel 4).
- Okänd form på svaret kastar `SourceError`, aldrig en tom lista. Id utan träff ger 502.
- Ur sökträffarna läses bara `PickupAddress`, `PickupCity` och `ExternalId`. Inget annat fält får finnas i klientens returvärden, i fixturerna eller i loggar.
- `npm run lint && npm test && npm run build` är grönt före varje commit.

## Review Focus

1. **Gatan med en enda adress:** sökningen går direkt till schemat utan `hits`. Den ska ändå ge en adress, och uppslaget ska ge ett schema. Test i Task 2 och Task 3.
2. **Fritidshus i november:** `Var 14:e dag (v 22-39)` har nästa datum i juni 2027. Inga datum får räknas fram utanför veckorna 22–39. Test i Task 3.
3. **Tömning i dag:** `pickupDateIso` `2026-11-15T23:00:00.000Z` är den 16 november och ska visas som i dag, inte försvinna som passerad. Test i Task 3.
4. **Adress med `/`:** "Nygatan 5/ He" ska inte visas i sökningen, eftersom schemat inte går att hämta. Test i Task 2.
5. **Miva ändrar appen:** saknat `registerInitialState` eller ett tillstånd utan `hits` och `trips` ska ge `SourceError` och i bevakningen `nytt-format`. Test i Task 2 och Task 5.

---

### Task 1: Säsong i veckor för `weekRuleDates`

**Files:**
- Modify: `src/domain/recurrence.ts` (`expandEvery`, `weekRuleDates`)
- Test: `src/domain/recurrence.test.ts`

**Interfaces:**
- Produces: `expandEvery(input: { next: string; stepDays: number; months?: number; inMonths?: number[]; inWeeks?: [number, number] })` och `weekRuleDates(next, rule, opts: { inMonths?: number[]; inWeeks?: [number, number] })`. `inWeeks: [22, 39]` behåller bara datum vars ISO-vecka ligger i intervallet, utom källans eget datum, som alltid är med.

- [ ] **Step 1: Skriv testerna**

```ts
it('räknar bara datum i veckorna 22–39 med inWeeks', () => {
  const dates = weekRuleDates('2027-06-01', { weekday: 2, every: 2, parity: 'udda' }, { inWeeks: [22, 39] }).map((p) => p.date)
  expect(dates[0]).toBe('2027-06-01')
  expect(dates.every((d) => { const w = isoWeek(d).week; return w >= 22 && w <= 39 })).toBe(true)
  expect(dates.at(-1)).toBe('2027-09-28')
})

it('behåller källans datum utanför inWeeks', () => {
  expect(weekRuleDates('2026-11-17', { weekday: 2, every: 2, parity: 'udda' }, { inWeeks: [22, 39] })[0]).toEqual({ date: '2026-11-17', estimated: false })
})
```

- [ ] **Step 2: Kör** `npx vitest run src/domain/recurrence.test.ts`. Väntat: FAIL, `inWeeks` finns inte.
- [ ] **Step 3: Lägg till `inWeeks`** i `expandEvery` med `isoWeek` från `./dates.js`, och skicka det vidare från `weekRuleDates`, som `inMonths`.
- [ ] **Step 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Step 5: Commit** `feat: Tömningar med säsong i veckor`

### Task 2: Mivas sida, sökning och adress-id

**Files:**
- Modify: `src/server/http.ts` (ny `fetchHtml`)
- Create: `src/server/miva.ts`
- Create: `src/server/__fixtures__/miva-sok.html`, `miva-sok-en.html`, `miva-schema.html`, `miva-schema-tomt.html`
- Test: `src/server/miva.test.ts`, `src/server/http.test.ts`

**Interfaces:**
- Produces:
  - `fetchHtml(url: string, opts?: FetchOptions): Promise<string>` med `Accept: text/html`, samma fel som `fetchJson`.
  - `MIVA_URL = 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen'` och `MIVA_APP = '12.5e486747177feaef88f29850'`.
  - `mivaState(html: string): MivaState`, där `MivaState = { route: string; hits?: unknown[]; trips?: unknown[]; address?: unknown; city?: unknown }`. Kastar `SourceError('miva.se svarade med ett okänt format')` utan tillstånd, och när varken `hits` eller `trips` är en lista.
  - `interface MivaAddress { building: EdpBuilding; address: string; city: string; frequencies: string[] }`. `address` och `city` är källans exakta text. `frequencies` är de olika `ExternalId` för adressens kärl, tom när sökningen gick direkt till schemat.
  - `mivaAddressId(address: string, city: string): string`, som `edpAddressId({ raw, street: address, locality: titleCase(city), buildingId: idHash(\`${address}, ${city.toUpperCase()}\`) })`.
  - `mivaSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MivaAddress[]>`.

- [ ] **Step 1: Spara fixturerna.** Hämta sidan för `q=Nygatan`, `q=Nygatan 10`, schemat för Nygatan 2 i Örnsköldsvik och schemat för Nygatan 2 i Bredbyn (tomt). Behåll bara `<script>` med `registerInitialState` för `MIVA_APP`. I varje träff: behåll `PickupAddress`, `PickupCity`, `ExternalId` och `ContentTypeName`, och ersätt alla andra fält med tomma strängar eller `0`. Lägg till en träff med `PickupAddress: "Nygatan 5/ He"`.
- [ ] **Step 2: Skriv testerna** i `src/server/miva.test.ts`:
  - `mivaState` läser tillståndet ur `miva-sok.html` och kastar `SourceError` för `<html></html>` och för ett tillstånd utan `hits` och `trips`.
  - `mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')` är `` `nygatan-2_örnsköldsvik-${idHash('Nygatan 2, ÖRNSKÖLDSVIK')}` ``, och `mivaAddressId('Nygatan 2', 'Örnsköldsvik')` ger samma id.
  - `mivaSearch('Nygatan, Örnsköldsvik')` frågar med `q=Nygatan` och utan orten, ger en adress per adress och ort, och tar inte med "Nygatan 5/ He".
  - Varje `MivaAddress` har exakt nycklarna `building`, `address`, `city` och `frequencies`, och `JSON.stringify` av resultatet innehåller inte `CustomerId`, `PickupName` eller `PickupEmail`.
  - `mivaSearch('Nygatan 10')` mot `miva-sok-en.html` ger en adress, `Nygatan 10` i `Bredbyn`, med `frequencies: []`.
  - `fetchHtml` kastar `SourceError` för ett JSON-svar (i `http.test.ts`).
- [ ] **Step 3: Kör** `npx vitest run src/server/miva.test.ts src/server/http.test.ts`. Väntat: FAIL.
- [ ] **Step 4: Skriv `fetchHtml` och klienten.** Sökningens URL är `MIVA_URL` med `sv.target=MIVA_APP`, `sv.<MIVA_APP>.route=/` och `q`. Frågan rensas som i `vakinSearch` (orten bort, `:` och andra skiljetecken till mellanslag). Tillståndet är JSON mellan `registerInitialState('<MIVA_APP>',` och `);</script>`. Adresser med andra tecken än bokstäver, siffror, mellanslag och bindestreck tas bort.
- [ ] **Step 5: Kör** samma kommando. Väntat: PASS.
- [ ] **Step 6: Commit** `feat: Mivas sökning för Örnsköldsvik`

### Task 3: Uppslag och schema

**Files:**
- Modify: `src/server/miva.ts`
- Test: `src/server/miva.test.ts`

**Interfaces:**
- Consumes: `mivaState`, `mivaSearch`, `mivaAddressId`, `MivaAddress` (Task 2). `weekRuleDates` med `inWeeks` (Task 1).
- Produces:
  - `mivaFind(id: string, fetchFn?, timeoutMs = 5000): Promise<MivaAddress | null>`. Söker på `queryFromAddressId(id).query` och väljer adressen med samma id. Saknar den frekvenser söks gatan utan nummer, och frekvenserna tas därifrån.
  - `interface MivaTrip { text: string; types: string[]; first: string; next?: string }`, med datum som `YYYY-MM-DD` i svensk tid (`todayInStockholm(new Date(iso))`).
  - `mivaTrips(a: MivaAddress, fetchFn?, timeoutMs = 5000): Promise<MivaTrip[]>`. Route `/details/<address>` och `city`. En tom lista är ett giltigt, tomt schema.
  - `mivaSchedule(trips: MivaTrip[], frequencies: string[], today: string): Schedule`.

- [ ] **Step 1: Skriv testerna:**
  - `mivaFind` hittar Nygatan 2 i Örnsköldsvik från dess id, och ger `null` för ett id med fel hash.
  - `mivaFind` för Nygatan 10 i Bredbyn, där första sökningen går direkt till schemat, gör en andra sökning på `q=Nygatan` och får frekvensen `Var 14:e dag`.
  - `mivaTrips` ger `{ text: 'måndag jämna veckor', types: ['Restavfall', 'Matavfall'], first: '2026-11-23', next: '2026-12-07' }` för första turen i `miva-schema.html`, och `[]` för `miva-schema-tomt.html`.
  - `mivaSchedule`, med `today = '2026-11-16'`:
    - `Var 14:e dag` och `first: '2026-11-16'`: första händelsen är 2026-11-16 med `estimated: false`, den tredje är 2026-12-14 med `estimated: true`, och fraktionerna är `rest` och `mat`.
    - `1 gång per vecka`: 2026-11-19, 2026-11-26 och 2026-12-03.
    - `2 gånger per vecka` med `first: '2026-11-16'` och `next: '2026-11-19'`: måndagar och torsdagar.
    - `Var 14:e dag (v 22-39)` med `first: '2027-06-01'`: inget datum utanför veckorna 22–39.
    - Okänd frekvens, eller ingen: bara `first` och `next`, `estimated: false`.
    - `typeText` `Hushållsavfall` blir `rest`.
- [ ] **Step 2: Kör** `npx vitest run src/server/miva.test.ts`. Väntat: FAIL.
- [ ] **Step 3: Skriv funktionerna.** Regeln per frekvens, med veckodag och paritet ur `edpRule(text, 26)`:
  - `Var 14:e dag`: `weekRuleDates(first, { weekday, every: 2, parity })`.
  - `Var 14:e dag (v 22-39)`: samma, med `{ inWeeks: [22, 39] }`.
  - `1 gång per vecka`: `weekRuleDates(first, { weekday, every: 1 })`.
  - `2 gånger per vecka`: `expandWeekdays({ next: first, weekdays: [veckodagen för first, veckodagen för next] })`.
  - Har adressen flera frekvenser används den tätaste. Stämmer `first` inte med regeln ger `weekRuleDates` bara källans datum.
  - `next` läggs alltid till som källans eget datum. Datum före `today` tas bort, och turerna slås ihop med `mergeSeries`.
- [ ] **Step 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Step 5: Commit** `feat: Mivas hämtschema med framräknade datum`

### Task 4: Källan i sökningen, uppslaget och kalendern

**Files:**
- Modify: `src/sources/index.ts`, `src/server/handlers.ts`, `src/server/lookup.ts`
- Create: `data/osm/2284.json` (med `npm run build:streets`)
- Test: `src/server/miva-handlers.test.ts`, `src/sources/sources.test.ts` om den listar källtyper

**Interfaces:**
- Consumes: `mivaSearch`, `mivaFind`, `mivaTrips`, `mivaSchedule` (Task 2 och 3).
- Produces: `SourceConfig` får `{ system: 'miva' }`. Källan `{ id: 'miva', name: 'Miva', url: 'https://miva.se', kommuner: [{ code: '2284', name: 'Örnsköldsviks kommun' }], config: { system: 'miva' } }`, med `contact` från Mivas kontaktsida (kontrollerad i dag) och `emptyScheduleNote`:
  - `title`: `Miva visar ingen tömning just nu`
  - `text`: `Källan har inga planerade tömningar för den här adressen. Miva visar bara villor, radhus och fritidshus med eget kärl. Bor du i flerbostadshus, kontakta Miva.`

- [ ] **Step 1: Skriv testerna** i `src/server/miva-handlers.test.ts`, efter mönstret i `vakin-handlers.test.ts`:
  - `handleSearch` för "Nygatan 2" ger adressen med id `mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')` och kommunen Örnsköldsviks kommun.
  - `handleSchedule` för id:t ger 200 och ett schema, och ger 502 för ett id utan träff.
  - `handleIcs` ger en kalenderfil med UID `<id>-2026-11-23@sopor.hardyson.se`, och 502 för ett tomt schema.
  - `handleV1Address` ger adressen och schemat.
- [ ] **Step 2: Kör** `npx vitest run src/server/miva-handlers.test.ts`. Väntat: FAIL.
- [ ] **Step 3: Koppla in källan:** en gren i `searchLiveSource` (som `vakin`, med `system === 'miva'` i listan över källor som filtrerar orten själva), `lookupMiva` i `lookup.ts` (som `lookupTelge`), och källan i `ALL_SOURCES` efter `vakin`. Kör `npm run build:streets` och checka in `data/osm/2284.json`.
- [ ] **Step 4: Kör** `npm run lint && npm test && npm run build`. Väntat: grönt.
- [ ] **Step 5: Commit** `feat: Örnsköldsvik (Miva)`

### Task 5: Bevakningen

**Files:**
- Modify: `scripts/source-checks.ts`, `scripts/monitor-sources.ts`, `docs/kommuner/hitta-kommunens-data.md`
- Test: `scripts/source-checks.test.ts`

**Interfaces:**
- Consumes: `MIVA_URL`, `mivaFind`, `mivaSearch`, `mivaTrips`, `mivaSchedule`, `mivaAddressId` (Task 2 och 3).
- Produces: `checkMivaSource(source: Source, probe: string, today: string, fetchFn?: typeof fetch): Promise<SourceResult>`, som `checkVakinSource`.

- [ ] **Step 1: Skriv testerna** för lägena `fungerar`, svarar inte, `nytt-format` (sida utan tillstånd), `tom` (sökningen ger inget), `inga-tomningar` och en okänd frekvenstext eller fraktion i `unknownWasteTypes`.
- [ ] **Step 2: Kör** `npx vitest run scripts/source-checks.test.ts`. Väntat: FAIL.
- [ ] **Step 3: Skriv `checkMivaSource`,** lägg den i `checks` och `miva` i listan för `siteProbe` i `monitor-sources.ts`, och lägg en kontrolladress i `PROBES`: ett adress-id för en villa med riktigt schema, med en kommentar som hänvisar till specen. Ta bort Örnsköldsviks rad ur tabellen i `hitta-kommunens-data.md`, eftersom kommunen nu är live.
- [ ] **Step 4: Kör** `npm run lint && npm test && npm run build` och `npm run monitor:sources` för källan, om skriptet tar ett id. Väntat: grönt, och `miva` som `fungerar`.
- [ ] **Step 5: Kontrollera i `npm run dev`:** sök "Nygatan 2, Örnsköldsvik" och en adress i Bredbyn, öppna schemat och ladda ner kalenderfilen.
- [ ] **Step 6: Commit** `feat: Bevakning av Miva`

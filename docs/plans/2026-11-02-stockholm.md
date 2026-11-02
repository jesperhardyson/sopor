# Stockholm – implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development (rekommenderas) eller superpowers:executing-plans för att genomföra planen uppgift för uppgift. Stegen har kryssrutor (`- [ ]`).

**Mål:** Stockholms villor och radhus på sajten, i API:t och i kalendrarna, via SVOA:s publika tjänst, utan att en ändring hos SVOA kan ge användarna fel datum eller tömda kalendrar.

**Arkitektur:** En ny källtyp `svoa` med en egen klient (`src/server/svoa.ts`) bredvid EDP. Sökningen för live-källor samlas i en funktion som både `/api/sok` och `/api/v1/sok` använder, och uppslaget i `lookup.ts` får en gren för `svoa`. Datum räknas fram med en ny generell funktion i `src/domain/recurrence.ts`.

**Teknik:** TypeScript, Vitest, React (bara `EmptyState`), Vercel Functions.

**Spec:** `docs/specs/2026-11-02-stockholm.md`

## Genomgående krav

- Källan: `{ id: 'stockholm', name: 'Stockholm Vatten och Avfall', url: 'https://www.stockholmvattenochavfall.se', kommuner: [{ code: '0180', name: 'Stockholms kommun' }], config: { system: 'svoa' } }`. Id:t får aldrig ändras.
- Bas-URL: `https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen`, med `GET /AutoCompleteMe?query=…` och `GET /Search?address=…`.
- Anropen går via `fetchJson` (`src/server/http.ts`), med User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)`. Timeout: 3000 ms för sökning och 5000 ms för schema.
- Adress-id: `hjortronvägen-3_bromma-16859` för `Hjortronvägen 3, Bromma, 168 59`. Formatet får aldrig ändras.
- Okänd form, eller ett datum som inte är `YYYY-MM-DD`, kastar `SourceError('stockholmvattenochavfall.se svarade med ett okänt format')`. Aldrig en tom lista.
- Ett id utan träff ger 502, aldrig 404, både i `/api/schema`, `/api/v1/adress` och `/ics/…`.
- Beräknade datum i 12 månader. Det första datumet är källans eget (`estimated: false`), och resten är `estimated: true`.
- Lägenheter, exakt text: rubrik `I Stockholm visar Sopor bara villor och radhus`, text `Bor du i lägenhet sköter fastighetsägaren sophämtningen. Fråga din hyresvärd eller bostadsrättsförening.`
- Kod som funktionerna når använder relativa importer med `.js` (AGENTS.md regel 2).
- Kommentarer, texter och commit-meddelanden på svenska. `npm run lint && npm test && npm run build` grönt före varje commit.

## Att granska extra

1. **Husnummer med bokstav** (`Hjortronvägen 3 A, Bromma, 168 59`): id:t blir `hjortronvägen-3a_bromma-16859`, och uppslaget hittar adressen. Test i uppgift 2.
2. **Adressökningen ger både "3" och "3 A"** för samma postnummer: uppslaget för `…-3_…` väljer "3", aldrig "3 A". Gatan jämförs exakt, inte som prefix. Test i uppgift 2.
3. **En säsongsfrekvens när nästa datum är i november:** inga datum december till mars, och nästa datum i april. Test i uppgift 1.
4. **Sökning med ort i API v1** (`Hjortronvägen 3 Bromma`): ger Stockholms adress, med kommunen "Stockholms kommun". Test i uppgift 3.
5. **Kalenderfilen för ett id utan träff:** svarar 502, aldrig med uppmaningskalendern (`buildNoticeIcs`). Test i uppgift 3.

---

### Uppgift 1: Datum med fast intervall och säsong

**Filer:**
- Ändra: `src/domain/recurrence.ts`, `src/domain/recurrence.test.ts`

**Gränssnitt:**
- Ger:
  ```ts
  /** Var `stepDays`:e dag från `next` i `months` månader. Med `inMonths` (1–12) bara datum i de månaderna. */
  export function expandEvery(input: { next: string; stepDays: number; months?: number; inMonths?: number[] }): ExpandedPickup[]
  ```

- [ ] **Steg 1: Skriv de fallerande testerna.**
  - `expandEvery({ next: '2026-11-04', stepDays: 14 })` börjar med `{ date: '2026-11-04', estimated: false }`, sedan `2026-11-18` med `estimated: true`, och slutar senast `addDays('2026-11-04', 365)`.
  - Granska extra 3: `expandEvery({ next: '2026-11-11', stepDays: 14, inMonths: [4,5,6,7,8,9,10,11] })` har inga datum i december, januari, februari eller mars, och nästa datum efter `2026-11-25` ligger i april 2027.
  - Ett beräknat datum på juldagen (`next: '2026-12-11', stepDays: 14` ger `2026-12-25`) har varningen `Infaller på juldagen – kan flyttas.`
- [ ] **Steg 2: Kör** `npx vitest run src/domain/recurrence.test.ts`. Väntat: FAIL, `expandEvery` finns inte.
- [ ] **Steg 3: Skriv `expandEvery`.** Datumen tas fram med samma stegning och slutdatum som `expandPickups`, och varningarna med samma kod, som bryts ut till en gemensam hjälpfunktion så att de två delar den. `next` behålls alltid, även utanför `inMonths`.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS, även de befintliga testerna för `expandPickups`.
- [ ] **Steg 5: Commit** `git commit -m "Datum med fast intervall och säsong"`

### Uppgift 2: SVOA-klienten

**Filer:**
- Skapa: `src/server/svoa.ts`, `src/server/svoa.test.ts`, `src/server/__fixtures__/stockholm-search.json`, `src/server/__fixtures__/stockholm-schedule.json`, `src/server/__fixtures__/stockholm-schedule-gammal.json`
- Ändra: `src/server/edp.ts` (exportera `encode`)

**Gränssnitt:**
- Använder: `expandEvery` (uppgift 1), `mapWasteType` (`src/server/fractions-map.ts`), `fetchJson`, `SourceError` (`src/server/http.ts`), `encode` och `queryFromAddressId` (`src/server/edp.ts`).
- Ger:
  ```ts
  export const SVOA_URL = 'https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen'
  export interface SvoaAddress { raw: string; street: string; locality: string; postcode: string }
  export function parseSvoaAddress(raw: string): SvoaAddress | null
  export function svoaAddressId(a: SvoaAddress): string
  /** Söksträng ("hjortronvägen 3") och postnummer utan mellanslag ("16859") */
  export function queryFromSvoaId(id: string): { query: string; postcode: string } | null
  /** Gatan och postnumret som id:t pekar på: uppslaget jämför bara dessa, inte orten. */
  export function sameSvoaAddress(id: string, a: SvoaAddress): boolean
  export function svoaFractions(group: string): { fractions: FractionId[]; label?: string }
  /** null för en frekvens vi inte känner igen */
  export function svoaStep(frequency: string): { stepDays: number; inMonths?: number[] } | null
  export async function svoaSearch(q: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<SvoaAddress[]>
  export async function svoaSchedule(raw: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<Schedule>
  ```

- [ ] **Steg 1: Spara de riktiga svaren.** Hämta `AutoCompleteMe?query=Hjortronvägen` och `Search?address=Hjortronvägen 3, Bromma, 168 59` en gång var, med Sopors User-Agent, och spara dem som `stockholm-search.json` och `stockholm-schedule.json`. Skriv `stockholm-schedule-gammal.json` för hand i det äldre formatet: `{ "Kärl 1 - restavfall och matavfall": [{ "ExecutionDate": "2026-11-04", "FetchFrequency": "Varannan vecka", "Weekday": "Onsdag" }] }`.
- [ ] **Steg 2: Skriv de fallerande testerna** (falskt `fetch` som i `edp.test.ts`).
  - `parseSvoaAddress('Hjortronvägen 3, Bromma, 168 59')` → `{ street: 'Hjortronvägen 3', locality: 'Bromma', postcode: '168 59', raw: … }`. Tre delar krävs, annars `null`.
  - `svoaAddressId(…)` → `'hjortronvägen-3_bromma-16859'`. Testet låser strängen.
  - Granska extra 1: `Hjortronvägen 3 A, Bromma, 168 59` → `'hjortronvägen-3a_bromma-16859'`, och `sameSvoaAddress` stämmer mot den adressen.
  - `queryFromSvoaId('hjortronvägen-3_bromma-16859')` → `{ query: 'hjortronvägen 3', postcode: '16859' }`.
  - Granska extra 2: `sameSvoaAddress('hjortronvägen-3_bromma-16859', <3 A>)` är `false`, och samma id mot `Hjortronvägen 3, BROMMA, 168 59` är `true` (orten jämförs inte).
  - `svoaFractions` för varje rad i specens tabell. Okänd grupp `'Kärl 9 - farligt avfall'` → `{ fractions: ['karl'], label: 'Kärl 9 - farligt avfall' }`.
  - `svoaStep`: `Varje vecka` 7, `Varannan vecka` 14, `Var 3:e vecka` 21, `Var 4:e vecka` 28, `Varannan vecka (april-nov)` 14 med `inMonths: [4,5,6,7,8,9,10,11]`. `'Var 14:e dag'` → `null`.
  - `svoaSearch` med `stockholm-search.json` ger adresser. Svar som inte är en array, eller poster utan `value`, kastar `SourceError` med specens text.
  - `svoaSchedule` med `stockholm-schedule.json`: fyra grupper, `2026-11-04` har `['rest', 'mat']` och `estimated: false`, och trädgårdsavfallet har `labels.karl === 'Trädgårdsavfall'`. Samma resultat för de gemensamma datumen med `stockholm-schedule-gammal.json`.
  - `svoaSchedule` med `[]` ger `{ events: [] }`, och schemat visar sig som tomt (lägenhet).
  - `svoaSchedule` med `{ "något": 1 }`, med `executionDate: '4 nov'` och med `[{ group: 'X' }]` kastar `SourceError`.
  - En okänd frekvens ger bara källans datum för den gruppen.
- [ ] **Steg 3: Kör** `npx vitest run src/server/svoa.test.ts`. Väntat: FAIL, modulen saknas.
- [ ] **Steg 4: Skriv `svoa.ts`.**
  - `svoaFractions`: delar `group` vid ` - `. En lista efter strecket delas vid ` och ` och `,`, och varje del går genom `mapWasteType`. Annars går delen före kommatecknet genom `mapWasteType` (`'Trädgårdsavfall, villa'` → `'Trädgårdsavfall'`). Gör `mapWasteType` om ett känt kärl till `karl`, används källans hela text som etikett.
  - `svoaSchedule` läser båda formaten till `{ group, frequency, date }[]` och slår ihop händelser per datum som `edpSchedule` gör. `bins` är tom och `updatedAt` är dagens datum.
- [ ] **Steg 5: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 6: Commit** `git commit -m "Stockholm: klient för SVOA:s publika tjänst"`

### Uppgift 3: Källan, sökningen, uppslaget och API:t

**Filer:**
- Ändra: `src/sources/index.ts`, `src/server/handlers.ts`, `src/server/lookup.ts`, `src/server/v1.ts`, `src/server/handlers.test.ts`, `src/server/v1.test.ts`
- Skapa: `data/osm/0180.json` (med `npm run build:streets`)

**Gränssnitt:**
- Använder: allt från uppgift 2.
- Ger:
  ```ts
  // src/sources/index.ts
  export type SourceConfig = { system: 'static' } | { system: 'edp'; baseUrl: string } | { system: 'svoa' }
  export type LiveSource = Source & { config: { system: 'edp' | 'svoa' } }
  export const isLive = (s: Source): s is LiveSource => s.config.system !== 'static'
  // src/server/handlers.ts
  export function liveSources(ids: string[], sources: Source[]): LiveSource[]   // ersätter edpSources
  /** En live-källas adresser för gatan, filtrerade på orten om den finns. */
  export async function searchLiveSource(source: LiveSource, street: string, place: string, opts: HandlerOptions): Promise<Address[]>
  ```

- [ ] **Steg 1: Skriv de fallerande testerna.**
  - `handleSearch` med `sources=stockholm` och falskt `fetch` som svarar med `stockholm-search.json` ger Stockholms adresser, med `kommun: 'Stockholms kommun'` och `sourceId: 'stockholm'`.
  - `handleSchedule` för `stockholm` och id:t `hjortronvägen-3_bromma-16859` ger 200 och schemat.
  - Granska extra 5: samma id när adressökningen inte har id:t ger **502** från `handleSchedule` och från `handleIcs`. Kalendersvaret innehåller inte `-saknas@`.
  - När adressökningen eller schemat har okänd form ger `handleSchedule` 502.
  - Granska extra 4: `handleV1Search` med `q=Hjortronvägen 3 Bromma` (gatuindexet stubbat så att `hjortronvägen` pekar på `stockholm`) ger adressen med `kommun: 'Stockholms kommun'`.
  - `handleV1Address` för Stockholms id ger schemat.
- [ ] **Steg 2: Kör** `npx vitest run src/server`. Väntat: FAIL för de nya testerna.
- [ ] **Steg 3: Lägg till källan och koppla in den.**
  - Källan läggs sist i `ALL_SOURCES`, som Genomgående krav anger.
  - `searchLiveSource` gör det `handleSearch` och `v1.ts` gör för EDP i dag (`edpSearchPlace`, `withDetails`, `toAddress`, `matchesPlace`). För `svoa` gör den `svoaSearch(street)` och bygger `Address` med id från `svoaAddressId`, `locality` från adressen och kommunen från källan.
  - `handleSearch` och `handleV1Search` använder `searchLiveSource` och `isLive` i stället för sina egna EDP-grenar. I `v1.ts` blir `live` alla källor där `isLive` gäller.
  - `lookupAddress` får en gren för `svoa`: `queryFromSvoaId` → `svoaSearch(query)` → första träffen där `sameSvoaAddress` gäller → `svoaSchedule`. Ingen träff, eller ett ogiltigt id, ger `{ status: 502 }`.
- [ ] **Steg 4: Gatuindexet.** Kör `npm run build:streets` och checka in `data/osm/0180.json`. Overpass kan vara överbelastad, och skriptet försöker då igen. Testet i `scripts/build-street-index.test.ts` kräver filen.
- [ ] **Steg 5: Kör** `npm run lint && npm test && npm run build`. Väntat: grönt. Uppdatera `scripts/check-source.ts` och `scripts/monitor-sources.ts` bara så mycket som typerna kräver; uppgift 5 gör bevakningen.
- [ ] **Steg 6: Commit** `git commit -m "Stockholm: källan i sökningen, uppslaget och API:t"`

### Uppgift 4: Besked för lägenheter

**Filer:**
- Ändra: `src/sources/index.ts` (fältet och texten på Stockholm), `src/ui/result/ResultStates.tsx`, `src/ui/pages/ResultPage.tsx`, `src/ui/pages/ResultPage.test.tsx`

**Gränssnitt:**
- Använder: källan från uppgift 3.
- Ger: `Source.emptyScheduleNote?: { title: string; text: string }` och `EmptyState({ note }: { note?: { title: string; text: string } })`.

- [ ] **Steg 1: Skriv de fallerande testerna** i `ResultPage.test.tsx`:
  - En källa med `emptyScheduleNote` och ett tomt schema visar rubriken och texten från Genomgående krav, och inte `Inga kommande tömningar i schemat än`.
  - Utan `emptyScheduleNote` visas dagens text som förut.
- [ ] **Steg 2: Kör** `npx vitest run src/ui/pages/ResultPage.test.tsx`. Väntat: FAIL.
- [ ] **Steg 3: Skriv koden.** `ResultPage` skickar `source.emptyScheduleNote` till `EmptyState`, som har samma utseende som i dag.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 5: Commit** `git commit -m "Stockholm: besked för lägenheter"`

### Uppgift 5: Bevakningen

**Filer:**
- Ändra: `scripts/source-checks.ts`, `scripts/source-checks.test.ts`, `scripts/monitor-sources.ts`, `scripts/monitor-sources.test.ts`

**Gränssnitt:**
- Använder: `svoaSearch`, `svoaSchedule`, `svoaFractions`, `svoaStep`, `SVOA_URL` (uppgift 2), `checkEdpSource`, `SourceResult` (redan i `source-checks.ts`).
- Ger: `export async function checkSvoaSource(source: Source, probe: string, today: string, fetchFn?: typeof fetch): Promise<SourceResult>`

- [ ] **Steg 1: Skriv de fallerande testerna.**
  - `checkSvoaSource` med `stockholm-search.json` och `stockholm-schedule.json` ger `fungerar` och `baseUrl: SVOA_URL`.
  - Timeout ger `svarar-inte`, okänd form ger `nytt-format`, en tom adressökning ger `tom`, och ett tomt schema för kontrolladressen ger `inga-tomningar`.
  - En okänd grupp ger den i `unknownWasteTypes`, och en okänd frekvens ger `Frekvens: <text>` i samma lista.
  - Testet för kontrolladresser gäller alla källor där `isLive` gäller, och `PROBES.stockholm === 'Hjortronvägen 3, Bromma, 168 59'`.
- [ ] **Steg 2: Kör** `npx vitest run scripts`. Väntat: FAIL för de nya testerna.
- [ ] **Steg 3: Skriv `checkSvoaSource`** med samma klassning av fel som `checkEdpSource` (bryt ut den om den inte redan är delad). Okända grupper och frekvenser läses ur råsvaret med `svoaFractions` och `svoaStep`. `runChecks` väljer kontroll efter `config.system`.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 5: Commit** `git commit -m "Stockholm: med i bevakningen av källorna"`

### Uppgift 6: Dokumentation och kontroll på riktigt

**Filer:**
- Ändra: `docs/kommuner/hitta-kommunens-data.md`, `docs/kommuner/lagga-till-kommun.md`, `docs/plans/2026-11-02-forbattringar.md`

- [ ] **Steg 1: Dokumentation.**
  - `hitta-kommunens-data.md`: en rad för Stockholm i tabellen (sköts av SVOA, schemat via `AutoCompleteMe` och `Search`, bara villor och radhus, live).
  - `lagga-till-kommun.md`: en mening om att en ny källtyp följer Stockholms mönster (`src/server/svoa.ts`, en gren i `searchLiveSource` och `lookupAddress`, en kontroll i bevakningen), och en ruta "Berätta för källan att Sopor använder deras publika tjänst" (för Stockholm: mejl till SVOA:s kundtjänst, som Jesper skickar).
  - Förbättringslistan: under punkt 12, "Stockholm (SVOA): klart".
- [ ] **Steg 2: Kontrollera mot den riktiga tjänsten** med `npm run dev` och webbläsaren:
  - Sök "Hjortronvägen 3": adressen finns, och adressidan visar Kärl 1–3 med fraktioner och beräknade datum.
  - Sök "Drottninggatan 50 Stockholm": adressen finns, och adressidan visar beskedet för lägenheter.
  - `/ics/stockholm/hjortronvägen-3_bromma-16859.ics` ger en kalender.
  - `RETRY=0 npm run monitor:sources` visar Stockholm som `fungerar`.
- [ ] **Steg 3: Kör** `npm run lint && npm test && npm run build`. Väntat: grönt.
- [ ] **Steg 4: Commit** `git commit -m "Stockholm: dokumentation"`

# Malmö och Burlöv (VA Syd) – implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development (rekommenderas) eller superpowers:executing-plans för att genomföra planen uppgift för uppgift. Stegen har kryssrutor (`- [ ]`).

**Mål:** Malmö och Burlöv på sajten, i API:t och i kalendrarna via VA Syds publika tjänst, med samma skydd mot ändringar hos källan som Stockholm.

**Arkitektur:** En ny källtyp `vasyd` med en klient (`src/server/vasyd.ts`) som ger samma `EdpBuilding` som EDP, så att adress-id, särskiljare och kommun per ort återanvänds. `searchLiveSource` och `lookupAddress` får varsin gren, och bevakningen en kontroll.

**Teknik:** TypeScript, Vitest, Vercel Functions.

**Spec:** `docs/specs/2026-11-03-malmo-vasyd.md`

## Genomgående krav

- Källan: `{ id: 'vasyd', name: 'VA Syd', url: 'https://www.vasyd.se', kommuner: [{ code: '1280', name: 'Malmö kommun' }, { code: '1231', name: 'Burlövs kommun' }], config: { system: 'vasyd' } }`. Id:t får aldrig ändras.
- `VASYD_URL = 'https://www.vasyd.se/api/sitecore/mypagesapi'`, med `POST /buildingaddresssearch` (`query`) och `POST /wastepickupbyaddress` (`query` = byggnads-id, `street`), som `application/x-www-form-urlencoded`. Sökvägen med gemener.
- Via `fetchJson`, User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)`, timeout 3000 ms för sökning och 5000 ms för schema.
- Adress-id med `edpAddressId`: `storgatan-1_malmö-125040` för `Storgatan 1, Malmö` (125040). Formatet får aldrig ändras.
- Okänd form kastar `SourceError('vasyd.se svarade med ett okänt format')`. Aldrig en tom lista.
- Ett id utan träff ger 502, inte 404.
- Frekvenser: `varje vecka` 7, `jämn vecka` och `udda vecka` 14, `var 4:e vecka` (med eller utan `startvecka N`) 28. Annat ger bara källans datum.
- Sparade svar får inte heta något som slutar på `-search.json` eller `-schedule.json`.
- Kod som funktionerna når använder relativa importer med `.js`. Kommentarer och commit-meddelanden på svenska. `npm run lint && npm test && npm run build` före varje commit.

## Att granska extra

1. **Två byggnader med samma adress** (Storgatan 1, Malmö: 125040 och 185904): båda syns i sökningen med "Byggnad …", och uppslaget väljer rätt byggnads-id. Test i uppgift 2.
2. **Arlöv** ger kommunen "Burlövs kommun", även i API v1. Test i uppgift 2.
3. **`nextWastePickup` med tid** (`2026-11-04T00:00:00`) kortas till datumet och räknas inte som okänd form. Test i uppgift 1.
4. **`meta.success: false` med en tom lista** ger ett fel, inte "inga adresser". Test i uppgift 1.
5. **En veckodag följd av en okänd text** (`Onsdag jämn vecka trädgård`, `Varannan onsdag`) ger bara källans datum. Test i uppgift 1.

---

### Uppgift 1: VA Syd-klienten

**Filer:**
- Skapa: `src/server/vasyd.ts`, `src/server/vasyd.test.ts`, `src/server/__fixtures__/vasyd-adresser.json`, `src/server/__fixtures__/vasyd-schema.json`, `src/server/__fixtures__/vasyd-schema-fyrfack.json`

**Gränssnitt:**
- Använder: `EdpBuilding`, `edpAddressId`, `mergeSeries`, `PickupSeries` (`src/server/edp.ts`), `mapWasteType` (`src/server/fractions-map.ts`), `expandEvery` (`src/domain/recurrence.ts`), `fetchJson`, `SourceError` (`src/server/http.ts`).
- Ger:
  ```ts
  export const VASYD_URL = 'https://www.vasyd.se/api/sitecore/mypagesapi'
  export function vasydStep(frequency: string): number | null
  export async function vasydSearch(q: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<EdpBuilding[]>
  export async function vasydSchedule(b: EdpBuilding, fetchFn?: typeof fetch, timeoutMs?: number): Promise<Schedule>
  ```

- [ ] **Steg 1: Spara de riktiga svaren.** En sökning på `Storgatan 1` (`vasyd-adresser.json`) och scheman för Limhamnsvägen 50, Malmö (104904, `vasyd-schema.json`) och Lommavägen 14, Arlöv (131502, `vasyd-schema-fyrfack.json`), med Sopors User-Agent. Tre anrop.
- [ ] **Steg 2: Skriv de fallerande testerna** (falskt `fetch` som i `svoa.test.ts`).
  - `vasydStep`: `Onsdag varje vecka` 7, `Tisdag udda vecka` 14, `Torsdag jämn vecka ` (med blanksteg sist) 14, `Tisdag var 4:e vecka startvecka 1` 28, `Torsdag var 4:e vecka` 28.
  - Granska extra 5: `Onsdag jämn vecka trädgård`, `Varannan onsdag` och `varje vecka` (utan veckodag) ger `null`.
  - `vasydSearch` med `vasyd-adresser.json`: den första träffen är `{ raw: 'Storgatan 1, Malmö', street: 'Storgatan 1', locality: 'Malmö', buildingId: '125040' }`, och `edpAddressId` för den är `'storgatan-1_malmö-125040'` (låst).
  - Anropet är `POST` till `${VASYD_URL}/buildingaddresssearch` med kroppen `query=Storgatan+1`.
  - Granska extra 4: `{ meta: { success: false }, items: [] }`, ett svar utan `items` och en träff utan `id` kastar `SourceError` med specens text.
  - `vasydSchedule` med `vasyd-schema.json`: `2026-11-04` har `['rest', 'mat']` och `estimated: false`, och `2026-11-11` är beräknad. Anropet skickar `query=104904` och `street=Limhamnsvägen 50, Malmö`.
  - `vasydSchedule` med `vasyd-schema-fyrfack.json`: `2026-11-03` har `labels.karl` med `Fyrfackskärl 1` och `Fyrfackskärl 2`, och trädgårdsavfallet finns bara på `2026-11-11` (okänd frekvens).
  - Granska extra 3: `nextWastePickup: '2026-11-04T00:00:00'` ger datumet `2026-11-04`.
  - `{ meta: { success: true }, items: [] }` ger `events: []`. Ett datum som `4 nov` kastar.
- [ ] **Steg 3: Kör** `npx vitest run src/server/vasyd.test.ts`. Väntat: FAIL, modulen saknas.
- [ ] **Steg 4: Skriv `vasyd.ts`.** `vasydStep` kräver en veckodag (måndag–söndag) först och sedan exakt en av frekvenserna i Genomgående krav, efter att blanksteg i början och slutet tagits bort. Schemat byggs med `mapWasteType`, `expandEvery` och `mergeSeries`, som `svoaSchedule`.
- [ ] **Steg 5: Kör** `npx vitest run src/server`. Väntat: PASS, även EDP:s tester.
- [ ] **Steg 6: Commit** `git commit -m "Malmö: klient för VA Syds publika tjänst"`

### Uppgift 2: Källan i sökning, uppslag och API

**Filer:**
- Ändra: `src/sources/index.ts`, `src/server/handlers.ts`, `src/server/lookup.ts`
- Skapa: `src/server/vasyd-handlers.test.ts`, `data/osm/1280.json`, `data/osm/1231.json`

**Gränssnitt:**
- Använder: allt från uppgift 1, och `searchLiveSource`, `withDetails`, `toAddress`, `searchCandidates`, `queryFromAddressId`, `loadServerPlaces`.
- Ger: `SourceConfig` med `{ system: 'vasyd' }`, och källan `vasyd` i `ALL_SOURCES`.

- [ ] **Steg 1: Skriv de fallerande testerna** i `vasyd-handlers.test.ts` (mönster som `svoa-handlers.test.ts`, med `/data/orter.json` som ger `{ vasyd: { 'malmö': 'Malmö kommun', 'arlöv': 'Burlövs kommun' } }`).
  - Granska extra 1: `handleSearch` med `q=Storgatan 1&sources=vasyd` ger båda Storgatan 1-byggnaderna med `detail: 'Byggnad 125040'` och `'Byggnad 185904'`.
  - Granska extra 2: Storgatan 10, Arlöv har `kommun: 'Burlövs kommun'`, både i `handleSearch` och i `handleV1Search` (`q=Storgatan 10 Arlöv`).
  - `handleSchedule` för `storgatan-1_malmö-185904` ger 200, och schemat hämtas med `query=185904`.
  - Ett id vars byggnads-id inte finns i sökningen ger 502 från `handleSchedule` och från `handleIcs`, och kalendersvaret innehåller inte `-saknas@`.
  - Okänd form i sökningen eller schemat ger 502.
- [ ] **Steg 2: Kör** `npx vitest run src/server/vasyd-handlers.test.ts`. Väntat: FAIL.
- [ ] **Steg 3: Lägg till källan och grenarna.**
  - Källan sist i `ALL_SOURCES`, som Genomgående krav anger.
  - `searchLiveSource`: `vasydSearch(street)` → `withDetails` → `toAddress` → `matchesPlace`, som EDP-grenen.
  - `lookupAddress`: `lookupVasyd` med `queryFromAddressId` → `searchCandidates` → träffen med rätt `buildingId` → `vasydSchedule`. Ingen träff ger `{ status: 502 }`. Ortindexet laddas som i `lookupEdp` (källan har två kommuner).
  - Uppdatera `scripts/monitor-sources.ts` så att `vasyd` inte går till `checkEdpSource` (tillfälligt till kontrollen via sajten, tills uppgift 3).
- [ ] **Steg 4: Gatuindex.** `npm run build:streets` för 1280 och 1231, och checka in filerna.
- [ ] **Steg 5: Kör** `npm run lint && npm test && npm run build`. Väntat: grönt.
- [ ] **Steg 6: Commit** `git commit -m "Malmö: källan i sökningen, uppslaget och API:t"`

### Uppgift 3: Bevakningen

**Filer:**
- Ändra: `scripts/source-checks.ts`, `scripts/source-checks.test.ts`, `scripts/monitor-sources.ts`, `scripts/monitor-sources.test.ts`

**Gränssnitt:**
- Använder: `vasydSearch`, `vasydSchedule`, `vasydStep`, `VASYD_URL` (uppgift 1) och `isKnownBin` (`src/server/fractions-map.ts`).
- Ger: `export async function checkVasydSource(source: Source, probe: string, today: string, fetchFn?: typeof fetch): Promise<SourceResult>`

- [ ] **Steg 1: Skriv de fallerande testerna.**
  - Med de sparade svaren och kontrolladressen `Limhamnsvägen 50, Malmö`: `fungerar`, `baseUrl: VASYD_URL`, `unknownWasteTypes: []`.
  - Timeout ger `svarar-inte`, okänd form ger `nytt-format`, en tom sökning ger `tom`.
  - En sökning utan `Limhamnsvägen 50, Malmö` (bara andra adresser) ger `nytt-format` med kontrolladressen i felet.
  - En okänd avfallstyp (`Grovavfall`) rapporteras, men inte `Trädgårdsavfall` (`isKnownBin`). En okänd frekvens rapporteras som `Frekvens: <text>`, utom `… trädgård` för en känd trädgårdstyp.
  - `PROBES.vasyd === 'Limhamnsvägen 50, Malmö'`.
- [ ] **Steg 2: Kör** `npx vitest run scripts`. Väntat: FAIL för de nya testerna.
- [ ] **Steg 3: Skriv `checkVasydSource`** med samma klassning av fel och samma råsvar som `checkSvoaSource`. Kontrolladressen matchas på `raw`. `checkOne` i `monitor-sources.ts` väljer kontroll efter `config.system`, med samma fallback via sajten som de andra.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 5: Commit** `git commit -m "Malmö: med i bevakningen av källorna"`

### Uppgift 4: Dokumentation och kontroll på riktigt

**Filer:**
- Ändra: `docs/kommuner/lagga-till-kommun.md`, `docs/plans/2026-11-02-forbattringar.md`

- [ ] **Steg 1: Dokumentation.** Avsnitt D: VA Syd (`src/server/vasyd.ts`) som andra exempel, och en rad om att EDP-lika svar kan återanvända `EdpBuilding` och `edpAddressId`. Förbättringslistan, punkt 12: "Malmö och Burlöv (VA Syd): klart" och "Göteborg: hämtdagen syns bara på Mina sidor; begär kopplingen adress → hämtdag som allmän handling".
- [ ] **Steg 2: Kontrollera i `npm run dev` och webbläsaren:** "Limhamnsvägen 50" ger en träff i Malmö med alla åtta avfallstyperna. "Lommavägen 14 Arlöv" ger Burlövs kommun och fyrfackskärlen. `/ics/vasyd/…` ger en kalender, och `RETRY=0 npm run monitor:sources` visar VA Syd som `fungerar`.
- [ ] **Steg 3: Kör** `npm run lint && npm test && npm run build`. Väntat: grönt.
- [ ] **Steg 4: Commit** `git commit -m "Malmö: dokumentation"`

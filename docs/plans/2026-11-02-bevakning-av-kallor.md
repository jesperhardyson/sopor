# Bevakning av källorna – implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development (rekommenderas) eller superpowers:executing-plans för att genomföra planen uppgift för uppgift. Stegen har kryssrutor (`- [ ]`).

**Mål:** Ett veckojobb som kontrollerar varje synlig källa med samma kod som sajten och gör problem till GitHub-ärenden som stängs av sig själva.

**Arkitektur:** Tre skriptfiler med var sitt ansvar: kontrollerna (`scripts/source-checks.ts`), ärendelogiken och GitHub-anropen (`scripts/source-issues.ts`) och körningen med kontrolladresser och utskrift (`scripts/monitor-sources.ts`). Allt utom nätverket är rena funktioner som testas med falskt `fetch`. Ett nytt arbetsflöde kör skriptet varje måndag.

**Teknik:** TypeScript (tsx), Vitest, GitHub Actions, GitHubs REST-API via `fetch`. Inga nya beroenden.

**Spec:** `docs/specs/2026-11-02-bevakning-av-kallor.md`

## Genomgående krav

- Bara publika anrop, User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)` (sätts redan av `fetchJson` i `src/server/http.ts`).
- Anropen till källorna går via `edpSearch` och `edpSchedule` i `src/server/edp.ts`, med `timeoutMs` 10 000.
- Nytt försök efter 5 minuter (300 000 ms), bara för källor i läget `svarar-inte`.
- "Framåt" betyder de närmaste 60 dagarna, både för tömningar och för statiska källors `validTo`.
- Cron `15 3 * * 1` och `workflow_dispatch`. Jobbet heter `sources`. Inget jobb får heta `test` utom i `ci.yml`.
- `permissions: contents: read, issues: write`. Bara det inbyggda `GITHUB_TOKEN`.
- Jobbet lyckas även när källor är trasiga. Det fallerar bara om skriptet kraschar.
- Etiketter: `källa` på alla bevakningens ärenden, och dessutom `avfallstyp` på ärenden om okända avfallstyper.
- Markering i ärendetexten: `<!-- sopor-bevakning: <källans id> <läge> -->`. Ärenden utan markering rörs aldrig.
- Kommentarer, texter och commit-meddelanden på svenska.

## Att granska extra

Fall som specen förutsätter men inte nämner. Varje rad har ett test i den uppgift som äger koden.

1. **En inloggningssida i stället för JSON** (status 200, `text/html`) ska bli `nytt-format`, inte `svarar-inte`. Test i uppgift 2.
2. **Sökningen fungerar men schemat ger 503** ska bli `svarar-inte`, inte `nytt-format`. Test i uppgift 2.
3. **En källa som inte svarar har ett öppet ärende om okända avfallstyper.** Avfallstyperna gick inte att läsa, så det ärendet ska varken stängas eller kommenteras. Test i uppgift 4.
4. **En källa som tas bort ur registret eller döljs** har kvar ett öppet ärende. Det ska stängas med "Källan kontrolleras inte längre". Test i uppgift 4.
5. **En källa i `SOURCES` saknar kontrolladress** och skulle tyst hoppas över. Testet i uppgift 3 ska fallera, med källans id i meddelandet.

---

### Uppgift 1: Inget jobb heter `test` utom i ci.yml

**Filer:**
- Skapa: `scripts/workflows.test.ts`

**Gränssnitt:** inga.

- [ ] **Steg 1: Skriv testet** `it.each(<filerna i .github/workflows/*.yml>)('%s har inget jobb som heter test, utom ci.yml')`. Jobben hittas med `/^jobs:\n((?:[ \t].*\n|\n)*)/m` följt av `/^  ([\w-]+):/gm` i blocket. För `ci.yml` ska `test` finnas, för övriga ska det inte göra det.
- [ ] **Steg 2: Kör** `npx vitest run scripts/workflows.test.ts`. Väntat: PASS för alla befintliga filer.
- [ ] **Steg 3: Kontrollera att testet biter.** Döp tillfälligt om `homey:` till `test:` i `.github/workflows/homey.yml` och kör igen. Väntat: FAIL för `homey.yml`. Återställ filen.
- [ ] **Steg 4: Commit** `git commit -m "Test: inget CI-jobb får heta test utom i ci.yml"`

### Uppgift 2: Kontrollerna

**Filer:**
- Skapa: `scripts/source-checks.ts`, `scripts/source-checks.test.ts`

**Gränssnitt:**
- Använder: `edpSearch`, `edpSchedule` (`src/server/edp.ts`), `SourceError` (`src/server/http.ts`), `classifyWasteTypes` (`scripts/check-source.ts`), `Source` (`src/sources/index.ts`), `addDays` (`src/domain/dates.ts`).
- Ger:
  ```ts
  export type SourceState = 'fungerar' | 'svarar-inte' | 'nytt-format' | 'tom' | 'inga-tomningar' | 'schemat-tar-slut'
  export interface SourceResult {
    sourceId: string
    name: string
    state: SourceState
    baseUrl?: string
    probe?: string
    /** Felet som det kom, t.ex. "futureweb.lidkoping.se svarade 502" */
    error?: string
    /** undefined = schemat hämtades inte, så avfallstyperna är okända */
    unknownWasteTypes?: string[]
  }
  export async function checkEdpSource(source: Source, probe: string, today: string, fetchFn?: typeof fetch): Promise<SourceResult>
  export function checkStaticSource(source: Source, validTo: string[], today: string): SourceResult
  ```

- [ ] **Steg 1: Skriv de fallerande testerna** i `scripts/source-checks.test.ts`. Använd `json` och `fakeEdp`-mönstret från `scripts/check-source.test.ts` (kopiera hjälparna; de exporteras inte). Källa: `{ id: 'test', name: 'Testkommun', config: { system: 'edp', baseUrl: 'https://edp.example.se/FutureWeb' }, … }`, `today = '2026-11-02'`.
  - `fungerar`: Buildings `['Storgatan 1, Test (1)']`, en tjänst med `NextWastePickup: '2026-11-10'` och `WasteType: 'Restavfall'` ger `{ state: 'fungerar', unknownWasteTypes: [] }`.
  - `svarar-inte`: `fetch` kastar `TypeError('fetch failed')` → `state: 'svarar-inte'` och `error` innehåller `Ingen kontakt med edp.example.se`.
  - `svarar-inte` vid 502 på sökningen.
  - `svarar-inte` vid 503 på schemat när sökningen fungerar (granska extra 2).
  - `nytt-format` vid 200 med `text/html` (granska extra 1), `error` innehåller `svarade inte med JSON`.
  - `nytt-format` vid 404 (sökvägen finns inte längre).
  - `nytt-format` när svaret saknar `Buildings`, och när `Buildings` har rader men ingen går att tolka (`['skräp']`).
  - `nytt-format` när schemasvaret saknar `RhServices`.
  - `tom`: `Buildings: []`.
  - `inga-tomningar`: enda tjänsten har `NextWastePickup: '2027-03-01'` och 0 tömningar per år.
  - Okända avfallstyper: `WasteType: 'Trädgårdsavfall XL'` ger `unknownWasteTypes: ['Trädgårdsavfall XL']` och `state: 'fungerar'`.
  - `unknownWasteTypes` är `undefined` när läget är `svarar-inte` och schemat aldrig hämtades.
  - `checkStaticSource(källa, ['2026-12-31'], '2026-11-02')` → `schemat-tar-slut` (59 dagar kvar). `['2027-01-10']` → `fungerar`. Det största `validTo` räknas.
- [ ] **Steg 2: Kör** `npx vitest run scripts/source-checks.test.ts`. Väntat: FAIL, modulen saknas.
- [ ] **Steg 3: Skriv `checkEdpSource` och `checkStaticSource`.**
  - Fånga råsvaren med ett spion-`fetch` (som `checkSource` gör), så att saknade `Buildings` och `RhServices` syns. `edpSearch` gör om dem till tomma listor.
  - Klassning av fel: `SourceError` vars text innehåller `Ingen kontakt` eller `svarade 5` → `svarar-inte`. Allt annat, alltså övriga `SourceError` och andra undantag → `nytt-format`.
  - Schemat hämtas för `buildings[0].raw`.
  - `inga-tomningar` när ingen händelse har `date` mellan `today` och `addDays(today, 60)`.
  - Avfallstyperna kommer från `classifyWasteTypes(<RhServices>)`, filtrerat på `status === 'okänd'` och mappat till `wasteType`.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 5: Commit** `git commit -m "Bevakning: kontroll av en källa"`

### Uppgift 3: Körningen och kontrolladresserna

**Filer:**
- Skapa: `scripts/monitor-sources.ts`, `scripts/monitor-sources.test.ts`

**Gränssnitt:**
- Använder: `checkEdpSource`, `checkStaticSource`, `SourceResult` (uppgift 2), `SOURCES` (`src/sources/index.ts`), `readYears` (`scripts/build-data.ts`).
- Ger:
  ```ts
  export const PROBES: Record<string, string>
  export async function runChecks(
    sources: Source[],
    today: string,
    opts?: { fetchFn?: typeof fetch; retryDelayMs?: number; readValidTo?: (sourceId: string) => string[] },
  ): Promise<SourceResult[]>
  export function formatTable(results: SourceResult[]): string
  ```

- [ ] **Steg 1: Skriv de fallerande testerna.**
  - `PROBES` har en adress för varje källa i `SOURCES` med `system: 'edp'`. Använd `it.each`, så att meddelandet namnger källans id (granska extra 5).
  - `PROBES` har inga nycklar som inte finns i `SOURCES`.
  - `runChecks` med `retryDelayMs: 0`: en källa vars första sökning kastar men andra fungerar blir `fungerar`, och det andra försöket görs bara för den källan (räkna anropen).
  - `runChecks` för en statisk källa använder `readValidTo` och gör inga anrop.
  - `formatTable` ger en Markdown-tabell med kolumnerna `Källa | Läge | Fel | Okända avfallstyper`, en rad per resultat.
- [ ] **Steg 2: Kör** `npx vitest run scripts/monitor-sources.test.ts`. Väntat: FAIL.
- [ ] **Steg 3: Ta fram kontrolladresserna.** Kör `npm run check:source -- <baseUrl> "<vanlig gata>"` för varje live-källa (gata från källans `data/osm/<kod>.json`, t.ex. Storgatan eller Kyrkogatan) och välj en adress ur utskriften. Skriv in dem i `PROBES` i samma ordning som `ALL_SOURCES`. Det blir ett 50-tal publika anrop, en gång.
- [ ] **Steg 4: Skriv `runChecks` och `formatTable`.**
  - Källorna kontrolleras en i taget, inte parallellt, så att varje värd bara får ett anrop åt gången.
  - Standardvärde för `retryDelayMs` är 300 000.
  - `readValidTo` läser som standard `readYears(path.join(root, 'data', id)).map((y) => y.schedules.validTo)`.
  - Källor med `hidden` finns inte i `SOURCES` och kontrolleras därför inte.
- [ ] **Steg 5: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 6: Commit** `git commit -m "Bevakning: kontrolladresser och körning med nytt försök"`

### Uppgift 4: Vilka ärenden som ska öppnas, kommenteras och stängas

**Filer:**
- Skapa: `scripts/source-issues.ts`, `scripts/source-issues.test.ts`

**Gränssnitt:**
- Använder: `SourceResult`, `SourceState` (uppgift 2).
- Ger:
  ```ts
  export interface OpenIssue { number: number; body: string }
  export type IssueAction =
    | { type: 'open'; title: string; body: string; labels: string[] }
    | { type: 'comment'; number: number; body: string }
    | { type: 'close'; number: number; body: string }
  /** "<!-- sopor-bevakning: lidkoping svarar-inte -->" → { sourceId, kind } */
  export function parseMarker(body: string): { sourceId: string; kind: string } | null
  export function planIssues(results: SourceResult[], open: OpenIssue[], today: string): IssueAction[]
  ```
  `kind` är läget, eller `okanda-avfallstyper`.

- [ ] **Steg 1: Skriv de fallerande testerna** med `today = '2026-11-09'`.
  - Nytt problem utan öppet ärende (resultat med `name: 'Lidköpings kommun'`) → `open` med titeln `Källa: Lidköpings kommun svarar inte`, etiketten `['källa']`, och en text som innehåller markeringen, `baseUrl`, kontrolladressen, felet, datumet och `npm run check:source -- <baseUrl> "<kontrolladress>"`.
  - Titlar för varje läge: `svarar inte`, `har nytt format`, `ger inga adresser`, `har inga tömningar framåt`, `schemat tar slut`, och `har okända avfallstyper` (etiketterna `['källa', 'avfallstyp']`, och typerna listade i texten).
  - Samma problem med öppet ärende → `comment` med `Fortfarande: <fel> (2026-11-09)`. Inget `open`.
  - Källan fungerar och har ett öppet ärende → `close` med `Fungerar igen 2026-11-09.`
  - Byter läge från `svarar-inte` till `nytt-format` → `close` på det gamla och `open` för det nya.
  - Ett ärende utan markering lämnas orört.
  - Granska extra 3: `svarar-inte` med `unknownWasteTypes: undefined` och ett öppet `okanda-avfallstyper`-ärende → inga åtgärder för det ärendet.
  - Granska extra 4: ett öppet ärende för en källa som inte finns i `results` → `close` med `Källan kontrolleras inte längre.`
- [ ] **Steg 2: Kör** `npx vitest run scripts/source-issues.test.ts`. Väntat: FAIL.
- [ ] **Steg 3: Skriv `parseMarker` och `planIssues`.** Problemen per resultat är `state` (om den inte är `fungerar`) och `okanda-avfallstyper` (om `unknownWasteTypes` har typer). Ärendets titel använder `source.name`, alltså `SourceResult.name`.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 5: Commit** `git commit -m "Bevakning: regler för ärenden"`

### Uppgift 5: GitHub-anropen

**Filer:**
- Ändra: `scripts/source-issues.ts`, `scripts/source-issues.test.ts`

**Gränssnitt:**
- Använder: `IssueAction`, `OpenIssue` (uppgift 4).
- Ger:
  ```ts
  export interface GitHub { repo: string; token: string; fetchFn?: typeof fetch }
  export async function listOpenIssues(gh: GitHub): Promise<OpenIssue[]>
  export async function ensureLabels(gh: GitHub): Promise<void>
  export async function applyIssues(gh: GitHub, actions: IssueAction[]): Promise<void>
  ```

- [ ] **Steg 1: Skriv de fallerande testerna** med ett falskt `fetch` som sparar anropen.
  - `listOpenIssues` anropar `GET https://api.github.com/repos/<repo>/issues?state=open&labels=k%C3%A4lla&per_page=100` med `Authorization: Bearer <token>` och `Accept: application/vnd.github+json`, och hoppar över poster med `pull_request`.
  - `ensureLabels` skapar `källa` och `avfallstyp` med `POST …/labels` bara när `GET …/labels/<namn>` ger 404.
  - `applyIssues`: `open` → `POST …/issues`, `comment` → `POST …/issues/<nr>/comments`, `close` → först en kommentar, sedan `PATCH …/issues/<nr>` med `{ state: 'closed', state_reason: 'completed' }`.
  - Ett svar som inte är 2xx kastar ett fel med status och sökväg.
- [ ] **Steg 2: Kör** `npx vitest run scripts/source-issues.test.ts`. Väntat: FAIL för de nya testerna.
- [ ] **Steg 3: Skriv funktionerna** med `fetch` och samma User-Agent som sajten.
- [ ] **Steg 4: Kör** samma kommando. Väntat: PASS.
- [ ] **Steg 5: Commit** `git commit -m "Bevakning: GitHub-ärenden via REST-API:t"`

### Uppgift 6: Huvudprogram, arbetsflöde och dokumentation

**Filer:**
- Ändra: `scripts/monitor-sources.ts`, `package.json` (`"monitor:sources": "tsx scripts/monitor-sources.ts"`)
- Skapa: `.github/workflows/sources.yml`
- Ändra: `docs/utveckling.md`, `docs/kommuner/lagga-till-kommun.md`, `docs/plans/2026-11-02-forbattringar.md`

**Gränssnitt:**
- Använder: allt ovan.

- [ ] **Steg 1: Skriv `main()`** i `scripts/monitor-sources.ts`, med samma `if (process.argv[1] …)`-mönster som `check-source.ts`.
  - Kör `runChecks(SOURCES, todayInStockholm())` och skriv `formatTable` till stdout.
  - Finns `GITHUB_STEP_SUMMARY`, lägg tabellen där också.
  - Med `GITHUB_TOKEN` och `GITHUB_REPOSITORY`: `ensureLabels`, `listOpenIssues`, `planIssues`, `applyIssues`.
  - Utan dem: skriv ut de planerade åtgärderna (`Skulle öppna: …`), utan att anropa GitHub.
  - Avsluta med kod 0 även när källor är trasiga. Undantag fångas, skrivs ut och ger kod 1.
- [ ] **Steg 2: Skriv `.github/workflows/sources.yml`** enligt Genomgående krav: checkout, `actions/setup-node@v7` med Node 22 och `cache: npm`, `npm ci`, `npm run monitor:sources` med `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Använd samma action-versioner som `homey.yml`.
- [ ] **Steg 3: Kör** `npx vitest run scripts/workflows.test.ts`. Väntat: PASS, även för `sources.yml`.
- [ ] **Steg 4: Kör lokalt utan token, med det riktiga nätverket,** `RETRY=0 npm run monitor:sources`. Läs `RETRY` (millisekunder) från miljön i `main`, för att slippa vänta 5 minuter vid lokala körningar. Väntat: en rad per källa, och "Skulle öppna" bara för källor som verkligen har problem. Klistra in tabellen i PR-beskrivningen.
- [ ] **Steg 5: Dokumentation.**
  - `docs/utveckling.md`: ett avsnitt "Bevakning av källorna": när den körs, vad ärendena betyder, hur man kör den själv, och att GitHub stänger av schemalagda arbetsflöden i publika repon efter 60 dagar utan aktivitet.
  - `docs/kommuner/lagga-till-kommun.md`, avsnitt A: en ny ruta efter registreringen i `ALL_SOURCES`: "Lägg till en kontrolladress i `PROBES` i `scripts/monitor-sources.ts` (en adress från `check:source`)."
  - Förbättringslistan: bocka av punkt 11.
- [ ] **Steg 6: Kör** `npm run lint && npm test && npm run build`. Väntat: grönt.
- [ ] **Steg 7: Commit** `git commit -m "Bevakning: veckojobb som gör trasiga källor till ärenden"`
- [ ] **Steg 8: Efter merge:** starta arbetsflödet för hand en gång (`gh workflow run sources.yml`) och kontrollera att sammanfattningen visas och att etiketterna finns.

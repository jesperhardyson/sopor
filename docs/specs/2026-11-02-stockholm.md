# Spec: Stockholm (Stockholm Vatten och Avfall)

Status: utkast, 2026-11-02. Första källan i fas 3 ("övriga källor") i `2026-10-30-sopor-hela-sverige-design.md`, och punkt 12 i `docs/plans/2026-11-02-forbattringar.md`.

## Bakgrund

Stockholm är Sveriges största kommun och den vanligaste sökningen som i dag ger "Vi finns inte i Stockholms kommun än". Stockholm Vatten och Avfall (SVOA) använder inte EDP. Sidan "När kommer sopbilen?" på stockholmvattenochavfall.se hämtar däremot sina uppgifter från en publik JSON-tjänst, utan inloggning eller nyckel. Tjänsten är inte dokumenterad som öppen API. Den används redan av Home Assistant-integrationen *Waste Collection Schedule* (källan `stockholmvattenochavfall_se`, PR 8061), och den bytte format minst en gång under 2026 (från PascalCase till camelCase).

Kontrollerat 2026-11-02, med Sopors User-Agent:

```
GET https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen/AutoCompleteMe?query=Hjortronvägen 3
→ [{"value":"Hjortronvägen 3, Bromma, 168 59","data":"168 59"}]

GET …/nar-kommer-sopbilen/Search?address=Hjortronvägen 3, Bromma, 168 59
→ [{"group":"Kärl 1 - restavfall och matavfall","fetchFrequency":"Varannan vecka","executionDate":"2026-11-04","weekday":"Onsdag"},
   {"group":"Trädgårdsavfall, villa","fetchFrequency":"Varannan vecka (april-nov)","executionDate":"2026-11-11","weekday":"Onsdag"},
   {"group":"Kärl 2 - papper och plast","fetchFrequency":"Varannan vecka","executionDate":"2026-11-12","weekday":"Torsdag"},
   {"group":"Kärl 3 - glas och metall","fetchFrequency":"Var 4:e vecka","executionDate":"2026-11-19","weekday":"Torsdag"}]

GET …/Search?address=Drottninggatan 50, Stockholm, 111 21   (flerbostadshus)
→ []
```

## Beslut

- **En ny källtyp, `svoa`**, bredvid `edp` och `static`: `{ system: 'svoa' }` i `SourceConfig`. Ingen generalisering för andra system än; nästa källtyp i fas 3 får avgöra vad som ska delas.
- **Källan:** `{ id: 'stockholm', name: 'Stockholm Vatten och Avfall', url: 'https://www.stockholmvattenochavfall.se', kommuner: [{ code: '0180', name: 'Stockholms kommun' }], config: { system: 'svoa' } }`. Id:t `stockholm` är stabilt och får aldrig ändras.
- **Bara villor och radhus.** SVOA:s tjänst har inget schema för flerbostadshus, där fastighetsägaren sköter hämtningen. Sopor säger det tydligt i stället för att visa ett fel (se Lägenheter).
- **Beräknade datum, som för EDP.** Tjänsten ger bara nästa tömning per kärl. Kommande datum räknas fram ur frekvensen och märks *beräknat*, och den förklaring som punkt 9 lade till gäller även här.
- **Samma regler som för alla källor** (AGENTS.md regel 4): bara publika anrop, User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)`, svar som cachas på CDN:en och få anrop.
- **Vi berättar för SVOA.** Ett kort mejl till kundtjänst om att Sopor använder den publika tjänsten, med en kontaktadress om de vill något annat. Det står i checklistan, och det är Jesper som skickar mejlet.

## Utanför

- Flerbostadshus i Stockholm och storlek på kärl.
- Andra källtyper i fas 3 (VA Syd, NSR, SRV …). De får egna specar.
- Stockholms grannkommuner. SVOA hämtar bara i Stockholms kommun.

## Klienten (`src/server/svoa.ts`)

```ts
export interface SvoaAddress {
  /** Hela adressen som tjänsten skriver den: "Hjortronvägen 3, Bromma, 168 59" */
  raw: string
  street: string     // "Hjortronvägen 3"
  locality: string   // "Bromma"
  postcode: string   // "168 59"
}
export function parseSvoaAddress(raw: string): SvoaAddress | null
export async function svoaSearch(q: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<SvoaAddress[]>   // AutoCompleteMe
export async function svoaSchedule(raw: string, fetchFn?: typeof fetch, now?: Date, timeoutMs?: number): Promise<Schedule>  // Search
export function svoaAddressId(a: SvoaAddress): string
export function queryFromSvoaId(id: string): { query: string; postcode: string } | null
```

- Anropen går via `fetchJson` i `src/server/http.ts`, med samma timeout som EDP (3 s för sökning, 5 s för schema).
- **Två format:** svaret läses både i dagens form (array med `group`, `fetchFrequency`, `executionDate`) och i den äldre (objekt per kärl med `ExecutionDate`, `FetchFrequency`). Annat format kastar `SourceError('stockholmvattenochavfall.se svarade med ett okänt format')`, så att bevakningen och sajten behandlar det som ett fel och inte som ett tomt schema.
- **Adressökning:** `AutoCompleteMe` ger högst fem adresser per sökning. Det räcker för en adress med nummer ("Hjortronvägen 3"), men inte för en hel gata. Sökrutan visar det som finns; fler träffar kräver ett husnummer.

### Adress-id

Format: gatan, orten och postnumret, kodade som EDP:s id (`encode` i `src/server/edp.ts`, som då exporteras), med postnumret utan mellanslag sist i stället för EDP:s byggnads-id. Exempel: `hjortronvägen-3_bromma-16859`. Uppslaget kan därför återanvända `queryFromAddressId`.

- Id:t får aldrig ändra format (AGENTS.md regel 3). Ett test låser exemplet ovan.
- Uppslag från id: `queryFromSvoaId` ger söksträngen `hjortronvägen 3` och postnumret `16859`. `svoaSearch` körs med söksträngen, och den träff vars `svoaAddressId` är lika med id:t används. Ingen träff ger 404.

### Fraktioner

`group` delas vid ` - `. Finns det en lista efter strecket (`restavfall och matavfall`) delas den vid `och` och `,`, och varje del går genom `mapWasteType` (`src/server/fractions-map.ts`). Annars går hela gruppen genom `mapWasteType`.

| `group` | Fraktioner |
|---|---|
| `Kärl 1 - restavfall och matavfall` | `rest`, `mat` |
| `Kärl 2 - papper och plast` | `papper`, `plast` |
| `Kärl 3 - glas och metall` | `glas`, `metall` |
| `Restavfall`, `Matavfall` | `rest`, `mat` |
| `Trädgårdsavfall, villa` | `karl` med texten "Trädgårdsavfall" |

Okända grupper blir `karl` med källans text, som för EDP.

### Datum

`fetchFrequency` översätts till ett intervall. Det första datumet (`executionDate`) är källans eget, och de följande är *beräknade*, i 12 månader som för EDP (`expandPickups` i `src/domain/recurrence.ts`).

| `fetchFrequency` | Intervall |
|---|---|
| `Varje vecka` | 7 dagar |
| `Varannan vecka` | 14 dagar |
| `Var 3:e vecka` | 21 dagar |
| `Var 4:e vecka` | 28 dagar |
| `… (april-nov)` (månadsnamn i parentes) | Som ovan, men bara datum i de angivna månaderna |

Okänd frekvens ger bara källans eget datum. Helgdagar hanteras som för EDP: ett beräknat datum på en helgdag får en varning, inte ett flyttat datum.

## Sökning och sajten

- `handleSearch` (`src/server/handlers.ts`) frågar `svoa`-källor med `svoaSearch`, på samma sätt som EDP-källor. `edpSources` byter namn till `liveSources` och tar med båda typerna.
- `lookupAddress` (`src/server/lookup.ts`) får en gren för `svoa`.
- Klienten behöver inga ändringar: `src/providers/api.ts` och `registry.ts` arbetar redan med alla källor som inte är statiska.
- **Gatuindex:** `data/osm/0180.json` byggs med `npm run build:streets`. Utan det hittar sökningen inte Stockholm förrän man skrivit ett husnummer eller tryckt Enter. Overpass var överbelastad 2026-11-02, så det kan behöva flera försök.
- Läget "Vi finns inte i … än" (#45) slutar gälla för Stockholm av sig självt, eftersom kommun 0180 nu är täckt.

### Lägenheter

En adress som hittas men ger ett tomt schema visar ett eget besked i stället för "Inga kommande tömningar i schemat än":

> **I Stockholm visar Sopor bara villor och radhus**
> Bor du i lägenhet sköter fastighetsägaren sophämtningen. Fråga din hyresvärd eller bostadsrättsförening.

Texten ligger i källan, som ett nytt valfritt fält: `Source.emptyScheduleNote?: { title: string; text: string }`. `EmptyState` (`src/ui/result/ResultStates.tsx`) visar källans text när den finns och annars dagens. UI:t vet alltså fortfarande ingenting om SVOA (regel 1). Designen har inget sådant läge; texten visas i samma ruta som `EmptyState`.

## Bevakningen och integrationerna

- **Bevakningen** (#50): `checkSvoaSource` i `scripts/source-checks.ts` med samma lägen som EDP, och kontrolladressen `stockholm: 'Hjortronvägen 3, Bromma, 168 59'` i `PROBES`. Testet för kontrolladresser utökas till alla live-källor, inte bara EDP.
- **API v1, Homey och Home Assistant:** inga ändringar. Stockholm syns i `/api/v1/kallor` och fungerar i båda integrationerna, eftersom de bara pratar med API:t.

## Test

- `parseSvoaAddress`, `svoaAddressId` och `queryFromSvoaId`, inklusive att exempel-id:t är låst.
- `svoaSchedule` mot sparade svar i `src/server/__fixtures__/` (`stockholm-search.json`, `stockholm-schedule.json`, båda formaten, tomt svar och okänt format).
- Fraktioner för varje rad i tabellen ovan, och frekvenserna, inklusive säsong (inga datum i december–mars för `(april-nov)`).
- `handleSearch` och `lookupAddress` med en `svoa`-källa och ett falskt `fetch`.
- `EmptyState` med och utan `emptyScheduleNote`.
- Bevakningen: `checkSvoaSource` för fungerar, svarar inte, nytt format och tom.

## Dokumentation

- `docs/kommuner/hitta-kommunens-data.md`: Stockholm in i tabellen som live, med SVOA:s två anrop.
- `docs/kommuner/lagga-till-kommun.md`: en kort anteckning om att en ny källtyp följer Stockholms mönster (`src/server/svoa.ts`).
- Förbättringslistan: punkt 12 får en underpunkt för Stockholm.

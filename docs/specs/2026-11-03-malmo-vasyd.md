# Spec: Malmö och Burlöv (VA Syd)

Status: utkast, 2026-11-03. Andra källan i fas 3 ("övriga källor") efter Stockholm (`2026-11-02-stockholm.md`), och en del av punkt 12 i `docs/plans/2026-11-02-forbattringar.md`.

## Bakgrund

VA Syd sköter sophämtningen i Malmö och Burlöv. Webbplatsen vasyd.se har en publik JSON-tjänst för adressökning och hämtschema, utan inloggning eller nyckel. Den används av Home Assistant-integrationen *Waste Collection Schedule* (`vasyd_se.py`). Svaren har samma fält som EDP:s (`wasteType`, `wastePickupFrequency`, `nextWastePickup`), men saknar antal tömningar per år.

Kontrollerat 2026-11-03, med Sopors User-Agent:

```
POST https://www.vasyd.se/api/sitecore/mypagesapi/buildingaddresssearch   query=Storgatan 1
→ {"query":"Storgatan 1","items":[{"street":"Storgatan 1, Malmö","id":"125040"},{"street":"Storgatan 1, Malmö","id":"185904"},
   {"street":"Storgatan 10, Arlöv","id":"131104"}, …],"meta":{"success":true,"message":null}}

POST …/mypagesapi/wastepickupbyaddress   query=104904   street=Limhamnsvägen 50, Malmö
→ {"items":[{"address":"Limhamnsvägen 50, Malmö","wasteType":"Restavfall","wastePickupFrequency":"Onsdag varje vecka","nextWastePickup":"2026-11-04"},
   {"wasteType":"Glasförp.färg","wastePickupFrequency":"Fredag varje vecka","nextWastePickup":"2026-11-13"}, …],"meta":{"success":true,"message":null}}

POST …/mypagesapi/wastepickupbyaddress   query=131502   street=Lommavägen 14, Arlöv
→ Fyrfack1 "Tisdag udda vecka" 2026-11-03, Fyrfack2 "Tisdag var 4:e vecka startvecka 1" 2026-11-03,
   Trädgårdsavfall "Onsdag jämn vecka trädgård" 2026-11-11
```

- Sökvägen med versaler (`/MyPagesApi/BuildingAddressSearch`) svarar 307 till samma adress med gemener. Sopor använder gemenerna direkt.
- Adresser i Lund, Lomma och Eslöv ger inga träffar. VA Syd sköter bara vatten där.
- Flerbostadshus finns med (Limhamnsvägen 50), till skillnad från Stockholm.

## Beslut

- **Regel 4.** Tjänsten ligger under `mypagesapi` ("Mina sidor"), men kräver ingen inloggning, kaka eller nyckel och används av sajtens publika sida. Jesper har bedömt den som tillåten (2026-11-03). Skulle VA Syd börja kräva inloggning tas källan bort, och anrop med inloggning görs aldrig.
- **En ny källtyp, `vasyd`**, bredvid `edp`, `svoa` och `static`: `{ system: 'vasyd' }`.
- **Källan:** `{ id: 'vasyd', name: 'VA Syd', url: 'https://www.vasyd.se', kommuner: [{ code: '1280', name: 'Malmö kommun' }, { code: '1231', name: 'Burlövs kommun' }], config: { system: 'vasyd' } }`. Id:t får aldrig ändras.
- **Samma skydd som Stockholm** (se `2026-11-02-stockholm.md`, Om källan ändras): okänd form ger ett fel, aldrig en tom lista. Ett id utan träff ger 502, inte 404. Ett tomt schema ger 502 i kalenderfilen (gäller redan alla live-källor). En frekvens som inte känns igen helt ger bara källans datum.
- **Vi berättar för VA Syd**, som för SVOA. Jesper skickar mejlet.

## Utanför

- Lund, Lomma och Eslöv (VA Syd sköter inte avfallet där; Lund finns redan som EDP-källa).
- Beställningar och avvikelser som VA Syd visar på Mina sidor.

## Klienten (`src/server/vasyd.ts`)

```ts
export const VASYD_URL = 'https://www.vasyd.se/api/sitecore/mypagesapi'
export async function vasydSearch(q: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<EdpBuilding[]>
export async function vasydSchedule(b: EdpBuilding, fetchFn?: typeof fetch, timeoutMs?: number): Promise<Schedule>
/** "Onsdag varje vecka" → 7, "Tisdag udda vecka" → 14, "Tisdag var 4:e vecka startvecka 1" → 28. null annars. */
export function vasydStep(frequency: string): number | null
```

- **Adresser som EDP:** `street` är "Storgatan 1, Malmö" och `id` är byggnads-id:t. Det blir en `EdpBuilding` (`{ raw, street, locality, buildingId }`), och adress-id:t blir `edpAddressId`, till exempel `storgatan-1_malmö-125040`. Uppslaget använder `queryFromAddressId` och `searchCandidates` som EDP. Formatet får aldrig ändras (regel 3), och ett test låser exemplet.
- **Anropen:** `POST` med `application/x-www-form-urlencoded` via `fetchJson` (`src/server/http.ts`), User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)`, 3 s för sökning och 5 s för schema. Schemat hämtas med `query=<byggnads-id>` och `street=<street>`.
- **Form:** svaret måste vara ett objekt med `meta.success === true` och en lista `items`. Varje sökträff måste ha `street` med gata och ort samt `id`, och varje schemarad `wasteType` och `nextWastePickup` på formen `YYYY-MM-DD` (eventuellt med tid, som kortas). Allt annat kastar `SourceError('vasyd.se svarade med ett okänt format')`.
- **Fraktioner:** `mapWasteType` som för EDP. `Glasförp.färg` och `Glasförp.ofärg` blir glas, `Fyrfack1` blir "Fyrfackskärl 1" och `Trädgårdsavfall` ett känt kärl (`isKnownBin`).

### Datum

`wastePickupFrequency` läses i sin helhet, efter veckodagen:

| Text (efter veckodagen) | Intervall |
|---|---|
| `varje vecka` | 7 dagar |
| `jämn vecka`, `udda vecka` | 14 dagar |
| `var 4:e vecka` (med eller utan `startvecka N`) | 28 dagar |

Det första datumet (`nextWastePickup`) är källans eget, och de följande är *beräknade*, i 12 månader med `expandEvery` (`src/domain/recurrence.ts`). Text som inte känns igen helt, till exempel `jämn vecka trädgård`, ger bara källans datum. Trädgårdsavfallet har säsong, men texten säger inte vilken, och det är bättre att visa ett datum för lite än tömningar hela vintern.

## Sökning, uppslag och sajten

- `searchLiveSource` (`src/server/handlers.ts`) får en gren för `vasyd` som använder `vasydSearch`, `withDetails` och `toAddress` som EDP. Två byggnader med samma adress (Storgatan 1, Malmö) får särskiljaren "Byggnad 125040".
- `lookupAddress` (`src/server/lookup.ts`) får en gren för `vasyd`: `searchCandidates` → träffen med rätt byggnads-id → `vasydSchedule`. Ingen träff ger **502** (som Stockholm, inte 404 som EDP).
- **Kommun per ort:** källan har två kommuner, så `kommunForLocality` med ortindexet avgör Malmö eller Burlöv (Arlöv → Burlövs kommun).
- **Gatuindex:** `data/osm/1280.json` och `data/osm/1231.json` med `npm run build:streets`.
- Läget "Vi finns inte i … än" slutar gälla för Malmö och Burlöv av sig självt.
- Klienten, API v1, Homey och Home Assistant behöver inga ändringar utöver grenen i `searchLiveSource`.

## Bevakningen

- `checkVasydSource` i `scripts/source-checks.ts`, med samma lägen och samma fallback via sajten som de andra. Kontrolladressen matchas med byggnads-id, som uppslaget gör.
- Kontrolladress i `PROBES`: `vasyd: 'Limhamnsvägen 50, Malmö'`.
- Okända avfallstyper (utom `isKnownBin`) och frekvenser som inte känns igen rapporteras som för Stockholm.

## Test

- Sparade svar i `src/server/__fixtures__/`: `vasyd-adresser.json`, `vasyd-schema.json` (Limhamnsvägen 50) och `vasyd-schema-fyrfack.json` (Lommavägen 14). Namnen får inte sluta på `-search.json` eller `-schedule.json`, eftersom EDP:s tester läser sådana filer.
- `vasydStep` för varje rad i tabellen, och `null` för `jämn vecka trädgård` och för en text utan veckodag.
- `vasydSearch` och `vasydSchedule` mot de sparade svaren, för okänd form (`meta.success` falskt, `items` saknas, datum i fel format) och för ett tomt schema.
- Adress-id:t `storgatan-1_malmö-125040` är låst, och Arlöv ger `Burlövs kommun`.
- `handleSearch`, `handleSchedule`, `handleIcs` och `handleV1Search` med en `vasyd`-källa. Ett id utan träff ger 502, aldrig uppmaningskalendern.
- Bevakningen: fungerar, svarar inte, nytt format, tom och en kontrolladress som inte längre matchar.

## Dokumentation

- `docs/kommuner/lagga-till-kommun.md`, avsnitt D: VA Syd som andra exempel.
- Förbättringslistan, punkt 12: "Malmö och Burlöv (VA Syd)" och en underpunkt för Göteborg: hämtdagen syns bara på Mina sidor, och vägen är att begära kopplingen adress → hämtdag som allmän handling.

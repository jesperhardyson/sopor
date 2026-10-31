# Sopor – publikt API (v1)

Datum: 2026-10-31
Status: utkast, avsnitten godkända i chatt 2026-10-31
Bygger på: `docs/specs/2026-10-30-sopor-hela-sverige-design.md` (v2)

## Syfte

Hemautomation som Homey och Home Assistant, och andra system, ska kunna läsa hämtschemat för en adress och bygga automatiseringar på det: påminnelse kvällen innan, en lampa i fraktionens färg, en rad på en kontrollpanel. Plugins för Homey och Home Assistant ska kunna byggas av vem som helst ovanpå API:t, med egen logik kring rådatan.

## Beslut (från användaren)

- **Två lager i samma svar.** Färdiga fält för den som klistrar in en URL i en REST-sensor eller ett HTTP-kort, och rådata för den som bygger en plugin.
- **Hemautomation först.** Adressuppslaget är huvudspåret. Sökning och källor finns för att plugins ska kunna ha ett installationsflöde.
- **Vi bygger inga plugins.** Leveransen är API:t och den dokumentation som behövs för att konsumera det.
- **Ett nytt, versionerat `v1`** bredvid de interna endpoints. `/api/sok` och `/api/schema` förblir UI:ts och får ändras fritt.

## Mål

- En URL per adress som ger nästa hämtning per fraktion, dagar kvar, i dag/i morgon, färg och en färdig svensk text.
- Allt som behövs för att bygga en integration: sök, källor, fullt schema, fraktionsregister.
- Ett kontrakt som inte bryts: OpenAPI-filen och koden testas mot varandra.
- Fortfarande gratis att drifta, utan databas och utan konton.

## Icke-mål

- Plugins, HACS-integration eller Homey-app.
- Webhooks och push. Det kräver lagrade prenumeranter.
- API-nycklar, konton och egen hastighetsbegränsning.
- En API-sida i appen innan den finns i designen.

## Anti-mål

- Att API:t avslöjar trakter, `scheduleRefs`, EDP eller andra källdetaljer.
- Att dolda källor (`hidden: true`) syns i något svar.
- Att ett fält i `v1` byter namn, betydelse eller försvinner.
- Nya adress-id. API:t använder samma id som kalenderlänkarna.

## Endpoints

| Endpoint | Används till |
|---|---|
| `GET /api/v1/adress/{källa}/{id}` | Adress, kärl, kommande hämtningar och `next` per fraktion |
| `GET /api/v1/sok?q=…[&kalla=…]` | Adresssökning, t.ex. i en plugins installationsflöde |
| `GET /api/v1/kallor` | Synliga källor, kommuner och fraktionsregistret |
| `GET /api/v1/openapi.json` | Kontraktet som OpenAPI 3.1 (statisk fil) |

Sökvägarna är på svenska som de befintliga (`/api/sok`). JSON-nycklarna är på engelska som domäntyperna i `src/domain/types.ts`.

### Adressuppslag

`GET /api/v1/adress/uppsala/storgatan-2_uppsala-4004688`

```json
{
  "apiVersion": "1",
  "today": "2026-11-04",
  "address": {
    "id": "storgatan-2_uppsala-4004688",
    "street": "Storgatan 2",
    "locality": "Uppsala",
    "kommun": "Uppsala kommun",
    "source": "uppsala",
    "detail": null
  },
  "next": [
    {
      "fraction": "mat",
      "name": "Matavfall",
      "color": "#7A4A1E",
      "date": "2026-11-05",
      "daysUntil": 1,
      "isToday": false,
      "isTomorrow": true,
      "estimated": false,
      "warning": null,
      "text": "Matavfall – i morgon, torsdag 5 november"
    }
  ],
  "summary": "Mat & rest – i morgon",
  "events": [
    {
      "date": "2026-11-05",
      "fractions": ["mat", "rest"],
      "estimated": false,
      "deviation": null,
      "warning": null,
      "labels": {}
    }
  ],
  "bins": [{ "fraction": "mat", "sizeLiters": 140, "pickupsPerYear": null, "frequencyText": "Varannan vecka" }],
  "fractions": {
    "mat": { "name": "Matavfall", "short": "Mat", "color": "#7A4A1E", "icon": "apple" }
  },
  "links": {
    "ics": "https://sopor.hardyson.se/ics/uppsala/storgatan-2_uppsala-4004688.ics",
    "web": "https://sopor.hardyson.se/uppsala/storgatan-2_uppsala-4004688"
  },
  "updatedAt": "2026-11-04"
}
```

**Bekvämlighetslagret**

- `today` är dagens datum i `Europe/Stockholm` (`todayInStockholm`). Alla relativa fält räknas mot det.
- `next` har en post per fraktion som förekommer i `events`: fraktionens närmaste hämtning från och med `today`, sorterad på datum och sedan på fraktionens `order`. Fraktioner utan kommande hämtning utelämnas.
- `daysUntil` är `daysBetween(today, date)`. `isToday` är `daysUntil === 0` och `isTomorrow` är `daysUntil === 1`.
- `text` och `summary` byggs med de befintliga hjälpfunktionerna i `src/domain/dates.ts` (`relativeDayLabel`, `formatLong`) och `FRACTIONS[..].short`. `summary` beskriver den närmaste hämtningen, med fraktionerna som hämtas samma dag (t.ex. "Mat & rest – i morgon"). Saknas kommande hämtning är `summary` `"Inga kommande hämtningar"` och `next` en tom lista.
- `color` är den färg som sajten visar fraktionen med i ljust tema, som hex. Det är samma token som `FRACTION_CLASS` använder: `tidningar` har pappers färg (`--frac-papper`) och `karl` har `--text-2`.

**Rådatalagret**

- `events` är alla hämtningar från och med `today` som källan ger, med samma fält som `PickupEvent`. Valfria fält skickas som `null` (eller `{}` för `labels`) i stället för att utelämnas.
- `bins` motsvarar `Bin`, med `null` för saknade värden.
- `fractions` innehåller registret för de fraktioner som förekommer i svaret, så att en plugin kan visa namn, färg och ikon (Lucide-namn) utan att hårdkoda dem.
- `updatedAt` är schemats `updatedAt`.

### Sökning

`GET /api/v1/sok?q=storgatan 2&kalla=uppsala`

```json
{
  "apiVersion": "1",
  "addresses": [
    {
      "id": "storgatan-2_uppsala-4004688",
      "street": "Storgatan 2",
      "locality": "Uppsala",
      "kommun": "Uppsala kommun",
      "source": "uppsala",
      "detail": null,
      "url": "https://sopor.hardyson.se/api/v1/adress/uppsala/storgatan-2_uppsala-4004688"
    }
  ],
  "failed": []
}
```

- Minst tre tecken efter normalisering, annars `bad_request`.
- Servern väljer källor med gatuindexet, som sajten gör (`candidateSources`). Saknas gatan i indexet frågas alla live-källor bara om frågan innehåller en siffra. Statiska källor söks lokalt i sina adressfiler.
- `kalla` är valfri och begränsar sökningen till en synlig källa. Okänd eller dold källa ger `not_found`.
- Högst tio träffar per källa, som i dag.
- `failed` listar källor som inte svarade. Svaret är då ofullständigt.

### Källor

`GET /api/v1/kallor`

```json
{
  "apiVersion": "1",
  "sources": [
    {
      "id": "uppsala",
      "name": "Uppsala Vatten",
      "url": "https://www.uppsalavatten.se",
      "kommuner": [{ "code": "0380", "name": "Uppsala kommun" }],
      "testData": false
    }
  ],
  "fractions": {
    "mat": { "name": "Matavfall", "short": "Mat", "color": "#7A4A1E", "icon": "apple" }
  }
}
```

Bara källor utan `hidden`. Byggs direkt ur `SOURCES` och `FRACTIONS`, utan anrop mot källorna. `config` (system och adress till källan) skickas aldrig.

### Fel

Alla fel har samma form:

```json
{ "apiVersion": "1", "error": { "code": "not_found", "message": "Adressen finns inte hos källan" } }
```

| `code` | Status | När |
|---|---|---|
| `bad_request` | 400 | För kort fråga, saknad parameter |
| `not_found` | 404 | Okänd eller dold källa, okänd adress, okänd sökväg under `/api/v1/` |
| `source_unavailable` | 502 | Källan svarar inte eller svarar fel |

`code` är fast. `message` är svensk text och får ändras. Vid 502 ska konsumenten behålla sitt senaste svar och försöka igen senare.

## Cache och åtkomst

| Svar | `Cache-Control` |
|---|---|
| Adress | `public, s-maxage=<min(21600, sekunder till midnatt i Stockholm)>, stale-while-revalidate=3600` |
| Sök, komplett | Som `/api/sok` i dag (ett dygn) |
| Sök med `failed`, 404 | `public, s-maxage=60` |
| Källor | `public, s-maxage=86400` |
| 400, 502 | `no-store` |

- Adressens cachetid slutar vid midnatt så att `isToday`, `isTomorrow` och `daysUntil` aldrig är från igår. `stale-while-revalidate` får inte heller sträcka sig över midnatt, så den sätts till det kortaste av 3600 och tiden kvar till midnatt.
- Alla `v1`-svar har `Access-Control-Allow-Origin: *`. Dashboard-kort i Home Assistant hämtar från webbläsaren. `OPTIONS` svarar 204 med samma header.
- Inga nycklar. Skyddet mot för många anrop är CDN-cachen. Dokumentationen säger att man ska fråga högst en gång i timmen per adress. Blir det problem läggs en regel i Vercel Firewall till, utan att kontraktet ändras.

## Arkitektur

- **`src/server/v1.ts`** innehåller `handleV1Address`, `handleV1Search` och `handleV1Sources` och formaterar svaren. Ingen källlogik här.
- **Gemensam adressupplösning på servern.** `resolve()` i `src/server/handlers.ts` klarar i dag bara EDP. Den blir en funktion som tar en källa och ett id och returnerar `{ address, schedule }` oavsett system:
  - EDP: som i dag (sök och välj rätt byggnads-id, hämta schemat).
  - Statisk: läs `addresses.json` och schemafilerna från sajtens egna `/data/<källa>/…` över HTTP (samma format som `createStaticProvider`, med `mergeParts`).
  
  ICS-funktionen och `/api/schema` använder samma funktion, så att alla tre svarar lika.
- **Serversökning med gatuindex.** Källvalet i `src/providers/registry.ts` (`liveSourcesFor`) flyttas till en ren funktion som både webbläsaren och servern kan använda. Servern hämtar gatuindexets delfiler från sajtens egna `/data/gator/…`.
- **Bekvämlighetsfälten** (`next`, `daysUntil`, `text`, `summary`) räknas i en ren funktion i `src/domain/` (t.ex. `src/domain/next.ts`), utan React, så att den kan testas för sig och återanvändas i UI:t.
- **Färger.** Hex-värdena för fraktionerna ligger i dag bara i `src/styles/theme.css`. De läggs in i `FRACTIONS` som `color`, och ett test kontrollerar att de stämmer med den token i `theme.css` som `FRACTION_CLASS` använder för fraktionen.
- **Funktionerna**: `api/v1/adress.ts`, `api/v1/sok.ts` och `api/v1/kallor.ts`, med rewrite i `vercel.json` från `/api/v1/adress/:source/:id`. Relativa importer med `.js`, som regel 2 kräver.
- **Dev-servern.** Routern i `vite.config.ts` får de nya sökvägarna.
- **Basadressen** för `url` och `links` tas från anropets egen URL, så att preview-adresser länkar till sig själva.

## Stabilitet i v1

- Fält får läggas till. Befintliga fält tas aldrig bort, byter aldrig namn och byter aldrig betydelse.
- Fraktions-id (`rest`, `mat`, `papper`, `plast`, `glas`, `metall`, `tidningar`, `karl`) är fasta. Nya kan tillkomma, och konsumenter ska klara okända id.
- Fält utan värde skickas som `null`, så att sökvägar i mallar och flödeskort är förutsägbara.
- Ett brytande byte blir `v2` bredvid `v1`.

## Dokumentation

- **`public/api/v1/openapi.json`**: OpenAPI 3.1 för alla endpoints, med scheman, felkoder och exempel.
- **`docs/api.md`**, guiden:
  - Kom igång: hitta adressens id på sajten eller via `/sok`.
  - Stabilitetsreglerna, rekommenderad frekvens (högst en gång i timmen) och hantering av 502.
  - **Home Assistant**: en REST-sensor i YAML med `daysUntil` och attribut från `next`, och en automation för kvällen innan.
  - **Homey**: ett flöde med HTTP-kortet och JSON-sökväg.
  - Ett `curl`-exempel.
  - Bygga en integration: sök vid installation, spara `url`, klara okända fraktions-id, räkna själv ur `events` om man vill.
- README länkar till guiden. En länk från Om-sidan kräver att den först läggs in i designen.

## Tester

- `src/domain/next.test.ts`: `next`, `summary` och `text`, med flera fraktioner samma dag, tomt schema och dagarna runt midnatt i Stockholm.
- `src/server/v1.test.ts`: varje endpoint mot de EDP-fixtures som finns och mot statiska testkällor. Felkoder, CORS, `OPTIONS`, att dolda källor inte syns och `s-maxage` som slutar vid midnatt.
- Kontraktstest: riktiga svar från handlers valideras mot `openapi.json`.
- Färgerna i `FRACTIONS` mot `theme.css`.
- Testet för `.js`-importer omfattar `api/v1/`.

## Kvar åt den som bygger

- Om OpenAPI-valideringen i testerna görs med ett bibliotek (t.ex. Ajv som dev-beroende) eller ett litet eget schema-test.
- Om `v1` ska svara 404 som JSON för okända sökvägar via en catch-all eller bara för de tre funktionerna.

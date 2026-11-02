# Utveckla Sopor

För dig som vill ändra i koden. Vill du lägga till en kommun räcker [checklistan](kommuner/lagga-till-kommun.md). Reglerna som inte får brytas står i [`AGENTS.md`](../AGENTS.md#arkitekturregler-bryt-inte-dessa).

## Kommandon

Kräver Node 22 eller senare.

```bash
npm install
npm run dev          # genererar data och startar http://localhost:5173
npm test             # Vitest
npm run lint         # oxlint
npm run build        # genererar data, typkontroll och produktionsbygge i dist/
npm run build:data   # bara datafilerna (körs automatiskt före dev och build)
npm run check:ids    # inga befintliga adress-id har tagits bort
npm run build:orter  # hämtar orter i hela Sverige från Wikidata till data/sverige/ (för hand, sällan)
RETRY=0 npm run monitor:sources  # kontrollerar alla källor på riktigt (utan GITHUB_TOKEN skapas inga ärenden)
```

Kör `npm run lint && npm test && npm run build` innan du skickar en pull request. CI kör samma sak.

## Prova med testdata

Avesta har påhittad data i `data/avesta/2026/` (`testData: true`) och är därför dold på sajten (`hidden: true`). Den ersätts när den riktiga kopplingen adress → trakt har kommit från Avesta Vatten och Avfall. Testerna gör den synlig via `src/test/show-hidden-sources.ts`.

Vill du prova den i webbläsaren, sätt tillfälligt `hidden: false` på Avesta i `src/sources/index.ts` (checka inte in det). Sedan:

- Sök på `storg`. Det ger tre adresser (Krylbo, Avesta, Fors).
- Sök på `Storgtan 12` och tryck Enter. Det ger "Vi hittade inte adressen" med förslaget "Storgatan 12, Avesta".
- Öppna `/avesta/krylbo-storgatan-12b`. Där är 6 januari flyttad till 7 januari (trettondedag jul).
- Öppna `/avesta/fors-storgatan-21`. Där är juldagen flyttad till 28 december.
- Öppna `/hedemora/x`. Det ger läget "Den här adressen finns inte hos Sopor".

## Så hänger det ihop

Det finns två sorters källor. **Statiska** källor är datafiler i repot som byggs till JSON och kalenderfiler. **Live-källor** (EDP Future) frågas per adress via Vercel-funktionerna.

```
data/<källa>/<år>/schedules.json  ┐                         ┌► public/data/<källa>/addresses.json      (sökindex)
data/<källa>/<år>/addresses.csv   ┘─► scripts/build-data.ts ┼► public/data/<källa>/schedules/<id>.json (scheman)
                                                            └► public/ics/<källa>/<adress-id>.ics      (kalenderfiler)
```

| Mapp | Innehåll |
|---|---|
| `src/domain/` | typer, fraktioner, datum, schemalogik, ICS och sökning (ren TypeScript, körs både i build-skriptet och i webbläsaren) |
| `src/data/` | filformatet för statisk data: parsning, validering och generering |
| `src/sources/` | källregistret: vilka avfallsbolag och kommuner som finns och vilket system de använder |
| `src/providers/` | `WasteProvider`, gränssnittet som UI:t pratar med: `static` (filer) och `api` (live) |
| `src/server/` | logiken bakom Vercel-funktionerna: EDP-klienten, sökning, schema och kalenderfiler |
| `api/` | Vercel-funktionerna, med det publika API:t i `api/v1/` |
| `src/ui/` | React-sidor och komponenter (`src/components/ui/` är shadcn/ui) |
| `data/osm/` | gatu- och ortnamn per kommun från OpenStreetMap |
| `data/sverige/` | orter i hela Sverige och deras kommun, från Wikidata. Ger "Vi finns inte i … än" i sökningen |
| `integrations/` | Homey-appen och Home Assistant-integrationen, egna paket |

UI:t vet aldrig om datan kommer från filer, EDP eller något annat. Genererade filer under `public/data/` och `public/ics/` checkas inte in.

## Lägga till en ny typ av datakälla

För ett nytt system, alltså inte EDP Future (som redan finns) eller statiska filer. Exempel: ett annat kundsystem med en publik söktjänst per adress.

1. Lägg till en variant i `SourceConfig` (`src/sources/index.ts`).
2. Implementera `WasteProvider` i `src/providers/<typ>.ts` och koppla in den i `providerFor` (`src/providers/registry.ts`).
3. Saknar källan CORS-headers behövs en proxy i Vercel-funktionerna. Lägg logiken i `src/server/` (se `edp.ts` och `handlers.ts`) och generera `.ics` live med `buildIcs` från `src/domain/ics.ts`. Providerns `icsUrl` pekar då på funktionen.

Inget utanför `src/providers/`, `src/server/`, `src/data/` och `scripts/` får känna till trakter, EDP eller andra källdetaljer.

## Kalendrar

Prenumererade kalendrar (webcal, Google, Apple) hämtar nya filer själva. Apple gör det enligt användarens inställning. Google bestämmer själv, oftast inom ett dygn men ibland längre. Nedladdade `.ics`-filer uppdateras aldrig.

Påminnelsen kvällen innan (`VALARM`) följer med i filen, men Google ignorerar den för prenumerationer och Apple stänger av notiser som standard. Därför finns ett tips om det i kalenderarket.

## Versioner

- **Webben** har inga versionsnummer. Varje push till `main` driftsätts, och CI (`ci.yml`, den obligatoriska checken `test`) ska vara grön innan dess.
- Det som måste vara stabilt har egna kontrakt:
  - API:t är versionerat i sökvägen (`/api/v1`) och har ett kontraktstest mot `openapi.json`.
  - Adress-id får inte tas bort (`check:ids` i CI).
  - ICS-UID ändrar aldrig format.
- **Integrationerna** har semver och egna releaser: Homey-appen med taggar `homey-v*`, och Home Assistant med taggar `ha-v*` och GitHub-releaser. Hur man släpper en version står i respektive README.

## Driftsättning

Vercel (Hobby). Vercel kör `npm test && npm run build`, så röda tester når aldrig produktion. `vercel.json` sätter `Content-Type: text/calendar` och cache-headers för `/ics/*`, kort cache för `/data/*` och SPA-rewrite för övriga sökvägar.

- **Projekt:** `sopor` i Vercel-teamet `badvatten-s-projects`, kopplat till GitHub-repot. Varje push till `main` driftsätts, och varje pull request får en egen preview-deploy.
- **Domän:** `sopor.hardyson.se`. DNS ligger hos Cloudflare: `A sopor 76.76.21.21`, satt till *DNS only* (inte proxad).
- **Öppen sajt:** Vercel Authentication är avstängd, så både sajten och preview-adresserna är publika. Bidragsgivare kan alltså testa sina ändringar live. Pull requests från forkar byggs inte förrän förvaltaren godkänt dem i Vercel.
- **Delningsbild och ikoner:** `public/og.png`, `public/icon-*.png` och `public/apple-touch-icon.png` exporteras från ramarna "Delningsbild 1200×630" och "Webbapp-ikon 240" i designfilen.
- **Dolda källor:** en källa med `hidden: true` syns inte i sökningen, på Om-sidan, i API:t eller i byggd data, men build-skriptet validerar ändå dess datafiler.

## Bevakning av källorna

`.github/workflows/sources.yml` kör `npm run monitor:sources` natten mot måndag (och för hand under Actions). Skriptet söker på en känd adress per källa (`PROBES` i `scripts/monitor-sources.ts`) och hämtar schemat, med samma kod som sajten. Resultatet blir en tabell i jobbets sammanfattning. Se `docs/specs/2026-11-02-bevakning-av-kallor.md`.

- **Ärenden:** ett per källa och problem, med etiketten `källa` (okända avfallstyper också `avfallstyp`). Ärendet får en kommentar varje vecka problemet finns kvar och stängs av sig självt när källan fungerar igen. Bevakningen känner igen sina ärenden på en dold markering och rör aldrig andra ärenden.
- **Lägen:** *svarar inte* (även efter ett nytt försök fem minuter senare), *nytt format*, *ger inga adresser*, *inga tömningar framåt* (60 dagar) och, för statiska källor, *schemat tar slut*.
- **Själv:** `RETRY=0 npm run monitor:sources` skriver tabellen och vilka ärenden som skulle öppnas, utan att röra GitHub. `npm run check:source -- <baseUrl> "<adress>"` visar detaljer för en källa.
- **Tyst?** GitHub stänger av schemalagda arbetsflöden i publika repon efter 60 dagar utan aktivitet. Starta det igen under Actions.

## Design

Designen i `docs/design/sopor-design.pen` (Pencil) är facit för färger, typsnitt, komponenter och tillstånd. Filen är krypterad och öppnas i Pencil. Färgerna ligger som tokens i `src/styles/theme.css`, med ljust och mörkt läge.

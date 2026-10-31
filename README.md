# Sopor

**[sopor.hardyson.se](https://sopor.hardyson.se)**: skriv in din adress och se vilka sopkärl som töms vilket datum. Schemat kan läggas in i den egna kalendern.

Sopor är en **inofficiell** hobbytjänst. Den är inte kopplad till någon kommun eller något avfallsbolag. Vid avvikelser gäller alltid kommunens information.

- Ingen databas, inga konton. Sajten är statisk; små Vercel-funktioner (`api/`) hämtar och cachar schema från kommunernas publika tjänster. Allt ryms i Vercels gratisplan.
- Sparade adresser ligger bara i användarens webbläsare (localStorage).
- Data hämtas bara från kommunens publika källor, aldrig från inloggade tjänster som Mina sidor.

> **Obs:** Datan i `data/avesta/2026/` är **FAKE** och finns bara för utveckling. Avesta är därför dold (`hidden: true`) och syns inte på sajten. Datan ersätts när den riktiga adress→trakt-tabellen har kommit från Avesta Vatten och Avfall.

## Bidra

Sopor är öppen källkod, och bidrag är välkomna, särskilt **fler kommuner**:

- Saknar du din kommun? Börja med [guiden om att hitta kommunens data](docs/kommuner/hitta-kommunens-data.md), och lägg sedan in den enligt [Lägga till en kommun](#lägga-till-en-kommun). Använd bara publika källor, som kommunens hämtschema eller en publik söktjänst.
- Hittat ett fel i schemat? Öppna ett issue med adress, datum och länk till kommunens uppgift.
- Kör `npm run lint && npm test && npm run build` innan du skickar en pull request. GitHub Actions kör samma kontroller på varje pull request, och stoppar även ändringar som tar bort eller byter namn på ett befintligt adress-id (`npm run check:ids`).
- Vercel kör testerna före varje bygge, så röda tester når aldrig produktion.

Mer i [`CONTRIBUTING.md`](CONTRIBUTING.md). Säkerhetsbrister rapporteras enligt [`SECURITY.md`](SECURITY.md). Instruktioner för AI-agenter finns i [`AGENTS.md`](AGENTS.md).

## Kom igång

Kräver Node 22 eller senare.

```bash
npm install
npm run dev        # genererar data och startar http://localhost:5173
npm test           # Vitest
npm run build      # genererar data, typkontroll och produktionsbygge i dist/
```

`npm run build:data` genererar bara datafilerna. Den körs automatiskt före `dev` och `build`.

Att prova med seed-datan: sätt tillfälligt `hidden: false` på Avesta i `src/sources/index.ts` (checka inte in det). Sedan:

- Sök på `storg`. Det ger tre adresser (Krylbo, Avesta, Fors).
- Sök på `Storgtan 12` och tryck Enter. Det ger "Vi hittade inte adressen" med förslaget "Storgatan 12, Avesta".
- Öppna `/avesta/krylbo-storgatan-12b`, exempelvillan. Där är 6 januari flyttad till 7 januari (trettondedag jul).
- Öppna `/avesta/fors-storgatan-21`. Där är juldagen flyttad till 28 december.
- Öppna `/hedemora/x`. Det ger läget "Den här adressen finns inte hos Sopor".

## Så hänger det ihop

```
data/<kommun>/<år>/schedules.json  ┐                         ┌► public/data/<kommun>/addresses.json      (sökindex)
data/<kommun>/<år>/addresses.csv   ┘─► scripts/build-data.ts ┼► public/data/<kommun>/schedules/<id>.json (scheman)
                                                             └► public/ics/<kommun>/<adress-id>.ics      (kalenderfiler)

src/domain/          typer, fraktionsregister, datum, schemalogik, ICS, sök (ren TypeScript)
src/data/            filformatet för statisk data: parsning, validering, generering
src/sources/         källregistret: avfallsbolag/kommuner, system och vilka kommuner de täcker
src/server/          logiken bakom Vercel-funktionerna (EDP-klient, sök, schema, kalenderfiler)
api/                 Vercel-funktionerna (sok, schema, ics och det publika API:t i api/v1/)
data/osm/            gatu- och ortnamn per kommun från OpenStreetMap (ODbL)
src/providers/       WasteProvider-gränssnittet och implementationerna (static nu)
src/ui/              React-sidor och komponenter
src/components/ui/   shadcn/ui-primitiver
docs/design/         designen (Pencil, .pen)
docs/specs/          specifikationer
docs/plans/          implementationsplaner
```

**Publikt API.** Sophämtning per adress finns också som öppet JSON-API (`/api/v1`) för Home Assistant, Homey och egna integrationer. Se [`docs/api.md`](docs/api.md) och [`openapi.json`](https://sopor.hardyson.se/api/v1/openapi.json).

UI:t pratar bara med `WasteProvider` (`src/providers/types.ts`). Det vet aldrig om datan kommer från statiska filer, EDP eller något annat. Genererade filer under `public/data/` och `public/ics/` checkas inte in.

## Dataformatet

### `data/<kommun>/<år>/schedules.json`

```json
{
  "year": 2026,
  "source": "Avesta Vatten och Avfall, hämtschema 2026",
  "validFrom": "2026-01-01",
  "validTo": "2027-01-10",
  "updatedAt": "2026-10-29",
  "note": "Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.",
  "schedules": {
    "onsdag-jamn": {
      "name": "Trakt 4 – onsdag, varannan vecka",
      "bins": [{ "fraction": "rest", "sizeLiters": 190, "frequencyText": "Var 6:e vecka · onsdagar" }],
      "events": [
        { "date": "2026-11-11", "fractions": ["rest", "mat"] },
        { "date": "2027-01-07", "fractions": ["papper", "mat"],
          "deviation": { "originalDate": "2027-01-06", "reason": "trettondedag jul" } }
      ]
    }
  }
}
```

- `fractions` får vara `rest`, `mat`, `papper`, `plast`, `glas` eller `metall` (`src/domain/fractions.ts`).
- `bins` är valfritt och visas inte på sajten i dag, eftersom vi inte vet vilket abonnemang varje hushåll har.
- Avvikelser, till exempel helgdagar, skrivs in som de står i kommunens schema. Sopor räknar inte ut helgdagar.
- `validFrom` och `validTo` anger vilka datum filen gäller. Ett schema kan gå över årsskiftet.

### `data/<kommun>/<år>/addresses.csv`

```csv
# Rader som börjar med # är kommentarer
id,street,locality,schedule
krylbo-storgatan-12b,Storgatan 12 B,Krylbo,onsdag-jamn
```

- `id` är adressens stabila id, `<ort>-<gata>-<nummer><bokstav>` utan å/ä/ö. Det används i URL:en och i kalenderprenumerationen. **Ett id får aldrig ändras eller återanvändas**, inte heller om stavningen av gatan rättas.
- `schedule` pekar på en nyckel i samma års `schedules.json`.

Build-skriptet stoppar med ett tydligt fel vid okända fraktioner, ogiltiga datum, dubbletter av id och adresser som pekar på ett schema som saknas.

## Uppdatera årets schema

1. Skapa `data/avesta/<nytt år>/` med `schedules.json` och `addresses.csv`.
2. Sätt `validFrom` till det datum då det nya schemat börjar gälla. Från det datumet ersätter den nya filen den gamla, även för adresser som byter trakt.
3. Behåll samma adress-id som förra året. Nya adresser får nya id.
4. Låt förra årets mapp ligga kvar, eftersom kalendrar visar historiken.
5. Kör `npm test && npm run build` och kontrollera några adresser i `npm run dev`. Committa och pusha.

Prenumererade kalendrar (webcal, Google, Apple) hämtar den nya filen själva. Apple gör det enligt användarens inställning. Google bestämmer själv, oftast inom ett dygn men ibland längre. Nedladdade `.ics`-filer uppdateras aldrig.

Påminnelsen kvällen innan (`VALARM`) följer med i filen, men Google ignorerar den för prenumerationer och Apple stänger av notiser som standard. Därför finns ett tips om det i kalenderarket.

## Lägga till en kommun

1. Lägg till källan i `src/sources/index.ts` (id, namn, länk, kommuner med SCB-kod, `config: { system: 'static' }`).
2. Skapa `data/<id>/<år>/` med de två filerna.
3. Kör `npm test && npm run build`. Kommunens adresser dyker upp i sökningen och på Om-sidan.

## Lägga till en EDP-källa

Många kommuner och avfallsbolag kör EDP Future med den publika modulen SimpleWastePickup. Då räcker en rad i registret:

1. Testa att modulen har data (se [guiden](docs/kommuner/hitta-kommunens-data.md#steg-2-finns-en-publik-söktjänst-per-adress)).
2. Lägg till källan i `src/sources/index.ts` med `config: { system: 'edp', baseUrl: 'https://<värd>/<sökväg till FutureWeb>' }` och alla kommuner den täcker (SCB-kod och namn).
3. Kör `npm run build:streets` för att hämta gatunamnen för de nya kommunerna från OpenStreetMap, och checka in `data/osm/`.
4. Kör `npm test && npm run build` och prova sökningen i `npm run dev`.

EDP ger nästa tömning och en frekvens. Sopor räknar fram kommande datum i 12 månader och märker dem *beräknat*; datum som infaller på röda dagar får en varning.

## Lägga till en ny datakälla (provider-typ)

Exempel: EDP Future "SimpleWastePickup", som många kommuner använder.

1. Lägg till en variant i `SourceConfig` (`src/sources/index.ts`).
2. Implementera `WasteProvider` i `src/providers/<typ>.ts` och koppla in den i `providerFor` (`src/providers/registry.ts`).
3. Om källan saknar CORS (troligt för EDP) behövs en liten Vercel Function i `/api` som proxar och cachar, och som genererar `.ics` live med `buildIcs` från `src/domain/ics.ts`. Providerns `icsUrl` pekar då på funktionen.

Inget utanför `src/providers/` och `scripts/` får känna till trakter, EDP eller andra källdetaljer.

## Integrationer

Integrationer ligger i `integrations/`. De är egna paket som bara använder det publika API:t (`/api/v1`), aldrig koden i `src/` (regel 8 i `AGENTS.md`).

### Homey: `integrations/homey/`

Appen **Sophämtning** för Homey Pro (SDK v3, TypeScript).
- **Enhet:** en enhet per adress, som man lägger till genom att söka på adressen. Den visar nästa hämtning, "Dagar kvar", "I morgon" och en rad per avfallstyp. Avfallstyper man inte har kan döljas.
- **När:** sopor hämtas i morgon (vid enhetens påminnelsetid), sopor hämtas i dag (vid morgontiden), hämtschemat ändrades.
- **Och:** [fraktion] hämtas (inte) i dag, i morgon eller i övermorgon, eller om N dagar.
- **Då:** uppdatera hämtschemat, och "vilka sopor hämtas …?" (Advanced Flow).
- **Widget:** "Nästa hämtning" för Homeys dashboards.

Appen finns inte i Homey App Store än. Så här provar man den på en egen Homey Pro:

```bash
npm install -g homey && homey login && homey select
cd integrations/homey && npm install && npx homey app install
```

- **Utveckling:** se `integrations/homey/README.md`.
- **Spec:** `docs/specs/2026-10-31-sopor-homey-app.md`.
- **Undersökning och jämförelse med liknande appar:** `docs/specs/2026-10-31-integrationer-homey-home-assistant.md`.
- **CI:** arbetsflödet `homey.yml` körs bara när `integrations/homey/` ändras.

### Home Assistant

Planerad. HACS kräver ett eget repo, så integrationen kommer att ligga i ett separat repo, se undersökningen. Tills dess finns REST-sensorn i [`docs/api.md`](docs/api.md#home-assistant).

## Driftsättning

Vercel (Hobby). `vercel.json` sätter `Content-Type: text/calendar` och cache-headers för `/ics/*`, kort cache för `/data/*` och SPA-rewrite för övriga sökvägar. Varje deploy tömmer CDN-cachen.

- **Projekt:** `sopor` i Vercel-teamet `badvatten-s-projects`, kopplat till GitHub-repot. Varje push till `main` bygger och driftsätter en ny produktionsversion. Pull requests får en egen preview-deploy.
- **Domän:** `sopor.hardyson.se`. DNS ligger hos Cloudflare: `A sopor 76.76.21.21`, satt till *DNS only* (grå moln, inte proxad).
- **Öppen sajt:** Vercel Authentication är avstängd, så både `sopor.hardyson.se` och preview-adresserna för pull requests är publika. Bidragsgivare kan alltså testa sina ändringar live. Pull requests från forkar byggs inte förrän förvaltaren godkänt dem i Vercel (Git fork protection).
- **Testversion:** en allmän varningsbanderoll visas överst på alla sidor ("Testversion – Sopor är under utveckling …", `src/ui/layout/TestDataBanner.tsx`).
- **Dolda källor:** en källa med `hidden: true` i `src/sources/index.ts` syns inte i sökning, på Om-sidan, i API:t eller i byggd data, men build-skriptet validerar ändå dess datafiler. Avesta är dold så länge datan är påhittad (`testData: true`). Ta bort båda flaggorna när riktig data finns.

## Design

Designen finns i `docs/design/sopor-design.pen` (Pencil) och är facit för färger, typsnitt, komponenter och tillstånd. Färgerna ligger som CSS-variabler i `src/styles/theme.css`, med ljust och mörkt läge.

## Licens

[MIT](LICENSE). Datan om tömningar kommer från respektive kommun.

Gatu- och ortnamn © [OpenStreetMaps bidragsgivare](https://www.openstreetmap.org/copyright), tillgängliga under ODbL. Indexet i `data/osm/` delas under samma licens.

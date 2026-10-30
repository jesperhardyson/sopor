# Sopor – design (v1)

Datum: 2026-10-30
Status: godkänd 2026-10-30

## Syfte och varför

Sopor (sopor.hardyson.se) är en enkel, inofficiell webbtjänst. Invånaren skriver sin adress och ser vilka kärl som töms vilket datum, och kan lägga in schemat i sin kalender. Första kommunen är Avesta (Avesta Vatten och Avfall AB). Allt UI är på svenska.

Det är ett hobbyprojekt. Det ska kosta så nära noll som möjligt och vara enkelt att underhålla en gång om året när ett nytt hämtschema kommer.

## Mål

- Adress in → nästa tömning, kommande tömningar, månadskalender och användarens kärl.
- Kalenderexport: webcal-prenumeration, Google Kalender, Apple Kalender och nedladdning av .ics.
- Sparade adresser utan konto (localStorage).
- Delbar länk per adress: `/avesta/{addressId}`.
- Datakällan kan bytas per kommun utan att UI:t ändras.
- Fler kommuner kan läggas till med konfiguration och en ny datamapp.

## Icke-mål (v1)

- Ingen backend, ingen databas och inga Vercel Functions i v1.
- Ingen EDP-provider i v1. Gränssnittet ska däremot rymma den (se nedan).
- Inga påminnelser (push, e-post, sms). Bara en "Påminnelser – Kommer snart"-plats i UI:t, som i designen.
- Inget e-postfält i "kommunen stöds inte". Designens formulär "Meddela mig" byggs inte.
- Inga adresser i sökningen för kommuner vi inte har schema för (t.ex. Hedemora). Designens autocomplete-rad "Hedemora kommun · Stöds inte än" byggs inte.

## Anti-mål (misslyckande även om det "fungerar")

- Låsning till en leverantör. Ingen kod utanför providerlagret får känna till EDP, trakter eller något annat källspecifikt.
- En egen tolkning av utseendet. Designen i Pencil gäller.
- Kalenderprenumerationer som slutar fungera när en adress byter trakt, eller när data för ett nytt år läggs in. Adress-id och händelse-UID måste vara stabila.
- Anrop mot inloggade API:er (Mina sidor o.d.) eller scraping bakom inloggning. Endast publika, dokumenterade funktioner.
- Löpande kostnad utöver domänen.

## Begränsningar

- Hosting: Vercel Hobby (gratis, icke-kommersiellt).
- Stack: Vite + React + TypeScript, shadcn/ui + Tailwind, build-skript i TypeScript som körs i `npm run build`, Vitest, `vercel.json` för headers och rewrites.
- Statisk sajt. All data genereras vid build till `public/`.

## Design (utseende)

Källa: `docs/design/sopor-design.pen`. Läs den via Pencil MCP, inte direkt från fil. Följ den exakt för färger, typsnitt, logo, komponenter och tillstånd.

**Regel:** Allt som syns i designens skärmar byggs, utom det som står under Icke-mål. Det som finns i designen men inte i det här dokumentet byggs alltså, med designen som facit.

- **Tokens:** Variablerna i .pen-filen har ljust och mörkt läge (`bg`, `surface`, `surface-2`, `border`, `text`, `text-2`, `primary`, `on-primary`, `brand`, `brand-soft`, `brand-text`, `earth`, `earth-soft`, `warn`, `warn-bg`, `card-overlay` samt `frac-<fraktion>` och `frac-<fraktion>-bg` för rest, mat, papper, plast, glas och metall). De mappas till CSS-variabler i shadcn-temat. Fraktionsfärgerna blir egna tokens.
- **Typsnitt:** `Nunito` (UI) och `Fredoka` (varumärke/logo).
- **Komponenter:** Logo, Logo/Symbol 16–156 (används även som favicon), Chip/<fraktion>, Fraktionsikon/<fraktion>, Knapp/Primär, Knapp/Sekundär, Avvikelse, Sidhuvud, Sidfot och Sidhuvud/Desktop. Fraktionen visas alltid med färg, ikon och text tillsammans (se ramen "Varumärke · Sopor").
- **Skärmar:** Mobil · Start (tom, sparade adresser, autocomplete), Resultat, Lägg till i kalender (ark), Spara adress (ark), Adressen hittades inte, Kommunen stöds inte, Laddar, Om. Varianter finns för tablet (768) och desktop (1280) samt mörkt läge.
- **Levande bakgrund:** två mjuka fält i `--bg-2` glider långsamt över `--bg` (bara `transform`, avstängt vid `prefers-reduced-motion`). Avvikelse från designen på användarens begäran.
- **Större startsida på desktop:** från 1024 px är kolumnen 720 px och hero och sökfält större och centrerade. Avvikelse från designen på användarens begäran.
- **Tema:** Mörkt läge växlas med knappen i sidhuvudet. Valet sparas i localStorage, och utan sparat val följer temat systemet (*min bedömning*).

## Arkitektur

### Översikt

```
data/<kommun>/<år>/schedules.json   ┐
data/<kommun>/<år>/addresses.csv    ┘─► scripts/build-data.ts ─► public/data/<kommun>/addresses.json
                                                               ─► public/data/<kommun>/schedules/{scheduleId}.json
                                                               ─► public/ics/<kommun>/{addressId}.ics

src/
  domain/        typer, fraktionsregister, rena funktioner (gruppering, nästa tömning, ICS)
  municipalities/ kommunregister (konfiguration)
  providers/     Provider-gränssnitt + implementationer (static nu; edp senare)
  ui/            React-komponenter och vyer
```

Domänlogiken (gruppering, ICS-generering) är ren TypeScript och delas mellan build-skriptet och webbläsaren. En framtida Vercel-funktion för EDP kan återanvända samma ICS-kod.

### Domänmodell

```ts
type FractionId = "rest" | "mat" | "papper" | "plast" | "glas" | "metall";

// Register, lätt att utöka: id → { namn: "Restavfall", kort: "Rest", färgtoken, ikon }
const FRACTIONS: Record<FractionId, FractionInfo>;

interface Municipality {
  id: string;            // "avesta" – används i URL och sökvägar
  name: string;          // "Avesta kommun"
  operator: { name: string; url: string };  // "Avesta Vatten och Avfall", länk på Om-sidan
  provider: ProviderConfig;
}

type ProviderConfig =
  | { type: "static" }                              // läser /data/<id>/...
  | { type: "edp"; baseUrl: string };               // v2, via /api-proxy
// Nya leverantörer = ny variant + ny provider-implementation.

interface Address {
  id: string;            // stabilt, se "Adress-id"
  street: string;        // "Storgatan 12 B"
  locality: string;      // "Krylbo"
  municipalityId: string;
}

interface Bin {
  fraction: FractionId;
  sizeLiters?: number;      // okänt i praktiken – visas bara om det finns
  pickupsPerYear?: number;
  frequencyText?: string;   // "Varannan vecka · onsdagar", visas i "Mina kärl"
}
// "Mina kärl" kan härledas ur händelserna om bins saknas i datan:
// en rad per fraktion som förekommer, frekvens räknad från intervallen
// mellan datum (t.ex. 14 dagar → "Varannan vecka") och veckodag.
// Storlek i liter visas bara om den finns i datan.

interface PickupEvent {
  date: string;              // "2026-11-11" (lokalt datum, ingen tid)
  fractions: FractionId[];
  deviation?: { originalDate?: string; reason: string };  // "trettondedag jul"
}

interface Schedule {
  bins: Bin[];
  events: PickupEvent[];     // sorterade, alla kända år sammanslagna
  note?: string;             // t.ex. "ställ ut kärlen senast 06.00 på tömningsdagen"
  updatedAt: string;
}

interface WasteProvider {
  searchAddresses(query: string, signal?: AbortSignal): Promise<Address[]>;
  suggestAddresses(query: string, signal?: AbortSignal): Promise<Address[]>;  // "Menade du:"
  getAddress(addressId: string, signal?: AbortSignal): Promise<Address | null>; // delad länk
  getSchedule(addressId: string, signal?: AbortSignal): Promise<Schedule | null>;
  icsUrl(addressId: string): string;   // static: /ics/<kommun>/<id>.ics; edp: /api/...
}
```

`searchAddresses` och `getSchedule` är async och tar en AbortSignal, så att en nätverksbaserad provider (EDP) passar utan ändringar. Ett sökregister i UI:t frågar alla kommuners providers parallellt och slår ihop svaren. Det finns ingen kommunväljare.

Adressen i v1 bär inget `scheduleId` utåt. Kopplingen adress → trakt/schedule är en intern detalj i den statiska providern (EDP har ingen trakt). Det är en avvikelse från förslaget i uppdraget och *min bedömning*.

### Adress-id

Läsbar slug: `<ort>-<gata>-<nummer><bokstav>`, t.ex. `krylbo-storgatan-12b`. Den genereras en gång och sparas i `addresses.csv` som egen kolumn, så att id:t inte ändras om stavningen rättas senare. Build-skriptet stoppar vid dubbletter. Ett id återanvänds aldrig för en annan adress.

### Datafilformat (statisk provider)

`data/avesta/2026/addresses.csv`:

```csv
id,street,locality,schedule
krylbo-storgatan-12b,Storgatan 12 B,Krylbo,onsdag-jamn
```

`data/avesta/2026/schedules.json`:

```json
{
  "year": 2026,
  "source": "Avesta Vatten och Avfall, hämtschema 2026",
  "schedules": {
    "onsdag-jamn": {
      "name": "Trakt 4 – onsdag jämn vecka",
      "bins": [
        { "fraction": "rest", "sizeLiters": 190, "pickupsPerYear": 13, "frequencyText": "Var 4:e vecka · onsdagar" }
      ],
      "events": [
        { "date": "2026-11-11", "fractions": ["rest", "mat"] },
        { "date": "2027-01-07", "fractions": ["papper", "mat"],
          "deviation": { "originalDate": "2027-01-06", "reason": "trettondedag jul" } }
      ]
    }
  }
}
```

- **Datakälla:** Adress→trakt-tabellen är begärd ut som allmän handling men har inte kommit än. V1 byggs och levereras på seed-data. Den riktiga datan läggs in senare, i samma format.
- Ett schedule = en trakt plus en kärluppsättning. Om adresser i samma trakt har olika kärl blir det flera schedule-poster med samma händelser (*min bedömning*; formatet tillåter det redan).
- **Giltighet:** Varje årsfil har `validFrom` och `validTo` (t.ex. 2026-01-01 till 2027-01-10), eftersom ett schema kan sträcka sig över årsskiftet. Vid sammanslagning gäller den senare filen från sitt `validFrom`, och den tidigare filens händelser från och med det datumet kastas. Det gäller även om adressen bytt trakt. Överlappande intervall är tillåtna, och den nyare filen vinner (*min bedömning*).
- Avvikelser skrivs in uttryckligen, som i PDF:en. Vi räknar inte ut helgdagar.
- Flera år läses och slås ihop. Adressens trakt för ett visst år tas från det årets CSV. Publicerade schedule-id har året som prefix (t.ex. `2026-onsdag-jamn`). Sökindexet ger varje adress en lista av schedule-ref, en per år, och providern hämtar dem och slår ihop händelserna. Kärl och note tas från det senaste året.
- Build-skriptet validerar: okända fraktioner, ogiltiga datum, adresser som pekar på saknat schedule, dubbletter av id. Det stoppar med ett tydligt felmeddelande.

**Genererade filer:**

- `public/data/avesta/addresses.json`: kompakt sökindex, t.ex. `[[id, street, locality, scheduleRef], ...]`.
- `public/data/avesta/schedules/{scheduleId}.json`: ett `Schedule`.
- `public/ics/avesta/{addressId}.ics`: en per adress, med händelser från alla år som adressen har data för.

Genererade filer checkas inte in (`.gitignore`). `npm run dev` kör build-data först.

### Seed-data (byggs först)

`data/avesta/2026/` med fake-data i exakt samma format:

- Ett tiotal adresser i Avesta, Krylbo, Horndal och Fors, med 3–4 olika scheman.
- Exempelvillan (onsdag jämn vecka): Restavfall 190 l, Matavfall 140 l (26 ggr/år), Pappersförpackningar och Plastförpackningar. Uppdraget och designen skiljer sig åt: uppdraget säger papper/plast 240 l och rest 8 ggr/år, designen 370 l och rest "Var 4:e vecka". Seed-datan följer designen så att skärmen kan jämföras mot den (*min bedömning*). Den riktiga datan avgör. Tömningar: 2026-11-11 Rest+Mat, 2026-11-25 Papper+Mat, 2026-12-09 Plast+Mat, 2026-12-23 Rest+Mat, och en flyttad tömning 2027-01-07 (från 6 jan, trettondedag jul).
- Minst ett schema med en helgdagsavvikelse.
- En sökning utan träff är dokumenterad i README:n och testerna, t.ex. "Storgtan 12" → "Menade du: Storgatan 12, Avesta".
- Seed-datan märks tydligt som fake och ersätts när den riktiga tabellen kommer.

### EDP-provider (v2, byggs inte nu)

- `ProviderConfig { type: "edp", baseUrl }`. Endpointerna är desamma för alla EDP-kommuner (`/SimpleWastePickup/SearchAdress`, `/SimpleWastePickup/GetWastePickupSchedule`).
- Webbläsaren anropar `/api/edp/<kommun>/search` och `/api/edp/<kommun>/schedule`. Vercel-funktionen proxar och cachar (CDN-cache-headers), eftersom kommunens server troligen saknar CORS.
- Adress-id för EDP: en stabil slug av den adressträng EDP returnerar. Mappningen RhServices → `Schedule` skrivs när formatet är känt.
- ICS: `/api/ics/<kommun>/<id>.ics` genereras live med samma domänkod. Providerns `icsUrl` döljer skillnaden mot den statiska varianten.

### Extern adresskälla (framtid, byggs inte i v1)

När den riktiga trakt-tabellen finns: ett kontrollskript som jämför `addresses.csv` mot en oberoende adresskälla (stavning, saknade adresser, fel ort eller kommun). Skriptet läser bara datafilerna och påverkar inte arkitekturen. Kandidater i prioritetsordning: Lantmäteriet Belägenhetsadress (licens och ansökan oklar), OpenStreetMap (ODbL, kräver källangivelse och share-alike, glest på landsbygden) och kommunens egna öppna data. Valet görs när trakt-tabellen har kommit.

## Funktioner och beteende

### Sök / autocomplete

- Söker från 2 tecken, med debounce. Matchningen är skiftlägesokänslig och accentokänslig (å/ä/ö ska ändå matcha sig själva), och mellanslag inom gatunummer tolereras ("12b" = "12 B").
- Varje träff visar gatuadress, ort och kommun tydligt separerade (kommun som chip, enligt designen). Tangentbordsnavigering och ARIA-combobox.
- Ingen träff → tillståndet "Vi hittade inte adressen", med "Menade du:" från enkel fuzzy-matchning i webbläsaren. (Länken till kommunens officiella hämtschema är borttagen, beslut 2026-10-30.)
- Fokusläge på startsidan: när sökfältet får fokus glider det upp mot fönstrets överkant och resten av sidan tonas ner. Läget avslutas med Esc eller klick på den tonade ytan, inte vid blur. Ingen animation vid `prefers-reduced-motion`.

### Resultatvy (`/avesta/{addressId}`)

- Nästa tömning: veckodag, datum, "om N dagar"/"i morgon"/"i dag", fraktionschips, schemats `note` och knappen "Lägg till i kalender".
- Kommande tömningar grupperade per datum, med etiketten "Nästa" och avvikelser ("Flyttad · helgdag" plus förklaringstext).
- Månadskalender med fraktionsprickar och bläddring mellan månader (*min bedömning*: inom de månader som har data).
- ~~Mina kärl~~: borttaget (beslut 2026-10-30). Vi vet inte hushållets abonnemang, så sajten visar bara tömningar per datum.
- "Påminnelser – Kommer snart".
- "Spara" öppnar arket "Spara adress".
- "Byt adress" går tillbaka till start.
- "I dag" räknas i tidszonen Europe/Stockholm.

### Kalenderexport (ark "Lägg till i kalender")

- Prenumerera: `webcal://sopor.hardyson.se/ics/avesta/{id}.ics`.
- Google Kalender: `https://calendar.google.com/calendar/r?cid=<webcal-url-kodad>`.
- Apple Kalender: samma webcal-länk.
- Ladda ner .ics: samma fil med `download`-attribut.

### ICS

- En VEVENT per tömningsdatum, heldag (`DTSTART;VALUE=DATE`, `DTEND` = dagen efter).
- `SUMMARY: Sopor: Restavfall + Matavfall`. Fraktionsordningen följer registret.
- `UID: <addressId>-<faktiskt datum>@sopor.hardyson.se`. Datumen är unika per adress, eftersom en tömning per datum slår ihop fraktionerna. Avvikelser står redan i datan när den publiceras, så en flyttad tömning är bara en händelse på sitt nya datum (*min bedömning*).
- `DESCRIPTION` med avvikelsetext och friskrivning.
- VALARM kl. 18:00 kvällen innan (`TRIGGER:-PT6H`).
- `X-WR-CALNAME: Sopor – Storgatan 12 B, Krylbo`, `REFRESH-INTERVAL`/`X-PUBLISHED-TTL` på 1 dygn, CRLF och radvikning enligt RFC 5545.
- `DTSTAMP` sätts från datans `updatedAt`, inte från byggtiden, så att filen bara ändras när datan ändras.
- **Uppdateringar:** Prenumerationer (webcal, Google, Apple) hämtar om filen själva. Ändrad data når användaren vid nästa hämtning. Apple hämtar enligt användarens inställning, Google bestämmer själv, ofta inom ett dygn men ibland längre. `REFRESH-INTERVAL` är bara ett önskemål som Google ignorerar. Varje deploy på Vercel tömmer CDN-cachen, så inget gammalt ligger kvar hos oss. En nedladdad .ics uppdateras aldrig, och arket säger det redan ("Uppdateras inte").

### Sparade adresser

- localStorage med try/catch. Allt fungerar utan lagring (t.ex. privat läge). Varje post har id, eget namn ("Hemma", "Stugan", "Jobbet" som snabbval) och kommun.
- Startsidan visar listan med nästa tömning för varje sparad adress, enligt designen. Läget "Ändra" tar bort och byter namn.
- Texten "Sparas bara på den här enheten." visas.

### Tillstånd

| Tillstånd | När |
|---|---|
| Laddar | schema hämtas ("Hämtar schemat från Avesta kommun…") |
| Adressen hittades inte | sökningen ger ingen träff, eller okänt adress-id i URL:en |
| Kommunen stöds inte | URL med okänt kommun-id. Visas utan e-postformulär. |
| Avvikelse/helgdag | komponenten Avvikelse i listan och nästa tömning |
| Inga sparade adresser | Start (tom) |
| Fel vid laddning (*min bedömning*) | nätverksfel. Kort text och "Försök igen" i designens stil. |

### Sidor och routing

- `/`: start.
- `/:kommun/:addressId`: resultat.
- `/om`: Om-sidan enligt designen. Kontakt är `mailto:support@hardyson.se` (även länken "Kontakt" i sidfoten), och källorna kommer från kommunregistret.
- SPA-rewrite i `vercel.json`: allt utom `/data/*`, `/ics/*` och statiska filer → `index.html`.

### Sidfot

"Inofficiell tjänst. Vid avvikelser gäller kommunens information." samt Om och Kontakt, enligt designen. Länken till avfallsbolaget finns på Om-sidan, inte i sidfoten (beslut 2026-10-30).

## vercel.json

- `/ics/(.*)`: `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: public, max-age=3600, s-maxage=86400`.
- `/data/(.*)`: `Cache-Control: public, max-age=300, s-maxage=3600`. Filnamnen är inte hashade, så cachen hålls kort.
- SPA-rewrite enligt ovan.

## Tester (Vitest)

- Datagenerering: CSV- och JSON-parsning, validering (felfall stoppar), sammanslagning av flera år, kompakt index.
- Gruppering per datum och "nästa tömning" relativt ett givet "i dag" (inklusive "i dag" och "i morgon" samt årsskiftet).
- ICS: snapshot-test plus specifika kontroller (heldag, UID-stabilitet, VALARM, CRLF/radvikning, escaping av `,;\`).
- Sök: normalisering och fuzzy-förslag (seed-fallet "Storgtan 12").

## Arbetsordning

1. ~~Läs designen och föreslå struktur~~ (detta dokument).
2. Sätt upp Vite, React, shadcn/ui och Tailwind med designens tema, typsnitt och logo/favicon.
3. Domän + build-skript med seed-data → JSON + ICS, med tester.
4. UI:t enligt designen med alla tillstånd, för mobil, tablet och desktop, ljust och mörkt.
5. `vercel.json` och dokumentation:
   - `README.md`: vad Sopor är, köra lokalt, testa, uppdatera årets data, lägga till en ny kommun, lägga till en ny provider-typ, driftsättning.
   - `AGENTS.md`: instruktioner för AI-agenter (arkitekturregler som providergränsen, datakällsregler, kommandon, var specs och planer ligger).
   - `CLAUDE.md`: kort, pekar på `AGENTS.md` plus Claude-specifikt (Pencil MCP för designen).
6. Driftsättning: skapa Vercel-projektet, koppla domänen `sopor.hardyson.se` och verifiera att sajten, `/ics/*` (Content-Type) och SPA-routes fungerar i produktion.

## Kvar åt den som bygger

- Detaljer i fuzzy-matchningen och sökrankningen.
- Hur `addresses.json` packas (array-of-arrays eller liknande). Det viktiga är att filen är liten.
- Val av router (react-router eller en minimal egen).
- Hur alla designvarianter delas upp i komponenter, så länge resultatet matchar designen.

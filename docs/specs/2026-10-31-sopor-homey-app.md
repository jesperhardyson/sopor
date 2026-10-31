# Spec: Sopor som Homey-app

Status: utkast, 2026-10-31. Bygger på undersökningen `2026-10-31-integrationer-homey-home-assistant.md`.

Beslut:
- I appens texter heter det **avfallstyp** ("Något avfall" för vilken som helst), inte "fraktion", som är fackspråk. Id och kod säger fortfarande `fraktion`, så att befintliga flöden inte går sönder (från 0.4.1).
- Villkoren gör att användaren kan välja tiden själv i sitt flöde.
- Från 0.2.0 finns också triggern "Sopor hämtas i morgon" vid en inställd tid per enhet. Utan den gick det inte att få fraktionernas namn i en notis i ett vanligt flöde, eftersom tokens från handlingskort bara finns i Advanced Flow.
- 0.4.0 lägger till inställningen för att dölja fraktioner och widgeten "Nästa hämtning".
- 0.3.0 lägger till det som liknande appar har och vi saknade (se jämförelsen i undersökningen): "om N dagar", "Dagar kvar", triggern "Sopor hämtas i dag" och triggern "Hämtschemat ändrades".

## Mål

En Homey Pro-ägare lägger till sin adress genom att söka på den. Sedan kan adressen användas i flöden, till exempel "När klockan är 19:00 → Och plast hämtas i morgon → Då skicka notis". Enhetskortet visar nästa hämtning per fraktion.

## Utanför MVP

- Homey Cloud (kräver Verified Developer).
- Inställningssida för appen och Insights.
- Publicering i App Store. Ikon, bilder och `brandColor` finns (sidan "Homey · Sophämtning" i designen), och appen klarar `homey app validate --level publish`. Under utvecklingen installeras appen med `homey app install`.

## Ramar

- **Plats:** `integrations/homey/`, ett eget npm-paket. Repots rot-`tsconfig`, Vitest och Vercel-bygget rör inte mappen.
- **Källkoden:** TypeScript som ESM (`.mts`), SDK v3. `compatibility: ">=12.3.0"` och `platforms: ["local"]`.
- **App-id:** `se.hardyson.sopor`. Namn: "Sophämtning" (engelska "Waste Collection"). Namnet säger vad appen gör, och kopplingen till Sopor står i beskrivningen. Språk: `en` (krävs) och `sv`.
- **Bara publika API v1:** `/api/v1/sok` och `/api/v1/adress/{källa}/{id}`. Ingen kod från `src/`. Fraktionernas namn kommer ur svarets `fractions{}`.
- **User-Agent:** `Sopor-Homey/<version> (+https://sopor.hardyson.se)`.

## Enhet: en adress

- **Drivrutin:** `adress`, klass `other`.
- **Data och lagring:** `data: { id: "<källa>/<adress-id>" }`. `store` innehåller adressens API-`url` och det senaste lyckade svaret. Svaret sparas så att enheten fungerar efter omstart utan nät.
- **Namn vid parning:** `"<gata>, <ort>"`, och dessutom `detail` om det finns.

### Capabilities

| Capability | Typ | Visar |
|---|---|---|
| `sopor_summary` | string, sensor | Nästa hämtning, till exempel "Plast & metall – om 4 dagar". Räknas lokalt ur `events`. |
| `sopor_days` | number (d), sensor | "Dagar kvar" till nästa hämtning av någon fraktion. Den är tom när inget väntar. |
| `sopor_tomorrow` | string, sensor | "I morgon": till exempel "Plast & metall", eller "Inget". Fungerar som enhetstagg i vanliga flöden. |
| `sopor_next.<fraktion>` | string, sensor | En per fraktion som adressen har, med fraktionens namn som titel. Till exempel "i morgon" eller "om 4 dagar, ons 4 nov". |

Underkapabiliteter (`sopor_next.plast`) läggs till och tas bort efter vad svaret innehåller. Titeln sätts med `setCapabilityOptions`, så okända fraktions-id fungerar utan att appen uppdateras.

### Uppdatering

- Var 15:e minut räknas texterna om ur det sparade svaret. "I dag" och "i morgon" byts alltså strax efter midnatt utan att API:t anropas. "I dag" räknas i `Europe/Stockholm`.
- API:t hämtas om senaste lyckade hämtningen är äldre än 6 timmar, och direkt vid start. Det håller sig gott inom "högst en gång i timmen".
- Vid 502, nätfel eller timeout (15 s) behålls det sparade svaret. Enheten markeras inte som otillgänglig för enstaka fel. Först när inget svar alls finns (precis efter parning) visas `setUnavailable`.
- Vid 404 (adressen finns inte längre) blir enheten otillgänglig med texten "Adressen finns inte längre hos källan. Reparera enheten."

### Dolda fraktioner

- Enhetens inställningar har gruppen **Fraktioner**, med en kryssruta `visa_<id>` per känd fraktion (`rest`, `mat`, `papper`, `plast`, `glas`, `metall`, `tidningar`, `karl`). Alla är ikryssade från början.
- En avmarkerad fraktion tas bort ur schemat innan något räknas. Den försvinner från raderna, sammanfattningen, "I morgon", "Dagar kvar", autocomplete och alla kort, och en hämtning med bara dolda fraktioner finns inte längre.
- Fraktions-id som appen inte känner till visas alltid, eftersom Homeys inställningar är statiska.
- Enheten ritas om strax efter att inställningarna sparats.

## Parning

1. **Egen vy `sok`:** ett fält "Gata och husnummer" (exempel "Storgatan 2, Uppsala") och knappen "Sök". Inget kommunval: det första försöket med kommun före sökningen var krångligt och låste sig.
   - Text efter första kommat är **ort**. Drivrutinen söker på det som står före kommat (`/api/v1/sok?q=…`) och filtrerar själv på ort eller kommun, där varje ord ska vara början på ett ord i ortens eller kommunens namn. API:t används inte för orten, eftersom källorna tolkar ort i frågan olika: EDP förstår "gata, ort", de statiska källorna förstår ord.
   - Är delen före kommat kortare än tre tecken visas ett fel.
   - **Fler än 12 träffar:** vyn visar orterna som knappar, till exempel "Uppsala, Uppsala kommun (10)", med flest träffar först. Ett tryck på en ort visar bara dess träffar. "Storgatan 2" gav 129 träffar.
   - **Inga träffar och någon källa svarade inte:** "Några källor svarade inte. Försök igen om en stund."
   - **Annars, om inget hittades:** "Ingen adress hittades. Kontrollera stavningen och skriv med husnummer."
   - **1–12 träffar:** vyn går vidare till `list_devices`.
2. **`list_devices`** (systemvy): träffarna, med namnet `"<gata>, <ort>"` (kommunen om orten saknas) och `detail` om det finns.
3. **`add_devices`** (systemvy).

Vyn använder Homeys egna klasser (`homey-form-input`, `homey-button-primary-full`). Den har ingen egen design.

## Flödeskort

Alla är enhetskort och syns under adressens enhet (i dess zon) när man väljer kort, inte under appen. Titlarna innehåller "sopor" eller "hämt…", så att de kommer fram när man söker i kortväljaren.

- **Trigger `hamtas_i_morgon`:** "Sopor hämtas i morgon" i listan, och "[[fraktion]] hämtas i morgon" i kortet.
  - Går en gång om dagen vid enhetens inställning **Påminnelsetid** (`paminnelsetid`, "HH:MM" svensk tid, standard 18:00), om något hämtas dagen efter.
  - Var Homey avstängd vid den tiden, går den i högst tre timmar efteråt.
  - `fraktion` (autocomplete, "Någon fraktion" som standard) filtrerar.
  - Tokens: `fraktioner` (namnen med komma emellan), `antal` och `datum` (till exempel "tors 5 nov").
  - Senast utlöst dag sparas i enhetens `store`, så att triggern inte går två gånger efter en omstart.
- **Trigger `hamtas_i_dag`:** "Sopor hämtas i dag". Den fungerar som `hamtas_i_morgon`, men går vid inställningen **Morgontid** (`morgontid`, standard 07:00) på själva hämtningsdagen. Senast utlöst dag sparas separat.
- **Trigger `schema_andrat`:** "Hämtschemat ändrades" / "Schemat för [[fraktion]] ändrades".
  - Går efter en hämtning från API:t, en gång per fraktion vars nästa datum (räknat från i dag) har flyttats, försvunnit eller tillkommit jämfört med förra svaret.
  - Passerade hämtningar räknas inte som ändringar. Vid första hämtningen går den inte.
  - Tokens: `fraktion`, `text` (till exempel "Plastförpackningar flyttas från ons 4 nov till tors 5 nov"), `tidigare`, `nytt` och `orsak` (källans `deviation.reason`, annars tom).
- **Villkor `hamtas`:** "Sopor hämtas !{{|inte}}" i listan, och "[[fraktion]] hämtas !{{|inte}} [[nar]]" i kortet.
  - `fraktion` (autocomplete): "Någon fraktion", följd av adressens fraktioner i den ordning svarets `fractions{}` har dem. Valet filtreras på det användaren skriver.
  - `nar` (dropdown): i dag (0), i morgon (1), i övermorgon (2).
  - Sant om något datum i `events` med `datum = i dag + nar` innehåller fraktionen. Med "Någon fraktion" räcker det att datumet finns.
- **Villkor `hamtas_om`:** "[[fraktion]] hämtas !{{|inte}} om [[dagar]] dagar", där `dagar` är 0–60 och 0 betyder i dag.
- **Handling `uppdatera`:** "Uppdatera hämtschemat". Hämtar direkt från API:t och kastar fel om det misslyckas, så att flödet visar felet.
- **Handling `vad_hamtas`** (bara Advanced Flow, eftersom den har tokens): "Vilka sopor hämtas [[nar]]?".
  - Token `fraktioner` (text): namnen med komma emellan, eller tom text.
  - Token `antal` (tal).

## Widget "Nästa hämtning"

- **Design:** sidan "Homey · Sophämtning" i `sopor-design.pen`, i ljust och mörkt läge.
- **Layout:** ett kort med adressen och Sopor-symbolen. Under det kommer en rad per fraktion med nästa hämtning, tidigast först.
  - Varje rad har fraktionsikonen (Lucide, i fraktionens färg), namnet, datumet ("tors 5 nov", med "· beräknat" om datumet inte är bekräftat) och "i morgon" / "om 5 dagar".
  - Rader för i dag och i morgon markeras med `brand-soft`.
- **Inställning:** `adress` (autocomplete bland appens enheter). Utan val visas den första enheten.
- **Data:** `widgets/nasta-hamtning/api.ts` (`GET /?id=`) räknar raderna med `lib/widget.mts` ur enhetens filtrerade schema. Widgeten uppdateras var tionde minut.
- **Utseende:** widgeten är transparent och ritar ett eget kort med designens tokens. Mörkt läge styrs av Homeys klass `homey-dark-mode`.
- **Filer:** Nunito (OFL) och Lucide-ikonerna (ISC) ligger i `public/`, så widgeten inte behöver nätet för utseendet. Förhandsbilderna är exporterade från designen i 1024×1024.

## Tester

- Ren logik ligger i `lib/*.mts` utan Homey-beroenden och testas med Vitest:
  - API-klienten med en fejkad `fetch`
  - datumräkning
  - vilka fraktioner som hämtas en viss dag
  - texterna till capabilities
- Homey-klasserna (`app`, `driver`, `device`) hålls tunna.
- CI: ett eget jobb för `integrations/homey/**` som kör `npm ci`, `npm test`, `tsc --noEmit` och `homey app validate --level debug`.

## Senare

- Testversion i App Store, och sedan certifiering.
- Länk från Om-sidan och `docs/api.md`.

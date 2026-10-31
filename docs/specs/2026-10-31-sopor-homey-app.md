# Spec: Sopor som Homey-app

Status: utkast, 2026-10-31. Bygger på undersökningen `2026-10-31-integrationer-homey-home-assistant.md`. Beslut: appen får **villkor, inga tidsstyrda triggers**. Användaren väljer själv tiden i sitt flöde.

## Mål

En Homey Pro-ägare lägger till sin adress genom att söka på den. Sedan kan adressen användas i flöden, till exempel "När klockan är 19:00 → Och plast hämtas i morgon → Då skicka notis". Enhetskortet visar nästa hämtning per fraktion.

## Utanför MVP

- Homey Cloud (kräver Verified Developer).
- Triggers, widget, inställningssida, Insights.
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
| `sopor_next.<fraktion>` | string, sensor | En per fraktion som adressen har, med fraktionens namn som titel. Till exempel "i morgon" eller "om 4 dagar, ons 4 nov". |

Underkapabiliteter (`sopor_next.plast`) läggs till och tas bort efter vad svaret innehåller. Titeln sätts med `setCapabilityOptions`, så okända fraktions-id fungerar utan att appen uppdateras.

### Uppdatering

- Var 15:e minut räknas texterna om ur det sparade svaret. "I dag" och "i morgon" byts alltså strax efter midnatt utan att API:t anropas. "I dag" räknas i `Europe/Stockholm`.
- API:t hämtas om senaste lyckade hämtningen är äldre än 6 timmar, och direkt vid start. Det håller sig gott inom "högst en gång i timmen".
- Vid 502, nätfel eller timeout (15 s) behålls det sparade svaret. Enheten markeras inte som otillgänglig för enstaka fel. Först när inget svar alls finns (precis efter parning) visas `setUnavailable`.
- Vid 404 (adressen finns inte längre) blir enheten otillgänglig med texten "Adressen finns inte längre hos källan. Reparera enheten."

## Parning

1. **Egen vy `sok`:**
   - **Kommun** (obligatorisk): ett val med alla kommuner ur `/api/v1/kallor`, i bokstavsordning.
   - **Gata och husnummer:** ett textfält, och knappen "Sök".
   - Drivrutinen söker med `/api/v1/sok?q=…&kalla=<källa>` och tar bort träffar i källans andra kommuner. Träffar i kommuner som källan inte listar (grannkommuner, okända orter) behålls. Utan kommun gav "Storgatan" 139 träffar från 15 källor.
   - Är `q` kortare än tre tecken visas ett fel.
   - Ger källan sina högst tio träffar, men alla i andra kommuner: "För många träffar i området. Skriv med husnummer."
   - Svarade källan inte: "Källan svarade inte. Försök igen om en stund."
   - Annars, om inget hittades: "Ingen adress hittades i kommunen. Kontrollera stavningen och skriv med husnummer."
   - Finns det träffar går vyn vidare till `list_devices`.
2. **`list_devices`** (systemvy): träffarna, med namnet `"<gata>, <ort>"` och `detail` om det finns.
3. **`add_devices`** (systemvy).

Vyn använder Homeys egna klasser (`homey-form-input`, `homey-button-primary-full`). Den har ingen egen design.

## Flödeskort

Alla är enhetskort och syns under adressens enhet (i dess zon) när man väljer kort, inte under appen. Titlarna innehåller "sopor" eller "hämt…", så att de kommer fram när man söker i kortväljaren.

- **Villkor `hamtas`:** "Sopor hämtas !{{|inte}}" i listan, och "[[fraktion]] hämtas !{{|inte}} [[nar]]" i kortet.
  - `fraktion` (autocomplete): "Någon fraktion", följd av adressens fraktioner i den ordning svarets `fractions{}` har dem. Valet filtreras på det användaren skriver.
  - `nar` (dropdown): i dag (0), i morgon (1), i övermorgon (2).
  - Sant om något datum i `events` med `datum = i dag + nar` innehåller fraktionen. Med "Någon fraktion" räcker det att datumet finns.
- **Handling `uppdatera`:** "Uppdatera hämtschemat". Hämtar direkt från API:t och kastar fel om det misslyckas, så att flödet visar felet.
- **Handling `vad_hamtas`** (bara Advanced Flow, eftersom den har tokens): "Vilka sopor hämtas [[nar]]?".
  - Token `fraktioner` (text): namnen med komma emellan, eller tom text.
  - Token `antal` (tal).

## Tester

- Ren logik ligger i `lib/*.mts` utan Homey-beroenden och testas med Vitest:
  - API-klienten med en fejkad `fetch`
  - datumräkning
  - vilka fraktioner som hämtas en viss dag
  - texterna till capabilities
- Homey-klasserna (`app`, `driver`, `device`) hålls tunna.
- CI: ett eget jobb för `integrations/homey/**` som kör `npm ci`, `npm test`, `tsc --noEmit` och `homey app validate --level debug`.

## Senare

- Triggers (om användarna efterfrågar dem).
- Widget med nästa hämtningar i fraktionsfärg.
- Testversion i App Store, och sedan certifiering.
- Länk från Om-sidan och `docs/api.md`.

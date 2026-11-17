# Meddelanden från källorna – implementationsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mål:** En källa kan ha tillfälliga meddelanden som visas på sajten, följer med i API:t v1 och i kalenderfilen. Det första gäller Avesta.

**Arkitektur:** Meddelandena skrivs för hand på källan (`messages` i `src/sources/index.ts`). Ren logik för "gäller i dag" och "gäller på datum" ligger i `src/domain/messages.ts` och används av API:t, kalenderfilen och sajten. API:t lägger bara till fält.

**Teknik:** TypeScript, Vitest, Vercel Functions, React, OpenAPI 3.1 (kontraktstest med Ajv).

**Spec:** `docs/specs/2026-11-17-kallmeddelanden.md`. Appen Sophämtning får en egen plan i sitt repo.

## Globala krav

- Fältet heter `messages` överallt, aldrig `notices`.
- `id` matchar `^[a-z0-9-]+$` och är unikt inom källan.
- `validFrom <= validTo`, och `daysBetween(validFrom, validTo) <= 183`.
- `title` högst 60 tecken, `text` högst 400 tecken, inga tecknen `<`, `>`, `*`, `` ` ``, `[`.
- `url` är `https` på källans domän eller en underdomän (samma regel som `contact`).
- "Gäller i dag": `validFrom <= today <= validTo`, med `today = todayInStockholm(now)`.
- API-meddelande: `{ id, title, text, url, validFrom, validTo }`, `url` är `null` när den saknas. Ordning: `validFrom` stigande, sedan `id`.
- Inga befintliga fält i API:t ändrar form eller betydelse. `/sok` ändras inte.
- Kod som Vercel-funktionerna når importerar relativt med `.js`.

## Granskningsfokus

1. Ett meddelande med `validTo` lika med i dag ska fortfarande synas (intervallet är inklusive). Test i uppgift 1 och 2.
2. Klockan 23.30 UTC dagen före `validFrom` är det redan `validFrom` i Stockholm, och meddelandet ska synas i `/adress`. Test i uppgift 2.
3. En källa utan `messages` ger `messages: []` i alla tre endpoints, inte `null` och inte ett saknat fält. Test i uppgift 2.
4. Ett kommande meddelande syns i `/kallor` men inte i `/adress` eller `/omraden`. Test i uppgift 2.
5. Kalenderfilens UID och övriga fält ändras inte av ett meddelande, och tömningar utanför intervallet får ingen text. Test i uppgift 3.

---

### Task 1: Datamodell och regler

**Filer:**
- Skapa: `src/domain/messages.ts`, `src/domain/messages.test.ts`
- Ändra: `src/sources/index.ts` (`Source` får `messages?: SourceMessage[]`)
- Test: `src/sources/sources.test.ts`

**Gränssnitt:**
- Skapar:
  - `export interface SourceMessage { id: string; title: string; text: string; url?: string; validFrom: string; validTo: string }`
  - `export function activeMessages(messages: SourceMessage[] | undefined, today: string): SourceMessage[]`, de som gäller i dag, sorterade
  - `export function currentAndUpcoming(messages: SourceMessage[] | undefined, today: string): SourceMessage[]`, de med `validTo >= today`, sorterade
  - `export function messagesOn(messages: SourceMessage[] | undefined, date: string): SourceMessage[]`, samma regel som `activeMessages` (alias för läsbarhet i kalenderfilen)

- [ ] **Steg 1: Skriv fallerande tester i `messages.test.ts`**
  - `activeMessages`: med `{validFrom:'2026-11-17', validTo:'2026-11-30'}` → med för `2026-11-17` och `2026-11-30`, inte för `2026-11-16` eller `2026-12-01`. `undefined` → `[]`.
  - Sortering: två meddelanden med `validFrom` `2026-12-01`/`a` och `2026-11-01`/`b` → ordningen `b`, `a`. Samma `validFrom` → ordning på `id`.
  - `currentAndUpcoming('2026-11-17')`: med ett meddelande som börjar `2026-12-01`, utan ett som slutade `2026-11-16`.
- [ ] **Steg 2:** `npx vitest run src/domain/messages.test.ts` → FAIL (modulen saknas).
- [ ] **Steg 3:** Implementera `src/domain/messages.ts`. Ren TypeScript, inga importer utanför `src/domain/`.
- [ ] **Steg 4:** Kör igen → PASS.
- [ ] **Steg 5: Valideringstest i `sources.test.ts`**, `it('har giltiga meddelanden')`, för alla `ALL_SOURCES` med `messages`: id-mönster och unika id inom källan, datum giltiga (`isValidDate`), `validFrom <= validTo`, `daysBetween <= 183`, längder, förbjudna tecken och `url`-regeln (återanvänd `onSite` från kontakttestet genom att lyfta ut den till `describe`-nivå). Lägg till `messages?: SourceMessage[]` på `Source` (importera typen från `../domain/messages.js`) med en JSDoc-rad.
- [ ] **Steg 6:** `npx vitest run src/sources src/domain/messages.test.ts` → PASS.
- [ ] **Steg 7: Commit** `feat: Meddelanden från källorna i datamodellen`

### Task 2: API:t

**Filer:**
- Ändra: `src/server/v1.ts`, `public/api/v1/openapi.json`, `docs/api.md`
- Test: `src/server/v1.test.ts`, `src/server/openapi.test.ts`

**Gränssnitt:**
- Använder: `activeMessages`, `currentAndUpcoming`, `SourceMessage` från uppgift 1.
- Skapar: `const v1Messages = (list: SourceMessage[]) => list.map(m => ({ id, title, text, url: m.url ?? null, validFrom, validTo }))` i `v1.ts`.

- [ ] **Steg 1: Fallerande tester i `v1.test.ts`.** Ge testkällan `trog` två meddelanden: `nu` (`2026-11-01`–`2026-11-30`, med `url: 'https://trog.test/nyheter'`) och `snart` (`2026-12-10`–`2026-12-31`, utan `url`).
  - `/adress` för en `trog`-adress med `now` 2026-11-17 → `body.messages` är `[{ id: 'nu', title, text, url: 'https://trog.test/nyheter', validFrom: '2026-11-01', validTo: '2026-11-30' }]`.
  - `/adress` för en källa utan meddelanden → `messages: []`.
  - `/adress` med `now = new Date('2026-12-09T23:30:00Z')` → `messages` innehåller `snart` (det är 10 december i Stockholm).
  - `/adress` med `now` 2026-11-30 → `nu` finns kvar.
  - `/kallor` med `now` 2026-11-17 → `trog` har `['nu', 'snart']` (id:n), källor utan har `[]`, och `snart.url` är `null`.
  - `/omraden?plats=Avesta` → `sources[0].messages` är `[]` för testkällan `avesta`, och lika med det aktiva urvalet när `avesta` får ett meddelande.
- [ ] **Steg 2:** `npx vitest run src/server/v1.test.ts` → FAIL.
- [ ] **Steg 3: Implementera i `v1.ts`.**
  - `handleV1Address`: lägg `messages: v1Messages(activeMessages(source.messages, today))` efter `area` i svaret.
  - `handleV1Areas`: `text` får `messages: v1Messages(activeMessages(source.messages, todayInStockholm(now)))`.
  - `handleV1Sources`: använd `opts.now ?? new Date()`. Varje källa får `messages: v1Messages(currentAndUpcoming(s.messages, today))` efter `contact`.
- [ ] **Steg 4:** Kör igen → PASS.
- [ ] **Steg 5: OpenAPI.** Lägg till `components.schemas.SourceMessage`: alla sex fält obligatoriska, `url` är `["string","null"]` och datumen `format: date`. Lägg `messages` (array av `$ref`) som obligatoriskt fält i `AddressResponse`, i båda `sources`-posterna under `AreasResponse` och `DatedAreasResponse` och i källposten under `SourcesResponse`. Skriv beskrivningar på svenska i samma ton som `contact`.
- [ ] **Steg 6: Kontraktstest.** I `openapi.test.ts` får `trog` ett meddelande och `avesta` ett meddelande. Kör `npx vitest run src/server/openapi.test.ts` → PASS. Testet kräver redan att alla fält är obligatoriska.
- [ ] **Steg 7: `docs/api.md`.** Lägg till ett avsnitt "Meddelanden från källan" efter `/kallor`: fälten, att `/adress` och `/omraden` ger de som gäller i dag och `/kallor` även kommande, att `id` aldrig återanvänds, så att klienter kan minnas vad de visat, och ett JSON-exempel. Nämn fältet i svaret för `/adress`.
- [ ] **Steg 8:** `npm run lint && npm test` → grönt.
- [ ] **Steg 9: Commit** `feat: Källornas meddelanden i API:t`

### Task 3: Kalenderfilen

**Filer:**
- Ändra: `src/domain/ics.ts`, `src/server/handlers.ts:221`, `src/data/static-format.ts:291`
- Test: `src/domain/ics.test.ts`

**Gränssnitt:**
- Använder: `messagesOn`, `SourceMessage`.
- Ändrar: `buildIcs(input)` får `messages?: SourceMessage[]`.

- [ ] **Steg 1: Fallerande test**, `describe('buildIcs med meddelanden från källan')`. Schemat har tömningar 2026-11-10 och 2026-11-24, och meddelandet gäller `2026-11-20`–`2026-11-30` med titeln `Rutterna läggs om` och texten `Kontrollera schemat.`.
  - Händelsen 2026-11-24 har `Rutterna läggs om: Kontrollera schemat.` i `DESCRIPTION`, före friskrivningen.
  - Händelsen 2026-11-10 saknar texten.
  - `UID`, `SUMMARY` och `X-WR-CALDESC` är identiska med samma anrop utan `messages`.
  - Utan `messages` blir filen byte för byte densamma som i dag (snapshoten ändras inte).
- [ ] **Steg 2:** `npx vitest run src/domain/ics.test.ts` → FAIL.
- [ ] **Steg 3:** Implementera i `buildIcs`. Lägg `messagesOn(messages, event.date).map(m => \`${m.title}: ${m.text}\`)` efter `notice` i `description`.
- [ ] **Steg 4:** Skicka `messages: live.messages` i `handlers.ts` och `messages: source.messages` i `static-format.ts`.
- [ ] **Steg 5:** `npm test` → PASS.
- [ ] **Steg 6: Commit** `feat: Källornas meddelanden i kalenderfilen`

### Task 4: Sajten

**Filer:**
- Design: `docs/design/sopor-design.pen`, bara via Pencil MCP
- Skapa: `src/ui/result/SourceMessages.tsx`
- Ändra: `src/ui/pages/ResultPage.tsx`, `src/ui/pages/AreaPage.tsx`
- Test: `src/ui/result/SourceMessages.test.tsx` och befintliga sidtester

**Gränssnitt:**
- Använder: `activeMessages`.
- Skapar: `export function SourceMessages({ messages, sourceName }: { messages: SourceMessage[]; sourceName: string })`. Returnerar `null` för en tom lista.

- [ ] **Steg 1: Design.** Leta i `.pen` efter en ruta för källmeddelanden. Finns ingen läggs en till på resultatsidan (mobil och desktop) och på områdessidan, i samma stil som rutan "Schemat tar snart slut" (`bg-warn-bg`, `text-warn`, rubrik 15 px extrabold, text 14 px) med Lucide-ikonen `Megaphone` och en länk "Läs mer hos <källans namn>". Visa skärmbilden för Jesper innan steg 2.
- [ ] **Steg 2: Fallerande test** för `SourceMessages`: en ruta per meddelande med `role="status"`, rubriken som `h2`, texten, och länken "Läs mer hos Avesta AB" med `href` lika med `url` bara när `url` finns. Tom lista ger ingenting.
- [ ] **Steg 3:** Implementera komponenten enligt designen, med tokens och inga hårdkodade färger.
- [ ] **Steg 4: Sidtester.** `ResultPage` och `AreaPage` med en källa som har ett aktivt och ett utgånget meddelande (`today`-propen) visar bara det aktiva. Placera rutan enligt designen och skicka `activeMessages(source.messages, today)`.
- [ ] **Steg 5:** `npm run lint && npm test && npm run build` → grönt.
- [ ] **Steg 6: Commit** `feat: Sajten visar källornas meddelanden`

### Task 5: Avestas meddelande och dokumentation

**Filer:**
- Ändra: `src/sources/index.ts` (Avesta), `docs/kommuner/lagga-till-kommun.md`, `src/sources/sources.test.ts`

- [ ] **Steg 1:** Lägg till `messages` på Avesta: `id: 'nya-rutter-2026'`, `title: 'Hämtrutterna läggs om'`, `text: 'Avesta Vatten och Avfall lägger om hämtrutterna under hösten 2026 när kärlen för förpackningar ställs ut. Schemat här kan bli fel. Kontrollera dina tömningsdagar på Mina sidor hos Avesta Vatten.'`, `validFrom: '2026-11-17'`, `validTo: '2027-03-31'`, ingen `url`.
- [ ] **Steg 2:** Lägg till i Avesta-testet i `sources.test.ts` att `activeMessages(avesta.messages, '2026-11-17')` har id:t `nya-rutter-2026`.
- [ ] **Steg 3:** Lägg till ett avsnitt "Meddelanden från källan" i `docs/kommuner/lagga-till-kommun.md`: när meddelanden används, reglerna från Globala krav, att `id` aldrig återanvänds och att man förlänger med ett nytt `validTo`.
- [ ] **Steg 4:** `npm run lint && npm test && npm run build` → grönt. Kontrollera i `public/ics/avesta/` att en händelse efter 2026-11-17 har texten.
- [ ] **Steg 5: Commit** `feat: Avesta meddelar att hämtrutterna läggs om`

### Task 6: Befintliga integrationer påverkas inte

**Filer:**
- Test: `integrations/home-assistant/tests/` (testfixturen för `/adress` och `/omraden`) och `integrations/homey/lib/api.test.mts`

- [ ] **Steg 1:** Lägg till `messages` med ett meddelande i ett adressvar och ett områdessvar i varje klients testfixtur, utan att ändra något annat.
- [ ] **Steg 2:** `cd integrations/home-assistant && uv sync && uv run pytest`, och `cd integrations/homey && npm test && npm run typecheck`. Båda ska vara gröna utan kodändring.
- [ ] **Steg 3: Commit** `test: Integrationerna klarar källornas meddelanden`

### Efter planen

- PR mot `main` med titeln `feat: Meddelanden från källorna`.
- Efter appens release: issue för Home Assistant och Homey enligt specens avsnitt Uppföljning.

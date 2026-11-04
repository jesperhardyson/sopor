# Välj påminnelsetid för kalendern – implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development (rekommenderas) eller superpowers:executing-plans för att genomföra planen uppgift för uppgift. Stegen använder kryssrutor (`- [ ]`).

**Mål:** Den som lägger till sopkalendern kan välja när påminnelsen kommer, utan att befintliga prenumerationer påverkas.

**Arkitektur:** Valen samlas i `src/domain/reminders.ts`, och `buildIcs` bygger filens `VALARM` utifrån valet. Ett val utöver förvalet ligger i sökvägen `/ics/<källa>/<val>/<adress-id>.ics`, som alltid går via `handleIcs`. UI:t får länkarna från providern och känner inte till sökvägarna.

**Teknik:** TypeScript, React, Vitest, Testing Library, Vercel Functions, Pencil (`.pen`).

**Spec:** `docs/specs/2026-11-04-kalender-paminnelsetid.md`

**Worktree:** `/Users/jesper/Code/sopor-paminnelsetid`, gren `feature/paminnelsetid`. Symlänka `node_modules` från `../sopor`, och kör aldrig `npm ci` genom symlänken.

## Globala krav

- Förvalet `kvall-18` ger exakt samma fil och länk som i dag. Befintlig snapshot i `src/domain/__snapshots__/ics.test.ts.snap` får inte ändras.
- Id:n i länken: `kvall-20`, `morgon`, `kvall-och-morgon`. De får aldrig ändras när de är publicerade.
- UID-formatet `<adress-id>-<datum>@sopor.hardyson.se` ändras inte.
- Kod som funktionerna når (`src/domain/`, `src/server/`) importerar relativt med filändelsen `.js`.
- UI-texter, kommentarer och commit-meddelanden skrivs på svenska. Inga AI-attributionsrader i commits eller PR.
- Färger är tokens från `src/styles/theme.css`, inga hårdkodade hex-värden.
- Kör `npm run lint && npm test && npm run build` innan varje commit. Allt ska vara grönt.
- `.pen`-filen läses och ändras bara via Pencil MCP.

## Granskningsfokus

Testerna för varje punkt ligger i den uppgift som äger koden.

1. Ett val som krockar med objektets inbyggda namn (`constructor`, `__proto__`) ger 404, inte en krasch eller förvalet (uppgift 2 och 3).
2. Adress-id med åäö fungerar också i den längre sökvägen, annars går prenumerationen inte att hämta (uppgift 4).
3. På Android går "Prenumerera" via Google, och länken där ska innehålla det valda valet, korrekt kodat (uppgift 4).
4. En källa som är nere ger 502 även med vald tid, så att kalenderappen behåller det den har. En borttagen adress ger notisfilen (uppgift 3).
5. Två påminnelser med långa fraktionsnamn följer fortfarande radvikningen på 75 oktetter (uppgift 2).

---

### Uppgift 1: Designen

**Filer:**
- Ändra: `docs/design/sopor-design.pen` (ramarna `M1Tes` och `foIAb`)

**Gränssnitt:** Texter och utseende som uppgift 4 bygger efter.

- [ ] **Steg 1: Läs ramarna och komponenterna**

Öppna `/Users/jesper/Code/sopor-paminnelsetid/docs/design/sopor-design.pen`, inte huvudmappens fil. Läs hur `M1Tes` och `foIAb` är uppbyggda och återanvänd variabler och befintliga komponenter.

- [ ] **Steg 2: Rita in tidsvalet och notisrutan i båda ramarna**

Ovanför alternativen: rubriken "När vill du bli påmind?" och fyra val med förvalet markerat: "Kvällen innan, kl. 18", "Kvällen innan, kl. 20", "Samma morgon, kl. 06", "Kväll och morgon". Under alternativen: notisrutan med klockikon och specens text för förvalet.

- [ ] **Steg 3: Kontrollera layouten**

Ta skärmbilder av båda ramarna och kontrollera att inget är avklippt, att arket får plats på mobil och att alternativen fortfarande går att nå.

- [ ] **Steg 4: Stäm av designen med Jesper**

Visa skärmbilderna och vänta på godkännande. Designen är facit, så uppgift 4 börjar inte innan den är godkänd.

- [ ] **Steg 5: Commit**

```bash
git add docs/design/sopor-design.pen docs/specs/2026-11-04-kalender-paminnelsetid.md docs/plans/2026-11-04-kalender-paminnelsetid.md
git commit -m "Design, spec och plan för valbar påminnelsetid"
```

### Uppgift 2: Valen och kalenderfilen

**Filer:**
- Skapa: `src/domain/reminders.ts`, `src/domain/reminders.test.ts`
- Ändra: `src/domain/ics.ts:44-50` och `:80-84`
- Test: `src/domain/ics.test.ts`

**Gränssnitt:**
- Skapar:
  - `type ReminderId = 'kvall-18' | 'kvall-20' | 'morgon' | 'kvall-och-morgon'`
  - `DEFAULT_REMINDER: ReminderId` (`'kvall-18'`)
  - `REMINDERS: Record<ReminderId, { label: string; sentence: string; alarms: { trigger: string; prefix: string }[] }>`
  - `REMINDER_IDS: ReminderId[]`, i tabellens ordning med förvalet först
  - `reminderFromLink(value: string): ReminderId | undefined`, som bara godtar de tre id:n som har en egen länk
  - `buildIcs(input: { …; reminder?: ReminderId })`

Värden:

| Id | `label` | `sentence` | `alarms` |
|---|---|---|---|
| `kvall-18` | Kvällen innan, kl. 18 | Påminnelsen kommer kvällen innan kl. 18. | `-PT6H` / `I morgon` |
| `kvall-20` | Kvällen innan, kl. 20 | Påminnelsen kommer kvällen innan kl. 20. | `-PT4H` / `I morgon` |
| `morgon` | Samma morgon, kl. 06 | Påminnelsen kommer samma morgon kl. 06. | `PT6H` / `I dag` |
| `kvall-och-morgon` | Kväll och morgon | Påminnelser kommer kvällen innan kl. 18 och samma morgon kl. 06. | `-PT6H` / `I morgon`, sedan `PT6H` / `I dag` |

- [ ] **Steg 1: Skriv de fallerande testerna**

```ts
// reminders.test.ts
it('godtar bara valen som har en egen länk', () => {
  for (const id of ['kvall-20', 'morgon', 'kvall-och-morgon']) expect(reminderFromLink(id)).toBe(id)
  for (const value of ['kvall-18', '', 'MORGON', 'constructor', '__proto__', 'toString']) expect(reminderFromLink(value)).toBeUndefined()
})

// ics.test.ts, med en hjälpfunktion som bygger filen med vald reminder
it.each([
  ['kvall-20', ['TRIGGER:-PT4H'], ['DESCRIPTION:I morgon: Restavfall + Matavfall']],
  ['morgon', ['TRIGGER:PT6H'], ['DESCRIPTION:I dag: Restavfall + Matavfall']],
  ['kvall-och-morgon', ['TRIGGER:-PT6H', 'TRIGGER:PT6H'], ['DESCRIPTION:I morgon: Restavfall + Matavfall', 'DESCRIPTION:I dag: Restavfall + Matavfall']],
])('bygger påminnelserna för %s', (reminder, triggers, descriptions) => {
  const lines = vevent(icsWith(reminder), '2026-11-11')
  expect(lines.filter((l) => l.startsWith('TRIGGER:'))).toEqual(triggers)
  for (const d of descriptions) expect(lines).toContain(d)
  expect(lines.filter((l) => l === 'BEGIN:VALARM')).toHaveLength(triggers.length)
})

it('har samma UID för alla val', () => { /* varje id i REMINDER_IDS ger UID:krylbo-storgatan-12b-2026-11-11@sopor.hardyson.se */ })

it('ger samma fil för förvalet som utan val', () => {
  expect(icsWith('kvall-18')).toBe(ics())
})

it('viker rader vid 75 oktetter även med två påminnelser och långa namn', () => {
  // Händelse med alla fraktioner och reminder: 'kvall-och-morgon'.
  // Varje rad i text.split('\r\n') är högst 75 oktetter.
})
```

- [ ] **Steg 2: Kör testerna och se dem fallera**

Kör: `npx vitest run src/domain/reminders.test.ts src/domain/ics.test.ts`
Väntat: FAIL, modulen `./reminders` saknas.

- [ ] **Steg 3: Skapa `reminders.ts` och ändra `buildIcs`**

Slå upp med en lista över länk-id:n, inte med `in` eller `REMINDERS[value]`, så att ärvda namn inte räknas. I `buildIcs` loopas `REMINDERS[reminder].alarms`, och varje `VALARM` har samma fält i samma ordning som i dag. Importera med `./reminders.js`.

- [ ] **Steg 4: Kör testerna och se dem passera**

Kör: `npx vitest run src/domain/reminders.test.ts src/domain/ics.test.ts`
Väntat: PASS, och snapshot-filen är oförändrad (`git status` visar den inte).

- [ ] **Steg 5: Commit**

```bash
git add src/domain/reminders.ts src/domain/reminders.test.ts src/domain/ics.ts src/domain/ics.test.ts
git commit -m "Kalenderfilen kan byggas med valbar påminnelsetid"
```

### Uppgift 3: Sökvägen till kalenderfilen

**Filer:**
- Ändra: `src/server/handlers.ts:168-189`, `vercel.json`, `vite.config.ts:46-52`
- Test: `src/server/handlers.test.ts`, `src/server/lookup.test.ts`, `scripts/vercel-config.test.ts`

**Gränssnitt:**
- Använder: `reminderFromLink`, `DEFAULT_REMINDER` och `buildIcs({ reminder })` från uppgift 2
- Skapar: frågeparametern `reminder` på `/api/ics` och sökvägen `/ics/:source/:reminder/:file`

- [ ] **Steg 1: Skriv de fallerande testerna**

```ts
// handlers.test.ts, i describe('handleIcs')
const url = (extra: string) => new URL(`https://x/api/ics?source=uppsala&file=storgatan-2_uppsala-4004688.ics${extra}`)

it('bygger filen med vald tid', async () => {
  const text = await (await handleIcs(url('&reminder=morgon'), opts)).text()
  expect(text).toContain('TRIGGER:PT6H')
  expect(text).not.toContain('TRIGGER:-PT6H')
})

it('använder förvalet utan parameter', async () => {
  expect(await (await handleIcs(url(''), opts)).text()).toContain('TRIGGER:-PT6H')
})

it.each(['kvall-18', 'okand', '', 'constructor', '__proto__'])('ger 404 för %j utan att fråga källan', async (value) => {
  vi.mocked(fetchFn).mockClear()
  const res = await handleIcs(url(`&reminder=${value}`), opts)
  expect(res.status).toBe(404)
  expect(res.headers.get('Cache-Control')).toBe(CACHE_PARTIAL)
  expect(fetchFn).not.toHaveBeenCalled()
})

it('svarar 502 med vald tid när källan är nere', async () => {
  // Trög svarar aldrig: source=trog med ett giltigt id och reminder=morgon ger status 502 och Cache-Control: no-store.
})

it('ger notisfilen utan påminnelse när adressen inte finns, även med vald tid', async () => {
  // source=uppsala&file=nygatan-9_uppsala-123.ics&reminder=morgon: status 200, innehåller inte BEGIN:VALARM.
})

// lookup.test.ts, med befintliga avesta-fixturer. Importera handleIcs från './handlers.js'.
it('bygger filen med vald tid för en statisk källa', async () => {
  // handleIcs med source=avesta, en adress från fixturen och reminder=kvall-20: status 200, innehåller TRIGGER:-PT4H.
})

// vercel-config.test.ts
it('skickar kalenderfiler med vald tid till api/ics', () => {
  const rewrite = config.rewrites.find((r) => r.source === '/ics/:source/:reminder/:file')
  expect(rewrite?.destination).toBe('/api/ics?source=:source&reminder=:reminder&file=:file')
})
```

Lägg också till `/ics/avesta/morgon/x.ics` i listan över sökvägar som inte får gå till `index.html` (rad 63). `CACHE_PARTIAL` exporteras redan från `handlers.ts`.

- [ ] **Steg 2: Kör testerna och se dem fallera**

Kör: `npx vitest run src/server/handlers.test.ts src/server/lookup.test.ts scripts/vercel-config.test.ts`
Väntat: FAIL på de nya testerna.

- [ ] **Steg 3: Ändra `handleIcs` och `vercel.json`**

Högst upp i `handleIcs`: läs `url.searchParams.get('reminder')`. `null` betyder förvalet. Annars används `reminderFromLink`, och `undefined` ger `new Response('Hittades inte', { status: 404, headers: { 'Cache-Control': CACHE_PARTIAL } })`. Skicka valet till `buildIcs`. Lägg den nya omskrivningen direkt efter `/ics/:source/:file`.

- [ ] **Steg 4: Ändra `vite.config.ts`**

Utöka regexen till `^\/ics\/([^/]+)\/(?:([^/]+)\/)?([^/]+)$` och sätt parametern `reminder` när segmentet finns.

- [ ] **Steg 5: Kör testerna och se dem passera**

Kör: `npx vitest run src/server/handlers.test.ts src/server/lookup.test.ts scripts/vercel-config.test.ts`
Väntat: PASS.

- [ ] **Steg 6: Prova dev-servern**

Gå in i worktreen med `EnterWorktree` (`path`), starta dev-servern med `preview_start` och hämta `/ics/avesta/morgon/<ett id från public/data/avesta/addresses.json>.ics`.
Väntat: `text/calendar` och `TRIGGER:PT6H`. Visar förhandsvisningen huvudmappens kod görs kontrollen i stället på gren-URL:en i uppgift 5, steg 4.

- [ ] **Steg 7: Commit**

```bash
git add src/server/handlers.ts src/server/handlers.test.ts src/server/lookup.test.ts vercel.json vite.config.ts scripts/vercel-config.test.ts
git commit -m "Kalenderfilen kan hämtas med vald påminnelsetid"
```

### Uppgift 4: Länkarna och kalenderrutan

**Filer:**
- Skapa: `src/providers/ics-path.ts`
- Ändra: `src/providers/types.ts:19-20`, `src/providers/static.ts:86-88`, `src/providers/api.ts:50-52`, `src/ui/sheets/CalendarSheet.tsx`, `src/ui/pages/ResultPage.tsx:226`
- Test: `src/providers/registry.test.ts`, `src/providers/api.test.ts`, `src/ui/sheets/sheets.test.tsx`

**Gränssnitt:**
- Använder: `ReminderId`, `DEFAULT_REMINDER`, `REMINDERS` och `REMINDER_IDS` från uppgift 2, och designen från uppgift 1
- Skapar:
  - `icsPath(sourceId: string, addressId: string, reminder?: ReminderId): string`
  - `WasteProvider.icsUrl(addressId: string, reminder?: ReminderId): string`
  - `CalendarSheet`-propen `icsUrl: (reminder: ReminderId) => string`, som ersätter `icsPath`

- [ ] **Steg 1: Skriv de fallerande testerna**

```ts
// registry.test.ts
it('lägger valet i sökvägen, men inte förvalet', () => {
  const provider = providerFor(getSource('avesta')!)
  expect(provider.icsUrl('x', 'kvall-18')).toBe('/ics/avesta/x.ics')
  expect(provider.icsUrl('x', 'morgon')).toBe('/ics/avesta/morgon/x.ics')
})

// api.test.ts
it('kodar id:t även med vald tid', () => {
  expect(createApiProvider(vafab, fakeFetch()).icsUrl('älvvägen-3_örebro-1', 'kvall-20'))
    .toBe('/ics/vafab/kvall-20/%C3%A4lvv%C3%A4gen-3_%C3%B6rebro-1.ics')
})

// sheets.test.tsx. Byt propen i alla befintliga tester och ersätt den gamla notistexten.
const icsUrl = (r: ReminderId) => (r === 'kvall-18' ? '/ics/avesta/a.ics' : `/ics/avesta/${r}/a.ics`)

it('börjar på kl. 18 med dagens länkar', () => {
  expect(screen.getByRole('radio', { name: 'Kvällen innan, kl. 18' })).toBeChecked()
  // Prenumerera har href webcal://sopor.hardyson.se/ics/avesta/a.ics
})

it('byter alla fyra länkarna när man väljer en annan tid', async () => {
  await userEvent.click(screen.getByRole('radio', { name: 'Samma morgon, kl. 06' }))
  // Prenumerera och Apple: webcal://sopor.hardyson.se/ics/avesta/morgon/a.ics
  // Google: cid-parametern avkodad är samma webcal-adress
  // Ladda ner: /ics/avesta/morgon/a.ics
})

it('notistexten följer valet', async () => {
  // Förval: exakt texten för kl. 18 från specen.
  // Efter "Kväll och morgon": texten börjar med "Påminnelser kommer kvällen innan kl. 18 och samma morgon kl. 06."
})

it('valet går att göra med tangentbordet', async () => {
  // Fokusera det förvalda alternativet och tryck {ArrowDown}: "Kvällen innan, kl. 20" är valt.
})

it('börjar om på kl. 18 när rutan öppnas igen', async () => {
  // Välj morgon, rerender med open={false}, rerender med open: kl. 18 är valt.
})

it('skickar valet via Google på Android', async () => {
  // userAgent Android, välj kvall-20: Prenumerera har cid som avkodat är webcal://…/ics/avesta/kvall-20/a.ics
})
```

Notistexten för förvalet, ordagrant från specen:

> Påminnelsen kommer kvällen innan kl. 18. Slå på notiser för kalendern i din kalenderapp. Google Kalender visar troligen inte påminnelser från prenumerationer. Vill du byta tid senare tar du bort kalendern och lägger till den igen.

- [ ] **Steg 2: Kör testerna och se dem fallera**

Kör: `npx vitest run src/providers src/ui/sheets/sheets.test.tsx`
Väntat: FAIL på de nya testerna.

- [ ] **Steg 3: Implementera `icsPath` och provider-ändringarna**

Båda providers anropar `icsPath(source.id, addressId, reminder)`. Sökvägen kodar bara adress-id:t.

- [ ] **Steg 4: Implementera valet i `CalendarSheet` och ändra `ResultPage`**

Flytta innehållet i arket till en inre komponent med `useState<ReminderId>(DEFAULT_REMINDER)`. Dialogen avmonterar sitt innehåll när den stängs, så valet börjar om av sig självt. Bygg valet som `<fieldset>` med `<legend>När vill du bli påmind?</legend>` och vanliga `<input type="radio">` efter designen från uppgift 1: det ger tangentbord och skärmläsare utan ett nytt beroende. `ResultPage` skickar `icsUrl={(r) => providerFor(source).icsUrl(address.id, r)}`.

- [ ] **Steg 5: Kör testerna och se dem passera**

Kör: `npx vitest run src/providers src/ui`
Väntat: PASS.

- [ ] **Steg 6: Jämför med designen**

Öppna kalenderrutan på mobil- och desktopbredd, i förhandsvisningen från uppgift 3 eller på gren-URL:en efter uppgift 5, steg 3. Jämför med ramarna `M1Tes` och `foIAb`, och kontrollera att arket går att scrolla på en liten skärm. Spara en skärmbild till PR:en.

- [ ] **Steg 7: Commit**

```bash
git add src/providers src/ui/sheets src/ui/pages/ResultPage.tsx
git commit -m "Kalenderrutan låter användaren välja påminnelsetid"
```

### Uppgift 5: Dokument, PR och manuellt test

**Filer:**
- Ändra: `AGENTS.md:35`, `docs/utveckling.md` (avsnittet Kalendrar), `docs/specs/2026-10-30-sopor-design.md` (raden om `VALARM`)

**Gränssnitt:** Inga nya. Beskriver det som uppgift 2–4 har byggt.

- [ ] **Steg 1: Uppdatera dokumenten**

- `AGENTS.md`, regel 3: lägg till att id:n i kalenderlänken (`kvall-20`, `morgon`, `kvall-och-morgon`) aldrig får ändras när de är publicerade, eftersom prenumerationer hänger på dem.
- `docs/utveckling.md`: beskriv valen, att de definieras i `src/domain/reminders.ts` och att de går via funktionen eftersom det inte finns några statiska filer för dem.
- `docs/specs/2026-10-30-sopor-design.md`: raden om `VALARM` hänvisar till `2026-11-04-kalender-paminnelsetid.md`.

- [ ] **Steg 2: Kör hela kontrollen**

Kör: `npm run lint && npm test && npm run build`
Väntat: allt grönt.

- [ ] **Steg 3: Commit och öppna PR**

```bash
git add AGENTS.md docs/utveckling.md docs/specs/2026-10-30-sopor-design.md
git commit -m "Dokumenterar valbar påminnelsetid"
git push -u origin feature/paminnelsetid
```

PR-titel: `feature: Välj påminnelsetid för kalendern`. Jesper mergar, och PR:en mergas inte förrän det manuella testet är gjort.

- [ ] **Steg 4: Kontrollera preview-adressen**

Hämta en gång för en statisk källa och en gång för en livekälla från Vercels gren-URL, inte från produktion: `/ics/<källa>/kvall-20/<adress-id>.ics`.
Väntat: `text/calendar` och `TRIGGER:-PT4H`.

- [ ] **Steg 5: Be Jesper testa på riktiga enheter**

Från preview-adressen, med ett kommande tömningsdatum:
1. iPhone: prenumerera med `kvall-20` och `morgon`, slå på Aktivitetspåminnelser och kontrollera att påminnelsen kommer vid rätt tid.
2. Google Kalender: prenumerera och se om någon påminnelse kommer.

- [ ] **Steg 6: Justera texten om Google efter svaret**

Om Google visar påminnelser tas meningen bort, annars blir den "Google Kalender visar inte påminnelser från prenumerationer." Ändra test och kod tillsammans, kör hela kontrollen och pusha.

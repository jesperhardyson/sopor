# Sökbarhet och kommunsidor – implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development eller superpowers:executing-plans. Stegen bockas av med `- [ ]`.

**Mål:** Alla 290 kommuner och en översikt får egna adresser med innehåll och metadata direkt i HTML:en, plus riktiga `robots.txt` och `sitemap.xml`, utan nya funktionsanrop.

**Arkitektur:** Ett skript skapar statiska HTML-filer efter `vite build` från samma rena React-komponenter som appen använder. Sidans data bäddas in i filen, så att appen kan ta över direkt utan att innehållet blinkar bort.

**Teknik:** React 19 (`renderToStaticMarkup`), react-router 8 (`StaticRouter`), tsx, Vitest, Vercel.

**Spec:** `docs/specs/2026-11-04-sokbarhet-kommunsidor.md`. **Skisser:** ramen "Kommunsida · skiss" i `docs/design/sopor-design.pen`.

## Globala krav

- Arbeta i `/Users/jesper/Code/sopor-sokbarhet` på grenen `feature/sokbarhet`. Rör inte huvudmappen.
- Kör `npm ci` i worktreen. Symlänka inte `node_modules`: `npm ci` genom en symlänk tömmer huvudmappens paket.
- Rebasera på `origin/main` när [PR 84](https://github.com/jesperhardyson/sopor/pull/84) är mergad. CSP-testet i uppgift 4 kräver den.
- UI-texter, kommentarer och commit-meddelanden på svenska. Inga rader om AI-författarskap i commits eller PR.
- Färger är tokens, inga hex-värden. Fraktioner visas med befintliga `FractionIcon`.
- UI:t pratar med data via `src/providers/registry.ts` (arkitekturregel 1).
- Före varje commit: `npm run lint && npm test && npm run build`.

## Särskild granskning

Det här täcker specen inte uttryckligen, och det är här en användare först skulle märka fel. Varje rad har ett test i uppgiften inom parentes.

1. **Innehållet får inte blinka bort när appen tar över.** Kommunsidan ska visa sitt innehåll direkt, utan laddningsläge, när filen har inbäddad data (uppgift 2).
2. **Inbäddad data från fel sida får inte användas.** Navigerar man inom appen från Uppsala till Göteborg ska Göteborg visas (uppgift 2).
3. **Stora bokstäver och avslutande snedstreck.** `/kommuner/Uppsala-Kommun` ska ge "Kommunen finns inte" och inte en tom sida. `/kommuner/uppsala-kommun/` kontrolleras på previewen (uppgift 2 och 5).
4. **Dold testdata.** Avesta ska visas som "Inte än" och aldrig med sin källa (uppgift 1).
5. **Långa ortlistor på mobil.** Uppsala har 168 orter. Sidan får inte scrolla i sidled vid 375 px (uppgift 5).

---

## Uppgift 1: Kommundata

**Filer:**
- Skapa: `src/data/kommun-pages.ts`, `src/data/kommun-pages.test.ts`, `src/data/kommun-slugs.json`
- Ändra: `scripts/build-data.ts`, `scripts/build-data.test.ts`

**Gränssnitt:**
```ts
export interface KommunPage { code: string; name: string; slug: string; covered: boolean; sources: { name: string; url: string }[]; orter: string[] }
export type KommunSummary = Pick<KommunPage, 'name' | 'slug' | 'covered'>
export function kommunSlug(code: string, name: string): string
export function buildKommunPages(file: SwedenPlacesFile, sources: Source[]): KommunPage[] // sorterad på namn med 'sv'
```

- [ ] **Steg 1: Skriv de fallerande testerna** i `kommun-pages.test.ts`, med `data/sverige/orter.json` och `SOURCES` som indata:
  - ger 290 sidor med unika sluggar.
  - `kommunSlug('0380', 'Uppsala kommun')` är `uppsala-kommun`, `('1480', 'Göteborgs kommun')` är `goteborgs-kommun`, `('0980', 'Region Gotland')` är `region-gotland`.
  - `('0305', 'Håbo kommun')` är `haabo-kommun`, `('0643', 'Habo kommun')` är `habo-kommun`.
  - Uppsala: `covered` är sant, `sources` innehåller Uppsala Vatten, `orter[0]` är `Uppsala`, listan innehåller `Storvreta`.
  - Göteborg: `covered` är falskt och `sources` är tom.
  - Avesta (`2084`) med `SOURCES`: `covered` är falskt och `sources` är tom.
  - En `grannkommun` ger inte `covered`, och en kommun med två källor listar båda (egna testkällor).
  - Kommunnamn med genitiv: huvudorten hittas för `Göteborgs kommun`.
  - Fel kastas som `DataError` för en källa med `id: 'kommuner'`, för en källkommun vars kod saknas i filen och för två sidor med samma slug.
  - Alla sluggar är lika med `kommun-slugs.json` (kod → slug).
- [ ] **Steg 2: Kör testerna och se dem falla:** `npx vitest run src/data/kommun-pages.test.ts`.
- [ ] **Steg 3: Implementera modulen.** Slug: samma normalisering som `slug` i `src/lib/analytics.ts`, med undantaget `{ '0305': 'haabo-kommun' }`. Huvudort: orten som är lika med namnet utan ` kommun`/`Region `, eller samma sak utan avslutande `s`; övriga orter sorteras med `localeCompare(…, 'sv')`. Filen får bara ha relativa importer, som övriga `src/data/`.
- [ ] **Steg 4: Skapa `kommun-slugs.json`** från modulen med ett engångskommando och läs igenom Håbo, Habo och Gotland.
- [ ] **Steg 5: Skriv fallerande test och implementera `writeKommunPages()`** i `scripts/build-data.ts`, som skriver `public/data/kommuner.json` och anropas från `main()`, efter samma mönster som `writeSwedenPlaces()`.
- [ ] **Steg 6: Kör `npm test` och `npm run build:data`.** Väntat: grönt, och `public/data/kommuner.json` har 290 poster.
- [ ] **Steg 7: Commit:** `Kommundata för kommunsidorna`.

## Uppgift 2: Sidorna i appen

**Filer:**
- Skapa: `src/ui/kommun/KommunContent.tsx`, `KommunerContent.tsx`, `StaticSearch.tsx`, `embedded.ts` med tester; `src/ui/pages/KommunPage.tsx`, `KommunerPage.tsx` med tester
- Ändra: `src/providers/places.ts`, `src/providers/registry.ts`, `src/ui/App.tsx`, `src/ui/pages/StartPage.tsx`, `src/lib/analytics.ts`, `src/lib/analytics.test.ts`, tester för startsidan

**Gränssnitt:**
```ts
// registry.ts. Null när filen inte går att hämta; ett misslyckande cachas inte, så "Försök igen" fungerar.
export function kommunPages(): Promise<KommunPage[] | null>
export function kommunPage(slug: string): Promise<KommunPage | undefined | null>

// KommunContent.tsx och KommunerContent.tsx. Rena: bara props och <Link>.
export function KommunContent(props: { page: KommunPage; search: ReactNode }): JSX.Element
export function KommunerContent(props: { kommuner: KommunSummary[] }): JSX.Element

// embedded.ts
export const EMBEDDED_ID = 'sopor-sidans-data'
export function embeddedData<T>(pathname: string): T | undefined // läser { path, data } ur scriptblocket, bara om path === pathname
export function embeddedScript(path: string, data: unknown): string // <script type="application/json" …>, med < escapat som <
```
`KommunRoute` och `KommunerRoute` exporteras från sidfilerna, efter mönstret `ResultRoute`.

- [ ] **Steg 1: Skriv fallerande tester för innehållet:**
  - `KommunContent` för täckt kommun: H1 `Sophämtning i Uppsala kommun`, prop `search` renderas, länk till källan, orterna, länk till `/kommuner`.
  - `KommunContent` för saknad kommun: H1, ingressen `Sopor finns inte i Göteborgs kommun än.`, länk till `/bidra`, inget sök.
  - Avsnittet "Orter i kommunen" utgår vid tom lista.
  - `KommunerContent`: rubrikerna `Här finns Sopor (2)` och `Inte än (1)` för testdata, och länkar till `/kommuner/<slug>`.
  - Båda renderas med `renderToStaticMarkup` i `StaticRouter`, utan fel och med innehållet i strängen.
- [ ] **Steg 2: Kör och se dem falla.**
- [ ] **Steg 3: Implementera komponenterna** enligt skisserna, med texterna därifrån. `StaticSearch` är ett `disabled` sökfält som ser ut som `AddressSearch`, med samma klasser och platshållaren `Skriv din adress, t.ex. Storgatan 2`.
- [ ] **Steg 4: Skriv fallerande tester för rutterna:**
  - Med inbäddad data som matchar sökvägen visas innehållet direkt, utan laddningsläge och utan `fetch` (granskningspunkt 1).
  - Med inbäddad data för en annan sökväg hämtas rätt kommun (granskningspunkt 2).
  - `/kommuner/Uppsala-Kommun` och `/kommuner/finns-inte` visar `Kommunen finns inte` med länk till `/kommuner` (granskningspunkt 3).
  - Null från `kommunPages()` ger `ErrorState`, och "Försök igen" hämtar på nytt.
  - Sidtiteln blir `Sophämtning i Uppsala kommun – Sopor` respektive `Sophämtning i Sveriges kommuner – Sopor`.
  - `/kommuner/uppsala-kommun` matchar kommunrutten och inte `:sourceId/:addressId`.
- [ ] **Steg 5: Kör och se dem falla.**
- [ ] **Steg 6: Implementera loader, registry, rutter och kopplingen.** `KommunRoute` startar med `embeddedData<KommunPage>(pathname)` som state, `search` är `<AddressSearch />`. Laddningsläget är en enkel platshållare med `aria-busy`, eftersom `LoadingState` kräver ett källnamn. Rutterna läggs före `:sourceId/:addressId`.
- [ ] **Steg 7: Skriv fallerande test och ändra resten:**
  - `redactUrl` släpper igenom `/kommuner/uppsala-kommun`.
  - "Just nu: N kommuner." på startsidan blir en `Link` till `/kommuner`, i samma stil som "Finns din kommun?". Listan för högst tre kommuner behålls som text.
- [ ] **Steg 8: Kör `npm test`, `npm run lint` och `npm run build`.** Väntat: grönt.
- [ ] **Steg 9: Commit:** `Kommunsidor och översikt i appen`.

## Uppgift 3: Statiska filer vid bygget

**Filer:**
- Skapa: `scripts/prerender.ts`, `scripts/prerender.test.ts`, `public/robots.txt`
- Ändra: `package.json`

**Gränssnitt:**
```ts
export function renderKommunHtml(template: string, page: KommunPage): string
export function renderKommunerHtml(template: string, pages: KommunPage[]): string
export function sitemapXml(origin: string, pages: KommunPage[]): string
```
Alla använder uppgift 2:s komponenter, `StaticSearch` och `embeddedScript`, och `SITE.origin`.

- [ ] **Steg 1: Skriv de fallerande testerna** med en mall som har samma struktur som `index.html`:
  - Täckt kommun: `<title>` och `og:title` är `Sophämtning i Uppsala kommun – Sopor`, `description` och `og:description` är `Se när dina kärl töms i Uppsala kommun och lägg schemat i kalendern. Inofficiell tjänst.`, `og:url` och `canonical` är `https://sopor.hardyson.se/kommuner/uppsala-kommun`, H1 och Storvreta finns i `#root`.
  - Saknad kommun: beskrivningen `Sopor finns inte i Göteborgs kommun än. Tipsa om var kommunen publicerar sitt hämtschema.`
  - Översikt: titeln `Sophämtning i Sveriges kommuner – Sopor` och beskrivningen `Sopor finns i 71 av Sveriges 290 kommuner. Se om din kommun är med.` med räknade antal.
  - Inbäddad data läses tillbaka med `embeddedData` och innehåller inte `</script>`, även om ett ortnamn gör det.
  - Mallens temaskript och skripttaggar finns kvar oförändrade.
  - `sitemapXml`: `/`, `/om`, `/bidra`, `/kommuner` och alla kommunsidor, inga adressidor, ingen `lastmod`.
  - `public/robots.txt` har exakt spec-texten.
- [ ] **Steg 2: Kör och se dem falla.**
- [ ] **Steg 3: Implementera funktionerna och `main()`.** Använd en ersättningsfunktion i `String.replace`, så att `$` i data inte tolkas. `main()` läser `dist/index.html` och `public/data/kommuner.json`, skriver `dist/kommuner/index.html`, `dist/kommuner/<slug>/index.html`, `dist/sitemap.xml` och `dist/404.html` (kopia av `dist/index.html`), och körs bara när filen startas direkt, som i `build-data.ts`.
- [ ] **Steg 4: Lägg till robots-filen och ändra `build`** till `npm run build:data && tsc -b && vite build && tsx scripts/prerender.ts`.
- [ ] **Steg 5: Kör `npm test` och `npm run build`.** Väntat: grönt, 291 filer under `dist/kommuner/`, och `grep -c '<loc>' dist/sitemap.xml` ger 294.
- [ ] **Steg 6: Commit:** `Statiska kommunsidor, sitemap och robots vid bygget`.

## Uppgift 4: Vercel och service worker

**Filer:**
- Ändra: `vercel.json`, `scripts/vercel-config.test.ts`, `public/sw.js`, `src/sw.test.ts`, `scripts/prerender.test.ts`

- [ ] **Steg 1: Skriv de fallerande testerna:**
  - Omskrivningarna `/kommuner` → `/kommuner/index.html` och `/kommuner/:slug` → `/kommuner/:slug/index.html` ligger före regeln till `/index.html`.
  - `X-Robots-Tag: noindex` matchar `/uppsala/storgatan-2_uppsala-4004688`, men inte `/kommuner/uppsala-kommun`, `/kommuner`, `/om`, `/`, `/api/v1/kallor`, `/ics/uppsala/x.ics`, `/data/gator/st.json` eller `/assets/x.js`.
  - I `sw.test.ts`: en navigering till `/kommuner/uppsala-kommun` sparas inte som `/`, men en adressida gör det fortfarande.
  - I `prerender.test.ts`: inline-skriptet i en färdig kommunfil matchar hashen i `vercel.json`.
- [ ] **Steg 2: Kör och se dem falla.**
- [ ] **Steg 3: Implementera ändringarna.** Regeln för `X-Robots-Tag` är `/((?!kommuner/|api/|ics/|data/|assets/)[^/]+/[^/]+)`.
- [ ] **Steg 4: Kör `npm run lint && npm test && npm run build`.** Väntat: grönt.
- [ ] **Steg 5: Commit:** `Omskrivningar, noindex för adressidor och service worker för kommunsidorna`.

## Uppgift 5: Dokumentation och kontroll på previewen

**Filer:**
- Ändra: `docs/utveckling.md`, `docs/kommuner/lagga-till-kommun.md`, `AGENTS.md`

- [ ] **Steg 1: Uppdatera dokumenten.** Bygget och de nya sidorna; en ny kommun får sidan automatiskt och en slug ändras aldrig; slug läggs till i regel 3.
- [ ] **Steg 2: Commit och push av grenen:** `Dokumentation för kommunsidorna`. Pusha och öppna PR:en med titeln `feature: Sökbarhet och kommunsidor`.
- [ ] **Steg 3: Kontrollera på previewen med `curl`:**
  - `/robots.txt` och `/sitemap.xml` är text respektive XML med rätt innehåll.
  - `/kommuner/uppsala-kommun` har rätt titel och innehåll i rå HTML, och saknar `X-Robots-Tag`.
  - `/kommuner/finns-inte` ger 404.
  - `/kommuner/uppsala-kommun/` ger sidan eller en omdirigering dit, inte 404 (granskningspunkt 3).
  - En adressida har `X-Robots-Tag: noindex`.
- [ ] **Steg 4: Kontrollera i webbläsaren:**
  - Kommunsidan tar över utan blink och utan CSP-fel. Bara `vercel.live` får blockeras på previewen.
  - Sökfältet leder till en adressida.
  - Vid 375 px ger Uppsala ingen sidledes scroll: `document.documentElement.scrollWidth <= innerWidth` (granskningspunkt 5).
  - Mörkt och ljust läge ser rätt ut.
- [ ] **Steg 5: Rätta det som hittas med ett test först, och pusha.** Mergas av Jesper.

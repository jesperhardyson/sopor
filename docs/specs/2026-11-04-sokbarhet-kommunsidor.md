# Spec: Sökbarhet och kommunsidor

Status: utkast, 2026-11-04. Skisser: ramen "Kommunsida · skiss" i `docs/design/sopor-design.pen`.

## Bakgrund

Sopor hade 33 besökare den 30 oktober–4 november, och nästan alla kom utan hänvisning. Sajten är svår att hitta:

- `robots.txt` och `sitemap.xml` finns inte. De svarar med startsidans HTML, eftersom alla okända sökvägar skickas till `index.html`.
- Alla sidor har samma titel och beskrivning i HTML:en. Rätt titel sätts först med JavaScript.
- Påhittade adresser ger status 200.

## Mål

Den som söker på "sophämtning Uppsala" eller "sophämtning Göteborg" ska kunna hitta Sopor, utan löpande kostnad och utan underhåll per kommun.

Lyckat är när:

- Alla 290 kommuner och översikten har en egen adress med eget innehåll, titel och beskrivning direkt i HTML:en.
- `robots.txt` och `sitemap.xml` är riktiga filer, och sitemapen listar alla kommunsidor.
- Adressidor indexeras inte.
- En ny kommun i `src/sources/index.ts` får sin sida automatiskt.
- Inga nya funktionsanrop tillkommer.

## Utanför specen

- Sökning avgränsad till en kommun.
- Kommande tömningar, kärltyper eller annan schemadata på kommunsidorna.
- Länkar till varje kommuns egen webbplats. Sådan data finns inte för de kommuner som saknas.
- Delningsbild per sida (punkt 13 i `docs/plans/2026-11-02-forbattringar.md`).
- Egen rendering av `/om` och `/bidra`. De listas i sitemapen och får sin titel med JavaScript, som i dag.
- Status 404 för okända sökvägar med en enda del, som `/foo`. De visar fortfarande startsidan med status 200.

## Sidor

### Adresser

| Sida | Adress |
|---|---|
| Översikt | `/kommuner` |
| Kommun | `/kommuner/<slug>`, till exempel `/kommuner/uppsala-kommun` |

**Slug** är kommunens namn med gemener, utan diakritiska tecken och med bindestreck: `goteborgs-kommun`, `region-gotland`. Håbo och Habo skulle båda bli `habo-kommun`, så Håbo (kod `0305`) får ett uttryckligt undantag: `haabo-kommun`. Habo (kod `0643`) behåller `habo-kommun`.

Slug är stabil som adress-id (arkitekturregel 3). En publicerad slug får aldrig ändras eller återanvändas. Byter en kommun namn läggs den gamla slugen till som undantag för koden.

`kommuner` är nu ett reserverat ord i sökvägar, så ingen källa får ha det som `id`.

### Kommun som Sopor har

Se "Mobil · Kommunsida" och "Desktop · Kommunsida".

- Länk tillbaka till startsidan.
- Fraktionsrad.
- H1: "Sophämtning i Uppsala kommun". Ingress enligt skissen.
- Det vanliga sökfältet (`AddressSearch`).
- "Varifrån kommer schemat?": källans namn och länk. Har kommunen flera källor listas alla.
- "Orter i kommunen".
- Länk till `/kommuner`.

Bara kommuner i `supportedKommuner()` räknas som täckta. Dolda källor (Avesta) och `grannkommuner` räknas inte, så de får sidan för kommuner som saknas.

### Kommun som saknas

Se "Mobil · Kommunsida, saknas" och "Desktop · Kommunsida, saknas".

- Länk tillbaka till startsidan.
- H1: "Sophämtning i Göteborgs kommun". Ingress enligt skissen.
- Rutan "Hjälp till att få in kommunen" med länk till `/bidra`.
- "Orter i kommunen".
- Länk till `/kommuner`.

Sidan har inget sökfält. Sidorna går att indexera. Ser vi att de drar ned sajten läggs `noindex` på dem, utan att någon adress ändras.

### Översikt

Se "Mobil · Alla kommuner" och "Desktop · Alla kommuner". Två listor i bokstavsordning, "Här finns Sopor (N)" och "Inte än (M)", där varje kommun länkar till sin sida. Antalen räknas fram.

### Orter

Alla orter i kommunen visas, med huvudorten först och resten i bokstavsordning. Huvudorten är den ort som har kommunens namn, med eller utan genitiv-s.

Skissen visar ett kort urval med "och fler", men datan säger inte vilka orter som är störst. De 12 första i bokstavsordning för Uppsala är bland annat Almunge och Andersberg, medan Storvreta inte kommer med. Hela listan ger också sidan mer eget innehåll.

En kommun utan orter i datan visar inte avsnittet.

### Ingång från sajten

"Just nu: 71 kommuner." på startsidan blir en länk till `/kommuner`, i samma stil som länken "Finns din kommun?" bredvid. Ingen annan del av sajten ändras.

## Teknisk lösning

Ett skript skapar en HTML-fil per sida efter `vite build`. Filen innehåller sidans innehåll och metadata, och laddar samma app som övriga sidor. När JavaScript har laddats ersätter appen innehållet med samma React-komponent, med `createRoot` som i dag. Ingen hydrering behövs.

Innehållet syns alltså före JavaScript. Sidhuvud och sidfot kommer med appen och kan dyka upp en kort stund senare.

### Data

Ny ren modul `src/data/kommun-pages.ts`, som tar kommunlistan och orterna från `data/sverige/orter.json` samt `SOURCES` och ger:

```ts
interface KommunPage {
  code: string
  name: string
  slug: string
  covered: boolean
  sources: { name: string; url: string }[]
  orter: string[]
}
```

`npm run build:data` skriver den till `public/data/kommuner.json`. Filen är genererad och ligger utanför git, som övrig data i `public/data/`.

Arkitekturregel 1 gäller: UI:t hämtar datan via `src/providers/registry.ts`, med `kommunPages()` och `kommunPage(slug)`. Modulen innehåller inga källdetaljer utöver namn och länk.

### Komponenter

- `src/ui/kommun/KommunContent.tsx` och `KommunerContent.tsx` är rena: all data kommer som props, och de använder varken `window` eller `localStorage`. Sökfältet kommer in som prop.
- `src/ui/pages/KommunPage.tsx` och `KommunerPage.tsx` hämtar datan och skickar in `AddressSearch`. Okänd slug visar sidan "Kommunen finns inte" med länk till `/kommuner`, i samma stil som designens "Adressen hittades inte". Medan datan laddas visas samma laddningsläge som på adressidan.
- Rutterna läggs före `:sourceId/:addressId` i `App.tsx`.

### Bygget

Nytt skript `scripts/prerender.ts`, sist i `npm run build`:

```
npm run build:data && tsc -b && vite build && tsx scripts/prerender.ts
```

Skriptet:

1. Läser `dist/index.html` som mall.
2. Renderar komponenterna med `renderToStaticMarkup` och `StaticRouter`, med ett stilat men vilande sökfält, och lägger resultatet i `#root`.
3. Sätter `<title>`, `description`, `og:url`, `og:title` och `og:description`, och lägger till `<link rel="canonical">`.
4. Skriver `dist/kommuner/index.html` och `dist/kommuner/<slug>/index.html`.
5. Skriver `dist/sitemap.xml` med `/`, `/om`, `/bidra`, `/kommuner` och alla kommunsidor. `lastmod` utelämnas, eftersom den skulle ändras vid varje bygge utan att innehållet har ändrats.
6. Skriver `dist/404.html`, en kopia av `dist/index.html`.

| Sida | Titel | Beskrivning |
|---|---|---|
| Kommun som finns | Sophämtning i Uppsala kommun – Sopor | Se när dina kärl töms i Uppsala kommun och lägg schemat i kalendern. Inofficiell tjänst. |
| Kommun som saknas | Sophämtning i Göteborgs kommun – Sopor | Sopor finns inte i Göteborgs kommun än. Tipsa om var kommunen publicerar sitt hämtschema. |
| Översikt | Sophämtning i Sveriges kommuner – Sopor | Sopor finns i 71 av Sveriges 290 kommuner. Se om din kommun är med. |

`public/robots.txt`:

```
User-agent: *
Allow: /
Sitemap: https://sopor.hardyson.se/sitemap.xml
```

### Vercel

I `vercel.json`, före den allmänna regeln till `index.html`:

```json
{ "source": "/kommuner", "destination": "/kommuner/index.html" },
{ "source": "/kommuner/:slug", "destination": "/kommuner/:slug/index.html" }
```

En okänd slug pekar då på en fil som inte finns, och Vercel svarar 404 med `dist/404.html`. Appen startar där och visar "Kommunen finns inte". Beteendet kontrolleras på previewen, eftersom Vercels hantering inte går att testa lokalt.

Adressidor får `X-Robots-Tag: noindex`, på alla sökvägar med två delar utanför `kommuner`, `api`, `ics`, `data` och `assets`. Det håller enskilda hemadresser borta från sökmotorerna och täcker också påhittade adresser.

### Service worker

`public/sw.js` sparar i dag alla HTML-sidor som `/`, och den sparade sidan används sedan som app-skal när nätet inte svarar. En kommunsida får inte bli skalet, så sidor under `/kommuner` sparas inte.

Utan nät visar en kommunsida skalet, och där datan inte går att hämta visas samma fel som på andra sidor.

### Statistik och CSP

- `redactUrl` i `src/lib/analytics.ts` undantar `kommuner`, så att `/kommuner/uppsala-kommun` inte visas som `/kommuner/[adress]`.
- Mallen behåller temaskriptet oförändrat, så hashen i CSP:n från [PR 84](https://github.com/jesperhardyson/sopor/pull/84) stämmer även för de nya filerna. Ett test läser en färdig fil och kontrollerar det, och kräver då att PR 84 är inne.

## Felhantering

- Går `kommuner.json` inte att hämta visar `KommunPage` och `KommunerPage` samma felläge och "Försök igen" som övriga sidor.
- Saknas orter för en kommun utelämnas avsnittet.
- Två kommuner med samma slug, en källa med `id` `kommuner` eller en källkommun vars kod inte finns i `data/sverige/orter.json` stoppar bygget med ett tydligt fel.

## Tester

Tester skrivs först.

- `kommun-pages.test.ts`: 290 sidor med unika sluggar; Håbo och Habo; Region Gotland; `covered` för dolda källor och grannkommuner; flera källor; huvudorten först; alla sluggar låsta mot en incheckad lista, så att en publicerad adress inte kan ändras av misstag.
- `KommunContent.test.tsx` och `KommunerContent.test.tsx`: båda varianterna, antal, länkar och att avsnittet Orter utgår utan orter. Komponenterna renderas också med `renderToStaticMarkup`, för att visa att de inte behöver webbläsaren.
- `KommunPage.test.tsx`: okänd slug, laddning och fel.
- `prerender.test.ts`: titel, beskrivning, kanonisk adress och innehåll i HTML:en; sitemapen innehåller alla sidor men inga adressidor; inline-skriptet matchar hashen i CSP:n.
- `vercel-config.test.ts`: de nya omskrivningarna ligger före den allmänna regeln; `X-Robots-Tag` gäller adressidor men inte `/kommuner/uppsala-kommun`, `/om` eller `/`.
- `analytics.test.ts`: `/kommuner/uppsala-kommun` maskeras inte.
- Test för att `sw.js` inte sparar sidor under `/kommuner`.

På previewen kontrolleras med `curl` och i webbläsaren:

- `robots.txt` och `sitemap.xml` har rätt innehåll och typ.
- En kommunsida har rätt titel och innehåll utan JavaScript, och appen tar sedan över utan CSP-fel.
- `/kommuner/finns-inte` ger 404 och visar "Kommunen finns inte".
- En adressida har `X-Robots-Tag: noindex`, och en kommunsida har det inte.
- Sökfältet på en kommunsida leder till en adressida.

## Efter lansering

Lägg in `sitemap.xml` i Google Search Console. Det kräver att domänen verifieras med ett eget Google-konto, och görs därför av Jesper.

## Dokumentation

- `docs/utveckling.md`: bygget och de nya sidorna.
- `docs/kommuner/lagga-till-kommun.md`: en ny kommun får sin sida automatiskt, och en slug ändras aldrig.
- `AGENTS.md`: slug läggs till i regel 3 om stabila id.
- `docs/plans/`: implementationsplan.

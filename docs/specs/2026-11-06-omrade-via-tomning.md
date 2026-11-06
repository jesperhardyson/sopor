# Spec: Hitta område via senaste tömning i API v1

Status: utkast, 2026-11-06. Issue [#112](https://github.com/jesperhardyson/sopor/issues/112). Bygger på områdesvalet i `docs/specs/2026-11-04-avesta-omradesval.md`.

## Bakgrund

Webbens ark **Hitta område** räknar ut område från datumet då kärlet senast tömdes. Det gör den med `areaForDate` och datum som inte ingår i API:t, som bara ger kommande tömningar. iOS-appen Sophämtning ([uppgift 18](https://github.com/jesperhardyson/Sophamtning/issues/20)) och andra klienter behöver samma funktion. De får bara använda API v1.

## Anropet

```
GET /api/v1/omraden?plats=Avesta&tomning=2026-10-27
```

Utan `tomning` är svaret oförändrat, både innehåll och cachning.

Med `tomning` innehåller `addresses` bara områden med hämtning det datumet:

- Varje träff har samma fält som i dag, plus `pickups`: `{ "previous": ["2026-10-13", "2026-10-27"], "next": "2026-11-10" }`.
- Svaret har också `dateCovered`, som skiljer "ingen hämtning den dagen" från "schemat täcker inte perioden".

## Fälten

`pickups` räknas från det angivna datumet, inte från i dag, precis som på webben:

- `previous` är högst två datum, och det angivna datumet är sist.
- `next` är områdets tömning efter det angivna datumet och kan redan ha passerat. Den är `null` om schemat inte har fler datum.

`dateCovered` är:

| Värde | Betyder |
|---|---|
| `true` | Datumet ligger inom perioden för minst en källa. Tom lista betyder då att inget område har hämtning den dagen. |
| `false` | Alla källor svarade, och datumet ligger utanför allas schema. |
| `null` | Ingen källa kunde bedöma datumet: platsen saknar områdesval, eller en källa svarade inte och ingen annan täcker datumet. Se `failed`. |

Perioden är från tidigaste till senaste datum bland källans områden.

## Fel

`400 bad_request` för ett tomt eller ogiltigt datum och för ett datum efter dagens datum i `Europe/Stockholm`. Dessa svar cachas inte.

## Beslut

1. **Flera områden samma dag ger alla.** Avesta och Säter har inga delade datum i dag, men att välja det första vore en gissning. `areasForDate` i `src/domain/areas.ts` returnerar alla träffar. Webbens `areaForDate` bygger på den och visar ett område, som i dag. Får en källa delade datum behöver arket ett eget läge i designen.
2. **Cachning med `addressCacheControl`.** Svaret beror inte på dagens datum, så midnatt gör det inte fel. Risken är att `dateCovered: false` eller `next: null` ligger kvar efter att nästa års schema lagts in, så cachetiden är kortare än för en vanlig sökning: högst sex timmar och slut vid midnatt. Saknas en källa gäller den korta cachen för delvisa svar.
3. **Inga befintliga fält ändras.** `pickups` och `dateCovered` finns bara med `tomning`. OpenAPI beskriver det svaret med egna scheman, `DatedAreaHit` och `DatedAreasResponse`, eftersom alla fält i ett schema ska vara obligatoriska och `/sok` delar `SearchHit` och `SearchResponse`.

## Sopor gissar fortfarande inte

Svaret bygger på datumet användaren anger. En försenad tömning kan ge fel område, så klienten ska visa det och låta användaren bekräfta valet. `notice` följer med som vanligt. `docs/api.md` säger det uttryckligen.

## Utanför

- Ändringar i webbens ark.
- Klientens gränssnitt, som görs i Sophämtning.

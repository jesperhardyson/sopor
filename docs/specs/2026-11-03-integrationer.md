# Spec: Integrationer

Status: byggd, 2026-11-03. Skisserna finns på sidan "Integrationer · skiss" i `docs/design/sopor-design.pen`. Bygger vidare på `2026-10-31-smarta-hem-pa-webben.md`.

## Mål

"Smarta hem" blir "Integrationer", och API:t blir ett eget kort i stället för en rad längst ner. Den som bygger något eget ska hitta en dokumentation där man kan prova anropen.

## Var

- **Startsidan:** överrubriken heter **INTEGRATIONER**. Rubriken är kvar ("Påminnelse i Homey eller Home Assistant"). Tre kort: Homey, Home Assistant och API, sida vid sida på desktop.
- **Om-sidan:** avsnittet heter **Integrationer** och har ankaret `#integrationer`. Spalten är för smal för tre kort, så Homey och Home Assistant ligger sida vid sida och API-kortet på en egen rad under dem.
- **Raden i "Det här får du"** heter Integrationer och länkar till `/om#integrationer` ("Läs mer om integrationer").
- **Adressrutan** byter bara rubrik till Integrationer.
- Raden "Bygger du något eget?" utgår, eftersom API-kortet ersätter den.

Ingressen på båda sidorna:

> Få veta när soporna hämtas, direkt i ditt smarta hem. Bygger du något eget finns ett öppet API. Allt är gratis, och du behöver inget konto.

## API-kortet

**API** (ikon `braces`) · "Öppet JSON-API · v1"

> Hämta schemat för en adress som JSON och bygg något eget.
>
> - Sök adress, hämta schema och kalender
> - Inga nycklar och inget konto
> - Fält tas aldrig bort inom v1
>
> Knapp (sekundär): **Utforska API:t** → `/api/v1/docs`
>
> Textlänk: **Läs API-guiden →** → `docs/api.md` på GitHub

Knappen är sekundär så att Homey och Home Assistant syns först. Textlänken hamnar under knappen när kortet är smalt.

## Dokumentationen

- `/api/v1/docs` visar `openapi.json` med [Scalar](https://github.com/scalar/scalar). Valt framför Swagger UI (daterat utseende), Redoc (går inte att prova anropen) och Stoplight Elements (utvecklas knappt).
- Sidan är en statisk fil, `public/api/v1/docs/index.html`, utan byggsteg. Scalar laddas från jsDelivr i en låst version med integrity-hash.
- Scalar får inte skicka något: `telemetry: false`, `agent: { disabled: true }`, `withDefaultFonts: false` och ingen `proxyUrl` (API:t har redan CORS). Ett test vakar över det.
- Accentfärgen är sajtens gröna.

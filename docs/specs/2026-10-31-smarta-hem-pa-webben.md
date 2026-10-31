# Spec: Smarta hem på webben

Status: skiss, 2026-10-31. Skisserna finns på sidan "Smarta hem på webben · skiss" i `docs/design/sopor-design.pen`.

## Mål

Den som har Homey eller Home Assistant ska förstå att Sopor fungerar där, och komma igång utan att läsa en API-guide. Utvecklare ska fortfarande hitta API:t, men det ska inte vara det första en vanlig besökare möter.

## Var

1. **Om-sidan:** avsnittet "API" ersätts av **"Smarta hem"**. Det har ett kort per integration och en rad "Bygger du något eget?" som länkar till API-guiden. På desktop ligger korten sida vid sida.
2. **Adressidan:** "API"-rutan ersätts av **"Smarta hem"**.
   - Den har en rad per integration.
   - Raden för Homey visar exakt vad man ska söka på för just den adressen, med en kopieringsknapp.
   - API-länken för utvecklare ligger kvar längst ner som en enkel rad med "Kopiera".

Ingen egen sida i första steget. Den kan komma när Home Assistant finns, med skärmbilder av widget och flöden.

## Texter

### Om-sidan

**Smarta hem**

> Få veta när soporna hämtas, direkt i ditt smarta hem. Det är gratis, och du behöver inget konto.

**Homey** · märke *Testversion* · "Appen Sophämtning · för Homey Pro"

> Lägg till din adress i appen, så vet Homey när soporna hämtas.
>
> - Påminnelse kvällen innan, eller på morgonen
> - Besked när schemat ändras, till exempel kring helgdagar
> - Widget med nästa hämtning på din dashboard
>
> Knapp: **Installera i Homey** → testlänken `https://homey.app/a/se.hardyson.sopor/test/`, och App Store-sidan när appen är publicerad

**Home Assistant** · märke *Kommer snart* · "Integration via HACS"

> En integration med sensorer och kalender är på väg. Tills dess kan du läsa schemat med en REST-sensor.
>
> Knapp: **Så gör du i dag** → `docs/api.md#home-assistant`

**Bygger du något eget?** Läs API-guiden →

### Adressidan

**Smarta hem**

> Få en påminnelse kvällen innan, i Homey eller Home Assistant.

- **Homey** · *Testversion* · Installera ↗
  > Sök på den här adressen i appen Sophämtning:
  > `<gata>, <ort>` [Kopiera]
- **Home Assistant** · *Kommer snart* · Guide ↗
  > Tills dess: en REST-sensor med adressens API-länk.
- {} API-länk för utvecklare [Kopiera]

Söktexten är `"<gata>, <ort>"`, med kommunen om orten saknas. Det är samma format som appen förstår, där orten efter kommat filtrerar träffarna.

## Så skriver vi om integrationerna

- **Nyttan först.** Skriv vad man får ("Påminnelse kvällen innan"), inte hur det är byggt (flödeskort, capabilities, API, JSON).
- **Ärligt om läget.** Märken: *Testversion*, *Kommer snart*, och senare inget märke alls. Lova aldrig något som inte finns. Home Assistant-kortet nämner bara det som är bestämt (sensorer och kalender).
- **Vanliga ord:**
  - "avfallstyp" eller namnet på avfallet, inte "fraktion"
  - "smarta hem", inte "hemautomation"
  - "appen Sophämtning" när det gäller Homey-appen, och "Sopor" när det gäller tjänsten
- **Namnen, inte logotyperna.** Homey och Home Assistant är andras varumärken. Vi skriver namnen och använder neutrala ikoner (`house-wifi`, `server`). Någon gång bör sidfoten eller Om-sidan ha en rad om att varumärkena tillhör sina ägare.
- **Samma löfte som sajten.** Inofficiellt och gratis, och kommunens information gäller vid avvikelser. Det står redan på Om-sidan och i App Store-texten och behöver inte upprepas i varje kort.
- **Korta texter.** En mening till ett kort, högst tre punkter och en knapp.

## Byggs sen

- Komponenten `SmartHomeBox` ersätter `ApiBox` på adressidan. `ApiBox` lever kvar som raden längst ner. Avsnittet på Om-sidan blir en komponent `IntegrationCard`.
- Länkarna läggs i `SITE`: `homeyAppUrl` (testlänken nu, App Store sen) och `homeAssistantGuideUrl`.
- Tester: korten och rutan renderar, söktexten för en adress utan ort, och att kopieringen fungerar utan urklipp (try/catch, som i `ApiBox`).
- Desktop och tablet för adressidan ritas innan bygget, eftersom skissen bara visar mobil.

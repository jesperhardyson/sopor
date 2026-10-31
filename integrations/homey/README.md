# Sopor för Homey

Homey Pro-app (SDK v3, TypeScript som ESM) som visar sophämtningen för en adress och ger flödeskort. Specen finns i `docs/specs/2026-10-31-sopor-homey-app.md`.

Appen är ett eget npm-paket och använder bara det publika API:t (`https://sopor.hardyson.se/api/v1`). Den importerar ingenting från repots `src/`.

```bash
cd integrations/homey
npm install
npm test               # Vitest för lib/
npm run typecheck
npm run validate       # homey app validate --level debug
npx homey app run      # provkör på vald Homey (homey select --id …)
```

- `lib/` innehåller ren logik utan Homey-beroenden. Allt som går att testa ligger där.
- `app.mts`, `drivers/adress/driver.mts` och `device.mts` kopplar logiken till Homey och hålls tunna.
- `widgets/nasta-hamtning/` är widgeten: `api.ts` för data, och `public/` med HTML, ikoner och typsnitt.
- `app.json` genereras av CLI:t ur `.homeycompose/` och `drivers/*/driver*.compose.json`. Ändra i compose-filerna.
- Ikoner och bilder kommer från sidan "Homey · Sophämtning" i `docs/design/sopor-design.pen`:
  - **App-ikonen** (`assets/icon.svg`) är Sopor-symbolen.
  - **Drivrutinsikonen** och **`assets/karl.svg`** är kärlet i linjestil.
  - Ikonerna är svarta SVG:er på 960×960, eftersom Homey färgar dem själv.
  - **Bilderna** är exporterade PNG:er i Homeys storlekar.
  - **`brandColor`** är designens `primary` (#157A46).

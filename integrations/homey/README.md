# Sopor för Homey

Homey Pro-app (SDK v3, TypeScript som ESM) som visar sophämtningen för en adress och ger flödeskort. Specen finns i `docs/specs/2026-10-31-sopor-homey-app.md`.

Appen är ett eget npm-paket och använder bara det publika API:t (`https://sopor.hardyson.se/api/v1`). Den importerar ingenting från repots `src/`.

```bash
cd integrations/homey
npm install
npm test               # Vitest för lib/
npm run typecheck
npm run validate       # homey app validate --level debug
npm run check:version  # versionen stämmer i alla filer och ändringsloggen
npm run smoke          # appens klient mot produktions-API:t
npx homey app install  # installera på vald Homey (kolla först med homey select current)
```

## Släppa en version

```bash
npm run release -- 0.4.2 "Text på engelska" "Text på svenska"
git push && git push origin homey-v0.4.2
```

1. `release` kräver ett rent arbetsträd och en högre version.
   - Det sätter versionen i `.homeycompose/app.json`, `app.json`, `package.json` och `package-lock.json`.
   - Det skriver ändringsloggen i `.homeychangelog.json`, som visas i App Store.
   - Det committar och taggar `homey-v<version>`.
2. **Taggen** startar `homey-release.yml`. Arbetsflödet kontrollerar att taggen stämmer med versionen, kör tester och validering på publish-nivå och laddar upp ett utkast till Athom. Det behöver secreten `HOMEY_PAT`, en token från tools.developer.homey.app/me.
3. **Testversion och publicering** görs för hand på tools.developer.homey.app (*Publish to Test*, och senare *Publish to Live*), så att inget når användarna utan ett aktivt beslut.

## CI

- **`homey.yml`** körs vid ändringar i `integrations/homey/`. Jobbet `homey` kör versionskontroll, tester, typkontroll och validering på publish-nivå. Det heter inte `test`, eftersom det är namnet på den obligatoriska checken för `main`.
- **Varje natt** kör samma arbetsflöde `npm run smoke` mot produktions-API:t. En källa som inte svarar ger en varning, men ett ändrat svarsformat ger ett fel.
- **Testet `scripts/boundary.test.mts`** fäller bygget om appen importerar något utanför `integrations/homey/` (regel 8).
- **`.homeyignore`** håller skript och tester utanför appen som laddas upp.

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

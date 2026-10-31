# AGENTS.md

Instruktioner för AI-agenter som arbetar i det här repot. Läs också `README.md`.

## Projektet

Sopor (sopor.hardyson.se) är en inofficiell, statisk webbtjänst som visar sophämtning per adress och exporterar schemat till kalendern. Allt UI är på svenska. Projektet är ett hobbyprojekt, och målet är noll löpande kostnad och minimalt underhåll.

## Kommandon

```bash
npm run dev          # genererar data + Vite dev-server
npm test             # Vitest (alla tester)
npm run build        # build:data + tsc -b + vite build
npm run build:data   # bara datagenereringen (scripts/build-data.ts)
```

Kör `npm run lint && npm test && npm run build` innan varje commit. Allt ska vara grönt.

Homey-appen (`integrations/homey/`) är ett eget paket: `cd integrations/homey && npm test && npm run typecheck && npm run validate`. `npx homey app install` installerar den på vald Homey. Kör `homey select current` först, eftersom CLI:t kan peka på fel Homey.

`main` är skyddad: ändringar går via pull request och kräver grön CI. Arbeta på en gren.

## Arkitekturregler (bryt inte dessa)

1. **Providergränsen.** UI:t pratar bara med `WasteProvider` (`src/providers/types.ts`) via `src/providers/registry.ts`. Ingen kod utanför `src/providers/`, `src/server/`, `src/data/` och `scripts/` får känna till trakter, `scheduleRefs`, EDP eller andra källdetaljer.
2. **Ingen databas och inga konton.** Vercel Functions (`api/`) används bara som proxy och cache mot publika källor. Logiken ligger i `src/server/handlers.ts`. Kod som funktionerna når (`api/`, `src/server/`, `src/domain/`, `src/sources/`) använder relativa importer med filändelsen `.js`, eftersom Vercel kompilerar fil för fil (ett test vakar över det).
3. **Stabila id.** Adress-id (i `addresses.csv`) och ICS-UID (`<adress-id>-<datum>@sopor.hardyson.se`) får aldrig ändra format eller återanvändas, eftersom kalenderprenumerationer hänger på dem.
4. **Bara publika källor utan inloggning.** Inga anrop mot inloggade tjänster (Mina sidor, BankID, kundportaler, apptoken). Svar cachas och anropen hålls få; User-Agent är `Sopor/1.0 (+https://sopor.hardyson.se)`.
5. **Datum** är strängar på formen `YYYY-MM-DD`. Aritmetik görs i `src/domain/dates.ts` (UTC-midnatt). "I dag" räknas i `Europe/Stockholm`.
6. **localStorage** används alltid med try/catch. Appen ska fungera utan lagring.
7. **Domänlogik** (`src/domain/`) är ren TypeScript utan React, eftersom den körs både i build-skriptet och i webbläsaren.
8. **Integrationer** (`integrations/`) är egna paket som bara pratar med det publika API:t v1. De importerar aldrig från `src/`, och API:ts stabilitetslöften är deras enda kontrakt.

## Design

- Designen i `docs/design/sopor-design.pen` är facit. Gör ingen egen tolkning av utseendet. Allt som syns i designen byggs, utom det som specen uttryckligen utesluter.
- `.pen`-filer är krypterade. Läs dem bara via Pencil MCP, aldrig direkt från fil.
- Färger är tokens i `src/styles/theme.css` (`bg-surface`, `text-text-2`, `bg-frac-mat-bg` …). Använd dem, inte hårdkodade hex-värden.
- Fraktioner visas alltid med färg, ikon och text tillsammans (`FractionChip`, `FractionIcon`).

## Dokument

- Specifikationer: `docs/specs/`
- Implementationsplaner: `docs/plans/`
- Integrationer (Homey, Home Assistant): `docs/specs/2026-10-31-integrationer-homey-home-assistant.md` och `integrations/*/README.md`
- Kommunernas datakällor och lärdomar: `docs/kommuner/hitta-kommunens-data.md` (uppdatera tabellen när en kommun undersöks)

Nya design- och plandokument läggs där, inte någon annanstans.

## Språk och stil

- UI-texter, kommentarer och commit-meddelanden skrivs på svenska.
- Följ den omgivande kodens stil: korta funktioner och få men träffande kommentarer.
- Skriv tester först (Vitest + Testing Library). Tester ligger bredvid koden som `*.test.ts(x)`.

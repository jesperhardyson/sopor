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

Kör `npm test && npm run build` innan varje commit. Båda ska vara gröna.

## Arkitekturregler (bryt inte dessa)

1. **Providergränsen.** UI:t pratar bara med `WasteProvider` (`src/providers/types.ts`) via `src/providers/registry.ts`. Ingen kod utanför `src/providers/`, `src/data/` och `scripts/` får känna till trakter, `scheduleRefs`, EDP eller andra källdetaljer.
2. **Ingen backend.** Inga Vercel Functions, ingen databas, inga konton. Undantaget som kommer: en EDP-proxy i `/api`, och den byggs bara på uttrycklig begäran.
3. **Stabila id.** Adress-id (i `addresses.csv`) och ICS-UID (`<adress-id>-<datum>@sopor.hardyson.se`) får aldrig ändra format eller återanvändas, eftersom kalenderprenumerationer hänger på dem.
4. **Bara publika källor.** Inga anrop mot inloggade API:er (Mina sidor o.d.) och ingen scraping bakom inloggning.
5. **Datum** är strängar på formen `YYYY-MM-DD`. Aritmetik görs i `src/domain/dates.ts` (UTC-midnatt). "I dag" räknas i `Europe/Stockholm`.
6. **localStorage** används alltid med try/catch. Appen ska fungera utan lagring.
7. **Domänlogik** (`src/domain/`) är ren TypeScript utan React, eftersom den körs både i build-skriptet och i webbläsaren.

## Design

- Designen i `docs/design/sopor-design.pen` är facit. Gör ingen egen tolkning av utseendet. Allt som syns i designen byggs, utom det som specen uttryckligen utesluter.
- `.pen`-filer är krypterade. Läs dem bara via Pencil MCP, aldrig direkt från fil.
- Färger är tokens i `src/styles/theme.css` (`bg-surface`, `text-text-2`, `bg-frac-mat-bg` …). Använd dem, inte hårdkodade hex-värden.
- Fraktioner visas alltid med färg, ikon och text tillsammans (`FractionChip`, `FractionIcon`).

## Dokument

- Specifikationer: `docs/specs/`
- Implementationsplaner: `docs/plans/`

Nya design- och plandokument läggs där, inte någon annanstans.

## Språk och stil

- UI-texter, kommentarer och commit-meddelanden skrivs på svenska.
- Följ den omgivande kodens stil: korta funktioner och få men träffande kommentarer.
- Skriv tester först (Vitest + Testing Library). Tester ligger bredvid koden som `*.test.ts(x)`.

# Plan: Uddevalla

Spec: `docs/specs/2026-11-04-uddevalla.md`. Tester först i varje steg, och `npm run lint && npm test && npm run build` före varje commit.

- [x] Flytta hashen till `idHash` i `src/server/edp.ts`, med `srvKey` oförändrad.
- [x] Klienten `src/server/uddevalla.ts` med sparade svar: sökning, uppslag, schema, särskiljare och fraktioner.
- [x] Källan i `src/sources/index.ts`, grenar i `searchLiveSource` och `lookupAddress`, och `npm run build:streets` för 1485.
- [x] `checkUddevallaSource` och kontrolladressen i `PROBES`.
- [x] Beslut 6 i planen för fler kommuner (Rambo hoppas över), `lagga-till-kommun.md` och `hitta-kommunens-data.md`.
- [x] Stickprov mot Uddevalla Energi: 60 adresser ur 634 träffar, inga fel, dubbletter eller passerade datum. Förhandsvisningen på Vercel.

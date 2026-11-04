# Plan: Uddevalla

Spec: `docs/specs/2026-11-04-uddevalla.md`. Tester först i varje steg, och `npm run lint && npm test && npm run build` före varje commit.

- [ ] Flytta hashen till `idHash` i `src/server/edp.ts`, med `srvKey` oförändrad.
- [ ] Klienten `src/server/uddevalla.ts` med sparade svar: sökning, uppslag, schema, särskiljare och fraktioner.
- [ ] Källan i `src/sources/index.ts`, grenar i `searchLiveSource` och `lookupAddress`, och `npm run build:streets` för 1485.
- [ ] `checkUddevallaSource` och kontrolladressen i `PROBES`.
- [ ] Beslut 6 i planen för fler kommuner (Rambo hoppas över), `lagga-till-kommun.md` och `hitta-kommunens-data.md`.
- [ ] Stickprov mot Uddevalla Energi och förhandsvisningen på Vercel.

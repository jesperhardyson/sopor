# Plan: Hitta område via senaste tömning i API v1

Spec: `docs/specs/2026-11-06-omrade-via-tomning.md`. Tester först i varje steg, och `npm run lint && npm test && npm run build` före commit.

- [x] `areasForDate` i `src/domain/areas.ts`, med `areaForDate` ovanpå så att webben är oförändrad.
- [x] `tomning` i `handleV1Areas`: träffar med `pickups`, `dateCovered`, fel och cachning.
- [x] Tester för träff, flera områden samma dag, ingen hämtning, datum utanför schemat, framtida och ogiltigt datum, och oförändrat svar utan `tomning`.
- [x] `docs/api.md`, `public/api/v1/openapi.json` och kontraktstestet.
- [x] Prova på förhandsversionen på Vercel med riktig data från Avesta och Säter.

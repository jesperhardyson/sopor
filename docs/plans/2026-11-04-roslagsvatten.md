# Plan: Roslagsvatten

Spec: `docs/specs/2026-11-04-roslagsvatten.md`. Tester först i varje steg, och `npm run lint && npm test && npm run build` före varje commit.

- [x] `Rest- matavfall` i `src/server/fractions-map.ts`, och `weekdaysIn` exporterad från `edp.ts`.
- [x] Klienten `src/server/roslagsvatten.ts` med sparade svar: sökning, uppslag, schema och särskiljare.
- [x] Tre källor i `src/sources/index.ts`, grenar i `searchLiveSource` och `lookupAddress`, och `npm run build:streets` för 0117, 0125 och 0187.
- [x] `checkRoslagsvattenSource` och kontrolladresserna i `PROBES`.
- [x] Planen för fler kommuner, `lagga-till-kommun.md` och `hitta-kommunens-data.md`.
- [x] Stickprov mot Roslagsvatten: 120 adresser ur cirka 26 000, inga fel eller krockande id. Uppslaget missade adresser med `:` och `/`, så det söker nu brett när gatan inte ger något.
- [ ] Förhandsvisningen på Vercel.

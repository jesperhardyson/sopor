# Plan: Appbolaget (Kristianstad och Hässleholm)

Spec: `docs/specs/2026-11-03-appbolaget.md`. Samma ordning som NSR och SRV. Tester först i varje steg, och `npm run lint && npm test && npm run build` före varje commit.

## 1. Fraktionerna

- [ ] Test och mönster i `src/server/fractions-map.ts`: `Returpapper` → `tidningar`.

## 2. Klienten (`src/server/appbolaget.ts`)

- [ ] Sparade svar i `src/server/__fixtures__/` för en adress i Kristianstad och en i Hässleholm.
- [ ] `appbolagetSearch`: `Unit` i huvudet, bokstaven och orten bort ur frågan, `limit=100`, okänd form kastar.
- [ ] `appbolagetFind`: adressen direkt med uuid:t i id:t, ingen träff → `null`.
- [ ] `appbolagetSchedule`: Hässleholms `collections` i svensk tid, Kristianstads frekvenser och flyttade tömningar, avgifter bort.
- [ ] Fastighetsbeteckningen som särskiljare.

## 3. Källorna

- [ ] `SourceConfig` får `{ system: 'appbolaget', unit }`, och källorna `kristianstad` och `hassleholm` läggs i `src/sources/index.ts`.
- [ ] `searchLiveSource` och `lookupAddress` får en gren för `appbolaget` (test i `src/server/appbolaget-handlers.test.ts`).
- [ ] `npm run build:streets` för 1290 och 1293.

## 4. Bevakningen

- [ ] `checkAppbolagetSource` med test, och kontrolladresser i `PROBES`.

## 5. Dokumentation och kontroll

- [ ] `lagga-till-kommun.md`, planen för fler kommuner och `hitta-kommunens-data.md`.
- [ ] Stickprov mot Appbolaget i båda kommunerna, och förhandsvisningen på Vercel.

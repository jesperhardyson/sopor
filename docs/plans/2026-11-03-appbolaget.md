# Plan: Appbolaget (Kristianstad och Hässleholm)

Spec: `docs/specs/2026-11-03-appbolaget.md`. Samma ordning som NSR och SRV. Tester först i varje steg, och `npm run lint && npm test && npm run build` före varje commit.

## 1. Fraktionerna

- [x] Test och mönster i `src/server/fractions-map.ts`: `Returpapper` → `tidningar`, `Brä/Mat` → `rest`, `mat`.

## 2. Klienten (`src/server/appbolaget.ts`)

- [x] Sparade svar i `src/server/__fixtures__/` för en adress i Kristianstad och en i Hässleholm.
- [x] `appbolagetSearch`: `Unit` i huvudet, bokstaven och orten bort ur frågan, `limit=100`, okänd form kastar.
- [x] `appbolagetFind`: adressen direkt med uuid:t i id:t, ingen träff → `null`.
- [x] `appbolagetSchedule`: Hässleholms `collections` i svensk tid, Kristianstads frekvenser och flyttade tömningar, avgifter bort.
- [x] Fastighetsbeteckningen som särskiljare.

## 3. Källorna

- [x] `SourceConfig` får `{ system: 'appbolaget', unit }`, och källorna `kristianstad` och `hassleholm` läggs i `src/sources/index.ts`.
- [x] `searchLiveSource` och `lookupAddress` får en gren för `appbolaget` (test i `src/server/appbolaget-handlers.test.ts`).
- [x] `npm run build:streets` för 1290 och 1293.

## 4. Bevakningen

- [x] `checkAppbolagetSource` med test, och kontrolladresser i `PROBES`.

## 5. Dokumentation och kontroll

- [x] `lagga-till-kommun.md`, planen för fler kommuner och `hitta-kommunens-data.md`.
- [x] Stickprov mot Appbolaget: 29 adresser i Kristianstad och 40 i Hässleholm, inga fel. Förhandsvisningen på Vercel.

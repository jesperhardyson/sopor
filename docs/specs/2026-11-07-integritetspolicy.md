# Spec: Integritetspolicy på /integritet

Status: utkast, 2026-11-07. Issue [#114](https://github.com/jesperhardyson/sopor/issues/114).

## Bakgrund

iOS-appen Sophämtning ska till App Store, som kräver en integritetspolicy på en publik adress. Policyn ska gälla webbplatsen, API:t och appen. I dag svarar `/integritet` `200` med webbplatsens reservsida, så en statuskontroll ser ut att fungera trots att sidan saknas.

## Sidan

- `/integritet` är en statisk fil, `dist/integritet/index.html`, som kommunsidorna. Den går att läsa utan JavaScript, och appen tar över när JavaScript har laddats.
- `vercel.json` skickar `/integritet` till filen, före regeln till `index.html`.
- Service workern sparar inte sidan som appens skal, eftersom den har eget innehåll i HTML:en.
- Sidan finns i sitemapen, har en kanonisk adress och saknar `noindex`.
- Länkar finns i sidfoten och under Integritet på `/om`.

## Innehållet och var det är kontrollerat

| Påstående | Kontrollerat mot |
|---|---|
| Vad som sparas på enheten | `src/lib/storage.ts`, `src/lib/theme.ts`, `public/sw.js` |
| Rensningen på `/om` tar adresser, scheman och områdesval, men inte temat | `clearSaved` i `src/lib/storage.ts` |
| Adressen tas bort ur statistiken, och saknade kommuner räknas med namnet | `src/lib/analytics.ts`, `KommunCheck`, `AddressSearch` |
| Söktext går till källan, men inte besökarens ip-adress | `src/server/`, `api/`: inga inkommande headers läses eller skickas vidare |
| Cachetider: sökresultat högst åtta dygn, scheman drygt ett dygn | `CACHE_SEARCH`, `CACHE_SCHEDULE`, `addressCacheControl` |
| Loggar sparas en timme, med sökväg och parametrar | [Vercels dokumentation](https://vercel.com/docs/logs/runtime) för Hobby |
| Statistikens fält, inga cookies och besökshash som kastas efter 24 timmar | [Vercels dokumentation](https://vercel.com/docs/analytics/privacy-policy) |
| Statistiken går att se 31 dagar bakåt | Vercels API för Hobby, 2026-11-07 |
| Överföring utanför EU | [Vercels integritetsmeddelande](https://vercel.com/legal/privacy-notice) |
| Appen Sophämtning | Sophämtnings `docs/specs/2026-11-06-ios-app.md`, inte appens kod |

## Beslut

1. **Innehållet är statiskt och utan effekter.** `PrivacyContent` läser varken lagring eller nät, så samma komponent används i appen och i den statiska filen. Rensningsknappen finns kvar på `/om`, och policyn länkar dit.
2. **`/om` ändras där den säger för mycket.** "Samlar inte in personuppgifter" stämmer inte helt, eftersom söktext och ip-adress kan finnas i Vercels loggar en kort tid.
3. **Datumet är en konstant i innehållet.** Det ändras för hand när texten ändras, inte vid varje bygge.

## Utanför

- Juridisk granskning. Texten är inte juridiskt granskad, och Jesper läser den före merge.
- Egen design. Pencil gick inte att läsa när sidan byggdes (planens gräns var nådd), så sidan följer `/om`. Den behöver jämföras med designen.
- Appens länk och App Store-uppgifter, som görs i Sophämtning.

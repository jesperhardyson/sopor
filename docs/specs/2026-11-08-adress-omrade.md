# Spec: Områdets detaljer i adressvaret

Status: utkast, 2026-11-08. Issue [#128](https://github.com/jesperhardyson/sopor/issues/128).

## Bakgrund

Sedan #122 ger `/api/v1/omraden` områdets dag, etikett, platser, avvikande dagar och sökord. Adressvaret för ett sparat område (`/api/v1/adress/avesta/trakt-7`) ger inget av det. Appen kan därför inte varna att till exempel Bodgatan i Område 7 hämtas en annan dag, fast webbens resultatsida gör det (`AreaInfo`).

## API:t

- Adressvaret får `area` med formen `AreaDetails`, samma som träffarna i `/omraden`.
- `area` är `null` för adresser utan områdesval och för live-källor, enligt API:ts konvention om `null` för fält utan värde.
- Inga befintliga fält ändras.

## Beslut

1. **Uppgifterna läses ur `omraden.json`, som i `/omraden`.** Adressfilen har bara `detail` och sökorden per område, och samma källa gör att de två svaren inte kan glida isär. Det blir ett anrop till per adressvar, och bara för källor med områdesval.
2. **Går områdesfilen inte att läsa blir `area` `null`, men svaret är 200.** Schemat är det viktiga, och det har redan lästs. Felet loggas.
3. **`searchTerms` är med**, fast adressvaret tidigare med avsikt saknade sökord. De blev publika i #122, och issuet vill ha samma form som `AreaDetails`.

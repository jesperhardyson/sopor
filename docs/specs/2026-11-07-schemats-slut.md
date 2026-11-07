# Spec: Hur långt schemat gäller i API:t

Status: utkast, 2026-11-07. Issue [#121](https://github.com/jesperhardyson/sopor/issues/121).

## Bakgrund

Avesta och Säter publicerar schemat en period i taget. Efter sista datumet visar appen Sophämtning "Inga kommande hämtningar" utan att kunna förklara varför. Sista händelsens datum duger inte som slut, eftersom en källa kan skicka bara de närmaste tömningarna fast schemat fortsätter.

## Datat

- De statiska källornas schemafiler har redan `validTo`: sista dagen filen gäller. Avestas är 2027-01-10, eftersom hämtschemat 2026 sträcker sig in i vecka 1, fast trakt 8:s sista hämtning är 2026-12-23.
- `mergeParts` sätter `validTo` på det sammanslagna schemat till den senaste delens. Live-källorna sätter det inte, eftersom deras datum räknas fram eller hämtas löpande.
- Källregistret får `publishing`, en mening om hur källan publicerar schemat. Den krävs för statiska källor (test).

## API:t

Adressvaret får `schedule`:

```json
"schedule": { "until": "2027-01-10", "reason": "Avesta Vatten publicerar hämtschemat ett år i taget." }
```

- `schedule` är `null` när schemat saknar känt slut, enligt API:ts konvention om `null` för fält utan värde. Issuet föreslog att utelämna fältet.
- `reason` är `null` om källan saknar `publishing`.

## Utanför

- `/kallor` får inget `until`. Slutet hör till varje schema, och handlern läser inte källornas datafiler. Behövs det per källa kan det byggas vid build.
- När nästa period brukar publiceras. Det finns ingen säker uppgift, så `reason` säger bara hur källan publicerar.

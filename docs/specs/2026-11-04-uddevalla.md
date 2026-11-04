# Spec: Uddevalla (Uddevalla Energi)

Status: utkast, 2026-11-04. Fjärde källtypen i fas 2 i `docs/plans/2026-11-03-fler-kommuner.md`. Bara Uddevalla byggs av WordPress-appen. Rambo hoppas över (beslut 6).

## Bakgrund

Uddevalla Energi hämtar avfallet i Uddevalla, cirka 56 000 invånare. Sidan om sophämtning på uddevallaenergi.se använder en publik JSON-tjänst utan inloggning eller registrering.

Kontrollerat 2026-11-04, med Sopors User-Agent:

```
GET https://app.uddevallaenergi.se/wp-json/app/v2/address-flat?address=Kungsgatan 10
    X-App-Identifier: www.uddevallaenergi.se
→ [{"key":"K","is_key":true},{"plant_number":"<base64>","address":"Kungsgatan 10, Uddevalla","zip_city":"Uddevalla"}]

GET …/wp-json/app/v1/next-pickup-web?plant_number=<base64>      (samma huvud)
→ [{"type":"140 l Matkärl","address":"Kungsgatan 10 ","pickup_date":"2026-11-04","has_deviating_date":false,"message":"","week_type":"Ordinarie"}, …]
```

- **Identifieraren** är sajtens eget namn och står i klartext i sajtens `annat.js`. Utan den blir sökningen tom.
- **Sökningen** matchar på början av adressen. Med orten ("Kungsgatan 10, Uddevalla") eller en bokstav efter numret ("Södra Drottninggatan 1A") blir det inga träffar.
- **Bara nästa tömning per kärl**, utan frekvens. Kommande datum går alltså inte att räkna fram. Ett stickprov på 50 adresser och 94 kärl gav inga passerade datum.
- **`plant_number`** är ett ogenomskinligt värde i base64 (`+`, `/`, `=`). Det var stabilt mellan anrop, men det går inte att veta över längre tid.
- **Avfallstyper** i stickprovet: `370 l kärl 1`, `370 l kärl 2` (villornas två fyrfackskärl, enligt sajten), `140 l Matkärl`, `190 l Matkärl`, `370 l Matkärl`, `140 l Restavfall` … `770 l Restavfall` och `10 m3 Container`.
- **Andra anrop** (`save-address`, `get-addresses`) hör till appens sparade adresser. Sopor använder dem inte, av samma skäl som Avfallsapp (beslut 5).

## Beslut

- **Regel 4.** Tjänsten är den publika sökningen på uddevallaenergi.se, utan inloggning. Identifieraren står på sajten. Skulle den börja kräva inloggning tas källan bort.
- **En ny källtyp, `uddevalla`**: `{ system: 'uddevalla' }`. Ingen plattform, eftersom Rambo inte tas med.
- **Källan:** `{ id: 'uddevalla', name: 'Uddevalla Energi', url: 'https://www.uddevallaenergi.se', kommuner: [Uddevalla 1485], config: { system: 'uddevalla' } }`. Id:t får aldrig ändras.
- **Samma skydd som SRV:** okänd form ger ett fel, aldrig en tom lista. Ett id utan träff ger 502, inte 404.
- **Bara källans egna datum.** Inga datum räknas fram, så kalendern har nästa tömning per kärl och uppdateras när källan gör det. Det är en känd begränsning, och den står i PR:en och här.

## Klienten (`src/server/uddevalla.ts`)

- **Adress-id som EDP, med en hash av `plant_number`:** `kungsgatan-10_uddevalla-<hash>`. Hashen är `idHash` (samma FNV-1a som `srvKey`, flyttad till `edp.ts`). Värdet innehåller tecken som inte får stå i id:t, och det kan ändras över tid. Formatet och hashen får aldrig ändras (regel 3), och tester låser dem.
- **Uppslaget** (`uddevallaFind`) frågar sökningen med gatan och första numret i id:t och väljer träffen på samma gata och ort vars hash står i id:t. Finns hashen inte längre, och det är **den enda** träffen på adressen, används den med id:t oförändrat. Annars `null`.
- **Sökningen** tar bort orten och allt efter första numret innan frågan skickas, och `is_key`-raderna filtreras bort.
- **Särskiljare:** flera träffar på samma gata och ort får kärlen, och är de lika också nästa tömning. Samma schema visas en gång. Går kärlen inte att hämta blir det ingen särskiljare, aldrig en misslyckad sökning.
- **Form:** sökningen och tömningarna måste vara listor. En adressrad måste ha `plant_number` och `address`. En tömning måste ha `type`, och `pickup_date` är ett datum eller saknas (då hoppas den över). Allt annat kastar `SourceError('app.uddevallaenergi.se svarade med ett okänt format')`.
- **Schemat:** datumen från i dag och framåt, `estimated: false`, sammanslagna per dag. `has_deviating_date` ger varningen "Flyttad tömning enligt Uddevalla Energi."

### Fraktioner

Volymen tas bort och resten går genom `mapWasteType`:

| Text | Fraktioner |
|---|---|
| `370 l kärl 1`, `370 l kärl 2` | `karl` med texten "Fyrfackskärl 1" och "Fyrfackskärl 2" |
| `140 l Matkärl` | `mat` |
| `660 l Restavfall` | `rest` |
| `10 m3 Container` | `karl` med hela texten, rapporteras av bevakningen |

## Bevakningen

- `checkUddevallaSource` i `scripts/source-checks.ts`, med samma lägen och samma fallback via sajten som de andra.
- Kontrolladressen i `PROBES` är adress-id:t för Kungsgatan 10. Hittas den inte blir läget `nytt-format`. Inga tömningar inom 60 dagar blir `inga-tomningar`, vilket också fångar om tjänsten börjar svara med tomma listor.

## Test

- Sparade svar i `src/server/__fixtures__/`: `uddevalla-adresser.json` (med påhittade `plant_number`), `uddevalla-tomningar.json` och `uddevalla-tomningar-fyrfack.json`.
- Sökning, uppslag, schema, särskiljare, fraktioner och okänd form i `src/server/uddevalla.test.ts`.
- `handleSearch`, `handleSchedule`, `handleIcs` och API v1 i `src/server/uddevalla-handlers.test.ts`. Ett id utan träff ger 502.
- Bevakningen: fungerar, svarar inte, nytt format, tom, inga tömningar och okända typer.

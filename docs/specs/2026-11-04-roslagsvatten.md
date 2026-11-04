# Spec: Roslagsvatten (Österåker, Ekerö, Vaxholm)

Status: utkast, 2026-11-04. Sista källtypen i fas 2 i `docs/plans/2026-11-03-fler-kommuner.md`.

## Bakgrund

Roslagsvatten hämtar avfallet i Österåker, Ekerö och Vaxholm, cirka 91 000 invånare. Sidan `roslagsvatten.se/hamtningsschema` använder två öppna anrop, utan inloggning, nyckel eller registrering. Planens `POST /schedule` finns inte. Det är `/schedule/search` och `/schedule/fetch`.

Kontrollerat 2026-11-04, med Sopors User-Agent:

```
POST https://roslagsvatten.se/schedule/search   {"searchText":"Hamnvägen 4","municipality":"osteraker"}
→ [{"selector":"#waste-schedule-building-list","data":"<ul …><li … data-bid=\"…\" …>Hamnvägen 4, Åkersberga</li></ul>"}]

POST https://roslagsvatten.se/schedule/fetch    {"buildingId":"…","municipality":"osteraker"}
→ [{"selector":"#waste-schedule-item","data":"<div …><h3>Restavfall</h3><p>Frekvens: Måndag jämn vecka. Avfall</p><p>Nästa hämtning: 2026-11-09</p></div>"}]
```

- **Kommunen krävs i båda anropen** (`osteraker`, `ekero`, `vaxholm`). Med fel kommun blir svaret "No waste schedule found."
- **Sökningen** matchar på början av adressen, utan begränsning av antalet träffar. **Inga träffar ger HTTP 500** med texten "The website encountered an unexpected error", samma som ett verkligt fel skulle ge.
- **Adresser** skrivs "Gata 1, Ort", men en del saknar ort ("Hamngatan 3 -7"). Samma adress kan ha flera `data-bid`.
- **Svaren är HTML i JSON.** Varje kärl har namn, frekvens och nästa hämtning.
- **Nästa hämtning** är ett datum, tom, eller en vecka eller månad ("v47 Nov 2026", "Nov 2026"). Veckor och månader förekom bara på slam och fett.

Stickprov på 150 adresser och 357 kärl: inga fel och inga passerade datum. 232 kärl hade ett datum.

**Ekerös fyrfackskärl saknar datum.** Alla 68 raderna "Fyrfack 1" och "Fyrfack 2" var tomma, med "Rest- matavfall" eller "Restavfall" daterat bredvid. Roslagsvatten [inför fyrfackskärlen stegvis under hösten 2026](https://roslagsvatten.se/content/ny-avfallstaxa-ekero-kommun), så en tom rad betyder att tömningen inte har börjat.

## Beslut

- **Regel 4.** Tjänsten är den publika sökningen på roslagsvatten.se. Skulle den börja kräva inloggning tas källorna bort.
- **En källa per kommun**, som Appbolagets kunder: `{ system: 'roslagsvatten', municipality: 'ekero' }`. Kommunen krävs i varje anrop, och kommunen i adressen blir då alltid rätt. Id:n `osteraker`, `ekero` och `vaxholm` får aldrig ändras.
- **Datum räknas fram som för EDP.** Frekvensen går genom `edpRule`, och framräknade datum märks *beräknat*. Antalet tömningar per år läses ur texten: en angiven siffra ("19 ggr/år") gäller först, sedan "var 4:e vecka" (13), "udda/jämn vecka" (26) och "varje vecka" (52). Allt annat, som säsong eller "var 8:e vecka", ger bara källans datum. "Måndag, onsdag och fredag varje vecka" går genom `expandWeekdays`.
- **Ett kärl utan datum räknas aldrig fram**, även om frekvensen går att läsa. Det gäller Ekerös fyrfackskärl. När Roslagsvatten sätter datum på dem visas de utan ändring här.
- **HTTP 500 med sajtens feltext blir inga träffar i sökningen**, eftersom sajten inte skiljer på dem. Ett verkligt fel visas då som "inga träffar" i sökningen. Bevakningen märker det (läget `tom`), och uppslaget av ett sparat adress-id ger 502, så kalendrar töms inte. Andra felkoder och `/schedule/fetch` ger fel som vanligt.

## Klienten (`src/server/roslagsvatten.ts`)

- **Adress-id som EDP, med en hash av `data-bid`:** `hamnvägen-4_åkersberga-<hash>`, med `idHash`. Vi vet inte vad värdet står för, så det ska inte stå i klartext. En adress utan ort får id:t utan ort. Formatet och hashen får aldrig ändras (regel 3).
- **Sökningen** tar bort orten och allt efter första numret, så att "Hamnvägen 2A" hittar "Hamnvägen 2 A". Orten filtreras fram efteråt.
- **Uppslaget** väljer träffen vars hash står i id:t. Id:t saknar tecken som `:` och `/` ("Gustav III:s väg 2", cirka 60 av 26 000 adresser), så ger gatan inget söks det på de tre första bokstäverna och jämförs med id:t. Finns hashen inte längre, och det är den enda träffen på adressen, används den med id:t oförändrat. Annars `null`, som ger 502.
- **Särskiljare:** flera träffar på samma gata och ort får kärlen, och är de lika också frekvensen och nästa tömning. Samma schema visas en gång. Går kärlen inte att hämta blir det ingen särskiljare. Fler än 20 sådana träffar i samma sökning hämtas inte, för att hålla anropen få: de visas då utan särskiljare.
- **Form:** svaret ska vara en lista med `data`-text som innehåller listan eller resultatet. Varje `<li>` och kärl ska gå att läsa. Ett kärl med datum ska ha ett namn, och nästa hämtning ska ha en känd form. Annars `SourceError`, aldrig en tom lista.

### Fraktioner

| Text | Fraktioner |
|---|---|
| `Restavfall`, `Osorterat` | `rest` |
| `Matavfall` | `mat` |
| `Rest- matavfall` (nytt i `mapWasteType`) | `rest`, `mat` |
| `Pappersförp.`, `Plastförp.`, `Glasförp.färg`, `Glasförp.ofärg`, `Metallförp.` | `papper`, `plast`, `glas`, `glas`, `metall` |
| `Fyrfack 1`, `Fyrfack 2` | `karl` med texten "Fyrfackskärl 1" och "Fyrfackskärl 2" |
| `Trädgårdsavfall`, `Grovavfall` | `karl` med källans text |
| `Slam`, `Fett`, `Latrin` | visas inte |

## Bevakningen

`checkRoslagsvattenSource` med samma lägen som de andra. Kontrolladresserna är kommunernas egna hus: Hackstavägen 22 i Åkersberga, Tappströmsvägen 2 på Ekerö och Eriksövägen 27 i Vaxholm.

## Kända begränsningar

- Ett verkligt fel i sökningen ser ut som inga träffar (se Beslut).
- På Ekerö kan framräknade datum för "Rest- matavfall" bli inaktuella när fyrfackskärlen kommer. De är märkta *beräknat*, och schemat rättar sig när källan ändrar sina rader.

## Test

Sparade svar i `src/server/__fixtures__/roslagsvatten-*.json`, med påhittade `data-bid`. Tester för sökning (500, adress utan ort, entiteter, okänd form), uppslag, schema (framräkning, säsong, tomt datum, vecka), särskiljare, API:et och bevakningen.

# Spec: Sundsvall (MSVA) och Södertälje (Telge Återvinning)

Status: utkast, 2026-11-06. De två första källorna i fas 3 av `docs/plans/2026-11-03-fler-kommuner.md`. Efter dem pausas arbetet med fler källtyper, eftersom varje källtyp ger mer underhåll och de återstående kommunerna är mindre.

## MSVA: bakgrund

Mittsverige Vatten & Avfall hämtar i Sundsvall, cirka 99 000 invånare. Tjänsten är kommunens öppna API, utan inloggning. Timrå och Nordanstig finns inte i API:t (kommunkoden i adressen är Sundsvalls).

Kontrollerat 2026-11-06, med Sopors User-Agent:

```
GET https://api.sundsvall.se/Garbage/2281/schedules?street=Västra Radiogatan&houseNumber=18
→ [{"additionalInformation":"","address":{"city":"Sundsvall","houseNumber":"18","postalCode":"85461","street":"Västra Radiogatan"},
    "facilityCategory":"VILLA","garbageScheduledDay":"WEDNESDAY","garbageScheduledWeek":"ODD",
    "schedules":[{"nextPickupDate":"2026-11-18","wasteType":"WASTE"}, …]}]
```

Stickprovet: 40 slumpade gator ur OpenStreetMap gav träff på 16 gator och 280 adresser med 1 118 rader.

- **Bara småhus.** Alla 280 adresser var `VILLA`. Storgatan och Esplanaden i centrala Sundsvall ger inga träffar, så flerbostadshus saknas troligen helt.
- **Datumen ligger framåt.** Inget av 1 118 hade passerat. Det längsta låg sex veckor bort.
- **Nästa tömning per kärl**, utan frekvens. Veckodag och jämn eller udda vecka gäller bara en del av kärlen, så kommande datum går inte att räkna fram.
- **Gatan måste vara exakt**, men inte versalkänslig. "Västra Radio" ger en tom lista.
- **Inget id.** Gata, nummer, bokstav, postnummer och ort var unika bland de 280.
- **`postalCode` och `houseNumber`** går att söka på utan gatan.
- **Fyra typer:** `WASTE`, `FOOD`, `PAPER` och `PLASTIC`. Samma typ kan stå två gånger samma dag, när adressen har två kärl.
- **Bokstaven** står i `additionalInformation` (`A`–`D` i 22 av 280).

## MSVA: beslut

- **Källan:** `{ id: 'msva', name: 'Mittsverige Vatten & Avfall', url: 'https://www.msva.se', kommuner: [Sundsvall 2281], config: { system: 'msva' } }`. Id:t får aldrig ändras.
- **Adress-id:** `västra-radiogatan-18_sundsvall-85461`, som EDP med postnumret som byggnads-id. Formatet får aldrig ändras (regel 3), och tester låser det.
- **Uppslaget frågar på postnummer och husnummer, inte gatan,** och väljer träffen med samma id. Då spelar det ingen roll att id:t tappar skiljetecken i gatunamnet. Id utan träff ger 502.
- **Sökningen** delar upp "Västra Radiogatan 18 A" i gata, nummer och bokstav. Bokstaven filtreras här, eftersom `additionalInformation` inte är provad som filter.
- **En okänd typ** går genom `mapWasteType` och visas med källans text. Bevakningen rapporterar den. En ny fraktion ska inte ta ner alla adresser.
- **Känd begränsning:** flerbostadshus hittas inte. De brukar inte heller ha egna kärl.

## Telge: bakgrund

Telge Återvinning hämtar i Södertälje, cirka 103 000 invånare. Tjänsten är sopbilsschemat på telge.se, utan inloggning.

```
GET https://www.telge.se/api/thorweb/garbagecollection/autocomplete/BERGSGATAN 2
→ ["BERGSGATAN 20, SÖDERTÄLJE", …]

GET …/schedule/BERGSGATAN 22, SÖDERTÄLJE
→ [{"date":"2026-11-10T00:00:00","title":"Hämtning av hemsortering (240 liters kärl 1)","typeOfWaste":"HEMSORT",
    "typeOfWasteDescription":"Hemsortering","containerType":"K240L1","collectionFrequency":"V2V2",
    "vehicleDescription":"Hemsortering 4-fack      ", …}, …]
```

Stickprovet: 40 slumpade gator gav träff på 23 gator och 164 förslag, och 30 av dem gav scheman.

- **Inte Nykvarn.** Planen räknade med Nykvarn, men ingen av kommunens 204 gator i OpenStreetMap gav en adress där. Källan täcker bara Södertälje.
- **Riktiga datum ett år framåt.** Alla 30 scheman hade kommande datum, med det sista mellan oktober och november 2027. Inga datum behöver räknas fram.
- **Förslagen** matchar på början av adressen, oavsett versaler, och ger högst 10 träffar. Orten i sökningen ger en tom lista.
- **Skiljetecken ger fel.** `:`, `.` och `&` ger 500 och `/` ger 404. Inget av de 164 förslagen hade något annat än bokstäver, siffror, mellanslag och kommat före orten.
- **Trög första fråga.** Ett anrop tog 7 sekunder, och nästa 0,5.
- **Schemat kräver adresstexten** och svarar med en tom lista annars. Inget av de 30 var tomt.
- **`vehicleDescription` säger "Hemsortering 4-fack" även för `Mat & Restavfall`,** så den duger bara för typen `HEMSORT`.

## Telge: beslut

- **Källan:** `{ id: 'telge', name: 'Telge Återvinning', url: 'https://www.telge.se', kommuner: [Södertälje 0181], config: { system: 'telge' } }`. Id:t får aldrig ändras.
- **Adress-id:** `bergsgatan-22_södertälje-<hash>`, där hashen är `idHash` av källans text. Källan har inget id. Formatet får aldrig ändras (regel 3), och tester låser det.
- **Sökningen** tar bort orten och allt som inte är bokstäver, siffror, mellanslag eller bindestreck, så att besökarens skiljetecken inte blir 500. Tidsgränsen är 8 sekunder, för den tröga första frågan.
- **Förslag med andra tecken än de ovan visas inte.** Uppslaget kan inte söka fram dem igen, och en länk som ger fel är sämre än ingen träff. Stickprovet hade inga sådana.
- **Uppslaget** söker på texten i id:t och väljer träffen med samma id, utan träff 502. En tom lista för en adress som sökningen hittar är ett giltigt, tomt schema.
- **Bara källans datum,** från i dag och framåt, `estimated: false`.

### Fraktioner

`typeOfWasteDescription` går genom `mapWasteType`, utan förledet `BNI` (bostadsnära insamling):

| Text | Fraktion |
|---|---|
| `Restavfall`, `Matavfall` | `rest`, `mat` |
| `Mat & Restavfall` | `mat` och `rest`. `&` som delare är nytt i `fractions-map.ts` |
| `BNI Pappersförp.`, `BNI Plastförp.`, `BNI Metallförp.` | `papper`, `plast`, `metall` |
| `BNI Glas färgat`, `BNI Glas ofärgat` | `glas` |
| `Returpapper` | `tidningar` |
| `Hemsortering` | `karl` som "Fyrfackskärl 1" eller "Fyrfackskärl 2", med numret ur `title` |
| `Trädgårdsavfall` | `karl` med källans text |
| `Latrin`, `Slam` | Hoppas över, som för andra källor |

## Gemensamt

- **Regel 4.** Båda är publika tjänster utan inloggning. Skulle de börja kräva det tas källan bort.
- **Samma skydd som andra källor:** okänd form ger `SourceError`, aldrig en tom lista.
- **Bevakningen:** `checkMsvaSource` och `checkTelgeSource`, med samma lägen och samma fallback via sajten. Kontrolladressen är ett adress-id i `PROBES`.
- **Kvar för förvaltaren:** berätta för MSVA och Telge att Sopor använder deras tjänster, med en kontaktadress.

## Test

- Sparade svar i `src/server/__fixtures__/`: `msva-adress.json`, `telge-forslag.json` och `telge-schema.json`.
- Klienterna i `src/server/msva.test.ts` och `src/server/telge.test.ts`: adress-id, sökning, uppslag, fraktioner och okänd form.
- `handleSearch`, `handleSchedule` och `handleIcs` i `src/server/msva-handlers.test.ts` och `src/server/telge-handlers.test.ts`. Ett id utan träff ger 502.
- Bevakningen i `scripts/source-checks.test.ts`: fungerar, svarar inte, nytt format, tom, inga tömningar och okända typer.

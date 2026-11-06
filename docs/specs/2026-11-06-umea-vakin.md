# Spec: Umeå, Vindeln och Nordmaling (Vakin)

Status: utkast, 2026-11-06. Hittades vid djupkollen i fas 5 av `docs/plans/2026-11-03-fler-kommuner.md`. Undersökningen i oktober hittade ingen källa för Umeå, eftersom den byggde på Waste Collection Schedule. Umeå har cirka 134 000 invånare, fler än någon kvarvarande källa i fas 3, så källan byggs trots pausen i beslut 7.

## Bakgrund

Vakin hämtar i Umeå, Vindeln och Nordmaling. Sidan [När kommer sopbilen?](https://www.vakin.se/kundserviceochetjanster/sophamtning/narkommersopbilen.4.6252338c1a0c6bd088ed01f.html) använder Sitevision-appen `se.soleil.garbageTruckFetcher` 1.0.5, utan inloggning. Det är samma app som Borlänge, men i en annan version.

Kontrollerat 2026-11-06, med Sopors User-Agent:

```
GET https://www.vakin.se/appresource/4.6252338c1a0c6bd088ed01f/12.6252338c1a0c6bd088ed033/getAddresses?pickupAddress=Laboratorvägen 7
→ {"data":[{"id":1.043962241E9,"label":"Laboratorvägen 7, Umeå","value":{"zipCode":"90739","address":"Laboratorvägen 7, Umeå","city":"UMEÅ"}}]}

GET …/getcontainerdata?addressParams={"zipCode":"90739","address":"Laboratorvägen 7, Umeå","city":"UMEÅ"}&startDate=2026-11-06&endDate=2027-11-06
→ [{"executionDateFormated":"Torsdag 12 november","executionDate":"2026-11-12","flexServiceGroup":"Tunna flerb/verks","id":"360541","contentTypes":["Restavfall","Matavfall"],"dayUntil":6}, …]
```

Stickprovet: 60 slumpade gator ur OpenStreetMap (40 i Umeå, 10 i Vindeln och 10 i Nordmaling) gav 901 adresser, och 70 av dem gav scheman.

- **Riktiga datum i ett valfritt intervall.** Inget av de 2 026 datumen hade passerat. Schemat går att hämta långt fram, också för 2028.
- **Sökningen** matchar på början av adressen, oavsett versaler. "gatan 1" ger inget. Den gav upp till 131 träffar, utan tecken på avkortning.
- **Skiljetecken ger fel.** `:`, `.`, `&` och `/` ger 500 i sökningen. Schemat för `Cellovägen/Sophus 3, Umeå` gav också 500. Tre av de 901 adresserna hade sådana tecken.
- **Schemat kräver adress, ort och postnummer.** Saknas något eller är det fel blir svaret en tom lista, inte ett fel. Versaler spelar ingen roll i adressen.
- **9 av 70 scheman var tomma,** också med ett intervall på över ett år. Svaret säger inte varför.
- **Fem typer i stickprovet:** `Matavfall`, `Restavfall`, `Pappersförpackningar`, `Plastförpackningar` och `Fett`. Rökprovet visade också tidningar i Nordmaling, så listan är inte uttömmande.
- **Inte bara villor.** Sidan nämner villor, radhus och fritidshus, men stickprovet hade också `Tunna flerb/verks`, skolor och verksamheter.
- **`id`** är ett flyttal i svaret. Adress och postnummer var unika bland de 901, så `id` behövs inte.
- **13 orter:** Umeå, Holmsund, Obbola, Sävar, Hörnefors, Tavelsjö, Vindeln, Hällnäs, Nordmaling, Rundvik, Nyåker, Lögdeå och Håknäs.

Vakins egna vanliga frågor säger att pappers- och plastförpackningar kan saknas några dagar efter att nya tunnor har levererats, att hämtdagar kan ändras när hemsortering införs, och att den som bor i flerbostadshus eller samfällighet kan ha soprummet på en annan adress.

## Beslut

- **Regel 4.** Tjänsten är den publika sökningen på vakin.se, utan inloggning. Skulle den börja kräva inloggning tas källan bort.
- **En ny källtyp, `vakin`**, inte en gemensam klient med Borlänge. Anropen, parametrarna och svaren skiljer sig, och de delar bara appens namn. Täby är inte bekräftad, så ingen plattform byggs än. Visar fler kunder sig köra version 1.0.5 blir adressen en inställning, som `baseUrl` för EDP.
- **Källan:** `{ id: 'vakin', name: 'Vakin', url: 'https://www.vakin.se', kommuner: [Umeå 2480, Vindeln 2404, Nordmaling 2401], config: { system: 'vakin' } }`. Id:t får aldrig ändras.
- **Adress-id:** `laboratorvägen-7_umeå-90739`, som EDP med postnumret som byggnads-id. Formatet får aldrig ändras (regel 3), och tester låser det.
- **Uppslaget** söker på gatan i id:t, väljer träffen med samma id och skickar källans `value` oförändrad till schemat. Id utan träff ger 502.
- **Sökningen** tar bort orten och skiljetecken, så att besökarens text inte blir 500.
- **Adresser med andra tecken än bokstäver, siffror, mellanslag, komma och bindestreck visas inte.** De kan inte sökas fram igen, och schemat kan ge fel för dem.
- **Tolv månader framåt,** från i dag, `estimated: false`. Datumen är källans egna, men kan ändras när hemsortering införs. Prenumererade kalendrar hämtar ändringen själva.
- **`Fett` hoppas över,** som för andra källor. Fettavskiljare är inget hushåll ställer ut.
- **Postorterna pekas ut** där OpenStreetMap har samma namn i flera av källans kommuner: Holmsund och Röbäck i Umeå, Nyåker och Olofsfors i Nordmaling.
- **Text för tomt schema.** Var åttonde adress saknar tömningar, så källan får en `emptyScheduleNote` som nämner flerbostadshus utan att gissa orsaken. Kalenderfilen ger 502 för ett tomt schema, som för alla live-källor, så att en prenumeration inte töms om källan får problem.
- **Känd begränsning:** förpackningar kan saknas i kalendern de första dagarna efter att nya tunnor har levererats. Så visar källan det också.

## Bevakningen

- `checkVakinSource` i `scripts/source-checks.ts`, med samma lägen och samma fallback via sajten som de andra.
- Ändras Sitevision-id:n i adressen blir sökningen 404, och det rapporteras.
- Kontrolladressen i `PROBES` är ett adress-id. En ny fraktionstyp rapporteras som okänd.

## Test

- Sparade svar i `src/server/__fixtures__/`: `vakin-adresser.json` och `vakin-schema.json`.
- Klienten i `src/server/vakin.test.ts`: adress-id, sökning, uppslag, fraktioner och okänd form.
- `handleSearch`, `handleSchedule`, `handleIcs` och API v1 i `src/server/vakin-handlers.test.ts`. Ett id utan träff ger 502.
- Bevakningen i `scripts/source-checks.test.ts`.

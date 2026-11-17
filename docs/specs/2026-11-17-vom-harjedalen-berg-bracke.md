# Spec: Härjedalen, Berg och Bräcke (Vatten och miljöresurs)

Status: byggd, 2026-11-17. Härjedalen har flest besök av kommunerna utan källa i besöksstatistiken (fem besökare på en månad). Berg och Bräcke följer med, eftersom samma bolag och samma app täcker dem.

## Bakgrund

Vatten och miljöresurs (VoM) ägs av Härjedalens, Bergs och Bräcke kommuner och sköter sophämtningen i alla tre. Varje kommun har en sida "När kommer sopbilen?" på vattenmiljoresurs.se (till exempel [Härjedalen](https://www.vattenmiljoresurs.se/harjedalen/avfall-och-atervinning/avfallshamtning/nar-kommer-sopbilen)) med en egen Sitevision-app, `garbage-collection|1.0.1`.

Kontrollerat 2026-11-17, med Sopors User-Agent:

- **Appen hämtar alla adresser i ett anrop**, utan inloggning: `GET https://www.vattenmiljoresurs.se/appresource/<sid-id>/<portlet-id>/allAddresses` ger `{"allAddresses":[{"ort":"sveg","hamtstalle":"algatan 1","tbfurenhkorlistarad_strtomningsfrekvenskod":"h211"}, …]}`. Svaret tog 0,4 sekunder.

| Kommun | Resurs | Rader | Orter |
|---|---|---|---|
| Härjedalen | `4.19317d4219c47956faa53c9/12.19317d4219c47956faa53d3` | 6 793 (690 kB) | Sveg, Hede, Funäsdalen, Ytterhogdal, Lillhärdal, Vemdalen … |
| Berg | `4.19317d4219c47956faa37c0/12.19317d4219c47956faa37ca` | 4 227 (424 kB) | Svenstavik, Oviken, Åsarna, Hackås, Rätan, Klövsjö … |
| Bräcke | `4.19317d4219c47956faa4b46/12.19317d4219c47956faa4b50` | 3 746 (376 kB) | Gällö, Bräcke, Kälarne, Sörbygden, Pilgrimstad, och 42 rader med postorten Östersund |

- **Koden** (från appens JavaScript): tecken 1–2 är frekvensen (`h1` varje vecka, `h2` varannan vecka), tecken 3 veckan (`1` udda, `2` jämn) och tecken 4 veckodagen (1 måndag … 7 söndag). Sidan räknar fram nästa tömning med ISO-veckans paritet.
- **Andra koder:** `h4xx` (5 rader i Härjedalen, troligen var 4:e vecka) och `bud` (1 rad). Appen visar dem som "okänd".
- **Inga datum och inga fraktioner** i svaret. Alla tre sidorna säger: "tömning av dina avfallskärl var fjortonde dag … året om, även på röda dagar", och bilen är en tvåfacksbil som hämtar matavfall och restavfall på samma gång. Ändringar vid storhelger meddelas på sidan.
- **Adresserna** är gemener ("algatan 1", "sonfjällsgatan 12 a-e"). Adress och ort är unika: inga motstridiga koder, en dubblett med samma kod.
- **Orterna har stavfel** ("ytterhogdals", "vemhpn", "sveg 2:1"). De visas som källan skriver dem.
- **Udda adresser:** omkring 1 % har annan text än gata och nummer ("bakom hotellet (vid skalsbyn brf)", "berggatan 6 /kyrkogatan 13 ,15").
- **Inga personuppgifter** finns i svaret.

## Beslut

- **En källa per kommun**, som Roslagsvatten: `vom-harjedalen`, `vom-berg` och `vom-bracke`, med `name: 'Vatten och miljöresurs'` och `config: { system: 'vom', resource: '<sid-id>/<portlet-id>' }`. Kommunen kommer från källan, så Bräckes adresser med postorten Östersund hamnar i Bräcke. Id:na får aldrig ändras.
- **Klienten** (`src/server/vom.ts`) hämtar kommunens lista och sparar den i minnet i sex timmar per instans. Samtidiga anrop delar på en hämtning, och misslyckas en ny hämtning används den gamla listan. Enstaka trasiga rader hoppas över; går ingen rad att läsa är det nytt format. Svaren cachas dessutom i CDN:en som för andra källor.
- **Adress-id:** `algatan-1_sveg-<hash>`, med `edpAddressId` och hashen `idHash("<hamtstalle>, <ort>")` på den trimmade texten med gemener. Formatet får aldrig ändras (regel 3), och tester låser det.
- **Visningen:** första bokstaven med versal ("Algatan 1, Sveg", "Storsjö kapell"), och ensamma bokstäver efter numret med versaler ("Sonfjällsgatan 12 A-E"). Versal på varje ord blir fel på svenska ("Anders Pers Väg").
- **Adresser som inte visas:** text med andra tecken än bokstäver, siffror, mellanslag, bindestreck, komma och punkt (`/`, parenteser, `+`). De kan inte ligga i ett adress-id i en URL. Bortfallet är omkring 1 %.
- **Sökningen** jämför gatan i sökningen med början av adressen, utan hänsyn till versaler, som appens egen sökning. Orten filtreras som för andra live-källor, och först därefter begränsas träffarna till 50.
- **Datumen:**
  - `h2` med paritet: veckodagen i ISO-veckor med rätt paritet, tolv månader framåt (`weekRuleDates` med `every: 2` och `parity`). Vecka 53 och vecka 1 är båda udda, som i `docs/specs/2026-11-03-vecka-53.md` och som VoM:s egen sida räknar.
  - `h1`: veckodagen varje vecka, tolv månader framåt.
  - Första datumet är det första från och med i dag som passar koden.
  - **Alla datum är beräknade** (`estimated: true`, "ca"), eftersom källan inte ger något datum. Datum på röda dagar får varningen "kan flyttas", som för andra källor.
  - Vecka 53 är inte bekräftad med VoM. Sidan säger bara "var fjortonde dag", men räknar själv med pariteten.
  - Andra koder (`h4xx`, `bud`, tomma): inget schema. Källan får en `emptyScheduleNote` som hänvisar till VoM:s kundservice.
- **Ett id som saknas i listan ger 502, inte 404.** En 404 byter ut hela kalenderprenumerationen mot ett meddelande, och ett id kan försvinna när VoM rättar en ort eller en adress. Så gör också Stockholm och VA Syd.
- **Fraktioner:** `rest` och `mat` vid varje tömning.
- **Kontakt:** kundservice 010-251 53 15, kundservice@vattenmiljoresurs.se, [kontaktsidan](https://www.vattenmiljoresurs.se/harjedalen/kundservice/kontakta-oss) per kommun.

## Bevakningen

- `checkVomSource` i `scripts/source-checks.ts`. Kontrolladressen är ett adress-id per källa. Saknas `allAddresses`, eller saknar raderna fälten, rapporteras det som nytt format. Andelen okända koder rapporteras som okända typer ("Kod: h411").

## Test

- Fixtur i `src/server/__fixtures__/vom-adresser.json`: ett urval rader från Härjedalen, med udda adresser och okända koder.
- Klienten: koden, adress-id, visningen, sökningen, bortfallet, datumen för udda och jämna veckor över vecka 53, varje vecka, okända koder och cachen.
- `handleSearch`, `handleSchedule`, `handleIcs` och API v1 i `src/server/vom-handlers.test.ts`.
- Bevakningen i `scripts/source-checks.test.ts`.

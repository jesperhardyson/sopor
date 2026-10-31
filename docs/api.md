# Sopor API v1

Ett öppet, inofficiellt API för sophämtning per adress. Det är samma data som sajten [sopor.hardyson.se](https://sopor.hardyson.se) visar, tänkt för Home Assistant, Homey och egna integrationer.

- Bas-URL: `https://sopor.hardyson.se/api/v1`
- Bara `GET`. Svaren är JSON. Inga nycklar och ingen inloggning.
- Alla JSON-svar från endpoints har `"apiVersion": "1"`. Alla svar har `Access-Control-Allow-Origin: *`.
- Maskinläsbar beskrivning: [`openapi.json`](https://sopor.hardyson.se/api/v1/openapi.json) (OpenAPI 3.1).

Det är en hobbytjänst utan garantier. Vid avvikelser gäller alltid kommunens information.

## Kom igång

Du behöver två saker: källans id (`uppsala`, `orebro` …) och adressens id. De hör ihop.

### Alternativ 1: ta id:t från sajtens adress

Sök upp adressen på [sopor.hardyson.se](https://sopor.hardyson.se). Adressraden ser ut så här:

```
https://sopor.hardyson.se/uppsala/storgatan-2_uppsala-4004688
                          └ källa └ adress-id
```

Samma id används i kalenderlänken (`/ics/uppsala/storgatan-2_uppsala-4004688.ics`) och i API:t.

### Alternativ 2: sök med API

```bash
curl 'https://sopor.hardyson.se/api/v1/sok?q=storgatan%202&kalla=uppsala'
```

Svaret:

```json
{
  "apiVersion": "1",
  "addresses": [
    {
      "id": "storgatan-2_uppsala-4004688",
      "street": "Storgatan 2",
      "locality": "Uppsala",
      "kommun": "Uppsala kommun",
      "source": "uppsala",
      "detail": null,
      "url": "https://sopor.hardyson.se/api/v1/adress/uppsala/storgatan-2_uppsala-4004688"
    }
  ],
  "failed": []
}
```

`url` pekar direkt på adressens schema. Spara den.

Tänk på:

- Skriv med **husnummer** (`storgatan 2`) eller ange **`kalla`**. Utan husnummer och utan `kalla` kan svaret bli en tom lista om gatan inte finns i Soporas gatuindex. Tom lista betyder alltså inte alltid att adressen saknas.
- `q` måste vara minst tre tecken.
- Flera träffar kan ha samma gata och ort. Då skiljer `detail` dem åt (till exempel `"Byggnad 4062411"`). Låt användaren välja.
- Sökningen frågar flera källor. Svarar inte alla får du ändå **200** med de träffar som kom, och de källor som inte svarade står i `failed`. Svarar ingen källa får du ändå 200, med tom `addresses` och alla källor i `failed`. **502** betyder ett oväntat fel hos Sopor. En tom `addresses` med icke-tom `failed` betyder alltså "försök igen", inte "adressen finns inte".

## Endpoints

### `GET /api/v1/adress/{källa}/{id}`

Adressens schema. Det är den du hämtar regelbundet.

```bash
curl 'https://sopor.hardyson.se/api/v1/adress/uppsala/storgatan-2_uppsala-4004688'
```

Förkortat svar:

```json
{
  "apiVersion": "1",
  "today": "2026-10-31",
  "address": { "id": "storgatan-2_uppsala-4004688", "street": "Storgatan 2", "locality": "Uppsala",
               "kommun": "Uppsala kommun", "source": "uppsala", "detail": null },
  "next": [
    { "fraction": "plast", "name": "Plastförpackningar", "color": "#A8431F",
      "date": "2026-11-04", "daysUntil": 4, "isToday": false, "isTomorrow": false,
      "estimated": false, "warning": null,
      "text": "Plastförpackningar – om 4 dagar, onsdag 4 november" }
  ],
  "summary": "Plast & metall – om 4 dagar",
  "events": [
    { "date": "2026-11-04", "fractions": ["plast", "metall"], "estimated": false,
      "deviation": null, "warning": null, "labels": {} }
  ],
  "bins": [],
  "fractions": { "plast": { "name": "Plastförpackningar", "short": "Plast", "color": "#A8431F", "icon": "cup-soda" } },
  "links": { "ics": "https://sopor.hardyson.se/ics/uppsala/storgatan-2_uppsala-4004688.ics",
             "web": "https://sopor.hardyson.se/uppsala/storgatan-2_uppsala-4004688" },
  "updatedAt": "2026-10-31"
}
```

Id:t får skickas procentkodat. Okänd källa eller adress ger `404 not_found`.

### `GET /api/v1/sok?q=…&kalla=…`

Adresssökning, se [Kom igång](#alternativ-2-sök-med-api). Högst tio träffar per källa.

### `GET /api/v1/kallor`

Alla synliga källor (id, namn, vilka kommuner de täcker) och alla kända fraktioner med namn, färg och ikon. Cachas i ett dygn. Bra för att bygga en källväljare.

```bash
curl 'https://sopor.hardyson.se/api/v1/kallor'
```

### Fel

Alla fel har samma form:

```json
{ "apiVersion": "1", "error": { "code": "not_found", "message": "Adressen finns inte hos källan" } }
```

| Status | `code` | Betyder |
|---|---|---|
| 400 | `bad_request` | Ogiltigt anrop, till exempel för kort `q`. |
| 404 | `not_found` | Källan, adressen eller sökvägen finns inte. |
| 502 | `source_unavailable` | Källan (kommunens eller bolagets tjänst) svarar inte just nu. |

## Fältreferens: adressvaret

| Fält | Typ | Betydelse |
|---|---|---|
| `today` | `"YYYY-MM-DD"` | Svarets referensdatum i Stockholm. `daysUntil`, `isToday` och `isTomorrow` räknas från det. |
| `address` | objekt | `id`, `street`, `locality`, `kommun`, `source` och `detail` (`null` om inget skiljer). |
| `next` | lista | Nästa hämtning **per fraktion**, sorterad på datum (därefter i fraktionsordning). Tom (`[]`) när inga hämtningar väntar. Kortaste vägen till "vad hämtas härnäst". |
| `next[].fraction` | text | Fraktionens id, till exempel `rest`, `mat`, `plast`. |
| `next[].name` | text | Fraktionens namn, till exempel `Plastförpackningar`. |
| `next[].color` | text | Färg som hex, till exempel `#A8431F`. |
| `next[].date` | `"YYYY-MM-DD"` | Datum för nästa hämtning. |
| `next[].daysUntil` | heltal | Dagar från `today`. `0` är i dag. |
| `next[].isToday`, `isTomorrow` | bool | Hämtning i dag respektive i morgon. |
| `next[].estimated` | bool | `true` när datumet är framräknat och inte bekräftat av källan. Visa det gärna som "ca" eller "beräknat". |
| `next[].warning` | text eller `null` | Varning, till exempel att hämtningen infaller på en helgdag. |
| `next[].text` | text | Färdig svensk text, att visa som den är. |
| `summary` | text | En rad för nästa hämtning (`Inga kommande hämtningar` när `next` är tom), till exempel `Plast & metall – om 4 dagar`. Passar som sensorns tillstånd. |
| `events` | lista | Alla kommande hämtningar (i dag eller senare), sorterade på datum. Varje post har `date`, `fractions` (lista med id), `estimated`, `deviation`, `warning` och `labels`. |
| `events[].deviation` | objekt eller `null` | Avvikelse från ordinarie dag: `{ "originalDate": "YYYY-MM-DD" eller null, "reason": "…" }`. |
| `events[].labels` | objekt | Källans egen text per fraktions-id, till exempel `{"karl": "Fyrfack 1"}`. `{}` när det saknas. |
| `bins` | lista | Kärl/abonnemang: `fraction`, `sizeLiters`, `pickupsPerYear`, `frequencyText` (alla utom `fraction` kan vara `null`). Tom för många källor. |
| `fractions` | objekt | Id → `name`, `short`, `color`, `icon` för de fraktioner som förekommer i svaret. |
| `links.ics` | URL | Kalenderprenumeration (iCalendar). |
| `links.web` | URL | Adressens sida på sajten. |
| `updatedAt` | `"YYYY-MM-DD"` | Datum då schemat senast hämtades eller uppdaterades hos källan. |

`today` är referensdatumet. Behöver du egen logik, till exempel "påminn två dagar innan", räknar du själv ur `events` och `today`.

Fraktions-id är en öppen mängd. De som finns i dag är `rest`, `mat`, `papper`, `plast`, `glas`, `metall`, `tidningar` och `karl` (kärl med flera fraktioner), men fler kan tillkomma. Visa okända id med `name` ur `fractions` (eller id:t självt) i stället för att krascha.

## Stabilitet i v1

- Fält får läggas till. Befintliga fält tas aldrig bort, byter aldrig namn och byter aldrig betydelse.
- Fraktions-id (`rest`, `mat`, `papper`, `plast`, `glas`, `metall`, `tidningar`, `karl`) är fasta. Nya kan tillkomma, och konsumenter ska klara okända id.
- Fält utan värde skickas som `null`, så att sökvägar i mallar och flödeskort är förutsägbara.
- Ett brytande byte blir `v2` bredvid `v1`.

Adress-id och källans id är stabila, så det är säkert att spara dem.

## Hur ofta ska man fråga?

**Högst en gång i timmen per adress.** Schemat ändras sällan, och tjänsten drivs utan kostnad av en privatperson.

- Svaret för en adress cachas i högst sex timmar, och cachen slutar alltid vid midnatt svensk tid. Därför är `today`, `daysUntil`, `isToday` och `isTomorrow` aldrig inaktuella på grund av cachen.
- Mellan två frågor räknar du själv: för "dagar kvar" är det säkrast att jämföra `date` med dagens datum lokalt (se Home Assistant-exemplet).
- **502** betyder att källan inte svarar. Behåll det senast lyckade svaret och försök igen vid nästa intervall. Visa inte fel för användaren för en enstaka miss.
- Vid **400** och **404** hjälper det inte att försöka igen. Det är ett fel i anropet eller en adress som inte finns.

### CORS

Alla svar har `Access-Control-Allow-Origin: *`. Ett vanligt `GET` kräver ingen preflight, så det går bra att anropa API:t direkt från webbläsaren, till exempel från ett eget dashboard-kort i Home Assistant. `OPTIONS` ger `204` med bara `Access-Control-Allow-Origin: *`.

## Home Assistant

Verifierat mot Home Assistants dokumentation för [RESTful](https://www.home-assistant.io/integrations/rest/), [Template](https://www.home-assistant.io/integrations/template/) och automationer. Byt ut adressen mot din egen.

### REST-sensor

`summary` blir sensorns tillstånd och `next` blir ett attribut med nästa hämtning per fraktion. Lägg i `configuration.yaml`:

```yaml
rest:
  - resource: https://sopor.hardyson.se/api/v1/adress/uppsala/storgatan-2_uppsala-4004688
    scan_interval: 3600   # sekunder: högst en gång i timmen
    sensor:
      - name: "Sophämtning"
        unique_id: sopor_storgatan_2
        value_template: >
          {{ value_json.summary
             if value_json is defined and value_json.summary is defined
             else this.state }}
        json_attributes:
          - today
          - next
```

Sensorn heter `sensor.sophamtning`, med tillståndet `Plast & metall – om 4 dagar` och attributen `today` och `next`. Ta inte med `events` som attribut. Det är en lång lista, och Home Assistant sparar bara attribut upp till 16 kB.

**Vid fel.** Det här följer av Home Assistants källkod (`homeassistant/components/rest/data.py`) och dokumentation:

- Nätverksfel och timeout ger `unavailable` (dokumentationen anger det för timeout, och i koden nollas svaret).
- Ett svar med felstatus, till exempel Soporas `502`, kastas **inte** bort. Svarskroppen (felet i JSON-form) skickas till mallen som vanligt. En enkel `{{ value_json.summary }}` ger då inget användbart tillstånd.
- Mallen ovan faller därför tillbaka på `this.state` (sensorns förra tillstånd, `this` finns i REST-sensorns mallar enligt dokumentationen) när svaret saknar `summary`. Då ska det senaste lyckade tillståndet bestå vid 502 (mallen är inte provkörd i en riktig Home Assistant). Vid nätverksfel blir sensorn ändå `unavailable` tills nästa lyckade hämtning.
- Attributen (`today`, `next`) kan försvinna eller nollställas under ett felsvar. Det har inte verifierats. Mallsensorn och automationen nedan har `or []` och blir då `unavailable` respektive skickar ingen notis, så inget går sönder.

Är svaret ett tomt schema är tillståndet `Inga kommande hämtningar` och `next` är `[]`.

### Mallsensor: dagar kvar för en fraktion

`daysUntil` i svaret är räknat vid hämtningen och kan vara en timme gammalt. Räkna därför om från `date`. Den här sensorn visar dagar till nästa restavfall:

```yaml
template:
  - sensor:
      - name: "Dagar till restavfall"
        unique_id: sopor_dagar_rest
        unit_of_measurement: "d"
        availability: >
          {{ (state_attr('sensor.sophamtning', 'next') or [])
             | selectattr('fraction', 'eq', 'rest') | list | count > 0 }}
        state: >
          {% set n = (state_attr('sensor.sophamtning', 'next') or [])
             | selectattr('fraction', 'eq', 'rest') | first %}
          {{ (strptime(n.date, '%Y-%m-%d').date() - now().date()).days }}
```

Byt `rest` mot `mat`, `papper`, `plast`, `glas`, `metall` eller `tidningar`. Har adressen inte fraktionen, eller inga hämtningar väntar (`next` är `[]`), blir sensorn `unavailable`.

### Automation: notis kl. 19 kvällen innan

Skickar en notis när någon fraktion hämtas i morgon:

```yaml
automation:
  - alias: "Sopor: ställ ut kärlen"
    triggers:
      - trigger: time
        at: "19:00:00"
    conditions:
      - condition: template
        value_template: >
          {{ (state_attr('sensor.sophamtning', 'next') or [])
             | selectattr('isTomorrow') | list | count > 0 }}
    actions:
      - action: notify.mobile_app_min_telefon   # byt mot din notify-tjänst
        data:
          title: "Sophämtning i morgon"
          message: >
            {{ (state_attr('sensor.sophamtning', 'next') or [])
               | selectattr('isTomorrow') | map(attribute='name') | join(', ') }}
```

Villkoret går på `isTomorrow` i alla poster, inte bara `next[0]`. Första posten är den tidigaste hämtningen, och det kan vara dagens.

## Homey

**Appen Sophämtning** för Homey Pro är under utveckling i [`integrations/homey/`](../integrations/homey/). Med den lägger man till adressen genom att söka, och får färdiga flödeskort och en widget utan egen kod. Den är inte publicerad i Homey App Store än, så den går bara att installera med Homeys CLI (se [README](../README.md#homey-integrationshomey)). Tills den är publicerad fungerar receptet nedan.

### Med HomeyScript

Homey har inget inbyggt flödeskort som hämtar JSON från en URL och plockar ut ett fält. Appen "HTTP request flow cards" ska enligt användare på Homeys forum inte fungera på nyare Homey Pro. Det enklaste som fungerar är appen **HomeyScript** (gratis från Homey App Store, för Homey Pro, Homey Pro mini, Homey Cloud och Self-Hosted Server).

HomeyScripts flödeskort heter enligt appens sida bland annat *Run Code and return Yes/No-tag*, *Run Code and return Text-tag* och *Run Code and return Number-tag*. Namnen kan vara översatta i din app.

Ett flöde som varje kväll kl. 19 säger till om det hämtas något i morgon:

1. **När:** ett tidskort som startar flödet varje dag kl. 19:00.
2. **Då:** HomeyScript, *Run Code and return Yes/No-tag*, med koden:

   ```js
   const res = await fetch('https://sopor.hardyson.se/api/v1/adress/uppsala/storgatan-2_uppsala-4004688');
   if (!res.ok) throw new Error('Sopor svarade ' + res.status);
   const data = await res.json();
   return data.next.some((n) => n.isTomorrow);
   ```

3. **Då:** skicka en notis, med ett villkor som kräver att taggen från skriptet är *Ja*.

Vill du ha namnen i notisen kör du i stället *Run Code and return Text-tag* och returnerar:

```js
return data.next.filter((n) => n.isTomorrow).map((n) => n.name).join(', ');
```

Samma sökväg som i Home Assistant: `next[].isTomorrow`. Använd `.some(…)` och inte bara `next[0].isTomorrow`. Första posten är den tidigaste hämtningen, och det kan vara dagens, så hämtas något i dag och något annat i morgon missar du i morgon-hämtningen. Skriptet kör bara en gång per dag här, vilket håller dig långt under gränsen på en fråga i timmen.

Flödeskort som tar emot JSON-text och pekar ut ett fält med JSON-sökväg finns i community-appar. Kontrollera själv att en sådan app fungerar på just din Homey innan du bygger på den.

## Bygga en integration

Ett förslag på arbetsgång för en integration eller app:

1. **Vid installation:** låt användaren skriva en adress. Anropa `/api/v1/sok?q=<text>` (och gärna `kalla` om du vet källan). Visa träffarna (`street`, `locality`, `detail`) och låt användaren välja. Kräv husnummer i fältet, annars kan listan bli tom.
2. **Spara `url`** från den valda träffen (eller `source` och `id`). Id:n är stabila, och du ska inte tolka eller bygga om dem.
3. **Hämta** adressens `url` högst en gång i timmen. Cacha senaste lyckade svar. Vid 502, nätfel eller timeout behåller du det och försöker igen senare.
4. **Visa** `summary` eller `next[].text` för människor. Använd `color` och `fractions[id].icon` om du vill ha fraktionens utseende.
5. **Klara okända fraktions-id.** Slå upp `fractions[id]` och använd `name`, annars id:t. Kasta inte bort poster du inte känner igen.
6. **Räkna själv** när du behöver mer än `next`: gå igenom `events` (sorterad på `date`) och jämför med `today`. Respektera `estimated` (datumet är beräknat, inte bekräftat) och `warning`.
7. **Ignorera fält du inte känner till.** Nya fält kan tillkomma inom v1.

Vill du hellre prenumerera än fråga finns kalenderlänken i `links.ics`. Den fungerar i Google Kalender, Apple Kalender och de flesta andra appar.

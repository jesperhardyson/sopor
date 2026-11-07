# Sopor API v1

Ett öppet, inofficiellt API för sophämtning per adress. Det är samma data som sajten [sopor.hardyson.se](https://sopor.hardyson.se) visar, tänkt för Home Assistant, Homey och egna integrationer.

- Bas-URL: `https://sopor.hardyson.se/api/v1`
- Bara `GET`. Svaren är JSON. Inga nycklar och ingen inloggning.
- Alla JSON-svar från endpoints har `"apiVersion": "1"`. Alla svar har `Access-Control-Allow-Origin: *`.
- Maskinläsbar beskrivning: [`openapi.json`](https://sopor.hardyson.se/api/v1/openapi.json) (OpenAPI 3.1).
- Interaktiv dokumentation, där man kan prova anropen: [sopor.hardyson.se/api/v1/docs](https://sopor.hardyson.se/api/v1/docs).

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

- Skriv med **husnummer** (`storgatan 2`) eller ange **`kalla`**. Utan husnummer och utan `kalla` kan svaret bli en tom lista om gatan inte finns i Sopors gatuindex. Tom lista betyder alltså inte alltid att adressen saknas.
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

Adresssökning, se [Kom igång](#alternativ-2-sök-med-api). Högst tio träffar per källa. Ort eller kommun får stå efter gatan (`storgatan 2 uppsala` eller `storgatan 2, uppsala`): källorna söker då på gatan och träffarna filtreras på början av orten eller kommunen.

Den bästa träffen står först: exakt gata och husnummer före nummer som bara börjar likadant, och exakt ort före ort som börjar likadant. Nämner frågan en plats frågas bara källorna som täcker den, och svarar de utan träffar frågas övriga källor. Utan plats och utan `kalla` väntar sökningen högst cirka 2 sekunder: källor som inte hunnit svara står i `failed`, och du kan fråga dem igen med `kalla`.

### `GET /api/v1/omraden`

Områdena hos källor med områdesval, till exempel Avesta och Säter. Använd den när en adress inte hittas och användaren har angett en ort: användaren väljer då själv område. Sopor gissar aldrig vilket område en adress hör till.

```bash
curl 'https://sopor.hardyson.se/api/v1/omraden?plats=Avesta'
```

- `plats` är kommunens namn, med eller utan "kommun", eller en ort i kommunen. Minst två tecken.
- Svaret har samma form som `/sok`, och varje område har `selection: "area"` och `notice`, som ska visas innan användaren väljer. `areasUrl` är webbsidan som visar vilka platser som ingår i områdena och vem man kan fråga. Länka gärna dit, för Sopor vet inte vilket område en adress hör till. Fältet finns också på träffarna från `/sok` och är `null` för en vanlig adress.
- En plats utan områdesval ger en tom lista.

Vet användaren inte sitt område kan du fråga när kärlet senast tömdes och skicka datumet som `tomning`:

```bash
curl 'https://sopor.hardyson.se/api/v1/omraden?plats=Avesta&tomning=2026-10-27'
```

Svaret innehåller då bara områden med hämtning det datumet. Utan `tomning` är svaret oförändrat.

- `tomning` har formen `YYYY-MM-DD`. Ett ogiltigt datum eller ett datum efter dagens datum i `Europe/Stockholm` ger `400 bad_request`.
- Varje träff får `pickups`, till exempel `{ "previous": ["2026-10-13", "2026-10-27"], "next": "2026-11-10" }`. Datumen räknas från `tomning`, inte från i dag: `previous` är högst två tömningar med det angivna datumet sist, och `next` är tömningen efter det. `next` kan alltså redan ha passerat, och den är `null` om schemat inte har fler datum.
- Svaret får `dateCovered`, som säger vad en tom lista betyder:
  - `true`: datumet ligger inom schemats period, så inget område har hämtning den dagen.
  - `false`: alla källor svarade, och datumet ligger utanför schemat.
  - `null`: datumet gick inte att bedöma, eftersom platsen saknar områdesval eller en källa inte svarade (se `failed`).
- Flera områden kan ha hämtning samma dag, och då kommer alla med. Låt användaren välja.

Sopor bygger svaret på datumet användaren anger och vet fortfarande inte vilket område en adress hör till. En försenad tömning kan ge fel område, så visa det, visa `notice` och låt användaren bekräfta valet. `pickups` går bra att visa som kontroll: "Tömningar 13 okt och 27 okt. Nästa är 10 nov. Stämmer det?"

### `GET /api/v1/kallor`

Alla synliga källor (id, namn, vilka kommuner de täcker) och alla kända fraktioner med namn, färg och ikon. Cachas i ett dygn. Bra för att bygga en källväljare.

```bash
curl 'https://sopor.hardyson.se/api/v1/kallor'
```

Varje källa har `contact`: hur man når källans kundtjänst, eller `null` när inget är känt. Visa det gärna där användaren undrar vem som ansvarar för hämtningen.

```json
"contact": {
  "phone": { "number": "+46187279400", "display": "018-727 94 00" },
  "email": "kundservice@uppsalavatten.se",
  "page": "https://www.uppsalavatten.se/kontakt",
  "checkedAt": "2026-11-07",
  "checkedUrl": "https://www.uppsalavatten.se/kontakt"
}
```

- `phone.number` är i E.164 och passar i en `tel:`-länk. `phone.display` är till för att visa.
- `phone`, `email` och `page` kan var och en vara `null`, men minst en har ett värde. `email` går till kundtjänst, aldrig till en person.
- Uppgifterna kommer från källans egen webbplats: `checkedUrl` är sidan där de står, och `checkedAt` är dagen de senast kontrollerades.

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

**Enklast är integrationen Sophämtning**, som installeras via HACS. Den ger sensorer per avfallstyp, en kalender och en händelse när schemat ändras. Se [installationen](../integrations/home-assistant/README.md#installation-via-hacs).

### Utan kod: Remote Calendar

Home Assistants inbyggda integration Remote Calendar (*Inställningar → Enheter och tjänster → Lägg till integration → Remote Calendar*) kan prenumerera på schemat. Fyll i ett namn och kalenderlänken, alltså adressens `links.ics` från API:t (samma som ICS-länken på sajten), till exempel `https://sopor.hardyson.se/ics/uppsala/storgatan-2_uppsala-4004688.ics`.

Kalendern får heldagshändelser med titlar som `Sopor: Plastförpackningar + Metall` och `Sopor: Plastförpackningar + Glas (beräknat)`. Den fungerar med samma kalendertrigger och förskjutning som i [integrationen](../integrations/home-assistant/README.md#automation-kvällen-innan-kl-18).

### Eget: REST-sensor

Vill du bygga själv kan en REST-sensor läsa adressen direkt. `summary` blir tillståndet och `next` ett attribut med nästa hämtning per fraktion. I `configuration.yaml`:

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

- Mallen behåller förra tillståndet när svaret saknar `summary`, till exempel vid `502`. Vid nätverksfel blir sensorn `unavailable` tills nästa lyckade hämtning.
- Ta inte med `events` som attribut. Det är en lång lista, och Home Assistant sparar bara attribut upp till 16 kB.

En notis kvällen innan, när någon fraktion hämtas i morgon:

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

Titta på `isTomorrow` i alla poster, inte bara `next[0]`. Första posten är den tidigaste hämtningen, och det kan vara dagens.

## Homey

**Enklast är appen Sophämtning**, som finns som testversion i Homey App Store. Den ger enheter per adress och sopkärl, flödeskort och en widget utan egen kod. Se [appens README](../integrations/homey/README.md).

### Eget: HomeyScript

Vill du bygga själv går det med appen **HomeyScript**. Ett flöde som varje kväll kl. 19 säger till om det hämtas något i morgon:

1. **När:** ett tidskort som startar flödet varje dag kl. 19:00.
2. **Då:** HomeyScript, *Run Code and return Yes/No-tag* (namnet kan vara översatt i din app), med koden:

   ```js
   const res = await fetch('https://sopor.hardyson.se/api/v1/adress/uppsala/storgatan-2_uppsala-4004688');
   if (!res.ok) throw new Error('Sopor svarade ' + res.status);
   const data = await res.json();
   return data.next.some((n) => n.isTomorrow);
   ```

3. **Då:** skicka en notis, med ett villkor som kräver att taggen från skriptet är *Ja*.

Vill du ha namnen i notisen kör du i stället *Run Code and return Text-tag* och returnerar `data.next.filter((n) => n.isTomorrow).map((n) => n.name).join(', ')`.

Som i Home Assistant: titta på `isTomorrow` i alla poster, inte bara `next[0]`.

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

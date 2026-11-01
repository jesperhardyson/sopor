# Spec: Kärl som egna enheter i Homey-appen

Status: utkast, 2026-11-01. Bygger på `2026-10-31-sopor-homey-app.md` (appen 1.0.0).

## Bakgrund

Appen har en enhet per adress. Den visar alla avfallstyper och har alla flödeskort. Det räcker för påminnelser, men tre saker går inte:

- **Ett kärl i dashboarden.** Man kan inte ha en ruta för "Matavfall" i zonen "Uppfarten".
- **Enkla flöden per kärl.** Varje kort kräver att man väljer avfallstyp i en lista.
- **Tillstånd per kärl.** Det går inte att markera att kärlet är utställt och bygga "påminn igen kl. 21 om det inte är utställt".

Sopor vet bara vilka avfallstyper en adress har, inte vilka fysiska kärl som finns. Ett fyrfackskärl rymmer flera avfallstyper, och två hushåll med samma källa kan ha olika kärl. Därför skapar appen inte kärl automatiskt. **Användaren lägger själv till ett kärl och väljer vilka avfallstyper det rymmer.**

## Beslut

- Adressenheten finns kvar som förut, och ingenting i den ändras för användaren. Kärl är ett tillval ovanpå adressen.
- Ett kärl hämtar ingenting själv. Det läser adressens sparade schema, så antalet anrop mot API:t ökar inte.
- Ett kärl har inga egna tider. Påminnelsetid och morgontid läses från adressen, så att samma sak inte ställs in på flera ställen.
- I texterna heter det **sopkärl** eller **kärl**, och verbet är **töms**. "Sopkärl" gör att korten hittas när man söker på "sop" i kortväljaren.
- Texterna finns på svenska och engelska, som resten av appen (`lib/texts.mts`).

## Utanför

- Kärl i widgeten "Nästa hämtning".
- Insights och Timeline för "utställt".
- En trigger för "ta in kärlet" efter tömningen (se Senare).
- Att flytta ett kärl till en annan adress. Man tar bort det och lägger till ett nytt.

## Enhet: ett kärl

- **Drivrutin:** `karl`, klass `other`. Namnet är "Sopkärl" (engelska "Waste bin").
- **Data:** `data: { id: "<källa>/<adress-id>/<slump>" }`. `<slump>` är 8 tecken a–z0–9 och skapas vid parningen. Samma adress kan ha flera kärl, även två med samma avfallstyp (till exempel två restavfallskärl).
- **Store:** `address: "<källa>/<adress-id>"` (adressenhetens `data.id`), `fractions: string[]` (de valda avfallstyperna) och `putOutFor: "YYYY-MM-DD" | null` (se Utställt).
- **Namn vid parning:** det användaren skriver. Förslaget är de valda avfallstypernas korta namn, till exempel "Plast & metall" (samma sammanfogning som `sopor_summary`).
- **Ikon:** väljs vid parningen och skickas som `icon` till `Homey.createDevice`. Se Ikoner och bilder.

### Capabilities

| Capability | Typ | Visar |
|---|---|---|
| `sopor_next` | string, sensor | "Nästa tömning": till exempel "i morgon" eller "om 4 dagar, ons 4 nov". Samma text som adressens rader, men för kärlets avfallstyper. Titeln sätts med `capabilitiesOptions`. |
| `sopor_days` | number (d), sensor | "Dagar kvar" till nästa tömning. Tom när inget väntar. |
| `sopor_utstallt` | boolean, setable | "Utställt". Ny egen capability med `uiComponent: "toggle"` och `uiQuickAction: true`. Ett tryck på rutan i dashboarden växlar värdet. |

`sopor_utstallt` är den enda booleska capabilityn och blir därför rutans tillstånd. `uiState` behövs inte, och det kräver dessutom Homey 13.5.0, medan appen stöder 12.3.0.

Snabbknappen gäller inte bara dashboards: ett tryck på enhetens ruta i Homey-appens zonvy växlar också "Utställt", och ett långt tryck öppnar enheten. Ett feltryck kostar lite, eftersom värdet återställs av sig självt (se Utställt).

En tömning räknas för kärlet när minst en av dess avfallstyper finns i händelsen. Ett fyrfackskärl med rest och mat töms alltså när någon av dem hämtas.

### Koppling till adressen

- Kärlet hittar sin adress genom att leta bland drivrutinen `adress` enheter efter `data.id === store.address`. Det letar varje gång, så kopplingen överlever omstarter och att adressen tas bort och läggs till igen.
- Kärlet använder adressens **ofiltrerade** schema. Dolda avfallstyper på adressen gäller inte kärlet, eftersom användaren har valt kärlets avfallstyper själv.
- Adressenheten skickar händelsen `schedule` (EventEmitter, som `Homey.Device` redan är) efter varje lyckad hämtning. Kärlen lyssnar och ritar om direkt.
- Kärlet räknar dessutom om var 15:e minut, som adressen, så att "i dag" byts strax efter midnatt.

### Fel

- **Adressen saknas** (borttagen): kärlet blir otillgängligt med texten "Adressen är borttagen. Lägg till den igen eller ta bort kärlet."
- **Adressen har inget schema än:** kärlet blir otillgängligt med samma text som adressen ("Väntar på hämtschemat").
- **Adressen är otillgänglig (404):** kärlet blir otillgängligt med adressens text.
- När adressen fungerar igen blir kärlet tillgängligt vid nästa omräkning.

### Inställningar

- Gruppen **Avfallstyper i kärlet**, med en kryssruta `ingar_<id>` per känd avfallstyp (samma lista som adressens `visa_<id>`). De sätts vid parningen.
- Avfallstyper som appen inte känner till finns bara i `store.fractions`. De kan inte ändras i efterhand, eftersom Homeys inställningar är statiska. De följer med tills kärlet tas bort.
- Kärlets avfallstyper är de ikryssade kända typerna plus de okända i `store.fractions`. Måste minst en vara vald, annars avvisas inställningen med "Välj minst en avfallstyp."

## Utställt

- Användaren slår på "Utställt" i appen, med kortet "Markera sopkärlet som utställt" eller med rutans snabbknapp.
- Vid påslag sparas `putOutFor`: kärlets nästa tömning räknat från i dag. Saknas en kommande tömning sparas dagens datum.
- **Återställning:** när `today > putOutFor` slås "Utställt" av, och `putOutFor` blir `null`. Det sker i den vanliga omräkningen, alltså strax efter midnatt efter tömningsdagen.
- Att slå av sätter `putOutFor` till `null`.

Exempel: tömning onsdag. Man ställer ut tisdag kväll, då sparas onsdagens datum. Natten mot torsdag slås "Utställt" av, och kortet "är inte utställt" fungerar igen inför nästa tömning.

Tömningen sker oftast på förmiddagen. Att "Utställt" ligger kvar resten av tömningsdagen gör det möjligt att få en påminnelse om att ta in kärlet, utan något extra kort: "Klockan är 16:00 → Och sopkärlet töms i dag → Och sopkärlet är utställt → Skicka notis 'Ta in kärlet'". Den som tar in kärlet slår av "Utställt", och då går notisen inte.

## Parning

Inga systemvyer behövs. Två egna vyer, och enheten skapas med `Homey.createDevice` i den sista.

1. **Vy `adress`:** "Vilken adress står kärlet vid?" och en knapp per adressenhet (enhetens namn).
   - Finns ingen adressenhet: "Lägg först till din adress med enheten Adress." Ingen knapp går vidare.
   - Finns bara en går vyn vidare direkt.
   - Saknar adressen schema: "Adressen har inte hämtat schemat än. Försök igen om en stund."
2. **Vy `fraktioner`:** "Vad slängs i kärlet?" och en kryssruta per avfallstyp som adressen har, i schemats ordning. Under dem kommer fältet "Namn", som fylls med förslaget och uppdateras tills användaren skriver i det själv. Knappen "Lägg till" är avstängd tills minst en avfallstyp är vald.
      - Under avfallstyperna finns **Ikon**: ett rutnät med kärlikonerna. Förslaget markeras och följer valen tills användaren väljer en ikon själv (se Ikoner och bilder).
   - Vyn hämtar valen med `Homey.emit('fractions', addressId)` och får enheten med `Homey.emit('device', { addressId, fractions, name, icon })`. Drivrutinen bygger `data`, `store`, `settings` och `icon`, och vyn anropar `Homey.createDevice` och sedan `Homey.done()`.

Vyerna är ritade på sidan "Homey · Sopkärl" i `sopor-design.pen`. Där det går används Homeys egna klasser (`homey-form-checkbox`, `homey-form-input`, `homey-button-primary-full`), som i adressens sökvy. Adressknapparna och ikonvalet är egna.

## Ikoner och bilder

Designen finns på sidan "Homey · Sopkärl" i `sopor-design.pen`.

- **Enhetsikoner:** samma linjeritade kärl som adressens drivrutinsikon, med avfallstypens symbol mitt på kärlets framsida. Det finns nio: standard (utan symbol), rest (sopsäck), mat (äpple), papper (kartong), plast (PET-flaska med räfflor), glas (flaska och burk), metall (burk), tidningar och flerfack. Flerfack har en mittlinje och fyra små symboler.
  - Symbolerna är egna linjeritningar i Lucides stil (24-rutnät, runda ändar), inte Lucide-ikonerna i `FractionIcon`. Lucides `cup-soda`, `wine` och `cylinder` var för otydliga för plast, glas och metall.
  - Filer: `drivers/karl/assets/icon.svg` (standard) och `drivers/karl/assets/icons/<id>.svg`. SVG 960×960 med linjer och transparent bakgrund, enligt Homeys riktlinjer. Homey färgar ikonen själv, så den kan inte ha avfallstypens färg.
  - **Förslaget:** en enda känd avfallstyp ger dess ikon. Flera avfallstyper, eller `karl`, ger flerfack. Annars blir det standardikonen.
  - Ikonen sparas när enheten skapas. Den kan inte bytas i kärlets inställningar. Vill man byta tar man bort kärlet och lägger till det igen.
- **Drivrutinsbild** (`small`, `large`, `xlarge`): det gröna kärlet från adressens bild, med en vit etikett med fyra avfallsikoner i färg. Den skiljer drivrutinen "Sopkärl" från "Adress" i listan när man lägger till en enhet.
- **Capability-ikon** för `sopor_utstallt`: kärlet med en bock (`assets/sopor_utstallt.svg`).

## Flödeskort

Alla är enhetskort med filtret `driver_id=karl`. Id börjar med `karl_`, så de krockar inte med adressens kort. Inget kort har ett fält för avfallstyp: det är kärlets avfallstyper som gäller.

- **Trigger `karl_toms_i_morgon`:** "Sopkärlet töms i morgon". Går vid adressens påminnelsetid om kärlet töms dagen efter. Senast utlöst dag sparas i kärlets `store`, som för adressen.
  - Tokens: `fraktioner` (de av kärlets avfallstyper som hämtas, med komma emellan) och `datum` (till exempel "tors 5 nov").
- **Trigger `karl_toms_i_dag`:** "Sopkärlet töms i dag". Går vid adressens morgontid på tömningsdagen. Samma tokens.
- **Trigger `karl_stalldes_ut`:** "Sopkärlet ställdes ut". Går när "Utställt" slås på, oavsett hur.
- **Villkor `karl_toms`:** "Sopkärlet töms !{{|inte}} [[nar]]", där `nar` är i dag, i morgon eller i övermorgon (som adressens `hamtas`).
- **Villkor `karl_utstallt`:** "Sopkärlet är !{{|inte}} utställt".
- **Handling `karl_satt_utstallt`:** "Markera sopkärlet som [[lage]]", där `lage` är utställt eller intaget.

Typiskt flöde: "Klockan är 21:00 → Och sopkärlet töms i morgon → Och sopkärlet är inte utställt → Skicka notis 'Ställ ut matavfallet'".

Homey skapar egna kort för `sopor_utstallt` eftersom den är setable. Med `"insightsTitleTrue"`/`"insightsTitleFalse"` och en titel på båda språken blir de begripliga, men de egna korten ovan är de som beskrivs i README.

## Kod

- **`lib/bin.mts`** (ren logik, Vitest):
  - `binSchedule(schedule, fractions)`: schemat med bara kärlets avfallstyper (använder `withoutFractions` med komplementet).
  - `putOutDate(schedule, today)`: datumet som sparas i `putOutFor`.
  - `shouldReset(putOutFor, today)`.
  - `suggestedName(schedule, fractions, lang)`.
  - `binId(random)` för `data.id`, med den slumpade delen inskickad.
- **`drivers/karl/`**: `driver.mts` (parning och kort), `device.mts` (koppling, omräkning, utställt, triggrar) och `pair/adress.html`, `pair/fraktioner.html`. Klasserna hålls tunna, som för adressen.
- **`drivers/adress/device.mts`**: `this.emit('schedule')` efter lyckad hämtning, och en getter `storedSchedule` för det ofiltrerade schemat. Påminnelselogiken (`REMINDERS`, `reminderDue`) delas med kärlet i stället för att kopieras.
- **`.homeycompose/capabilities/sopor_utstallt.json`** med ikon i `assets/`.
- **Bilder och ikoner:** exporteras från sidan "Homey · Sopkärl" (se Ikoner och bilder). `lib/bin.mts` får också `suggestedIcon(fractions)`.

## Tester

- `lib/bin.test.mts`: filtrering, tömning när en av flera avfallstyper hämtas, `putOutDate` med och utan kommande tömning, återställning dagen efter tömningen men inte samma dag, namnförslag på båda språken och ikonförslag.
- Drivrutinen och enheten testas inte direkt, som för adressen.
- Provkörning på Homey Pro: para adress och två kärl, slå på "Utställt" från rutan, kontrollera att det slås av natten efter tömningen, ta bort och lägg tillbaka adressen.

## Release

En minor-version (1.1.0) med `npm run release`. Changeloggen säger att man nu kan lägga till kärl, och att adressenheten fungerar som förut.

## Öppna frågor

1. **Små storlekar.** Flerfacksikonens fyra symboler kan bli otydliga i Homeys minsta ikonstorlek. Det provas på riktig Homey, och vid behov får flerfack en enda symbol.

## Senare

- Trigger "Sopkärlet har tömts" vid en inställd tid på tömningsdagen. Flödet med "töms i dag" och "är utställt" räcker tills någon saknar den.
- Kärl i widgeten, eller en egen widget per kärl.
- Insights för "Utställt".

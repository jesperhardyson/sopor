# Spec: Meddelanden från källorna

Status: utkast, 2026-11-17.

## Bakgrund

Avesta Vatten och Avfall svarade 2026-11-17 att de lägger om körlistor och hämtrutter under hösten 2026, i samband med att kärl för förpackningar ställs ut. Schemat Sopor visar för Avesta kan därför bli fel inom några veckor, och det finns inget API eller öppna data att hämta det nya ifrån. Säter har ett liknande läge: schemat räcker bara till vecka 53 2026.

Användarna behöver få veta sådant där de ser schemat: på sajten, i appen Sophämtning och på sikt i Home Assistant och Homey. I dag finns bara fasta texter per källa (`areaNotice`, `emptyScheduleNote`) och inget sätt att lägga ut ett tillfälligt besked.

## Mål

- En källa kan ha tillfälliga meddelanden med rubrik, text, valfri länk och ett giltighetsintervall.
- Meddelandena visas på sajten, följer med i API:t och i kalenderfilen och visas i appen Sophämtning.
- Appen knuffar användaren en gång per nytt meddelande med en lokal notis.
- Det första meddelandet gäller Avesta och ruttomläggningen.

## Inte mål

- Home Assistant och Homey. De läser `notice` bara när adressen läggs till, så de behöver egna ändringar. Det blir ett issue som läggs när appen är klar (se Uppföljning).
- Meddelanden som bara gäller vissa kommuner eller områden hos en källa. Hela källan räcker för de fall vi har.
- Redigering utan deploy, pushnotiser från servern och automatisk hämtning av meddelanden från källornas webbplatser.

## Får inte hända

- Befintliga klienter går sönder. API-ändringen lägger bara till fält, och inga befintliga fält ändrar form eller betydelse.
- Ett gammalt meddelande ligger kvar. Slutdatum krävs.
- Appen tjatar. Högst en notis per meddelande och enhet, oavsett hur många sparade adresser som hör till källan.

## Tillvägagångssätt

Övervägda:

- **A. Fält på källan i `src/sources/index.ts` (valt).** Samma mönster som `contact` och `areaNotice`. Tester kan validera varje meddelande, och byggd data, sajt och API läser från samma ställe. Ett nytt meddelande kräver en commit och en deploy.
- **B. En datafil, `public/data/meddelanden.json`.** Lättare för någon som inte rör koden, men kräver ändå deploy och tappar typkontrollen.
- **C. Lagring utanför koden (Vercel Edge Config eller Supabase).** Ingen deploy behövs, men det blir ett nytt beroende för något som händer några gånger om året, och det bryter mot målet om noll löpande drift. Värt först om andra än Jesper ska skriva meddelanden.

Jesper valde A.

## Datamodellen

`Source` i `src/sources/index.ts` får ett valfritt fält:

```ts
/** Ett tillfälligt besked från källan, t.ex. att rutterna läggs om. Skrivs för hand. */
export interface SourceMessage {
  /** Unikt och oföränderligt inom källan. Klienter minns vilka id:n de har visat. */
  id: string
  title: string
  text: string
  /** Källans egen sida om saken, om den finns. */
  url?: string
  /** Första och sista dagen meddelandet visas, YYYY-MM-DD, båda inklusive. */
  validFrom: string
  validTo: string
}

messages?: SourceMessage[]
```

Regler, som testas för alla källor:

- `id` matchar `^[a-z0-9-]+$` och är unikt inom källan. Det får aldrig återanvändas för ett annat besked, eftersom appen då tror att användaren redan sett det. Förslag på form: `<ämne>-<år>`, t.ex. `nya-rutter-2026`.
- `validFrom <= validTo`, och `validTo` ligger högst 183 dagar efter `validFrom`. Behövs mer förlängs meddelandet med ett nytt `validTo`, vilket är ett medvetet beslut.
- `url` är `https` och ligger på källans egen domän eller en underdomän till den, som för `contact`.
- `title` högst 60 tecken, `text` högst 400 tecken, ingen HTML eller Markdown.
- "Gäller nu" avgörs med dagens datum i `Europe/Stockholm` (`src/domain/dates.ts`): `validFrom <= idag <= validTo`.

Namnet är `messages` och inte `notices`, eftersom API:t redan har fältet `notice` (områdesvalets text) på sökträffarna. Två nästan likadana namn med olika innehåll vore förvirrande.

## API:t

Alla tre ändringarna lägger till fält. Inget befintligt fält ändras.

Ett meddelande i API:t:

```json
{
  "id": "nya-rutter-2026",
  "title": "Hämtrutterna läggs om",
  "text": "Avesta Vatten och Avfall lägger om hämtrutterna under hösten 2026 när kärlen för förpackningar ställs ut. Schemat här kan bli fel. Kontrollera dina tömningsdagar på Mina sidor hos Avesta Vatten.",
  "url": null,
  "validFrom": "2026-11-17",
  "validTo": "2027-03-31"
}
```

- `url` är `null` när den saknas, enligt API:ts löfte att fält utan värde skickas som `null`.
- `GET /api/v1/adress/{källa}/{id}`: nytt fält `messages` på toppnivå med källans meddelanden som gäller i dag. `[]` när inga gäller.
- `GET /api/v1/omraden`: nytt fält `messages` på varje post i `sources`, med de som gäller i dag.
- `GET /api/v1/kallor`: nytt fält `messages` per källa, med de som gäller i dag och de som börjar senare. Utgångna tas bort.
- Ordning: `validFrom` stigande, sedan `id`.
- OpenAPI-beskrivningen (`openapi.json`) och `docs/api.md` uppdateras. Kontraktstestet täcker ett svar med och ett utan meddelanden.
- `/sok` ändras inte.

Bakåtkompatibilitet: Home Assistant läser svaren som dictar och Homey som JSON-objekt. Båda ignorerar okända nycklar. Appens `Codable`-typer ignorerar också okända nycklar. Planen ska ha ett test per klient som avkodar ett svar med `messages` och bekräftar att inget annat ändrats.

## Kalenderfilen

`title: text` läggs till i beskrivningen (`DESCRIPTION`) för tömningar vars datum ligger inom meddelandets intervall, på samma sätt som `notice` i dag (`src/domain/ics.ts`). Regeln utgår från tömningens datum, inte dagens. Statiska källor som Avesta och Säter bygger kalenderfilen vid deploy (`scripts/build-data.ts`), så en regel som följer dagens datum skulle kräva en deploy på rätt dag. Tömningens datum stämmer också med vad meddelandet påverkar. UID och övriga fält ändras inte. `X-WR-CALDESC` ändras inte, eftersom den gäller hela kalendern.

## Sajten

- En ruta överst på adressens sida (`ResultPage`) och på områdessidan (`AreaPage`) för varje meddelande som gäller. Rubrik, text och, om `url` finns, en länk "Läs mer hos <källans namn>".
- Utseendet ska finnas i `docs/design/sopor-design.pen` innan det byggs. Finns ingen passande meddelanderuta där läggs den till i designen först, i samma stil som rutan för områdesvalet.
- Rutan går inte att stänga på sajten. Den försvinner när `validTo` har passerat.

## Appen Sophämtning

Ligger i repot `Sophamtning` (`iOS/Packages/SophamtningKit`). Byggs mot `main`, inte mot releasen 1.2.0, eftersom `main` har nya notisinställningar (#77).

- `APIClient`-typen för adresssvaret får `messages: [SourceMessage]`, avkodad med `[]` som standard när fältet saknas. Då fungerar appen även mot ett cachat svar eller ett äldre API.
- Startsidan visar ett `MessageCard` per meddelande som gäller för någon sparad adress. Samma meddelande visas en gång även om flera sparade adresser hör till källan. Kortet går att stänga, och stängda `id` sparas per källa.
- Inställningar får ett eget reglage under Notiser, "Meddelanden från källan". Det är på från början. Det kräver att notiser är tillåtna i iOS, och appen frågar aldrig om tillstånd för meddelandenas skull. Det är skilt från påminnelserna, eftersom den som stängt av påminnelserna ändå kan vilja veta att schemat blir fel.
- Varje gång appen hämtar adressernas schema (`refreshAll`, i förgrunden och i bakgrunden) jämförs meddelandenas `id` med de som appen redan har sett:
  - Ser appen ett nytt `id` medan den är öppen visas bara kortet, och `id` räknas som sett utan notis.
  - Ser den ett nytt `id` i bakgrunden skickas en lokal notis med meddelandets rubrik, om reglaget är på och notiser är tillåtna. Sedan räknas det som sett.
  - Det gäller också meddelanden som redan var ute när appuppdateringen släpptes. Varje befintlig användare får alltså antingen kortet eller en notis, aldrig båda. Den som lägger till en adress ser kortet direkt utan notis.
  - En ominstallation nollställer det sparade. Kortet kommer då tillbaka, men ingen notis skickas om appen är öppen.
- Sedda och stängda `id` sparas med källans id som nyckel, så att samma `id` hos två källor inte krockar.
- Texterna i appen följer webbens ordval.

## Det första meddelandet

Avesta, `id` `nya-rutter-2026`, `validFrom` dagen det publiceras, `validTo` `2027-03-31`. Texten ovan är ett förslag och skrivs med Sopors egna ord, inte som citat ur mejlet. `url` saknas tills Avesta Vatten har en sida om det.

Säter kan få ett meddelande om att schemat bara räcker till vecka 53, men det beslutas separat och följer bara samma regler.

## Uppföljning

När appen har släppts läggs ett issue i `sopor` för Home Assistant och Homey: visa `messages` från `/adress` som sensorattribut och ärende under Reparationer (Home Assistant), och som enhetsvarning och flow-kort "Källan har ett nytt meddelande" (Homey).

## Kvar till byggaren

- Exakt placering av rutan på sajten, enligt designen.
- Ikon och stil (`neutral` eller `warning`) för `MessageCard` i appen, enligt appens design.
- Hur jämförelsen kopplas in i `refreshAll`, och hur appen vet om den körs i förgrunden eller i bakgrunden.

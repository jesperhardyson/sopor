# Undersökning: Homey-app och Home Assistant-integration ovanpå API v1

Status: undersökning (utkast), 2026-10-31. Inget är byggt. Dokumentet ska ligga till grund för en spec per integration.

## Bakgrund

API v1 (`docs/api.md`, specen `2026-10-31-sopor-api-design.md`) byggdes för att hemautomation ska kunna läsa hämtschemat. I dag visar guiden hur man gör det för hand: en REST-sensor i YAML för Home Assistant och ett HomeyScript-flöde för Homey. Båda kräver att användaren klistrar in en adress-URL och skriver mallar eller kod. API-specen uteslöt plugins i v1. Den här undersökningen tittar på nästa steg: riktiga integrationer där användaren söker upp sin adress och sedan får färdiga enheter och flödeskort.

Källorna är Athoms utvecklardokumentation (apps.developer.homey.app), Home Assistants utvecklardokumentation (som nu ligger på contributors.home-assistant.io), HACS dokumentation och befintliga appar och integrationer på GitHub. Uppgifter som inte gick att bekräfta är markerade *(overifierat)*.

## Sammanfattning

| | Homey | Home Assistant |
|---|---|---|
| Rekommendation | Egen app, byggs först | Egen integration, senare |
| Plats | `integrations/homey/` i det här repot | Eget repo (`sopor-home-assistant`). HACS kan inte läsa en undermapp |
| Språk | TypeScript, Node 22 | Python 3.14 |
| Plattform | Bara Homey Pro (`platforms: ["local"]`) | HACS (anpassat repo, sedan HACS standardlista) |
| Modell | En enhet per adress | En config entry per adress: en datumsensor per fraktion och en kalender |
| Publicering | Homey App Store, med granskning av Athom | GitHub-releaser och HACS |
| Testmiljö | Jespers Homey Pro 2026, via `homey app run` | Lokal Home Assistant i Docker, och `pytest-homeassistant-custom-component` |

Båda integrationerna pratar bara med det publika API:t (`/api/v1/sok` och `/api/v1/adress/…`). De känner inte till källor, trakter eller EDP, och de importerar ingen kod från `src/`. Providergränsen gäller alltså även här, och API:ts stabilitetslöften i v1 är det enda kontraktet.

## Homey

### Plattform

- **Homey Pro (lokal):** fritt att publicera. Gäller Homey Pro (Early 2023), Pro mini, Pro 2026 och Self-Hosted Server. Alla kör Node.js 22 från Homey v12.9.0. <https://apps.developer.homey.app/the-basics/app>
- **Homey Cloud:** kräver ett Verified Developer-konto. Bara registrerade företag kan söka, och "only official app integrations will be approved". Sopor är inofficiellt och drivs av en privatperson, så Cloud är uteslutet. <https://apps.developer.homey.app/app-store/verified-developer>, <https://apps.developer.homey.app/guides/homey-cloud>. (SRV Sophämtning listas för Cloud på sin App Store-sida. Hur det gick till framgår inte *(overifierat)*.)
- **Jespers hub:** "Bergslagsvägen 63B", Homey Pro 2026, firmware 13.5.3, språk svenska. Där kan appen provköras med `homey app run` eller installeras med `homey app install`, utan att gå via App Store. `homey`-CLI:t (4.4.0) är redan inloggat. Homey-MCP:n i claude.ai ser ingen Homey för kontot och går inte att använda.

### Modell: en enhet per adress

Det är så den närmaste förebilden gör: [Trashcan Reminder 2.0](https://github.com/robertraaijmakers/com.trashchecker) (`com.trashchecker`, TypeScript, GPL-3.0, aktivt underhållen). Den har enheten "Collection Address" med klassen `other`. En enhet per adress passar Sopor:

- **Parning:** en egen vy där användaren skriver adressen. Vyn anropar `Homey.emit('search', q)`. Drivern svarar via `session.setHandler('search', …)` med träffar från `/api/v1/sok`. Sedan visas systemvyn `list_devices`, och användaren väljer en träff (`street`, `locality`, `detail`). <https://apps.developer.homey.app/advanced/custom-views/custom-pairing-views>, <https://apps.developer.homey.app/the-basics/devices/pairing/system-views/devices-list>
- **Enhetens `data`:** `{ id: "<källa>/<adress-id>" }`. Det värdet måste vara unikt och stabilt, och Soporas id är det.
- **Uppdatering:** `this.homey.setInterval`, som städas automatiskt när enheten tas bort. Var sjätte timme räcker gott, plus en timer vid midnatt (Stockholm) som räknar om "dagar kvar" lokalt ur senaste svaret. Vid 502, nätfel eller timeout behålls senaste svaret, precis som guiden säger.
- **Reparera:** en `repair`-vy för att byta adress utan att flöden går sönder.

### Capabilities (vad enheten visar)

Fraktionerna styrs av data, men mängden id är fast i v1 (`rest`, `mat`, `papper`, `plast`, `glas`, `metall`, `tidningar`, `karl`), och nya kan tillkomma. Förslag:

- `sopor_summary` (string, `uiComponent: sensor`): `summary` ur svaret, till exempel "Plast & metall – om 4 dagar".
- En egen capability per känd fraktion, till exempel `sopor_next_rest` (string, med text som "i morgon, tors 1 nov"). Den läggs på med `addCapability` bara för de fraktioner som adressen faktiskt har.
- Valfritt: `sopor_days_<fraktion>` (number, enhet "d") för den som vill jämföra i logikflöden.
- Okända fraktions-id visas bara i `sopor_summary` och i flödeskorten. De får ingen egen capability förrän appen uppdateras.

Capabilities definieras i `.homeycompose/capabilities/*.json` och kan vara `boolean`, `number`, `string` eller `enum`. <https://apps.developer.homey.app/the-basics/devices/capabilities>

### Flödeskort

Det här är kärnan för användaren. Korten blir enhetskort, så de får automatiskt ett enhetsargument. Fraktionsargumentet blir `autocomplete`, fyllt från just den adressens `fractions{}`. Autocomplete-lyssnaren måste själv filtrera på `query`. <https://apps.developer.homey.app/the-basics/flow/arguments>

- **När (trigger):** "[fraktion] hämtas i morgon" och "[fraktion] hämtas i dag". Tokens: fraktion, datum, text, beräknat (ja/nej). En variant är "N dagar innan".
- **Och (villkor):** "[fraktion] hämtas !{{|inte}} [i dag/i morgon/i övermorgon]", "något hämtas i morgon". `!{{|inte}}` ger en negerad form gratis.
- **Då (handling):** "Uppdatera schemat nu".

**Öppen fråga: när ska triggern gå?** Triggern "hämtas i morgon" måste gå vid en bestämd tid. Två alternativ:

1. En tid per enhet i inställningarna (standard 18:00), och triggern går då. Det är enkelt för användaren, men appen bestämmer tiden.
2. Inga tidsberoende triggers. Användaren gör "När klockan är 19:00 → Och [fraktion] hämtas i morgon". Det är så Trashcan Reminder gör. Det är flexibelt och enkelt att bygga, men ett steg mer för användaren.

Förslag: bygg villkoren först (alternativ 2), och lägg till triggers med inställd tid när det behövs. SRV Sophämtning har triggers för "i morgon", "i dag", "om N dagar" och "schemat ändrat", så användarna verkar vilja ha dem.

Regler för korttexter: inga "När/Och/Då", inga enhetsnamn och inga parenteser i titlarna. <https://apps.developer.homey.app/app-store/guidelines>

### Widget (senare)

Homey Pro har dashboard-widgets (från Homey 12.3.0, inte på Cloud). En widget med nästa hämtningar i fraktionsfärg och ikon ligger nära sajtens adressida. `homey app widget create` skapar `widgets/<id>/` med HTML, `api.js` och förhandsbilder. <https://apps.developer.homey.app/the-basics/widgets>. Det kräver att designen får en widget-vy i `sopor-design.pen` först.

### Språk

Svenska (`sv`) stöds. Engelska är obligatoriskt och reservspråk, och Athom kräver att varje språk är komplett och korrekt stavat. Svenska och engelska alltså, med svenska som huvudspråk. <https://apps.developer.homey.app/the-basics/app/internationalization>

### App Store-granskningen

<https://apps.developer.homey.app/app-store/guidelines>, <https://apps.developer.homey.app/app-store/publishing>

- **App-id:** `se.hardyson.sopor`. Namnet: "Sopor" (högst fyra ord, inget "Homey" eller "Athom").
- **Inofficiellt:** inga regler om det, men beskrivningen ska säga att appen inte är knuten till kommunerna, som sajten gör.
- **Dubbletter (2.1):** svenska appar finns redan, till exempel SRV Sophämtning (`se.sikth.srv`) och Sophämtningskalendern Sysav (`com.hibbisoft.garbagecalendar`). Ansökan måste förklara varför Sopor behövs: att appen täcker många kommuner med ett gränssnitt.
- **Bilder:** en SVG-ikon på 960×960 (bara linjer, utan fyllning), app-bilder på 250×175, 500×350 och 1000×700, och drivrutinsbilder på 75×75, 500×500 och 1000×1000. Dessutom en obligatorisk `brandColor` som inte får vara för ljus. Det behöver designas.
- **Flöde:** `homey app validate --level publish` → `homey app publish` (blir ett utkast) → en testversion via testlänk → certifiering. Första granskningen kan ta upp till två veckor.
- **Kostnad:** gratis för Homey Pro enligt Cloud-guiden. Om ett vanligt utvecklarkonto kostar något framgår inte *(overifierat)*.
- **Öppen källkod:** inget krav hittades *(overifierat)*. Repot är redan MIT, och `source`/`bugs`/`homepage` i manifestet pekar hit.

### I det här repot: `integrations/homey/`

- **Ett eget paket:** egen `package.json`, `tsconfig.json` och `node_modules`. Rot-`tsconfig.app.json` (`src`, `scripts`, `api`) och Vitest (`src/**`, `scripts/**`) rör inte mappen, så den stör inte sajtens bygge.
- **TypeScript:** `homey app create` frågar om TS, och CLI:t kompilerar till `.homeybuild/`. Typer finns i `@types/homey`. <https://apps.developer.homey.app/guides/tools/typescript.md>
- **Tester:** Athom har inget testramverk. Lägg logiken (tolka svaret, välja fraktioner, räkna dagar, skapa texter) i rena moduler och testa dem med Vitest, som i resten av repot. Homey-klasserna hålls tunna.
- **CI:** ett eget jobb i `ci.yml` med `paths: integrations/homey/**`, som kör `npm ci`, test och `homey app validate`. Athoms action `github-action-homey-app-publish` kör en hårdkodad `cd /github/workspace/` och fungerar inte i en undermapp. Publiceringen görs i stället med `npx homey app publish` och `working-directory: integrations/homey`, med `HOMEY_HEADLESS=1` och en `HOMEY_PAT` som secret *(inte provat)*.
- **Vercel:** `ignoreCommand` bygger om sajten vid varje commit. Ändringar som bara rör `integrations/` kan hoppas över (`git diff --quiet HEAD^ HEAD -- . ':!integrations'`). Det är en liten ändring, men den rör deploy-flödet och görs separat.
- **Node-version:** Athom anger att CLI:t kräver Node 24+. Repot kräver `>=22.12`, och CLI 4.4.0 fungerar på Jespers Node 22.20. Behåll 22 tills något går sönder.

### Flödeskort i liknande appar

Kartlagt 2026-10-31.
- Trashcan Reminder 2.0 och Min Renovasjon är lästa i källkoden.
- Övriga appar är lästa via App Store-sidornas korttitlar, så argument, tokens och tidpunkter är *(overifierat)*.

| App | När | Och | Då |
|---|---|---|---|
| **Sophämtning 0.2.0** | i morgon vid inställd tid (+ fraktion) | fraktion (inte) i dag/i morgon/i övermorgon | uppdatera; Advanced: vilka fraktioner [när] |
| SRV Sophämtning | i dag, i morgon, om N dagar, schemat ändrat | dagar till hämtning = N; nästa innehåller typ | uppdatera |
| Sysav (hibbisoft) | i dag, i morgon, datum ändrat | om N dagar | – |
| Trashcan Reminder 2.0 | inga | typ (inte) [i dag/i morgon/i övermorgon] | Advanced: vilka typer [när] |
| Renovasjon (NO) | inga (utvecklaren avböjde) | något om N dagar; typ om N dagar | Advanced: typer om N dagar |
| Remidt (NO) | i dag, i morgon, om 2 dagar, denna vecka, status ändrad | många, bl.a. "minst N typer i dag" | – |
| Recycle België | tio stycken, bl.a. påminnelse 24 h och 4 h före, schemat ändrat, flyttad hämtning | fem | sex, bl.a. färdig notistext |

**Där vi ligger efter:**
- Godtyckligt antal dagar ("om N dagar") och "dagar till nästa hämtning", både som villkor, token och capability.
- En trigger för "schemat ändrat" eller "flyttad hämtning", som spelar roll kring helgdagar.
- En trigger för "hämtas i dag", till exempel som påminnelse på morgonen.
- Möjligheten att dölja fraktioner man inte har.
- En widget.

**Där vi ligger före:**
- Triggern med inställd tid och fraktionsfilter. Trashcan och Renovasjon saknar triggers och får kritik för det på forumet.
- Fraktionsnamn som alltid är svenska. Renovasjons användare klagar på att namnen följer systemspråket.


### Tre vägar

1. **Ingen kod (i dag):** REST-sensorn i `docs/api.md`. Alternativt prenumererar man på `links.ics` med Home Assistants inbyggda integration Remote Calendar *(den finns sedan 2025.4, men den har inte provats mot Soporas ICS)*. Kostar ingenting och borde stå i guiden.
2. **En källa i Waste Collection Schedule** ([mampfes/hacs_waste_collection_schedule](https://github.com/mampfes/hacs_waste_collection_schedule)): det kräver bara en Python-fil (`source/sopor_hardyson_se.py` med `TITLE`, `URL`, `TEST_CASES` och en `Source.fetch()` som returnerar `Collection(date, t, icon)`). <https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/doc/contributing_source.md>
   - **För:** ett par timmars arbete, en stor befintlig användarbas, och den finns redan i HACS.
   - **Emot:** gränssnittet bara på `en/de/it/fr` (inte svenska). `estimated`, `deviation`, `warning` och färger försvinner. Projektet har redan över 45 svenska källor, bland annat EDP (Uppsala Vatten, Örebro, SSAM, VAFAB med flera), Sysav och VA SYD, så Sopor blir en proxy som överlappar dem. Om underhållarna accepterar det är oklart *(overifierat)*.
3. **En egen integration `sopor`** (rekommenderas när Homey-appen är klar): en config flow med adressfältet → val bland träffarna, en `DataUpdateCoordinator` (`update_interval` minst 1 h, `UpdateFailed` vid 502 så att senaste data behålls), en `SensorEntity` per fraktion med `device_class: date`, och en `CalendarEntity` med heldagshändelser. Det är samma mönster som i kärnintegrationen Twente Milieu (platina-nivå). <https://github.com/home-assistant/core/tree/dev/homeassistant/components/twentemilieu>, <https://contributors.home-assistant.io/core/entities/sensor/>, <https://contributors.home-assistant.io/core/entities/calendar/>

### Varför ett eget repo

HACS kräver en integration per repo, i `custom_components/<domän>/` eller i roten (`content_in_root`). `hacs.json` ska ligga i roten, och HACS källkod har ingen inställbar sökväg. <https://hacs.xyz/docs/publish/integration/>, <https://hacs.xyz/docs/publish/start/>. En undermapp `integrations/home-assistant/` här går alltså inte att installera via HACS. Alternativen:

- **Ett eget repo, `jesperhardyson/sopor-home-assistant`:** det rena alternativet, med egna releaser och egna issues. Rekommenderas.
- Bygga här och spegla till ett eget repo med en GitHub Action. Det blir två ställen att hålla synkade, och det vinner lite.
- `custom_components/` i roten av det här repot. Det blandar releaser för appen och sajten, och om det godtas på HACS standardlista är oklart.

### Krav för HACS standardlista

<https://hacs.xyz/docs/publish/include/>

- HACS Action och hassfest gröna, riktiga GitHub-releaser, en OSI-licens, issues påslagna, beskrivning och topics.
- En domän som inte krockar med en kärnintegration (`sopor` gör inte det).
- Ikoner: från Home Assistant 2026.3 kan integrationen ha en egen `brand/`-mapp (`icon.png`, `logo.png`, mörka varianter och @2x), så det behövs ingen PR till home-assistant/brands. <https://contributors.home-assistant.io/blog/2026/02/24/brands-proxy-api>. Sätt `"homeassistant": "2026.3.0"` i `hacs.json`.
- Manifestet behöver `domain`, `name`, `codeowners`, `documentation`, `issue_tracker` och `version`, och dessutom `config_flow: true`, `iot_class: "cloud_polling"` och `integration_type: "service"`. <https://contributors.home-assistant.io/core/integrations/manifest/>

### Språk, tester och versioner

- **Språk:** `translations/en.json` (obligatorisk) och `translations/sv.json`. Anpassade integrationer har ingen `strings.json`, och `[%key:…%]`-referenser fungerar inte. <https://contributors.home-assistant.io/core/integrations/translations/>
- **Tester:** `pytest-homeassistant-custom-component` (följer Home Assistant 2026.10) med fixturer som är riktiga API-svar, och `hassfest` och `hacs/action` i CI.
- **Versioner:** Home Assistant 2026.10.4 kräver Python ≥3.14.2.

### Kärnintegration?

Det kräver ett separat klientbibliotek på PyPI, minst bronsnivå på kvalitetsskalan och att någon tar på sig kodägarskapet. Webbskrapning är förbjuden (ADR-0004), men Soporas API är JSON. Det går tekniskt, men underhållet krockar med målet om minimalt underhåll, och det är osäkert om granskarna godtar en proxy för kommunal data som drivs av en person. Inte aktuellt nu. <https://contributors.home-assistant.io/core/quality-scale/>, <https://contributors.home-assistant.io/core/development/checklist/>

## Påverkan på API och sajt

- **Inga API-ändringar krävs.** Allt ovan går att bygga på v1 som det är.
- **Användaragent:** integrationerna bör skicka en egen User-Agent, till exempel `Sopor-Homey/1.0 (+https://sopor.hardyson.se)`, så att trafiken går att se i loggarna.
- **Om-sidan och `docs/api.md`:** när appen är publicerad ersätter länken till den HomeyScript-avsnittet som förstahandsval.
- **AGENTS.md:** en ny regel om att `integrations/` bara använder det publika API:t och aldrig importerar från `src/`.

## Förslag på ordning

1. **Homey-spec** (`docs/specs/`): enhetsmodell, capabilities, flödeskort med svenska texter, inställningar och felbeteende. Avgör triggerfrågan ovan. Designa ikon, bilder och parningsvyn i `sopor-design.pen`.
2. **Homey MVP** i `integrations/homey/`: parning med sök, enhet per adress, `sopor_summary` och capabilities per fraktion, villkor och handlingen "uppdatera", Vitest och CI-jobb. Provkör på Jespers Pro 2026.
3. **Testversion i App Store** (testlänk), och sedan certifiering.
4. **Triggers och widget** efter användning.
5. **Home Assistant:** komplettera guiden med Remote Calendar (prova det först). Sedan en spec och ett eget repo `sopor-home-assistant` med config flow, datumsensorer, kalender och HACS.

## Förebilder

- [Trashcan Reminder 2.0](https://github.com/robertraaijmakers/com.trashchecker): Homey, TypeScript. Har parningsvy med adress, sensorer per fraktion, widget och Athoms actions.
- [SRV Sophämtning](https://homey.app/sv-se/app/se.sikth.srv/): svensk Homey-app, med triggers för i dag, i morgon, om N dagar och schemat ändrat.
- [Renovasjon](https://community.homey.app/t/142446): norsk Homey-app för många kommuner. Det närmaste Sopor konceptuellt.
- [Twente Milieu](https://github.com/home-assistant/core/tree/dev/homeassistant/components/twentemilieu): kärnintegration i Home Assistant, med datumsensor per fraktion och kalender.
- [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule): HACS, med många svenska källor.

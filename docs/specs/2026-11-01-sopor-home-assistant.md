# Spec: Sopor som Home Assistant-integration

Status: utkast, 2026-11-01. Bygger på undersökningen `2026-10-31-integrationer-homey-home-assistant.md` och Homey-appen (`2026-10-31-sopor-homey-app.md`), vars funktioner integrationen följer.

Beslut:
- Integrationen ligger i det här repot, inte i ett eget. HACS läser bara `custom_components/<domän>/` och `hacs.json` i repots rot (bekräftat i HACS källkod, `repositories/integration.py`). Därför ligger själva integrationen i `custom_components/sopor/`, och tester och verktyg i `integrations/home-assistant/`.
- Installation via HACS som anpassat repo (custom repository). HACS standardlista ingår inte. Om den blir aktuell speglas koden till ett eget repo vid release, utan att något ändras för användarna.
- HACS tar versionen från senaste **GitHub-releasen**. Bara Home Assistant-integrationen skapar GitHub-releaser. Homey-appen har bara taggar (`homey-v*`), och så ska det förbli.
- I texterna heter det **avfallstyp**, som i Homey. Id och kod säger `fraktion`.
- Påminnelser byggs med Home Assistants kalendertrigger och dess förskjutning ("−6 h" före en heldagshändelse ger kvällen innan kl. 18). Integrationen har därför ingen egen påminnelsetid och inga egna triggers för "i morgon" och "i dag".

## Mål

En Home Assistant-användare installerar Sophämtning via HACS, söker upp sin adress och får en enhet med sensorer, en kalender och en händelse för schemaändringar. Sedan kan adressen användas i automationer, till exempel "kalenderhändelse startar om −6 h → skicka notis med händelsens titel".

## Utanför första versionen

- HACS standardlista och spegling till ett eget repo.
- Ett eget Lovelace-kort (motsvarigheten till Homeys widget). Home Assistants vanliga kort räcker.
- Kärnintegration i Home Assistant.

## Ramar

- **Domän:** `sopor`. Namn: "Sophämtning" (engelska "Waste Collection"), som Homey-appen.
- **Manifest:** `config_flow: true`, `iot_class: "cloud_polling"`, `integration_type: "service"`, `codeowners`, `documentation` och `issue_tracker` som pekar hit, och `version` (semver).
- **`hacs.json`:** `name`, `country: "SE"`, `hide_default_branch: true` (användarna får bara releaser) och `homeassistant: "2026.3.0"` (krävs för egna ikoner i `brand/`).
- **Python 3.14**, och Home Assistant som `pytest-homeassistant-custom-component` följer (2026.10 i dag).
- **Bara publika API v1:** `/api/v1/sok`, `/api/v1/adress/{källa}/{id}` och `/api/v1/kallor`. Ingen kod från `src/`. Avfallstypernas namn kommer ur svarets `fractions{}`.
- **User-Agent:** `Sopor-HomeAssistant/<version> (+https://sopor.hardyson.se)`. HTTP via Home Assistants delade `aiohttp`-session.
- **Språk:** `translations/sv.json` och `translations/en.json` (obligatorisk). Inga `[%key:…%]`-referenser, eftersom de inte fungerar i anpassade integrationer.

## Filer

```
hacs.json
custom_components/sopor/
  manifest.json
  __init__.py           # setup och unload av konfigurationsposten
  api.py                # klient för API v1, SoporError med status och felkod
  logic.py              # ren logik utan Home Assistant
  coordinator.py        # DataUpdateCoordinator och sparat svar
  config_flow.py        # sök → välj, reconfigure, alternativ
  entity.py             # gemensam basklass med enhet och tillgänglighet
  sensor.py  binary_sensor.py  calendar.py  event.py
  translations/sv.json  translations/en.json
  brand/                # icon.png, logo.png, mörka varianter och @2x
integrations/home-assistant/
  pyproject.toml        # uv, pytest, ruff
  README.md
  scripts/release.py
  tests/                # pytest, fixturer är riktiga API-svar
```

`logic.py` motsvarar Homeys `lib/*.mts`: ortsfilter, kommunlistan, dolda typer, dagar kvar, vad som hämtas en viss dag och diffen mellan två svar. Den importerar inget från Home Assistant och testas för sig. Entitetsklasserna hålls tunna.

## Lägga till en adress (konfigurationsflöde)

Samma logik som Homeys parning (`lib/pairing.mts`):

1. **Steget `user`:** fältet "Gata och husnummer", med exemplet "Storgatan 2, Uppsala". Beskrivningen säger hur många kommuner Sopor finns i (ur `/api/v1/kallor`) och länkar till `https://sopor.hardyson.se/bidra#kommuner`.
   - Text efter första kommat är **ort**. API:t söker på delen före kommat, och integrationen filtrerar själv: varje ord i orten ska vara början på ett ord i ortens eller kommunens namn.
   - Är delen före kommat kortare än tre tecken: fel i formuläret.
   - **Inga träffar och någon källa svarade inte:** "Några källor svarade inte. Försök igen om en stund."
   - **Inga träffar, orten är en kommun som finns:** "Ingen adress hittades i <ort>. Kontrollera stavningen och husnumret."
   - **Inga träffar, orten är inte en kommun som finns:** "Ingen adress hittades i <ort>. Kontrollera att kommunen finns med."
   - **Inga träffar utan ort:** "Ingen adress hittades. Kontrollera stavningen och husnumret, och att din kommun finns med."
2. **Fler än 12 träffar → steget `ort`:** en lista med orterna, till exempel "Uppsala, Uppsala kommun (10)", med flest träffar först.
3. **1–12 träffar → steget `adress`:** en lista med `"<gata>, <ort>"` (kommunen om orten saknas) och `detail` om det finns.
4. Posten får `unique_id` = `<källa>/<adress-id>`, så samma adress kan inte läggas till två gånger. Titeln är `"<gata>, <ort>"`.

## Enhet och entiteter

En enhet per konfigurationspost, med postens titel som namn. Entiteternas `unique_id` är `<postens id>_<nyckel>`, så de behålls när adressen byts.

| Entitet | Plattform | Visar |
|---|---|---|
| `<avfallstyp>` | sensor, `device_class: date` | Nästa hämtning för typen, eller okänt när inget väntar. Attribut: `beraknat` (datumet är inte bekräftat), `avvikelse` (källans `deviation.reason`, annars tomt). En per typ som adressen har. Namnet tas ur `fractions{}` |
| Nästa hämtning | sensor | Till exempel "Plast & metall – om 4 dagar". Räknas lokalt ur `events` |
| Dagar kvar | sensor, enhet d | Dagar till nästa hämtning av någon typ. Okänt när inget väntar |
| Hämtas i dag | binary_sensor | På om något hämtas i dag. Attribut `avfallstyper` (namnen med komma emellan) |
| Hämtas i morgon | binary_sensor | Som ovan, för i morgon |
| Hämtschema | calendar | En heldagshändelse per hämtningsdag. Titeln är typernas namn, till exempel "Plast & metall". Beskrivningen säger om datumet är beräknat eller flyttat |
| Schemat ändrades | event | Händelsetypen `andrat`, med `avfallstyp`, `text` (till exempel "Plastförpackningar flyttas från ons 4 nov till tors 5 nov"), `tidigare`, `nytt` och `orsak` |

- Datumsensorer läggs till och tas bort efter vad svaret innehåller, som Homeys underkapabiliteter. En borttagen typ tas också bort ur entitetsregistret.
- "I dag" räknas i `Europe/Stockholm`, oavsett vilken tidszon Home Assistant har.

## Uppdatering

- `DataUpdateCoordinator` hämtar från API:t var sjätte timme och direkt vid start. Timeout 15 s. Det håller sig gott inom "högst en gång i timmen".
- Det senaste lyckade svaret sparas med `homeassistant.helpers.storage.Store` per post. Vid start läses det in först, så entiteterna har värden direkt, även utan nät.
- Var 15:e minut räknas texterna, de binära sensorerna och "dagar kvar" om ur det sparade svaret, utan att API:t anropas. "I dag" och "i morgon" byts alltså inom en kvart efter midnatt, som i Homey.
- **Schemat ändrades:** efter varje lyckad hämtning jämförs nästa datum per avfallstyp (räknat från i dag) med förra svaret. En händelse per typ vars datum har flyttats, försvunnit eller tillkommit. Passerade hämtningar räknas inte, och ingen händelse avfyras vid första hämtningen eller efter ett adressbyte.

## Fel

| Läge | Beteende |
|---|---|
| 502, nätfel eller timeout | `UpdateFailed`, och coordinatorn försöker igen vid nästa intervall. Entiteterna behåller senaste data. Tillgängligheten utgår från om det finns ett sparat svar, inte från `last_update_success` |
| Inget sparat svar alls och hämtningen misslyckas | Entiteterna är otillgängliga. Vid start ger det `ConfigEntryNotReady`, så Home Assistant försöker igen |
| 404 (adressen finns inte längre) | Ett reparationsärende (`issue_registry`, inte åtgärdbart i sig): "Adressen <titel> finns inte längre hos källan. Öppna integrationen Sophämtning och välj Konfigurera om för att byta adress." Senaste data visas tills dess |
| Fel vid sökningen | Visas i formuläret, och posten skapas inte |

## Byta adress (reconfigure)

Samma steg som när man lägger till en adress. Posten får ny adress, ny titel och nytt `unique_id` (`<källa>/<adress-id>`), men samma `entry_id`, så entiteternas id och automationerna behålls. Home Assistants standardmönster (`_abort_if_unique_id_mismatch`) förutsätter att `unique_id` inte ändras. Här är bytet själva poängen, så flödet kontrollerar i stället med `_abort_if_unique_id_configured` att ingen post redan har adressen, och skickar det nya id:t till `async_update_reload_and_abort`. Det sparade svaret raderas, och reparationsärendet tas bort.

## Alternativ (options flow)

- Kryssrutor (en `SelectSelector` med flerval i listläge) för de avfallstyper som adressen har, i den ordning svarets `fractions{}` har dem. Alla är ikryssade från början. Det som sparas är de **dolda** typerna (`dolda`), så att en ny typ hos källan syns utan att användaren gör något. Till skillnad från Homey kan även okända typ-id döljas, eftersom listan byggs ur adressens eget svar.
- En dold typ tas bort ur schemat innan något räknas: den försvinner ur sensorerna, kalendern, "Nästa hämtning", "Dagar kvar", de binära sensorerna och "Schemat ändrades". En hämtning med bara dolda typer finns inte längre. Typens datumsensor tas bort.
- När alternativen sparas laddas posten om.

## Tester

Tester skrivs först.

- **`logic.py`** med vanlig pytest: ortsfilter och orter, kommunlistan och vilket felmeddelande som gäller, dolda typer, vad som hämtas en viss dag, "dagar kvar" kring midnatt i Stockholmstid (även när Home Assistant har en annan tidszon) och diffen med flyttade, borttagna och nya hämtningar.
- **`pytest-homeassistant-custom-component`:** konfigurationsflödets alla grenar, reconfigure, alternativflödet, att senaste data behålls vid 502, `ConfigEntryNotReady` utan sparat svar, reparationsärendet vid 404, att datumsensorer läggs till och tas bort, och kalenderns händelser.
- Fixturerna är riktiga svar från API:t. Avesta (påhittad data) används inte.
- **Gränstest:** ingen fil i `custom_components/sopor/` refererar till `src/`.
- **Rökprov** mot produktions-API:t som fristående skript, `scripts/smoke.py` (inte pytest): sök, hämta en adress och tolka svaret.

## CI

Ett nytt workflow `home-assistant.yml`, med `paths: custom_components/**, integrations/home-assistant/**, hacs.json, .github/workflows/home-assistant.yml`:

- Jobbet `home-assistant` (inte `test`, som är den obligatoriska checken i `ci.yml`): uv, Python 3.14, `ruff check`, `ruff format --check` och pytest.
- `home-assistant/actions/hassfest` och `hacs/action` (kategori `integration`).
- Jobbet `smoke` varje natt och vid `workflow_dispatch`, som Homey-appens.

## Release

- `uv run scripts/release.py <version>` i `integrations/home-assistant/` sätter en uttrycklig, högre `version` i `manifest.json` (som Homeys), committar och taggar `ha-v<version>`. Versionen ändras aldrig för hand.
- Taggen startar `home-assistant-release.yml`: kontrollerar att taggen stämmer med manifestet, kör testerna och skapar en GitHub-release med genererade release notes.
- Ett test vaktar att inget annat workflow skapar GitHub-releaser.

## Dokumentation och sajt

- **Först, ett eget litet steg:** prova Home Assistants integration Remote Calendar mot `links.ics` och lägg till den i `docs/api.md` som sättet utan kod.
- `integrations/home-assistant/README.md`: installation via HACS (anpassat repo `jesperhardyson/sopor`), entiteterna och exempel på automationer med kalendertriggerns förskjutning.
- AGENTS.md:
  - regel 8 omfattar också `custom_components/`
  - kommandona för Home Assistant-paketet
  - regeln att bara Home Assistant skapar GitHub-releaser.
- `README.md`: avsnittet Home Assistant pekar på integrationen, och raden om releaser säger att Home Assistant har taggar `ha-v*` i det här repot.
- Smarta hem-avsnitten på sajten (startsidan, Om-sidan och adressidan) länkar till integrationen först när den första releasen finns.

## Senare

- HACS standardlista, via spegling till ett eget repo.
- Ett Lovelace-kort med nästa hämtningar i avfallstypernas färger, efter design i `sopor-design.pen`.

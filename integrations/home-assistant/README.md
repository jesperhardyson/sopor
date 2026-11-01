# Sopor för Home Assistant

Anpassad integration (custom component) som visar sophämtningen för en adress: sensorer, en kalender och en händelse när schemat ändras. Specen finns i `docs/specs/2026-11-01-sopor-home-assistant.md`.

Integrationen ligger i `custom_components/sopor/` i repots rot, eftersom HACS bara läser den platsen. Tester, verktyg och den här filen ligger i `integrations/home-assistant/`. Den använder bara det publika API:t (`https://sopor.hardyson.se/api/v1`) och importerar ingenting från repots `src/`.

## Installation via HACS

1. Öppna HACS i Home Assistant, välj menyn uppe till höger och *Anpassade databaser* (Custom repositories).
2. Lägg till `jesperhardyson/sopor` med kategorin *Integration*.
3. Sök upp *Sophämtning* i HACS, ladda ner den och starta om Home Assistant.
4. Gå till *Inställningar → Enheter och tjänster → Lägg till integration*, välj *Sophämtning* och sök upp adressen.
   - Skriv gata och husnummer, gärna med ort efter ett komma, till exempel `Storgatan 2, Uppsala`.
   - Är det många träffar får du först välja ort, sedan adress.

HACS hämtar versionen från senaste GitHub-releasen i det här repot.

## Entiteter

En enhet per adress, med adressen som namn.

| Entitet | Typ | Visar |
|---|---|---|
| En per avfallstyp | sensor (datum) | Nästa hämtning av typen, eller okänt när inget väntar. Attribut: `beraknat` (datumet är inte bekräftat) och `avvikelse` (källans förklaring, `null` när det inte finns någon avvikelse) |
| Nästa hämtning | sensor | Till exempel "Plast & metall – om 4 dagar" |
| Dagar kvar | sensor (dagar) | Dagar till nästa hämtning av någon typ |
| Hämtas i dag | binär sensor | På om något hämtas i dag. Attributet `avfallstyper` listar typerna med komma emellan, och är en tom sträng när inget hämtas |
| Hämtas i morgon | binär sensor | Som ovan, för i morgon |
| Hämtschema | kalender | En heldagshändelse per hämtningsdag, med typernas namn som titel |
| Schemat ändrades | händelse | Typen `andrat`, med `avfallstyp`, `text`, `tidigare`, `nytt` och `orsak` |

- Datumsensorerna följer vad adressen har. Tillkommer eller försvinner en avfallstyp hos källan läggs sensorn till eller tas bort.
- En avfallstyps sensor får sitt namn när den skapas. Byter källan namn på typen senare behåller sensorn det gamla namnet, tills du byter namn på den själv eller tar bort och lägger till integrationen igen.
- "I dag" räknas alltid i `Europe/Stockholm`, oavsett Home Assistants tidszon. Texter som integrationen räknar fram följer Home Assistants språk: svenska om det är `sv`, annars engelska. Avfallstypernas namn är alltid svenska.

## Dölja avfallstyper och byta adress

- **Dölja avfallstyper:** öppna integrationen och välj *Konfigurera*. Avmarkera de typer du inte vill se. En dold typ försvinner ur alla sensorer, kalendern och händelsen. Typer som tillkommer hos källan syns utan att du gör något.
- **Byta adress:** välj *Konfigurera om* på posten och sök upp den nya adressen. Entiteternas id och dina automationer behålls.

## Automation: kvällen innan kl. 18

Hämtschemat är en kalender med heldagshändelser, så Home Assistants kalendertrigger fungerar. En heldagshändelse börjar kl. 00.00, och förskjutningen `-6:00:00` ger alltså kvällen innan kl. 18.

```yaml
automation:
  - alias: "Sophämtning i morgon"
    triggers:
      - trigger: calendar
        event: start
        entity_id: calendar.storgatan_2_uppsala_hamtschema
        offset: "-6:00:00"
    actions:
      - action: notify.notify
        data:
          title: "Sophämtning i morgon"
          message: "{{ trigger.calendar_event.summary }}"
```

Byt `entity_id` mot kalenderns id hos dig och `notify.notify` mot din egen notistjänst. Kalenderns id följer språket Home Assistant hade när adressen lades till: på engelska blir det till exempel `calendar.storgatan_2_uppsala_collection_schedule`. Titeln på händelsen är avfallstypernas namn, till exempel "Plast & metall".

## Fel

- **Källan svarar inte** (nätfel, timeout eller 502): integrationen försöker igen vid nästa uppdatering, och entiteterna visar senaste data. Svaret sparas, så värdena finns även efter en omstart utan nät.
- **Inget sparat svar och källan svarar inte:** posten sätts inte upp (`ConfigEntryNotReady`), och Home Assistant försöker igen automatiskt tills källan svarar.
- **Adressen finns inte längre hos källan (404):** ett reparationsärende ber dig välja *Konfigurera om* och byta adress. Senaste data visas tills dess.
- **Fel vid sökningen** visas i formuläret, och ingen adress läggs till.

Data hämtas var sjätte timme. Texterna, de binära sensorerna och "dagar kvar" räknas om var 15:e minut utan att API:t anropas.

## Utveckling

Kräver [uv](https://docs.astral.sh/uv/) och Python 3.14.

```bash
cd integrations/home-assistant
uv sync
uv run pytest                                                   # tester
uv run ruff check ../../custom_components tests                 # lint
uv run ruff format --check ../../custom_components tests        # format
uv run scripts/smoke.py                                         # rökprov mot produktions-API:t
```

Fixturerna är riktiga API-svar. Rökprovet kräver nät och körs varje natt i CI (`home-assistant.yml`, jobbet `smoke`).

## Släppa en version

```bash
cd integrations/home-assistant
uv run scripts/release.py 0.2.0
git push && git push origin ha-v0.2.0
```

1. `release.py` kräver ett rent arbetsträd och en högre version. Det sätter `version` i `custom_components/sopor/manifest.json`, committar och taggar `ha-v<version>`.
2. **Taggen** startar `home-assistant-release.yml`, som kontrollerar att taggen stämmer med manifestet, kör testerna och skapar **GitHub-releasen**. Den är det HACS läser. Bara Home Assistant-integrationen skapar GitHub-releaser i det här repot.

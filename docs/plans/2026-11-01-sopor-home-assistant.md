# Home Assistant-integrationen – implementationsplan

> **För agenter:** Använd superpowers:subagent-driven-development (rekommenderas) eller superpowers:executing-plans för att genomföra planen uppgift för uppgift. Stegen har kryssrutor (`- [ ]`).

**Mål:** En HACS-installerbar integration `sopor` i `custom_components/sopor/` som ger en enhet per adress med datumsensorer, sammanfattning, dagar kvar, i dag/i morgon, en kalender och en händelse för schemaändringar, ovanpå API v1.

**Arkitektur:** Ren logik i `logic.py` (portad från Homeys `lib/schedule.mts`, `lib/dates.mts`, `lib/texts.mts` och `lib/pairing.mts`) utan Home Assistant-importer. En `DataUpdateCoordinator` hämtar, sparar senaste svaret i `Store` och räknar fram schemaändringar. Entiteterna är tunna och läser coordinatorns filtrerade schema.

**Teknik:** Python 3.14, Home Assistant 2026.10 (via `pytest-homeassistant-custom-component`), aiohttp (Home Assistants delade session), uv, pytest, ruff, GitHub Actions (`hassfest`, `hacs/action`).

**Spec:** `docs/specs/2026-11-01-sopor-home-assistant.md`

## Globala krav

- Integrationen ligger i `custom_components/sopor/` i repots rot. Tester, `pyproject.toml`, skript och README ligger i `integrations/home-assistant/`. `hacs.json` ligger i roten.
- Bara API v1: `https://sopor.hardyson.se/api/v1/sok`, `/adress/{källa}/{id}` (via träffens `url`) och `/kallor`. Ingen kod eller sökväg från `src/`.
- User-Agent: `Sopor-HomeAssistant/<version> (+https://sopor.hardyson.se)`, där versionen läses ur `manifest.json`. Timeout 15 s.
- Datum är `YYYY-MM-DD`-strängar. "I dag" är `today_in_stockholm(now)`, oavsett Home Assistants tidszon.
- Avfallstypernas namn kommer ur svarets `fractions{}` och är alltid svenska. Texter som integrationen räknar fram följer `hass.config.language`: `sv` ger svenska, allt annat engelska.
- I texterna heter det "avfallstyp". Id, nycklar och kod säger `fraktion`.
- Entiteternas `unique_id` är `f"{entry.entry_id}_{nyckel}"`. Postens `unique_id` är `f"{källa}/{adress-id}"`.
- Översättningar i `translations/sv.json` och `en.json`, utan `[%key:…%]`.
- Kommentarer och commit-meddelanden på svenska, utan AI-attribution. Inget CI-jobb får heta `test`.
- Före varje commit: `cd integrations/home-assistant && uv run ruff check ../../custom_components tests && uv run ruff format --check ../../custom_components tests && uv run pytest`. Rör en uppgift sajtens filer, kör också `npm run lint && npm test && npm run build` i roten.
- Avesta (testdata) används aldrig i fixturer.

## Fokus vid granskning

1. **Home Assistant i en annan tidszon än Stockholm** (till exempel UTC, där klockan är 23:30 när den är 00:30 i Stockholm): "i dag", "i morgon", "dagar kvar" och kalenderns datum ska följa Stockholm. Test i uppgift 2 och 6.
2. **Avfallstyp som bara finns i `events` men inte i `fractions{}`**: får namnet som sitt id, en egen datumsensor och kan döljas. Test i uppgift 3 och 7.
3. **Alla avfallstyper dolda, eller adress utan kommande hämtningar**: sammanfattningen säger "Inga kommande hämtningar", dagar kvar är okänt, de binära sensorerna är av, kalendern är tom och inget kraschar. Test i uppgift 3 och 7.
4. **Omstart utan nät med sparat svar**: entiteterna är tillgängliga med sparade värden, och ingen "Schemat ändrades" avfyras när nätet kommer tillbaka med samma schema. Test i uppgift 5.
5. **Adressbyte till en adress som redan finns i en annan post**: flödet avbryts med `already_configured`, och den ursprungliga posten är orörd. Test i uppgift 9.

---

### Uppgift 1: Paketet, manifest, gräns och CI

**Filer:**
- Skapa: `hacs.json`, `custom_components/sopor/manifest.json`, `custom_components/sopor/const.py`, `custom_components/sopor/__init__.py` (tom `async_setup_entry`/`async_unload_entry` som returnerar `True`), `custom_components/sopor/translations/sv.json`, `en.json` (bara `title`)
- Skapa: `integrations/home-assistant/pyproject.toml`, `integrations/home-assistant/tests/conftest.py`, `tests/test_package.py`
- Skapa: `.github/workflows/home-assistant.yml`
- Ändra: `AGENTS.md` (kommandon och regel 8), `.gitignore` (`.venv`, `__pycache__`, `.pytest_cache`, `.ruff_cache`)

**Gränssnitt:**
- Producerar: `const.py` med `DOMAIN = "sopor"`, `BASE_URL = "https://sopor.hardyson.se/api/v1"`, `UPDATE_INTERVAL = timedelta(hours=6)`, `TICK_INTERVAL = timedelta(minutes=15)`, `TIMEOUT = 15`, `MAX_LIST = 12`, `CONF_HIDDEN = "dolda"`, `VERSION` (läst ur `manifest.json` vid import).
- Producerar: fixturen `auto_enable_custom_integrations` (autouse, anropar `enable_custom_integrations`) i `conftest.py`.

- [ ] **Steg 1: Skriv de fallerande testerna i `tests/test_package.py`**

```python
def test_manifest(): ...
    # domain == "sopor", config_flow is True, iot_class == "cloud_polling",
    # integration_type == "service", version matchar r"^\d+\.\d+\.\d+$",
    # documentation och issue_tracker börjar med "https://github.com/jesperhardyson/sopor"

def test_hacs_json(): ...
    # name == "Sophämtning", country == "SE", hide_default_branch is True, homeassistant == "2026.3.0"

def test_gransen_mot_sajten(): ...
    # Ingen .py-fil under custom_components/sopor innehåller "src/" i en import eller sökväg,
    # och inga relativa importer pekar utanför custom_components/sopor (samma idé som scripts/boundary.test.mts)

def test_versionen_kommer_ur_manifestet():
    # const.VERSION == manifest["version"]
```

- [ ] **Steg 2: Kör och se dem fallera**

Kör: `cd integrations/home-assistant && uv run pytest tests/test_package.py -v`
Förväntat: FAIL (filerna finns inte).

- [ ] **Steg 3: Skapa paketet**

- `pyproject.toml`: `requires-python = ">=3.14"`, dev-beroenden `pytest-homeassistant-custom-component` (senaste som följer Home Assistant 2026.10) och `ruff`. `[tool.pytest.ini_options]`: `pythonpath = ["../.."]`, `testpaths = ["tests"]`, `asyncio_mode = "auto"`. `[tool.ruff]`: `target-version = "py314"`, `line-length = 120`.
- `manifest.json`: nycklarna i testet, `codeowners: ["@jesperhardyson"]`, `requirements: []`, `version: "0.1.0"`.
- `hacs.json`: nycklarna i testet.

- [ ] **Steg 4: Kör testerna**

Kör: `uv run pytest -v`
Förväntat: PASS.

- [ ] **Steg 5: CI-workflow `.github/workflows/home-assistant.yml`**

Byggt som `homey.yml`: `paths` = `custom_components/**`, `integrations/home-assistant/**`, `hacs.json`, `.github/workflows/home-assistant.yml`. `defaults.run.working-directory: integrations/home-assistant`.
- Jobbet `home-assistant`: `astral-sh/setup-uv`, Python 3.14, `uv sync`, ruff check, ruff format --check, pytest.
- Jobbet `hassfest`: `home-assistant/actions/hassfest@master` (körs i roten).
- Jobbet `hacs`: `hacs/action@main` med `category: integration` (körs i roten).
- Jobbet `smoke`: bara vid `schedule` (`30 3 * * *`) och `workflow_dispatch`: `uv run scripts/smoke.py`.

- [ ] **Steg 6: AGENTS.md**

- Regel 8: "Integrationer (`integrations/` och `custom_components/`) …".
- Under Kommandon: `cd integrations/home-assistant && uv sync && uv run pytest`, och lint-kommandona från Globala krav.

- [ ] **Steg 7: Commit**

```bash
git add hacs.json custom_components integrations/home-assistant .github/workflows/home-assistant.yml AGENTS.md .gitignore
git commit -m "Home Assistant: paket, manifest, gränstest och CI"
```

### Uppgift 2: Datum och texter i `logic.py`

**Filer:**
- Skapa: `custom_components/sopor/logic.py`
- Test: `integrations/home-assistant/tests/test_logic_dates.py`

**Gränssnitt:**
- Producerar: `Lang = Literal["sv", "en"]`, `lang_of(language: str) -> Lang`, `TEXTS: dict[Lang, ...]` (samma strängar som Homeys `lib/texts.mts`), `add_days(date: str, days: int) -> str`, `days_between(from_: str, to: str) -> int`, `today_in_stockholm(now: datetime) -> str`, `relative_day_label(days: int, lang: Lang) -> str`, `short_date(date: str, lang: Lang) -> str`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
def test_add_days_over_manadsskifte(): assert add_days("2026-10-31", 1) == "2026-11-01"
def test_add_days_over_sommartid(): assert add_days("2026-03-28", 2) == "2026-03-30"
def test_days_between(): assert days_between("2026-11-01", "2026-11-05") == 4
def test_today_i_stockholm_fast_utc_ar_gardag():
    assert today_in_stockholm(datetime(2026, 11, 1, 23, 30, tzinfo=UTC)) == "2026-11-02"
def test_relative_day_label():
    assert [relative_day_label(d, "sv") for d in (0, 1, 4)] == ["i dag", "i morgon", "om 4 dagar"]
    assert relative_day_label(4, "en") == "in 4 days"
def test_short_date():
    assert short_date("2026-11-04", "sv") == "ons 4 nov"
    assert short_date("2026-11-04", "en") == "Wed 4 Nov"
def test_lang_of(): assert (lang_of("sv"), lang_of("en-GB"), lang_of("nb")) == ("sv", "en", "en")
```

- [ ] **Steg 2: Kör och se dem fallera**

Kör: `uv run pytest tests/test_logic_dates.py -v` → FAIL (`ImportError`).

- [ ] **Steg 3: Implementera i `logic.py`**

`zoneinfo.ZoneInfo("Europe/Stockholm")` för "i dag". `date.fromisoformat` för aritmetiken. Veckodagar och månader som i `texts.mts` (`sön mån tis ons tors fre lör`, `jan feb mars apr maj juni juli aug sep okt nov dec`). Filen får inte importera något från `homeassistant`.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: datum och texter"`

### Uppgift 3: Schemalogik i `logic.py`

**Filer:**
- Ändra: `custom_components/sopor/logic.py`
- Skapa: `custom_components/sopor/api.py` (bara typerna i det här steget)
- Test: `integrations/home-assistant/tests/test_logic_schedule.py`, fixturer `tests/fixtures/adress.json` (ett riktigt svar från `/api/v1/adress/…` för en adress med minst tre avfallstyper, och ett event med `estimated: true`)

**Gränssnitt:**
- Producerar i `api.py`: `TypedDict`:arna `Address`, `SearchHit`, `Search`, `Event`, `Fraction`, `Schedule`, `Sources` med samma fält som Homeys `lib/api.mts`.
- Producerar i `logic.py`:
  - `fraction_ids(schedule) -> list[str]` (registrets ordning, sedan id som bara finns i events)
  - `fraction_name(schedule, id) -> str` (namnet, annars id:t)
  - `fractions_on(schedule, today, days_ahead) -> list[str]`
  - `next_event(schedule, today, fraction) -> Event | None`
  - `join_short(schedule, ids) -> str` ("Plast & metall")
  - `summary(schedule, today, lang) -> str`
  - `days_to_next(schedule, today) -> int | None`
  - `upcoming(schedule, today) -> list[Event]`
  - `@dataclass(frozen=True) ScheduleChange(fraction: str, from_: str | None, to: str | None, reason: str | None)`
  - `schedule_changes(before, after, today) -> list[ScheduleChange]`
  - `change_text(schedule, change, lang) -> str`
  - `without_fractions(schedule, hidden: list[str]) -> Schedule`

- [ ] **Steg 1: Skriv de fallerande testerna**

Bygg små scheman med en hjälpfunktion `schedule(events, fractions)` i testfilen. Varje test motsvarar ett test i Homeys `lib/schedule.test.mts`:

```python
def test_fraction_ids_tar_med_okanda_id_sist(): ...   # fractions {rest, plast}, events med "tradgard" → ["rest", "plast", "tradgard"]
def test_fraction_name_faller_tillbaka_pa_id(): assert fraction_name(s, "tradgard") == "tradgard"
def test_summary(): assert summary(s, "2026-11-01", "sv") == "Plast & metall – om 4 dagar"
def test_summary_utan_kommande(): assert summary(s, "2027-01-01", "sv") == "Inga kommande hämtningar"
def test_days_to_next_i_dag_ar_noll_och_tomt_ar_none(): ...
def test_fractions_on_i_morgon(): ...
def test_next_event_hoppar_over_passerade(): ...
def test_schedule_changes_flyttad_borttagen_ny(): ...  # tre ScheduleChange, reason ur deviation.reason
def test_schedule_changes_ignorerar_passerade(): ...
def test_change_text():
    assert change_text(s, ScheduleChange("plast", "2026-11-04", "2026-11-05", None), "sv") == \
        "Plastförpackningar flyttas från ons 4 nov till tors 5 nov"
def test_without_fractions_tar_bort_tomma_events(): ...
def test_alla_dolda_ger_tomt_schema(): ...   # events == [], summary → "Inga kommande hämtningar"
def test_fixturen_tolkas(): ...   # adress.json: fraction_ids icke-tom, summary(...) == fixturens "summary" för fixturens "today"
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera** som Homeys `lib/schedule.mts` rad för rad. `TypedDict`:arna har inga beroenden.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: schemalogik"`

### Uppgift 4: Söklogik och API-klient

**Filer:**
- Ändra: `custom_components/sopor/logic.py`, `custom_components/sopor/api.py`
- Test: `tests/test_logic_pairing.py`, `tests/test_api.py`, fixturer `tests/fixtures/sok.json` (riktigt svar för "Storgatan 2", fler än 12 träffar), `tests/fixtures/kallor.json`

**Gränssnitt:**
- Producerar i `logic.py`:
  - `parse_query(text) -> tuple[str, str]` (fråga, ort)
  - `SearchResult = Literal["found", "places", "failed", "none"]`
  - `search_outcome(search, place) -> tuple[SearchResult, list[SearchHit]]`
  - `place_key(hit) -> str` (`"<ort>|<kommun>"`)
  - `places(hits) -> list[Place]`, där `Place` är en dataklass med `key`, `label` och `count`
  - `hit_title(hit) -> str` (`"<gata>, <ort>"`, kommunen om orten saknas)
  - `hit_label(hit) -> str` (titeln, plus `", <detail>"` om det finns)
  - `kommun_names(sources) -> list[str]`
  - `place_covered(names, place) -> bool`
  - `not_found_error(place, names) -> str`, som returnerar felnyckeln `"not_found"`, `"not_found_covered"` eller `"not_found_elsewhere"`
- Producerar i `api.py`: `class SoporError(Exception)` med `status: int` (0 = nätfel eller timeout), `code: str` och `message`. `class SoporClient(session: aiohttp.ClientSession)` med `async search(q: str) -> Search`, `async schedule(url: str) -> Schedule` och `async sources() -> Sources`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
def test_parse_query(): assert parse_query(" Storgatan 2 , Uppsala ") == ("Storgatan 2", "Uppsala")
def test_ort_filtrerar_pa_ordborjan(): ...    # "upp" matchar "Uppsala", "sala" matchar inte "Uppsala"
def test_ort_matchar_kommun(): ...
def test_fler_an_12_ger_places(): ...          # sok.json → "places"
def test_inga_traffar_och_failed_ger_failed(): ...
def test_places_flest_forst_sedan_namn(): ...  # label "Uppsala, Uppsala kommun", count
def test_hit_label_med_detail(): ...
def test_kommun_names_unika_utan_ordet_kommun(): ...
def test_not_found_error(): ...                # tre fall: utan ort, ort som är kommun, ort som inte är det

async def test_search_skickar_user_agent_och_q(aioclient_mock, hass): ...
    # Begäran går till BASE_URL + "/sok?q=Storgatan+2", med headern User-Agent == f"Sopor-HomeAssistant/{VERSION} (+https://sopor.hardyson.se)"
async def test_502_ger_source_unavailable(aioclient_mock, hass): ...   # SoporError.status == 502, code == "source_unavailable"
async def test_felkod_ur_svaret(aioclient_mock, hass): ...             # 404 med {"error": {"code": "not_found"}} → code "not_found"
async def test_timeout_ger_status_0(aioclient_mock, hass): ...         # exc=TimeoutError → status 0, code "network"
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

Ortsfiltret som i `lib/pairing.mts`: ord är `re.split(r"[^\w]+", s.casefold())` utan tomma strängar. Klienten använder `aiohttp.ClientTimeout(total=TIMEOUT)`. Vid fel som inte är 2xx läses `error.code` ur JSON om det går, annars `source_unavailable` vid 502 och `unknown` vid annat.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: adressökning och API-klient"`

### Uppgift 5: Coordinator, sparat svar och setup

**Filer:**
- Skapa: `custom_components/sopor/coordinator.py`, `custom_components/sopor/entity.py`
- Ändra: `custom_components/sopor/__init__.py`, `translations/*.json` (`issues.address_gone`)
- Test: `tests/test_coordinator.py`. `conftest.py` får fixturerna `mock_entry` (en `MockConfigEntry` med data från `sok.json`s första träff), `second_entry` (en annan träff), `schedule_json`, `setup_entry` (lägger till `mock_entry` med `adress.json` som svar, låser tiden till fixturens `today` kl. 12 Stockholm och kör setup) och `setup_entry_hidden` (samma, med `options={"dolda": ["plast"]}`). Uppgift 7–9 använder dem.

**Gränssnitt:**
- Konsumerar: `SoporClient`, `SoporError`, `without_fractions`, `schedule_changes`, `today_in_stockholm`.
- Producerar:
  - `store_for(hass, entry_id) -> Store`, med nyckeln `f"sopor.{entry_id}"` och version 1. Innehållet är `{"schedule": Schedule}`.
  - `class SoporCoordinator(DataUpdateCoordinator[Schedule])`:
    - `data`: det senaste råa svaret.
    - `visible: Schedule | None`, med de dolda typerna borttagna.
    - `today: str`.
    - `changes: list[ScheduleChange]`: bara ifyllt under den uppdatering då ändringarna upptäcktes.
    - `async async_load() -> bool`: läser in det sparade svaret och returnerar om det fanns.
    - `@callback async_tick(now=None)`: tömmer `changes`, räknar om `today` och anropar `async_update_listeners`.
  - `type SoporConfigEntry = ConfigEntry[SoporCoordinator]`.
  - `class SoporEntity(CoordinatorEntity[SoporCoordinator])`: `_attr_has_entity_name = True`, `device_info` med identifiers `{(DOMAIN, entry.entry_id)}` och postens titel som namn, och `available` som är `self.coordinator.data is not None`.
  - Funktioner för entiteterna: `lang(hass) -> Lang`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
async def test_setup_hamtar_och_sparar(hass, mock_entry, aioclient_mock): ...
    # Efter setup: entry.state is LOADED, och store_for(...).async_load() innehåller svaret
async def test_502_behaller_senaste_data(hass, mock_entry, aioclient_mock, freezer): ...
    # Lyckad setup, sedan 502 och tiden framflyttad 6 h: coordinator.last_update_success is False, data oförändrad, SoporEntity.available sann
async def test_utan_sparat_svar_och_502_ger_not_ready(hass, mock_entry, aioclient_mock): ...
    # entry.state is SETUP_RETRY
async def test_omstart_utan_nat_med_sparat_svar(hass, mock_entry, aioclient_mock, hass_storage): ...
    # hass_storage förfyllt, API ger nätfel → state LOADED, data == sparat svar
async def test_ingen_andring_vid_forsta_hamtningen(hass, mock_entry, aioclient_mock): ...   # changes == []
async def test_andring_upptacks_och_tomms_vid_tick(hass, mock_entry, aioclient_mock, freezer): ...
async def test_samma_schema_efter_omstart_ger_ingen_andring(hass, mock_entry, aioclient_mock, hass_storage): ...
async def test_404_skapar_reparationsarende(hass, mock_entry, aioclient_mock, issue_registry): ...
    # ärendet (DOMAIN, f"address_gone_{entry_id}") finns med is_fixable False och placeholdern title; data behålls
async def test_lyckad_hamtning_tar_bort_arendet(...): ...
async def test_dolda_typer_filtreras_i_visible(hass, aioclient_mock): ...   # options {"dolda": ["plast"]}
async def test_today_foljer_stockholm_nar_ha_har_utc(hass, mock_entry, aioclient_mock, freezer): ...
    # hass.config.set_time_zone("UTC"), freezer 2026-11-01 23:30 UTC → coordinator.today == "2026-11-02"
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

- `__init__.py` `async_setup_entry`:
  - Skapa coordinatorn (`update_interval=UPDATE_INTERVAL`, `config_entry=entry`).
  - Om `await coordinator.async_load()`: `async_set_updated_data` med det sparade svaret, och sedan `await coordinator.async_refresh()`. Annars `await coordinator.async_config_entry_first_refresh()`.
  - `entry.runtime_data = coordinator`.
  - `entry.async_on_unload(async_track_time_interval(hass, coordinator.async_tick, TICK_INTERVAL))`.
  - Vidarebefordra till plattformarna (listan fylls på i uppgift 6–7, och börjar tom).
- `_async_update_data`:
  - Tömmer `changes` och hämtar.
  - Vid `SoporError` med status 404 skapas ärendet. Alla `SoporError` blir `UpdateFailed`.
  - Vid lyckad hämtning: om det fanns ett tidigare svar räknas `changes = schedule_changes(without_fractions(förra, dolda), without_fractions(nya, dolda), today)`. Svaret sparas, ärendet tas bort och det nya svaret returneras.
  - Det sparade svaret räknas som "tidigare svar". Därför ger en omstart med samma schema inga ändringar.
- `visible` räknas om i en överlagrad `async_update_listeners`, eller som en property ur `data` och `entry.options.get(CONF_HIDDEN, [])`. En property räcker.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: coordinator med sparat svar och reparationsärende"`

### Uppgift 6: Konfigurationsflödet

**Filer:**
- Skapa: `custom_components/sopor/config_flow.py`
- Ändra: `translations/sv.json`, `translations/en.json` (stegen `user`, `ort`, `adress`, felen och avbrotten)
- Test: `tests/test_config_flow.py`

**Gränssnitt:**
- Konsumerar: `SoporClient`, `parse_query`, `search_outcome`, `places`, `place_key`, `hit_title`, `hit_label`, `kommun_names`, `not_found_error`.
- Producerar: `SoporConfigFlow(ConfigFlow, domain=DOMAIN)` med stegen `user`, `ort` och `adress`. Postens `data` = `{"source", "id", "url", "street", "locality", "kommun", "detail"}` ur träffen. Uppgift 9 återanvänder stegen `ort` och `adress` för reconfigure.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
async def test_en_till_tolv_traffar_gar_till_adress(hass, aioclient_mock): ...
    # user {"adress": "Storgatan 2, Uppsala"} → form "adress", där valen är hit_label och värdet "<källa>/<id>"
async def test_val_skapar_post(hass, aioclient_mock): ...
    # create_entry, title == hit_title, unique_id == "<källa>/<id>", data["url"] == träffens url
async def test_fler_an_tolv_gar_till_ort(hass, aioclient_mock): ...       # "Storgatan 2" → form "ort", och sedan "adress"
async def test_for_kort_fraga(hass, aioclient_mock): ...                  # errors {"adress": "too_short"}
async def test_kallor_svarade_inte(hass, aioclient_mock): ...             # errors {"base": "sources_failed"}
async def test_ingen_traff_tre_meddelanden(hass, aioclient_mock): ...     # not_found / not_found_covered / not_found_elsewhere, med placeholdern place
async def test_natfel_vid_sokning(hass, aioclient_mock): ...              # errors {"base": "cannot_connect"}
async def test_samma_adress_tva_ganger(hass, aioclient_mock, mock_entry): ...  # abort "already_configured"
async def test_beskrivningen_har_antal_kommuner(hass, aioclient_mock): ...     # description_placeholders["count"] == str(len(kommun_names(kallor)))
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

- Steget `user` har ett fält, `adress` (`TextSelector`). Beskrivningen innehåller `{count}` och länken `https://sopor.hardyson.se/bidra#kommuner`. Hämtar `/kallor` misslyckas, används en text utan antal (placeholdern blir tom).
- Steget `ort` har `SelectSelector` (`mode=LIST`) med `Place.label` och `(count)` som etikett och `key` som värde.
- Steget `adress` har `SelectSelector` med träffarna.
- Träffarna sparas på flödesinstansen mellan stegen.
- Felens texter (svenska):
  - `too_short`: "Skriv minst tre tecken av gatan."
  - `sources_failed`: "Några källor svarade inte. Försök igen om en stund."
  - `not_found`: "Ingen adress hittades. Kontrollera stavningen och husnumret, och att din kommun finns med."
  - `not_found_covered`: "Ingen adress hittades i {place}. Kontrollera stavningen och husnumret."
  - `not_found_elsewhere`: "Ingen adress hittades i {place}. Kontrollera att kommunen finns med."
  - `cannot_connect`: "Sopor svarar inte. Försök igen om en stund."
- Engelska texter som i Homeys `locales/en.json`.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: konfigurationsflöde med adressökning"`

### Uppgift 7: Sensorer och binära sensorer

**Filer:**
- Skapa: `custom_components/sopor/sensor.py`, `custom_components/sopor/binary_sensor.py`
- Ändra: `__init__.py` (`PLATFORMS`), `translations/*.json` (`entity.sensor.summary`, `entity.sensor.days`, `entity.binary_sensor.today`, `entity.binary_sensor.tomorrow`)
- Test: `tests/test_sensor.py`

**Gränssnitt:**
- Konsumerar: `SoporEntity`, `coordinator.visible`, `coordinator.today`, `lang(hass)`, `summary`, `days_to_next`, `fractions_on`, `join_short`, `next_event`, `fraction_ids`, `fraction_name`.
- Producerar: nycklarna `next_<fraktion>`, `summary`, `days`, `today` och `tomorrow`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
async def test_datumsensor_per_avfallstyp(hass, setup_entry): ...
    # sensor.<titel>_plastforpackningar: state "2026-11-05", device_class "date", attribut beraknat False och avvikelse None. Namnet är fraction_name
async def test_beraknat_och_avvikelse(hass, setup_entry): ...
async def test_sammanfattning_och_dagar_kvar(hass, setup_entry, freezer): ...   # "Plast & metall – om 4 dagar", 4, enhet "d"
async def test_engelska_texter(hass, setup_entry): ...                         # hass.config.language = "en" → "… – in 4 days"
async def test_i_dag_och_i_morgon(hass, setup_entry, freezer): ...              # on/off, attributet avfallstyper == "Plast & metall"
async def test_byts_efter_midnatt_utan_api_anrop(hass, setup_entry, freezer, aioclient_mock): ...
    # Flytta tiden till 00:10 Stockholm + async_fire_time_changed → i morgon blir i dag, och aioclient_mock.call_count är oförändrat
async def test_ny_avfallstyp_ger_ny_sensor_och_borttagen_tas_bort(hass, setup_entry, aioclient_mock, freezer, entity_registry): ...
async def test_okand_typ_far_sensor_med_id_som_namn(hass, setup_entry): ...
async def test_inga_kommande(hass, setup_entry, freezer): ...   # summary "Inga kommande hämtningar", days unknown, binära off, datumsensor unknown
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

- `sensor.py` `async_setup_entry`:
  - Lägger till de fasta entiteterna.
  - En lyssnare på coordinatorn håller en mängd av tillagda typer. Nya typer i `fraction_ids(visible)` får `SoporFractionSensor` via `async_add_entities`. Typer som försvunnit tas bort med `entity_registry.async_remove`.
  - Lyssnaren körs också en gång direkt.
- `SoporFractionSensor`:
  - `_attr_name = fraction_name(...)`
  - `_attr_device_class = SensorDeviceClass.DATE`
  - `native_value` = `date.fromisoformat(next_event(...)["date"])` eller `None`
  - `extra_state_attributes` = `{"beraknat": …, "avvikelse": deviation.reason eller None}`.
- `days`: `native_unit_of_measurement = UnitOfTime.DAYS`.
- `binary_sensor.py`: `today` och `tomorrow` med `fractions_on(visible, today, 0|1)`.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: sensorer för avfallstyper, sammanfattning och i dag/i morgon"`

### Uppgift 8: Kalender och "Schemat ändrades"

**Filer:**
- Skapa: `custom_components/sopor/calendar.py`, `custom_components/sopor/event.py`
- Ändra: `__init__.py` (`PLATFORMS`), `translations/*.json` (`entity.calendar.schedule`, `entity.event.changed` med händelsetypen `andrat`, och attributens namn)
- Test: `tests/test_calendar_event.py`

**Gränssnitt:**
- Konsumerar: `coordinator.visible`, `coordinator.changes`, `upcoming`, `join_short`, `change_text`, `fraction_name`, `short_date`.
- Producerar: nycklarna `calendar` och `changed`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
async def test_kalenderns_nasta_handelse(hass, setup_entry, freezer): ...
    # calendar.<titel>: state on på hämtningsdagen och off annars. Attributet message == "Plast & metall", all_day True
async def test_get_events_i_intervall(hass, setup_entry, hass_client): ...
    # tjänsten calendar.get_events (eller /api/calendars/<id>?start=&end=) ger heldagshändelser med start == datum och end == datum + 1
async def test_beskrivning_beraknat_och_flyttad(hass, setup_entry): ...
    # "Beräknat datum." respektive "Flyttad från ons 4 nov: <orsak>"
async def test_dolda_typer_syns_inte_i_kalendern(hass, setup_entry_hidden): ...
async def test_schemat_andrades_avfyras_per_typ(hass, setup_entry, aioclient_mock, freezer): ...
    # Nytt svar där plast flyttats → event.<titel>_schemat_andrades har event_type "andrat" och attributen
    # avfallstyp "Plastförpackningar", text "Plastförpackningar flyttas från ons 4 nov till tors 5 nov", tidigare, nytt, orsak
async def test_tick_avfyrar_inte_igen(hass, setup_entry, aioclient_mock, freezer): ...
async def test_dold_typ_avfyrar_inte(hass, setup_entry_hidden, aioclient_mock, freezer): ...
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

- `CalendarEntity`:
  - `event` = första i `upcoming(visible, today)` som `CalendarEvent`.
  - `async_get_events(hass, start, end)` filtrerar `visible["events"]` på datumintervallet (start och end jämförs i Stockholmstid).
  - `CalendarEvent`: `start=date`, `end=date+1 dag`, `summary=join_short(...)`, `uid=f"{entry.data['id']}-{date}@sopor.hardyson.se"` (samma form som sajtens ICS-UID).
  - Beskrivningen är "Beräknat datum." när `estimated` är sant, och "Flyttad från <short_date(originalDate)>: <reason>" när `deviation` finns. Båda kan finnas, på var sin rad.
- `EventEntity`:
  - `_attr_event_types = ["andrat"]`.
  - `_handle_coordinator_update` anropar `_trigger_event("andrat", {...})` för varje post i `coordinator.changes` och sedan `async_write_ha_state()`.
  - Attributen: `avfallstyp` = `fraction_name`, `text` = `change_text`, `tidigare`/`nytt` = datumsträngarna eller `None`, och `orsak` = `reason`.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: kalender och händelsen Schemat ändrades"`

### Uppgift 9: Byta adress och dölja avfallstyper

**Filer:**
- Ändra: `custom_components/sopor/config_flow.py`, `translations/*.json` (`reconfigure`, `options.step.init`, avbrottet `reconfigure_successful`)
- Test: `tests/test_reconfigure_options.py`

**Gränssnitt:**
- Konsumerar: stegen från uppgift 6, `store_for`, `fraction_ids`, `fraction_name`, `CONF_HIDDEN`.
- Producerar: `async_step_reconfigure` och `SoporOptionsFlow(OptionsFlowWithReload)`, som sparar `{"dolda": list[str]}`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
async def test_byt_adress_behaller_entiteterna(hass, setup_entry, aioclient_mock, entity_registry): ...
    # reconfigure → sök → välj en annan adress → abort "reconfigure_successful".
    # Posten har ny titel, nytt unique_id och ny data["url"], samma entry_id, och entity_id:na för summary/days är oförändrade
async def test_byt_till_adress_som_redan_finns(hass, setup_entry, second_entry, aioclient_mock): ...
    # abort "already_configured", och posten är oförändrad
async def test_byte_raderar_sparat_svar_och_arende(hass, setup_entry, aioclient_mock, hass_storage, issue_registry): ...
    # och ingen "Schemat ändrades" efter bytet
async def test_alternativ_visar_adressens_typer_alla_ikryssade(hass, setup_entry): ...
    # schemats fält "visa" har options == fraction_ids, och default == alla
async def test_dolja_typ(hass, setup_entry, entity_registry): ...
    # avmarkera plast → options {"dolda": ["plast"]}, posten laddas om, datumsensorn för plast är borta, summary utan plast
async def test_ny_typ_hos_kallan_syns_trots_dolda(hass, setup_entry, aioclient_mock, freezer): ...
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

- Reconfigure:
  - `async_step_reconfigure` visar samma formulär som `user`, och stegen `ort`/`adress` grenar på `self.source == SOURCE_RECONFIGURE`.
  - Vid val: `await self.async_set_unique_id(nytt_id)`, sedan `self._abort_if_unique_id_configured()`, sedan `await store_for(hass, entry.entry_id).async_remove()` och `ir.async_delete_issue(...)`, och till sist `return self.async_update_reload_and_abort(entry, unique_id=nytt_id, title=hit_title(hit), data=träffdata)`.
  - Avvikelsen från standardmönstret ska ha en kommentar: `unique_id` byts med avsikt.
- Alternativ: fältet `visa` (`SelectSelector`, `multiple=True`, `mode=LIST`), med valen `fraction_ids(coordinator.data)` och etiketterna `fraction_name`. Det som sparas är `dolda = [id for id in alla if id not in visa]`.
- `async_get_options_flow` returnerar `SoporOptionsFlow()`.

- [ ] **Steg 4: Kör testerna** → PASS.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: byt adress och dölj avfallstyper"`

### Uppgift 10: Rökprov, release och regeln om GitHub-releaser

**Filer:**
- Skapa: `integrations/home-assistant/scripts/smoke.py`, `integrations/home-assistant/scripts/release.py`, `tests/test_release.py`, `.github/workflows/home-assistant-release.yml`
- Ändra: `AGENTS.md` (regeln om GitHub-releaser)

**Gränssnitt:**
- Producerar i `release.py`: `TAG_PREFIX = "ha-v"`, `bump_problem(current: str, wanted: str) -> str | None`, `set_version(manifest_path, version) -> None` och `main(argv)`.

- [ ] **Steg 1: Skriv de fallerande testerna**

```python
# scripts/smoke.py är ett fristående skript (inget pytest-test, ingen markör):
#   riktig aiohttp-session: search("Storgatan 2") har träffar; schedule(första träffens url) går att tolka med summary/fraction_ids

def test_bump_problem(): ...
    # "0.1.0"→"0.1.0" ger fel, "0.1.0"→"0.0.9" ger fel, "0.1.0"→"0.2.0" ger None, "x" ger fel
def test_set_version_andrar_bara_version(tmp_path): ...
def test_bara_home_assistant_skapar_github_releaser(): ...
    # Läs alla .github/workflows/*.yml: bara home-assistant-release.yml får innehålla "gh release" eller "softprops/action-gh-release"
```

- [ ] **Steg 2: Kör och se dem fallera** → FAIL.

- [ ] **Steg 3: Implementera**

- `release.py <version>`, som Homeys `release.mts`:
  - Kräver ett rent arbetsträd och en högre version.
  - Sätter `version` i `custom_components/sopor/manifest.json`.
  - Committar "Home Assistant-integrationen <version>" och taggar `ha-v<version>`.
  - Skriver ut push-kommandot.
- `home-assistant-release.yml`:
  - Körs på `tags: ['ha-v*']`, med `permissions: contents: write`.
  - Kontrollerar att taggen stämmer med manifestet och kör pytest.
  - Skapar releasen med `gh release create "$GITHUB_REF_NAME" --generate-notes --title "Home Assistant <version>"`.

- [ ] **Steg 4: Kör testerna**

Kör: `uv run pytest -v && uv run scripts/smoke.py`
Förväntat: PASS (rökprovet kräver nät).

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: rökprov och release"`

### Uppgift 11: Ikoner, dokumentation och provkörning

**Filer:**
- Skapa: `custom_components/sopor/brand/icon.png` (256×256), `icon@2x.png` (512×512), `logo.png`, `logo@2x.png`, `dark_icon.png`, `dark_logo.png` (och @2x). Exporteras från designens Sopor-symbol via Pencil MCP, sidan "Homey · Sophämtning".
- Skapa: `integrations/home-assistant/README.md`
- Ändra: `docs/api.md` (avsnittet Remote Calendar), `README.md` (Home Assistant och releaser med `ha-v*`)

- [ ] **Steg 1: Prova Remote Calendar**

Starta Home Assistant i Docker (`docker run -d --name ha-sopor -p 8123:8123 -v "$PWD/.ha-config:/config" ghcr.io/home-assistant/home-assistant:2026.10`, där `.ha-config` ligger i scratchpad och inte i repot). Lägg till Remote Calendar med `links.ics` för en riktig adress. Notera om händelserna syns och vilka titlar de får. Skriv bara in det i `docs/api.md` om det fungerar, och då med de steg som faktiskt användes.

- [ ] **Steg 2: Provkör integrationen**

Montera `custom_components/sopor` i containerns `/config/custom_components/sopor`, starta om och lägg till en adress via UI:t.
- Kontrollera entiteterna, kalendern, alternativen och reconfigure.
- Gör en automation med kalendertriggern och förskjutningen −6 h, och kontrollera att den visas rätt i UI:t.
- Ta skärmbilder till PR:en.

- [ ] **Steg 3: Skriv README och uppdatera dokumenten**

- `integrations/home-assistant/README.md`:
  - installation via HACS (anpassat repo `jesperhardyson/sopor`, kategori Integration)
  - entiteterna
  - automationsexemplet "kvällen innan kl. 18" i YAML
  - felbeteendet
  - utveckling och release.
- `README.md`: Home Assistant-avsnittet pekar på integrationen, och raden om releaser nämner `ha-v*`.

- [ ] **Steg 4: Verifiera allt**

Kör: `cd integrations/home-assistant && uv run ruff check ../../custom_components tests && uv run ruff format --check ../../custom_components tests && uv run pytest`, och i roten `npm run lint && npm test && npm run build`.
Förväntat: allt grönt.

- [ ] **Steg 5: Commit** `git commit -m "Home Assistant: ikoner, README och Remote Calendar i guiden"`

Sajtens Smarta hem-avsnitt uppdateras först efter den första releasen. Det är inte en del av den här planen.

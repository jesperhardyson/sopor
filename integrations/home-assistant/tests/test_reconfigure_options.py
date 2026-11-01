import copy
import json
from pathlib import Path

import pytest
from custom_components.sopor.const import BASE_URL, DOMAIN
from custom_components.sopor.logic import fraction_ids, fraction_name, hit_title
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir

FIXTURES = Path(__file__).parent / "fixtures"
SOK = json.loads((FIXTURES / "sok.json").read_text(encoding="utf-8"))
KALLOR = json.loads((FIXTURES / "kallor.json").read_text(encoding="utf-8"))
NY = SOK["addresses"][1]
KEYS = ("source", "id", "url", "street", "locality", "kommun", "detail")

PLAST = "sensor.storgatan_2_uppsala_plastforpackningar"
SAMMANFATTNING = "sensor.storgatan_2_uppsala_nasta_hamtning"
DAGAR = "sensor.storgatan_2_uppsala_dagar_kvar"
HANDELSE = "event.storgatan_2_uppsala_schemat_andrades"


@pytest.fixture(autouse=True)
def svenska(hass):
    hass.config.language = "sv"


def _mocka_sok(aioclient_mock):
    aioclient_mock.get(f"{BASE_URL}/sok", json=SOK)
    aioclient_mock.get(f"{BASE_URL}/kallor", json=KALLOR)


async def _byt_till(hass, entry, hit):
    result = await entry.start_reconfigure_flow(hass)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "reconfigure"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"adress": "Storgatan 2, Uppsala"})
    assert result["step_id"] == "adress"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"adress": f"{hit['source']}/{hit['id']}"}
    )
    await hass.async_block_till_done()
    return result


def _visa(result):
    return next(key for key in result["data_schema"].schema if key == "visa")


async def test_byt_adress_behaller_entiteterna(hass, setup_entry, aioclient_mock, schedule_json):
    registry = er.async_get(hass)
    fore = {
        key: registry.async_get_entity_id(platform, DOMAIN, f"{setup_entry.entry_id}_{key}")
        for platform, key in (("sensor", "summary"), ("sensor", "days"))
    }
    assert all(fore.values())
    _mocka_sok(aioclient_mock)
    aioclient_mock.get(NY["url"], json=schedule_json)
    entry_id = setup_entry.entry_id
    result = await _byt_till(hass, setup_entry, NY)
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    assert setup_entry.entry_id == entry_id
    assert setup_entry.title == hit_title(NY)
    assert setup_entry.unique_id == f"{NY['source']}/{NY['id']}"
    assert setup_entry.data == {key: NY[key] for key in KEYS}
    for key, entity_id in fore.items():
        assert registry.async_get_entity_id("sensor", DOMAIN, f"{entry_id}_{key}") == entity_id
    assert hass.states.get(SAMMANFATTNING) is not None


async def test_byt_till_adress_som_redan_finns(hass, setup_entry, second_entry, aioclient_mock):
    second_entry.add_to_hass(hass)
    _mocka_sok(aioclient_mock)
    title, unique_id, data = setup_entry.title, setup_entry.unique_id, dict(setup_entry.data)
    result = await _byt_till(hass, setup_entry, NY)
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
    assert (setup_entry.title, setup_entry.unique_id, dict(setup_entry.data)) == (title, unique_id, data)


async def test_byte_raderar_sparat_svar_och_arende(hass, setup_entry, aioclient_mock, hass_storage):
    nyckel = f"{DOMAIN}.{setup_entry.entry_id}"
    arende = f"address_gone_{setup_entry.entry_id}"
    assert nyckel in hass_storage
    ir.async_create_issue(
        hass, DOMAIN, arende, is_fixable=False, severity=ir.IssueSeverity.WARNING, translation_key="address_gone"
    )
    _mocka_sok(aioclient_mock)
    # Den nya adressen svarar inte, så bara flödet kan ha tagit bort svaret och ärendet
    aioclient_mock.get(NY["url"], status=502, text="Bad Gateway")
    result = await _byt_till(hass, setup_entry, NY)
    assert result["reason"] == "reconfigure_successful"
    assert nyckel not in hass_storage
    assert ir.async_get(hass).async_get_issue(DOMAIN, arende) is None


async def test_ingen_schemat_andrades_efter_bytet(hass, setup_entry, aioclient_mock, schedule_json):
    assert hass.states.get(HANDELSE).state == "unknown"
    annat = copy.deepcopy(schedule_json)
    annat["events"][0]["fractions"] = ["metall"]
    _mocka_sok(aioclient_mock)
    aioclient_mock.get(NY["url"], json=annat)
    result = await _byt_till(hass, setup_entry, NY)
    assert result["reason"] == "reconfigure_successful"
    assert hass.states.get(SAMMANFATTNING).state == "Metall – om 3 dagar"
    assert hass.states.get(HANDELSE).state == "unknown"


async def test_alternativ_visar_adressens_typer_alla_ikryssade(hass, setup_entry, schedule_json):
    result = await hass.config_entries.options.async_init(setup_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"
    selector = result["data_schema"].schema["visa"]
    ids = fraction_ids(schedule_json)
    assert selector.config["multiple"] is True
    assert selector.config["mode"] == "list"
    assert selector.config["options"] == [{"value": i, "label": fraction_name(schedule_json, i)} for i in ids]
    assert _visa(result).default() == ids


async def test_alternativ_utan_laddad_post(hass, mock_entry):
    mock_entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(mock_entry.entry_id)
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "not_loaded"


async def _dolj(hass, entry, dolda: list[str]):
    result = await hass.config_entries.options.async_init(entry.entry_id)
    visa = [i for i in fraction_ids(entry.runtime_data.data) if i not in dolda]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"visa": visa})
    await hass.async_block_till_done()
    return result


async def test_dolja_typ(hass, setup_entry):
    registry = er.async_get(hass)
    result = await _dolj(hass, setup_entry, ["plast"])
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert setup_entry.options == {"dolda": ["plast"]}
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{setup_entry.entry_id}_next_plast") is None
    assert hass.states.get(PLAST) is None
    assert hass.states.get(SAMMANFATTNING).state == "Metall – om 3 dagar"


async def test_alternativ_visar_dolda_som_avkryssade(hass, setup_entry_hidden, schedule_json):
    result = await hass.config_entries.options.async_init(setup_entry_hidden.entry_id)
    assert _visa(result).default() == [i for i in fraction_ids(schedule_json) if i != "plast"]


async def test_ny_typ_hos_kallan_syns_trots_dolda(hass, setup_entry, aioclient_mock, schedule_json):
    await _dolj(hass, setup_entry, ["plast"])
    schedule = copy.deepcopy(schedule_json)
    schedule["fractions"]["farligt"] = {**schedule["fractions"]["rest"], "name": "Farligt avfall", "short": "Farligt"}
    schedule["events"][0]["fractions"].append("farligt")
    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], json=schedule)
    await setup_entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get("sensor.storgatan_2_uppsala_farligt_avfall").state == "2026-11-04"
    assert hass.states.get(PLAST) is None


async def test_borttagen_post_raderar_sparat_svar(hass, setup_entry, hass_storage):
    nyckel = f"{DOMAIN}.{setup_entry.entry_id}"
    assert nyckel in hass_storage
    assert await hass.config_entries.async_remove(setup_entry.entry_id)
    await hass.async_block_till_done()
    assert nyckel not in hass_storage

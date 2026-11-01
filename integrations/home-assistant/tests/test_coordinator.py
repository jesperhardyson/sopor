import copy
from datetime import datetime, timedelta

import aiohttp
from custom_components.sopor.const import DOMAIN
from custom_components.sopor.coordinator import SoporCoordinator, store_for
from custom_components.sopor.entity import SoporEntity, lang
from custom_components.sopor.logic import ScheduleChange
from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers.device_registry import DeviceEntryType
from pytest_homeassistant_custom_component.common import async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMockResponse


def _spara(hass_storage, entry, schedule, url=None):
    _spara_data(hass_storage, entry, {"url": url or entry.data["url"], "schedule": schedule})


def _spara_data(hass_storage, entry, data):
    hass_storage[f"sopor.{entry.entry_id}"] = {
        "version": 1,
        "minor_version": 1,
        "key": f"sopor.{entry.entry_id}",
        "data": data,
    }


def _flyttad(schedule):
    """Samma schema, men plast och metall hämtas 6 nov i stället för 4 nov."""
    moved = copy.deepcopy(schedule)
    moved["events"][0]["date"] = "2026-11-06"
    return moved


def _svar(aioclient_mock, entry, **kwargs):
    aioclient_mock.clear_requests()
    aioclient_mock.get(entry.data["url"], **kwargs)


async def test_setup_hamtar_och_sparar(hass, setup_entry, schedule_json):
    assert setup_entry.state is ConfigEntryState.LOADED
    coordinator = setup_entry.runtime_data
    assert coordinator.data == schedule_json
    assert await store_for(hass, setup_entry.entry_id).async_load() == {
        "url": setup_entry.data["url"],
        "schedule": schedule_json,
    }


async def test_502_behaller_senaste_data(hass, setup_entry, aioclient_mock, freezer, schedule_json):
    coordinator = setup_entry.runtime_data
    # Coordinatorn schemalägger bara hämtningar när någon lyssnar, som entiteterna gör
    coordinator.async_add_listener(lambda: None)
    _svar(aioclient_mock, setup_entry, status=502, json={"error": {"code": "source_unavailable", "message": "Nere"}})
    freezer.tick(timedelta(hours=6, seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert aioclient_mock.call_count == 1
    assert coordinator.last_update_success is False
    assert coordinator.data == schedule_json
    assert SoporEntity(coordinator).available is True


async def test_utan_sparat_svar_och_502_ger_not_ready(hass, mock_entry, aioclient_mock):
    aioclient_mock.get(mock_entry.data["url"], status=502)
    mock_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert mock_entry.state is ConfigEntryState.SETUP_RETRY


async def test_omstart_utan_nat_med_sparat_svar(hass, mock_entry, aioclient_mock, hass_storage, schedule_json):
    _spara(hass_storage, mock_entry, schedule_json)
    aioclient_mock.get(mock_entry.data["url"], exc=aiohttp.ClientError())
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert mock_entry.state is ConfigEntryState.LOADED
    coordinator = mock_entry.runtime_data
    assert coordinator.data == schedule_json
    assert coordinator.last_update_success is False
    assert SoporEntity(coordinator).available is True


async def test_ingen_andring_vid_forsta_hamtningen(hass, setup_entry):
    assert setup_entry.runtime_data.changes == []


async def test_andring_upptacks_och_tomms_vid_tick(hass, setup_entry, aioclient_mock, schedule_json):
    coordinator = setup_entry.runtime_data
    seen = []
    coordinator.async_add_listener(lambda: seen.append(list(coordinator.changes)))
    _svar(aioclient_mock, setup_entry, json=_flyttad(schedule_json))
    await coordinator.async_refresh()
    expected = [
        ScheduleChange("plast", "2026-11-04", "2026-11-06", None),
        ScheduleChange("metall", "2026-11-04", "2026-11-06", None),
    ]
    assert coordinator.changes == expected
    assert seen == [expected]
    coordinator.async_tick()
    assert coordinator.changes == []
    assert seen == [expected, []]
    # Samma svar igen ger ingen ny ändring
    await coordinator.async_refresh()
    assert seen[-1] == []


async def test_samma_schema_efter_omstart_ger_ingen_andring(
    hass, mock_entry, aioclient_mock, hass_storage, freezer, schedule_json
):
    freezer.move_to(datetime.fromisoformat("2026-11-01T12:00:00+01:00"))
    _spara(hass_storage, mock_entry, schedule_json)
    aioclient_mock.get(mock_entry.data["url"], json=schedule_json)
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    coordinator = mock_entry.runtime_data
    assert aioclient_mock.call_count == 1
    assert coordinator.last_update_success is True
    assert coordinator.changes == []


async def test_sparat_svar_raknas_som_forra_svaret(
    hass, mock_entry, aioclient_mock, hass_storage, freezer, schedule_json
):
    freezer.move_to(datetime.fromisoformat("2026-11-01T12:00:00+01:00"))
    _spara(hass_storage, mock_entry, schedule_json)
    aioclient_mock.get(mock_entry.data["url"], json=_flyttad(schedule_json))
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert [change.fraction for change in mock_entry.runtime_data.changes] == ["plast", "metall"]


async def test_404_skapar_reparationsarende(hass, setup_entry, aioclient_mock, issue_registry, schedule_json):
    coordinator = setup_entry.runtime_data
    _svar(aioclient_mock, setup_entry, status=404, json={"error": {"code": "not_found", "message": "Finns inte"}})
    await coordinator.async_refresh()
    issue = issue_registry.async_get_issue(DOMAIN, f"address_gone_{setup_entry.entry_id}")
    assert issue is not None
    assert issue.is_fixable is False
    assert issue.translation_key == "address_gone"
    assert issue.translation_placeholders == {"title": "Storgatan 2, Uppsala"}
    assert coordinator.last_update_success is False
    assert coordinator.data == schedule_json


async def test_lyckad_hamtning_tar_bort_arendet(hass, setup_entry, aioclient_mock, issue_registry, schedule_json):
    coordinator = setup_entry.runtime_data
    issue_id = f"address_gone_{setup_entry.entry_id}"
    _svar(aioclient_mock, setup_entry, status=404)
    await coordinator.async_refresh()
    assert issue_registry.async_get_issue(DOMAIN, issue_id) is not None
    _svar(aioclient_mock, setup_entry, json=schedule_json)
    await coordinator.async_refresh()
    assert issue_registry.async_get_issue(DOMAIN, issue_id) is None


async def test_dolda_typer_filtreras_i_visible(hass, setup_entry_hidden, schedule_json):
    coordinator = setup_entry_hidden.runtime_data
    assert "plast" in coordinator.data["fractions"]
    assert "plast" not in coordinator.visible["fractions"]
    assert all("plast" not in event["fractions"] for event in coordinator.visible["events"])
    assert coordinator.visible["events"][0]["fractions"] == ["metall"]


async def test_dolda_typer_ger_ingen_andring(hass, setup_entry_hidden, aioclient_mock, schedule_json):
    coordinator = setup_entry_hidden.runtime_data
    moved = copy.deepcopy(schedule_json)
    moved["events"][0]["fractions"] = ["metall"]
    moved["events"].insert(0, {**moved["events"][0], "date": "2026-11-03", "fractions": ["plast"]})
    _svar(aioclient_mock, setup_entry_hidden, json=moved)
    await coordinator.async_refresh()
    assert coordinator.changes == []


async def test_today_foljer_stockholm_nar_ha_har_utc(hass, setup_entry, freezer):
    await hass.config.async_set_time_zone("UTC")
    freezer.move_to(datetime.fromisoformat("2026-11-01T23:30:00+00:00"))
    assert setup_entry.runtime_data.today == "2026-11-02"


async def test_tick_var_15_minut_uppdaterar_lyssnarna(hass, setup_entry, freezer):
    coordinator = setup_entry.runtime_data
    calls = []
    coordinator.async_add_listener(lambda: calls.append(coordinator.today))
    freezer.tick(timedelta(minutes=15, seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert calls == ["2026-11-01"]


async def test_avlastning(hass, setup_entry):
    assert await hass.config_entries.async_unload(setup_entry.entry_id)
    assert setup_entry.state is ConfigEntryState.NOT_LOADED


async def test_lang_foljer_ha_sprak(hass):
    hass.config.language = "sv"
    assert lang(hass) == "sv"
    hass.config.language = "de"
    assert lang(hass) == "en"


async def test_entitetens_enhet(hass, setup_entry):
    entity = SoporEntity(setup_entry.runtime_data)
    assert entity.has_entity_name is True
    assert entity.device_info["identifiers"] == {(DOMAIN, setup_entry.entry_id)}
    assert entity.device_info["name"] == "Storgatan 2, Uppsala"
    assert entity.device_info["entry_type"] is DeviceEntryType.SERVICE
    assert entity.device_info["manufacturer"] == "Sopor"
    assert entity.device_info["configuration_url"] == "https://sopor.hardyson.se/uppsala/storgatan-2_uppsala-4004688"


async def test_entitetens_enhet_utan_data(hass, mock_entry):
    mock_entry.add_to_hass(hass)
    assert (
        SoporEntity(SoporCoordinator(hass, mock_entry)).device_info["configuration_url"] == "https://sopor.hardyson.se"
    )


async def _starta_med_sparat(hass, entry, aioclient_mock, freezer, svar):
    freezer.move_to(datetime.fromisoformat("2026-11-01T12:00:00+01:00"))
    aioclient_mock.get(entry.data["url"], **svar)
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_sparat_svar_for_annan_adress_ignoreras(
    hass, mock_entry, aioclient_mock, hass_storage, freezer, schedule_json
):
    _spara(hass_storage, mock_entry, _flyttad(schedule_json), url="https://sopor.hardyson.se/api/v1/adress/annan/1")
    await _starta_med_sparat(hass, mock_entry, aioclient_mock, freezer, {"json": schedule_json})
    assert mock_entry.runtime_data.changes == []
    assert mock_entry.runtime_data.data == schedule_json


async def test_sparat_svar_for_annan_adress_raknas_inte_utan_nat(
    hass, mock_entry, aioclient_mock, hass_storage, freezer, schedule_json
):
    _spara(hass_storage, mock_entry, schedule_json, url="https://sopor.hardyson.se/api/v1/adress/annan/1")
    await _starta_med_sparat(hass, mock_entry, aioclient_mock, freezer, {"status": 502})
    assert mock_entry.state is ConfigEntryState.SETUP_RETRY


async def test_trasigt_sparat_svar_ignoreras(hass, mock_entry, aioclient_mock, hass_storage, freezer, schedule_json):
    _spara_data(hass_storage, mock_entry, {"url": mock_entry.data["url"], "schedule": ["inte", "ett", "schema"]})
    await _starta_med_sparat(hass, mock_entry, aioclient_mock, freezer, {"status": 502})
    assert mock_entry.state is ConfigEntryState.SETUP_RETRY


async def test_gammalt_format_utan_url_ignoreras(
    hass, mock_entry, aioclient_mock, hass_storage, freezer, schedule_json
):
    _spara_data(hass_storage, mock_entry, {"schedule": _flyttad(schedule_json)})
    await _starta_med_sparat(hass, mock_entry, aioclient_mock, freezer, {"json": schedule_json})
    assert mock_entry.runtime_data.changes == []


async def test_sparar_inte_om_adressen_bytts_under_hamtningen(
    hass, setup_entry, aioclient_mock, hass_storage, schedule_json
):
    coordinator = setup_entry.runtime_data
    ny_url = "https://sopor.hardyson.se/api/v1/adress/annan/1"
    nyckel = f"sopor.{setup_entry.entry_id}"

    async def byt_under_hamtningen(method, url, data):
        hass.config_entries.async_update_entry(setup_entry, data={**setup_entry.data, "url": ny_url})
        hass_storage.pop(nyckel, None)
        return AiohttpClientMockResponse(method, url, json=_flyttad(schedule_json))

    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], side_effect=byt_under_hamtningen)
    await coordinator.async_refresh()
    await hass.async_block_till_done()
    assert nyckel not in hass_storage

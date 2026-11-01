import copy
from datetime import datetime

import pytest
from custom_components.sopor.const import DOMAIN
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import async_fire_time_changed

PLAST = "sensor.storgatan_2_uppsala_plastforpackningar"
SAMMANFATTNING = "sensor.storgatan_2_uppsala_nasta_hamtning"
DAGAR = "sensor.storgatan_2_uppsala_dagar_kvar"
I_DAG = "binary_sensor.storgatan_2_uppsala_hamtas_i_dag"
I_MORGON = "binary_sensor.storgatan_2_uppsala_hamtas_i_morgon"


@pytest.fixture(autouse=True)
def svenska(hass):
    """Testhass har engelska som standard. Entitetsnamnen ska vara svenska."""
    hass.config.language = "sv"


def _flytta_till(freezer, dag_och_tid: str):
    """Flyttar klockan till en tid i Stockholm (vintertid, +01:00)."""
    freezer.move_to(datetime.fromisoformat(f"{dag_och_tid}+01:00"))


async def test_datumsensor_per_avfallstyp(hass, setup_entry):
    state = hass.states.get(PLAST)
    assert state.state == "2026-11-04"
    assert state.attributes["device_class"] == "date"
    assert state.attributes["friendly_name"] == "Storgatan 2, Uppsala Plastförpackningar"
    assert state.attributes["beraknat"] is False
    assert state.attributes["avvikelse"] is None
    registry = er.async_get(hass)
    assert registry.async_get(PLAST).unique_id == f"{setup_entry.entry_id}_next_plast"
    # En sensor per avfallstyp i fixturen
    assert len(hass.states.async_entity_ids("sensor")) == 7 + 2


async def test_beraknat_och_avvikelse(hass, setup_entry, aioclient_mock, schedule_json):
    schedule = copy.deepcopy(schedule_json)
    # Glas hämtas bara den beräknade 11 nov. Plast får en avvikelse
    schedule["events"][0]["deviation"] = {"originalDate": "2026-11-03", "reason": "Helgdag"}
    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], json=schedule)
    await setup_entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert hass.states.get(PLAST).attributes["avvikelse"] == "Helgdag"
    glas = hass.states.get("sensor.storgatan_2_uppsala_glas")
    assert glas.state == "2026-11-11"
    assert glas.attributes["beraknat"] is True


async def test_sammanfattning_och_dagar_kvar(hass, setup_entry):
    assert hass.states.get(SAMMANFATTNING).state == "Plast & metall – om 3 dagar"
    days = hass.states.get(DAGAR)
    assert days.state == "3"
    assert days.attributes["unit_of_measurement"] == "d"


async def test_engelska_texter(hass, setup_entry):
    hass.config.language = "en"
    setup_entry.runtime_data.async_tick()
    await hass.async_block_till_done()
    assert hass.states.get(SAMMANFATTNING).state == "Plast & metall – in 3 days"
    assert hass.states.get(DAGAR).state == "3"


async def test_i_dag_och_i_morgon(hass, setup_entry, freezer):
    assert hass.states.get(I_DAG).state == "off"
    assert hass.states.get(I_DAG).attributes["avfallstyper"] == ""
    assert hass.states.get(I_MORGON).state == "off"
    _flytta_till(freezer, "2026-11-03T12:00:00")
    setup_entry.runtime_data.async_tick()
    await hass.async_block_till_done()
    assert hass.states.get(I_MORGON).state == "on"
    assert hass.states.get(I_MORGON).attributes["avfallstyper"] == "Plast & metall"
    assert hass.states.get(I_DAG).state == "off"


async def test_byts_efter_midnatt_utan_api_anrop(hass, setup_entry, aioclient_mock, freezer):
    _flytta_till(freezer, "2026-11-03T23:50:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(I_MORGON).state == "on"
    assert hass.states.get(I_DAG).state == "off"
    anrop = aioclient_mock.call_count
    # Minst ett TICK_INTERVAL efter midnatt
    _flytta_till(freezer, "2026-11-04T00:16:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(I_DAG).state == "on"
    assert hass.states.get(I_DAG).attributes["avfallstyper"] == "Plast & metall"
    assert hass.states.get(I_MORGON).attributes["avfallstyper"] == "Rest, papper, tidn. & mat"
    assert hass.states.get(SAMMANFATTNING).state == "Plast & metall – i dag"
    assert aioclient_mock.call_count == anrop


async def test_ny_avfallstyp_ger_ny_sensor_och_borttagen_tas_bort(hass, setup_entry, aioclient_mock, schedule_json):
    registry = er.async_get(hass)
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{setup_entry.entry_id}_next_glas")
    schedule = copy.deepcopy(schedule_json)
    del schedule["fractions"]["glas"]
    for event in schedule["events"]:
        event["fractions"] = [f for f in event["fractions"] if f != "glas"]
    schedule["fractions"]["farligt"] = {**schedule["fractions"]["rest"], "name": "Farligt avfall", "short": "Farligt"}
    schedule["events"][0]["fractions"].append("farligt")
    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], json=schedule)
    await setup_entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{setup_entry.entry_id}_next_glas") is None
    assert hass.states.get("sensor.storgatan_2_uppsala_glas") is None
    ny = hass.states.get("sensor.storgatan_2_uppsala_farligt_avfall")
    assert ny.state == "2026-11-04"
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{setup_entry.entry_id}_next_farligt")


async def test_okand_typ_far_sensor_med_id_som_namn(hass, setup_entry, aioclient_mock, schedule_json):
    schedule = copy.deepcopy(schedule_json)
    schedule["events"][0]["fractions"].append("okand")
    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], json=schedule)
    await setup_entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    state = hass.states.get("sensor.storgatan_2_uppsala_okand")
    assert state.state == "2026-11-04"
    assert state.attributes["friendly_name"] == "Storgatan 2, Uppsala okand"


async def test_dolda_avfallstyper_far_ingen_sensor(hass, setup_entry_hidden):
    assert hass.states.get(PLAST) is None
    assert hass.states.get(SAMMANFATTNING).state == "Metall – om 3 dagar"


async def test_inga_kommande(hass, setup_entry, freezer):
    _flytta_till(freezer, "2035-01-01T12:00:00")
    setup_entry.runtime_data.async_tick()
    await hass.async_block_till_done()
    assert hass.states.get(SAMMANFATTNING).state == "Inga kommande hämtningar"
    assert hass.states.get(DAGAR).state == "unknown"
    assert hass.states.get(I_DAG).state == "off"
    assert hass.states.get(I_MORGON).state == "off"
    assert hass.states.get(PLAST).state == "unknown"

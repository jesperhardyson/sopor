import copy
from datetime import datetime, timedelta

import pytest
from custom_components.sopor.const import DOMAIN
from custom_components.sopor.logic import event_description
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import async_fire_time_changed

KALENDER = "calendar.storgatan_2_uppsala_hamtschema"
HANDELSE = "event.storgatan_2_uppsala_schemat_andrades"


@pytest.fixture(autouse=True)
async def svenska(hass):
    """Testhass har engelska och amerikansk tid som standard."""
    hass.config.language = "sv"
    await hass.config.async_set_time_zone("Europe/Stockholm")


def _flytta_till(freezer, dag_och_tid: str):
    freezer.move_to(datetime.fromisoformat(f"{dag_och_tid}+01:00"))


async def _nytt_svar(hass, entry, aioclient_mock, schedule):
    aioclient_mock.clear_requests()
    aioclient_mock.get(entry.data["url"], json=schedule)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()


def _plast_flyttad(schedule_json):
    schedule = copy.deepcopy(schedule_json)
    schedule["events"][0]["fractions"] = ["metall"]
    schedule["events"].insert(
        1,
        {
            "date": "2026-11-05",
            "fractions": ["plast"],
            "estimated": False,
            "deviation": {"originalDate": "2026-11-04", "reason": "Helgdag"},
            "warning": None,
            "labels": {},
        },
    )
    return schedule


async def test_kalenderns_nasta_handelse(hass, setup_entry, freezer):
    state = hass.states.get(KALENDER)
    assert state.state == "off"
    assert state.attributes["message"] == "Plast & metall"
    assert state.attributes["all_day"] is True
    assert hass.states.get(KALENDER).attributes["start_time"].startswith("2026-11-04")
    registry = er.async_get(hass)
    assert registry.async_get(KALENDER).unique_id == f"{setup_entry.entry_id}_calendar"
    _flytta_till(freezer, "2026-11-04T12:00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(KALENDER).state == "on"


async def test_get_events_i_intervall(hass, setup_entry):
    svar = await hass.services.async_call(
        "calendar",
        "get_events",
        {"entity_id": KALENDER, "start_date_time": "2026-11-04 00:00:00", "end_date_time": "2026-11-12 00:00:00"},
        blocking=True,
        return_response=True,
    )
    handelser = svar[KALENDER]["events"]
    assert [(h["start"], h["end"], h["summary"]) for h in handelser] == [
        ("2026-11-04", "2026-11-05", "Plast & metall"),
        ("2026-11-05", "2026-11-06", "Rest, papper, tidn. & mat"),
        ("2026-11-11", "2026-11-12", "Plast & glas"),
    ]


async def test_get_events_halvoppet_intervall(hass, setup_entry):
    handelser = (
        await hass.data["calendar"]
        .get_entity(KALENDER)
        .async_get_events(
            hass,
            datetime.fromisoformat("2026-11-05T00:00:00+01:00"),
            datetime.fromisoformat("2026-11-11T00:00:00+01:00"),
        )
    )
    # Slutet är exklusivt och 4 nov slutar vid start
    assert [h.start.isoformat() for h in handelser] == ["2026-11-05"]
    assert handelser[0].uid == f"{setup_entry.data['id']}-2026-11-05@sopor.hardyson.se"


async def test_beskrivning_beraknat_och_flyttad(hass, setup_entry, aioclient_mock, schedule_json):
    schedule = _plast_flyttad(schedule_json)
    schedule["events"][0]["estimated"] = True
    schedule["events"][1]["estimated"] = True
    await _nytt_svar(hass, setup_entry, aioclient_mock, schedule)
    kalender = hass.data["calendar"].get_entity(KALENDER)
    handelser = await kalender.async_get_events(
        hass, datetime.fromisoformat("2026-11-04T00:00:00+01:00"), datetime.fromisoformat("2026-11-06T00:00:00+01:00")
    )
    assert handelser[0].description == "Beräknat datum."
    assert handelser[1].description == "Beräknat datum.\nFlyttad från ons 4 nov: Helgdag"
    assert hass.states.get(KALENDER).attributes["description"] == "Beräknat datum."


def test_beskrivning_utan_orsak_eller_ursprung_och_engelska(schedule_json):
    event = {**schedule_json["events"][0], "deviation": {"originalDate": None, "reason": ""}}
    assert event_description(event) == "Flyttad."
    event = {**event, "estimated": True, "deviation": {"originalDate": "2026-11-04", "reason": "Holiday"}}
    assert event_description(event, "en") == "Estimated date.\nMoved from Wed 4 Nov: Holiday"
    assert event_description(schedule_json["events"][0]) == ""


async def test_dolda_typer_syns_inte_i_kalendern(hass, setup_entry_hidden):
    assert hass.states.get(KALENDER).attributes["message"] == "Metall"
    handelser = (
        await hass.data["calendar"]
        .get_entity(KALENDER)
        .async_get_events(
            hass,
            datetime.fromisoformat("2026-11-01T00:00:00+01:00"),
            datetime.fromisoformat("2026-11-13T00:00:00+01:00"),
        )
    )
    assert [h.summary for h in handelser] == ["Metall", "Rest, papper, tidn. & mat", "Glas", "Rest, papper & mat"]


async def test_schemat_andrades_avfyras_per_typ(hass, setup_entry, aioclient_mock, schedule_json):
    state = hass.states.get(HANDELSE)
    assert state.state == "unknown"
    assert state.attributes["event_types"] == ["andrat"]
    registry = er.async_get(hass)
    assert registry.async_get(HANDELSE).unique_id == f"{setup_entry.entry_id}_changed"
    schedule = copy.deepcopy(schedule_json)
    # Plast flyttas från ons 4 nov till tors 5 nov
    schedule["events"][0]["fractions"] = ["metall"]
    schedule["events"][1]["fractions"].append("plast")
    schedule["events"][1]["deviation"] = {"originalDate": "2026-11-04", "reason": "Helgdag"}
    await _nytt_svar(hass, setup_entry, aioclient_mock, schedule)
    state = hass.states.get(HANDELSE)
    assert state.attributes["event_type"] == "andrat"
    assert state.attributes["avfallstyp"] == "Plastförpackningar"
    assert state.attributes["text"] == "Plastförpackningar flyttas från ons 4 nov till tors 5 nov"
    assert state.attributes["tidigare"] == "2026-11-04"
    assert state.attributes["nytt"] == "2026-11-05"
    assert state.attributes["orsak"] == "Helgdag"


async def test_tick_avfyrar_inte_igen(hass, setup_entry, aioclient_mock, freezer, schedule_json):
    schedule = _plast_flyttad(schedule_json)
    await _nytt_svar(hass, setup_entry, aioclient_mock, schedule)
    forsta = hass.states.get(HANDELSE).state
    assert forsta != "unknown"
    freezer.tick(timedelta(minutes=16))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(HANDELSE).state == forsta


async def test_dold_typ_avfyrar_inte(hass, setup_entry_hidden, aioclient_mock, schedule_json):
    # Bara plast ändras, och den är dold
    schedule = copy.deepcopy(schedule_json)
    schedule["events"][0]["fractions"] = ["metall"]
    schedule["events"][1]["fractions"].append("plast")
    await _nytt_svar(hass, setup_entry_hidden, aioclient_mock, schedule)
    assert hass.states.get(HANDELSE).state == "unknown"


async def test_andring_vid_start_avfyras(hass, mock_entry, aioclient_mock, freezer, schedule_json, hass_storage):
    # Det sparade svaret skiljer sig från det hämtade: ändringen upptäcks innan entiteterna finns
    _flytta_till(freezer, "2026-11-01T12:00:00")
    gammalt = copy.deepcopy(schedule_json)
    gammalt["events"][0]["fractions"] = ["metall"]
    gammalt["events"][1]["fractions"].append("plast")
    key = f"{DOMAIN}.{mock_entry.entry_id}"
    hass_storage[key] = {
        "version": 1,
        "minor_version": 1,
        "key": key,
        "data": {"url": mock_entry.data["url"], "schedule": gammalt},
    }
    aioclient_mock.get(mock_entry.data["url"], json=schedule_json)
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get(HANDELSE)
    assert state.attributes["event_type"] == "andrat"
    assert state.attributes["avfallstyp"] == "Plastförpackningar"
    assert state.attributes["tidigare"] == "2026-11-05"
    assert state.attributes["nytt"] == "2026-11-04"


async def test_tva_typer_ger_tva_tillstandsandringar(hass, setup_entry, aioclient_mock, schedule_json):
    typer = []

    def spara(event):
        if event.data["entity_id"] == HANDELSE:
            typer.append(event.data["new_state"].attributes.get("avfallstyp"))

    hass.bus.async_listen("state_changed", spara)
    # Plast och metall flyttas båda från 4 nov till 6 nov
    schedule = copy.deepcopy(schedule_json)
    schedule["events"][0]["date"] = "2026-11-06"
    await _nytt_svar(hass, setup_entry, aioclient_mock, schedule)
    assert typer == ["Plastförpackningar", "Metall"]

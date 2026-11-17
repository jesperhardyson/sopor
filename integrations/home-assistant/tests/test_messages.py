"""Källans meddelanden: attribut på sensorn och ärenden under Reparationer."""

import copy
from datetime import timedelta

import pytest
from custom_components.sopor.const import DOMAIN
from custom_components.sopor.logic import active_messages, message_text
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import async_fire_time_changed

ARENDE = "message_uppsala_nya-rutter-2026"


def _meddelande(**kwargs):
    return {
        "id": "nya-rutter-2026",
        "title": "Hämtrutterna läggs om",
        "text": "Schemat kan bli fel.",
        "url": None,
        "validFrom": "2026-11-01",
        "validTo": "2026-11-30",
        **kwargs,
    }


def _med(schedule, *messages):
    schedule = copy.deepcopy(schedule)
    schedule["messages"] = list(messages)
    return schedule


def _summary_state(hass, entry):
    entity_id = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_summary")
    return hass.states.get(entity_id)


def test_aktiva_meddelanden_gaeller_forsta_till_sista_dagen(schedule_json):
    schedule = _med(schedule_json, _meddelande())
    assert [m["id"] for m in active_messages(schedule, "2026-11-01")] == ["nya-rutter-2026"]
    assert [m["id"] for m in active_messages(schedule, "2026-11-30")] == ["nya-rutter-2026"]
    assert active_messages(schedule, "2026-10-31") == []
    assert active_messages(schedule, "2026-12-01") == []


def test_svar_utan_meddelanden_ger_tom_lista(schedule_json):
    schedule = copy.deepcopy(schedule_json)
    schedule.pop("messages", None)
    assert active_messages(schedule, "2026-11-01") == []


def test_texten_har_lanken_nar_den_finns():
    assert message_text(_meddelande()) == "Schemat kan bli fel."
    assert (
        message_text(_meddelande(url="https://x.test/a"), "sv")
        == "Schemat kan bli fel.\n\n[Läs mer hos källan](https://x.test/a)"
    )
    assert (
        message_text(_meddelande(url="https://x.test/a"), "en")
        == "Schemat kan bli fel.\n\n[Read more from the source](https://x.test/a)"
    )


@pytest.fixture
def schedule_json(schedule_json):
    """adress.json med ett meddelande som gäller fixturens dag (2026-11-01)."""
    return _med(schedule_json, _meddelande(url="https://www.uppsalavatten.se/nyheter"))


async def test_sensorn_har_meddelandet_som_attribut(hass, setup_entry):
    state = _summary_state(hass, setup_entry)
    assert state.attributes["meddelanden"] == [
        {
            # Automationer behöver id:t för att känna igen ett meddelande de redan skickat
            "id": "nya-rutter-2026",
            "rubrik": "Hämtrutterna läggs om",
            "text": "Schemat kan bli fel.",
            "lank": "https://www.uppsalavatten.se/nyheter",
            "till": "2026-11-30",
        }
    ]


async def test_meddelandet_blir_ett_arende(hass, setup_entry, issue_registry):
    issue = issue_registry.async_get_issue(DOMAIN, ARENDE)
    assert issue is not None
    assert issue.is_fixable is False
    assert issue.translation_key == "source_message"
    assert issue.translation_placeholders == {
        "title": "Hämtrutterna läggs om",
        # Testernas Home Assistant är på engelska. Den svenska texten testas i test_texten_har_lanken_nar_den_finns.
        "text": "Schemat kan bli fel.\n\n[Read more from the source](https://www.uppsalavatten.se/nyheter)",
    }


async def test_arendet_forsvinner_nar_meddelandet_tas_bort(
    hass, setup_entry, aioclient_mock, issue_registry, schedule_json
):
    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], json=_med(schedule_json))
    await setup_entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is None
    assert _summary_state(hass, setup_entry).attributes["meddelanden"] == []


async def test_arendet_forsvinner_vid_midnatt_efter_sista_dagen(
    hass, setup_entry, aioclient_mock, freezer, issue_registry, schedule_json
):
    # Meddelandet gäller bara fixturens dag, också i svaret från hämtningen som hinner gå under natten.
    kort = _med(schedule_json, _meddelande(validTo="2026-11-01"))
    aioclient_mock.clear_requests()
    aioclient_mock.get(setup_entry.data["url"], json=kort)
    setup_entry.runtime_data.async_set_updated_data(kort)
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is not None
    freezer.tick(timedelta(hours=12, minutes=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is None
    assert _summary_state(hass, setup_entry).attributes["meddelanden"] == []


async def test_inget_arende_for_kommande_meddelande(hass, setup_entry, issue_registry, schedule_json):
    setup_entry.runtime_data.async_set_updated_data(_med(schedule_json, _meddelande(validFrom="2026-11-17")))
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is None
    assert _summary_state(hass, setup_entry).attributes["meddelanden"] == []


async def test_borttagen_post_raderar_kallans_arende(hass, setup_entry, issue_registry):
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is not None
    assert await hass.config_entries.async_remove(setup_entry.entry_id)
    await hass.async_block_till_done()
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is None


async def test_aldre_data_hos_en_annan_adress_tar_inte_bort_arendet(
    hass, setup_entry, second_entry, aioclient_mock, issue_registry, schedule_json
):
    # Två adresser hos samma källa. Den andra har ännu inte hämtat meddelandet.
    aioclient_mock.get(second_entry.data["url"], json=_med(schedule_json))
    second_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(second_entry.entry_id)
    await hass.async_block_till_done()
    ir.async_ignore_issue(hass, DOMAIN, ARENDE, True)
    second_entry.runtime_data.async_set_updated_data(_med(schedule_json))
    second_entry.runtime_data.async_tick()
    issue = issue_registry.async_get_issue(DOMAIN, ARENDE)
    assert issue is not None
    assert issue.dismissed_version is not None


async def test_arendet_gar_nar_ingen_adress_hos_kallan_har_meddelandet(
    hass, setup_entry, second_entry, aioclient_mock, issue_registry, schedule_json
):
    aioclient_mock.get(second_entry.data["url"], json=schedule_json)
    second_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(second_entry.entry_id)
    await hass.async_block_till_done()
    for entry in (setup_entry, second_entry):
        entry.runtime_data.async_set_updated_data(_med(schedule_json))
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is None


async def test_ärenden_för_en_källa_utan_adresser_tas_bort_vid_start(
    hass, mock_entry, aioclient_mock, freezer, issue_registry, schedule_json
):
    # Till exempel när den enda adressen hos källan bytt till en annan källa med Konfigurera om
    ir.async_create_issue(
        hass,
        DOMAIN,
        "message_avesta_nya-rutter-2026",
        is_fixable=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key="source_message",
        translation_placeholders={"title": "T", "text": "T"},
    )
    freezer.move_to("2026-11-01T12:00:00+01:00")
    aioclient_mock.get(mock_entry.data["url"], json=schedule_json)
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert issue_registry.async_get_issue(DOMAIN, "message_avesta_nya-rutter-2026") is None
    assert issue_registry.async_get_issue(DOMAIN, ARENDE) is not None


async def test_en_källa_vars_id_börjar_likadant_rörs_inte(hass, setup_entry, issue_registry, schedule_json):
    ir.async_create_issue(
        hass,
        DOMAIN,
        "message_uppsala-lan_x",
        is_fixable=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key="source_message",
        translation_placeholders={"title": "T", "text": "T"},
    )
    setup_entry.runtime_data.async_set_updated_data(_med(schedule_json))
    # Källan uppsala-lan har ingen adress, men det avgörs vid start, inte av uppsalas uppdatering
    assert issue_registry.async_get_issue(DOMAIN, "message_uppsala-lan_x") is not None

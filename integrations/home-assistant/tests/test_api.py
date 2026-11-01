import json
from pathlib import Path

import pytest
from custom_components.sopor.api import SoporClient, SoporError
from custom_components.sopor.const import BASE_URL, VERSION
from homeassistant.helpers.aiohttp_client import async_get_clientsession

FIXTURES = Path(__file__).parent / "fixtures"
USER_AGENT = f"Sopor-HomeAssistant/{VERSION} (+https://sopor.hardyson.se)"


async def test_search_skickar_user_agent_och_q(aioclient_mock, hass):
    data = json.loads((FIXTURES / "sok.json").read_text(encoding="utf-8"))
    aioclient_mock.get(f"{BASE_URL}/sok?q=Storgatan+2", json=data)
    client = SoporClient(async_get_clientsession(hass))
    assert await client.search("Storgatan 2") == data
    _, url, _, headers = aioclient_mock.mock_calls[0]
    assert str(url) == f"{BASE_URL}/sok?q=Storgatan+2"
    assert headers["User-Agent"] == USER_AGENT


async def test_schedule_hamtar_traffens_url(aioclient_mock, hass):
    data = json.loads((FIXTURES / "adress.json").read_text(encoding="utf-8"))
    url = f"{BASE_URL}/adress/uppsala/x"
    aioclient_mock.get(url, json=data)
    assert await SoporClient(async_get_clientsession(hass)).schedule(url) == data


async def test_sources(aioclient_mock, hass):
    data = json.loads((FIXTURES / "kallor.json").read_text(encoding="utf-8"))
    aioclient_mock.get(f"{BASE_URL}/kallor", json=data)
    assert await SoporClient(async_get_clientsession(hass)).sources() == data


async def test_502_ger_source_unavailable(aioclient_mock, hass):
    aioclient_mock.get(f"{BASE_URL}/kallor", status=502, text="Bad Gateway")
    with pytest.raises(SoporError) as err:
        await SoporClient(async_get_clientsession(hass)).sources()
    assert err.value.status == 502
    assert err.value.code == "source_unavailable"


async def test_annat_fel_utan_json_ger_unknown(aioclient_mock, hass):
    aioclient_mock.get(f"{BASE_URL}/kallor", status=500, text="oj")
    with pytest.raises(SoporError) as err:
        await SoporClient(async_get_clientsession(hass)).sources()
    assert (err.value.status, err.value.code) == (500, "unknown")


async def test_felkod_ur_svaret(aioclient_mock, hass):
    aioclient_mock.get(
        f"{BASE_URL}/adress/uppsala/x",
        status=404,
        json={"error": {"code": "not_found", "message": "Adressen finns inte"}},
    )
    with pytest.raises(SoporError) as err:
        await SoporClient(async_get_clientsession(hass)).schedule(f"{BASE_URL}/adress/uppsala/x")
    assert err.value.status == 404
    assert err.value.code == "not_found"
    assert err.value.message == "Adressen finns inte"


async def test_timeout_ger_status_0(aioclient_mock, hass):
    aioclient_mock.get(f"{BASE_URL}/kallor", exc=TimeoutError())
    with pytest.raises(SoporError) as err:
        await SoporClient(async_get_clientsession(hass)).sources()
    assert (err.value.status, err.value.code) == (0, "network")

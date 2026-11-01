"""Rökprov mot produktions-API:t. Körs bara med `pytest -m smoke` (kräver nät)."""

import socket
from datetime import datetime

import aiohttp
import pytest
import pytest_socket
from custom_components.sopor.api import SoporClient
from custom_components.sopor.logic import fraction_ids, summary, today_in_stockholm


@pytest.fixture
def riktigt_nat():
    """pytest-homeassistant-custom-component blockerar riktiga uttag i varje test. Öppna dem bara för rökprovet."""
    guard = socket.socket.connect
    pytest_socket._remove_restrictions()
    yield
    socket.socket.connect = guard
    pytest_socket.disable_socket(allow_unix_socket=True)


@pytest.mark.smoke
async def test_produktions_api(riktigt_nat):
    async with aiohttp.ClientSession() as session:
        klient = SoporClient(session)
        sok = await klient.search("Storgatan 2")
        assert sok["addresses"], "Storgatan 2 gav inga träffar"
        schema = await klient.schedule(sok["addresses"][0]["url"])
    idag = today_in_stockholm(datetime.now().astimezone())
    assert summary(schema, idag, "sv")
    assert fraction_ids(schema)

import json
import sys
from datetime import datetime
from pathlib import Path

import custom_components
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

# pytest-homeassistant-custom-component har ett eget paket "custom_components" (testing_config)
# som annars skuggar vårt. Lägg till repots mapp i dess sökväg så att custom_components.sopor hittas.
_REPO_PAKET = str(Path(__file__).resolve().parents[3] / "custom_components")
if _REPO_PAKET not in custom_components.__path__:
    custom_components.__path__.append(_REPO_PAKET)
sys.modules.pop("custom_components.sopor", None)

from custom_components.sopor.const import CONF_HIDDEN, DOMAIN


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Låter Home Assistant hitta custom_components/sopor i testerna."""
    yield


FIXTURER = Path(__file__).parent / "fixtures"


def _fixtur(namn: str):
    return json.loads((FIXTURER / namn).read_text(encoding="utf-8"))


def _post(hit: dict, **kwargs) -> MockConfigEntry:
    data = {key: hit[key] for key in ("source", "id", "url", "street", "locality", "kommun", "detail")}
    return MockConfigEntry(
        domain=DOMAIN,
        title=f"{hit['street']}, {hit['locality']}",
        unique_id=f"{hit['source']}/{hit['id']}",
        data=data,
        **kwargs,
    )


@pytest.fixture
def schedule_json() -> dict:
    """Ett riktigt svar från /adress (Uppsala), med today 2026-11-01."""
    return _fixtur("adress.json")


@pytest.fixture
def mock_entry() -> MockConfigEntry:
    """Posten för sok.jsons första träff, samma adress som adress.json. Läggs inte till i hass."""
    return _post(_fixtur("sok.json")["addresses"][0])


@pytest.fixture
def second_entry() -> MockConfigEntry:
    """En post för en annan träff i sok.json. Läggs inte till i hass."""
    return _post(_fixtur("sok.json")["addresses"][1])


async def _setup(hass, entry, aioclient_mock, freezer, schedule_json):
    freezer.move_to(datetime.fromisoformat(f"{schedule_json['today']}T12:00:00+01:00"))
    aioclient_mock.get(entry.data["url"], json=schedule_json)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


@pytest.fixture
async def setup_entry(hass, mock_entry, aioclient_mock, freezer, schedule_json) -> MockConfigEntry:
    """mock_entry uppsatt med adress.json som svar och tiden låst till fixturens dag kl. 12 i Stockholm."""
    return await _setup(hass, mock_entry, aioclient_mock, freezer, schedule_json)


@pytest.fixture
async def setup_entry_hidden(hass, aioclient_mock, freezer, schedule_json) -> MockConfigEntry:
    """Som setup_entry, men med plast dold."""
    entry = _post(_fixtur("sok.json")["addresses"][0], options={CONF_HIDDEN: ["plast"]})
    return await _setup(hass, entry, aioclient_mock, freezer, schedule_json)

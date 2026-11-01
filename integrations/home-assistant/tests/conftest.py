import sys
from pathlib import Path

import custom_components
import pytest

# pytest-homeassistant-custom-component har ett eget paket "custom_components" (testing_config)
# som annars skuggar vårt. Lägg till repots mapp i dess sökväg så att custom_components.sopor hittas.
_REPO_PAKET = str(Path(__file__).resolve().parents[3] / "custom_components")
if _REPO_PAKET not in custom_components.__path__:
    custom_components.__path__.append(_REPO_PAKET)
sys.modules.pop("custom_components.sopor", None)


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Låter Home Assistant hitta custom_components/sopor i testerna."""
    yield

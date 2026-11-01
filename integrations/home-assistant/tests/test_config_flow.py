import json
from pathlib import Path

from custom_components.sopor.api import Search
from custom_components.sopor.const import BASE_URL, DOMAIN
from custom_components.sopor.logic import hit_label, hit_title, kommun_names, parse_query, search_outcome
from homeassistant.config_entries import SOURCE_USER
from homeassistant.data_entry_flow import FlowResultType

FIXTURES = Path(__file__).parent / "fixtures"
SOK = json.loads((FIXTURES / "sok.json").read_text(encoding="utf-8"))
KALLOR = json.loads((FIXTURES / "kallor.json").read_text(encoding="utf-8"))


def _mocka(aioclient_mock, q: str, search: Search = SOK, kallor=KALLOR):
    aioclient_mock.get(f"{BASE_URL}/sok", json=search)
    if kallor is None:
        aioclient_mock.get(f"{BASE_URL}/kallor", status=502, text="Bad Gateway")
    else:
        aioclient_mock.get(f"{BASE_URL}/kallor", json=kallor)


async def _start(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    return result


async def _sok(hass, text: str):
    result = await _start(hass)
    return await hass.config_entries.flow.async_configure(result["flow_id"], {"adress": text})


def _uppsala():
    _, hits = search_outcome(SOK, parse_query("Storgatan 2, Uppsala")[1])
    return hits


def _val(result) -> list[dict]:
    return result["data_schema"].schema["adress"].config["options"]


async def test_en_till_tolv_traffar_gar_till_adress(hass, aioclient_mock):
    _mocka(aioclient_mock, "Storgatan 2")
    result = await _sok(hass, "Storgatan 2, Uppsala")
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "adress"
    hits = _uppsala()
    assert _val(result) == [{"value": f"{h['source']}/{h['id']}", "label": hit_label(h)} for h in hits]
    # Sökningen görs på gatan, orten filtreras i integrationen
    assert f"{BASE_URL}/sok?q=Storgatan+2" in [str(call[1]) for call in aioclient_mock.mock_calls]


async def test_val_skapar_post(hass, aioclient_mock):
    _mocka(aioclient_mock, "Storgatan 2")
    result = await _sok(hass, "Storgatan 2, Uppsala")
    hit = _uppsala()[1]
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"adress": f"{hit['source']}/{hit['id']}"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == hit_title(hit)
    assert result["data"] == {k: hit[k] for k in ("source", "id", "url", "street", "locality", "kommun", "detail")}
    entry = result["result"]
    assert entry.unique_id == f"{hit['source']}/{hit['id']}"
    assert entry.data["url"] == hit["url"]


async def test_fler_an_tolv_gar_till_ort(hass, aioclient_mock):
    _mocka(aioclient_mock, "Storgatan 2")
    result = await _sok(hass, "Storgatan 2")
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "ort"
    options = result["data_schema"].schema["ort"].config["options"]
    uppsala = next(o for o in options if o["value"] == "Uppsala|Uppsala kommun")
    assert uppsala["label"] == "Uppsala, Uppsala kommun (10)"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"ort": uppsala["value"]})
    assert result["step_id"] == "adress"
    assert len(_val(result)) == 10


async def test_for_kort_fraga(hass, aioclient_mock):
    _mocka(aioclient_mock, "")
    result = await _sok(hass, "St, Uppsala")
    assert result["step_id"] == "user"
    assert result["errors"] == {"adress": "too_short"}


async def test_kallor_svarade_inte(hass, aioclient_mock):
    _mocka(aioclient_mock, "x", {"addresses": [], "failed": ["uppsala"]})
    result = await _sok(hass, "Storgatan 2")
    assert result["step_id"] == "user"
    assert result["errors"] == {"base": "sources_failed"}


async def test_ingen_traff_tre_meddelanden(hass, aioclient_mock):
    tom = {"addresses": [], "failed": []}
    _mocka(aioclient_mock, "x", tom)
    result = await _sok(hass, "Storgatan 2")
    assert result["errors"] == {"base": "not_found"}

    # Orten är en av kommunerna men gatan finns inte
    namn = kommun_names(KALLOR)[0]
    result = await _sok(hass, f"Storgatan 2, {namn}")
    assert result["errors"] == {"base": "not_found_covered"}
    assert result["description_placeholders"]["place"] == namn

    result = await _sok(hass, "Storgatan 2, Zzzville")
    assert result["errors"] == {"base": "not_found_elsewhere"}
    assert result["description_placeholders"]["place"] == "Zzzville"


async def test_natfel_vid_sokning(hass, aioclient_mock):
    aioclient_mock.get(f"{BASE_URL}/sok", exc=TimeoutError)
    aioclient_mock.get(f"{BASE_URL}/kallor", json=KALLOR)
    result = await _sok(hass, "Storgatan 2")
    assert result["step_id"] == "user"
    assert result["errors"] == {"base": "cannot_connect"}


async def test_samma_adress_tva_ganger(hass, aioclient_mock, mock_entry):
    mock_entry.add_to_hass(hass)
    _mocka(aioclient_mock, "Storgatan 2")
    result = await _sok(hass, "Storgatan 2, Uppsala")
    hit = _uppsala()[0]
    assert f"{hit['source']}/{hit['id']}" == mock_entry.unique_id
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"adress": mock_entry.unique_id})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_beskrivningen_har_antal_kommuner(hass, aioclient_mock):
    _mocka(aioclient_mock, "")
    result = await _start(hass)
    assert result["description_placeholders"]["count"] == str(len(kommun_names(KALLOR)))


async def test_beskrivningen_utan_antal_nar_kallor_failar(hass, aioclient_mock):
    _mocka(aioclient_mock, "", kallor=None)
    result = await _start(hass)
    assert result["description_placeholders"]["count"] == ""

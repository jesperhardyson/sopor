import json
from pathlib import Path

import probatio
import pytest
from custom_components.sopor.api import Search
from custom_components.sopor.const import BASE_URL, DOMAIN
from custom_components.sopor.logic import hit_label, hit_title, kommun_names, parse_query, search_outcome
from homeassistant.config_entries import SOURCE_USER
from homeassistant.data_entry_flow import FlowResultType, InvalidData

FIXTURES = Path(__file__).parent / "fixtures"
SOK = json.loads((FIXTURES / "sok.json").read_text(encoding="utf-8"))
KALLOR = json.loads((FIXTURES / "kallor.json").read_text(encoding="utf-8"))


def _mocka(aioclient_mock, q: str, search: Search = SOK, kallor=KALLOR, omraden=None):
    aioclient_mock.get(f"{BASE_URL}/sok", json=search)
    aioclient_mock.get(f"{BASE_URL}/omraden", json={"apiVersion": "1", "addresses": omraden or [], "failed": []})
    if kallor is None:
        aioclient_mock.get(f"{BASE_URL}/kallor", status=502, text="Bad Gateway")
    else:
        aioclient_mock.get(f"{BASE_URL}/kallor", json=kallor)


async def _start(hass, step="user"):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == step
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
    assert result["description_placeholders"]["kommuner_url"] == "https://sopor.hardyson.se/bidra#kommuner"


async def test_beskrivningen_utan_antal_nar_kallor_failar(hass, aioclient_mock):
    _mocka(aioclient_mock, "", kallor=None)
    result = await _start(hass, "user_utan_antal")
    assert result["description_placeholders"]["count"] == ""


async def test_ingen_traff_utan_kommunlista_ger_not_found(hass, aioclient_mock):
    aioclient_mock.get(f"{BASE_URL}/sok", json={"addresses": [], "failed": []})
    aioclient_mock.get(f"{BASE_URL}/omraden", json={"apiVersion": "1", "addresses": [], "failed": []})
    aioclient_mock.get(f"{BASE_URL}/kallor", status=502, text="Bad Gateway")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["step_id"] == "user_utan_antal"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"adress": "Storgatan 2, Zzzville"})
    assert result["step_id"] == "user_utan_antal"
    assert result["errors"] == {"base": "not_found"}
    # /kallor hämtas bara en gång under flödets sökning, även vid misslyckande
    kallor = [c for c in aioclient_mock.mock_calls if str(c[1]).endswith("/kallor")]
    assert len(kallor) == 1


def _omrade(notice: str = "Kontrollera att området stämmer."):
    return {
        "id": "trakt-7",
        "street": "Avesta tätort",
        "locality": "",
        "kommun": "Avesta kommun",
        "source": "avesta",
        "detail": "Tisdag, jämn vecka · Trakt 7",
        "url": f"{BASE_URL}/adress/avesta/trakt-7",
        "selection": "area",
        "notice": notice,
        "areasUrl": "https://sopor.hardyson.se/avesta/omraden",
    }


async def test_adresser_utan_notice_far_steget_adress(hass, aioclient_mock):
    _mocka(aioclient_mock, "Storgatan 2")
    result = await _sok(hass, "Storgatan 2, Uppsala")
    assert result["step_id"] == "adress"
    assert "notice" not in (result["description_placeholders"] or {})


async def test_omrade_visar_notice_en_gang_i_blandad_lista(hass, aioclient_mock):
    adress = SOK["addresses"][0]
    search = {"addresses": [adress, _omrade(), {**_omrade(), "id": "trakt-8"}], "failed": []}
    _mocka(aioclient_mock, "Stallgatan", search)
    result = await _sok(hass, "Stallgatan")
    assert result["step_id"] == "adress_omrade"
    assert result["description_placeholders"]["notice"] == "Kontrollera att området stämmer."
    assert len(_val(result)) == 3


async def test_omrade_ar_inte_forvalt(hass, aioclient_mock):
    _mocka(aioclient_mock, "Avesta", {"addresses": [_omrade()], "failed": []})
    result = await _sok(hass, "Avesta tätort")
    # Frontenden förväljer annars första alternativet i ett obligatoriskt fält
    falt = next(iter(result["data_schema"].schema))
    assert falt.description == {"suggested_value": ""}
    assert isinstance(falt, probatio.Required)


async def test_tomt_omrade_godtas_inte(hass, aioclient_mock):
    _mocka(aioclient_mock, "Avesta", {"addresses": [_omrade()], "failed": []})
    result = await _sok(hass, "Avesta tätort")
    with pytest.raises(InvalidData):
        await hass.config_entries.flow.async_configure(result["flow_id"], {"adress": ""})


async def test_val_efter_notice_skapar_post_utan_notice(hass, aioclient_mock):
    _mocka(aioclient_mock, "Avesta", {"addresses": [_omrade()], "failed": []})
    result = await _sok(hass, "Avesta tätort")
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"adress": "avesta/trakt-7"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert "notice" not in result["data"]


async def test_notice_efter_val_av_ort_galler_bara_den_ortens_traffar(hass, aioclient_mock):
    gator = [{**_omrade(), "id": f"trakt-{i}", "kommun": "Avesta kommun"} for i in range(13)]
    adress = {**SOK["addresses"][0], "notice": None}
    _mocka(aioclient_mock, "Storgatan", {"addresses": [*gator, adress], "failed": []})
    result = await _sok(hass, "Storgatan")
    assert result["step_id"] == "ort"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"ort": "Uppsala|Uppsala kommun"})
    assert result["step_id"] == "adress"


def test_stegets_oversattningar_visar_notice():
    for lang in ("sv", "en"):
        path = Path(__file__).parents[3] / "custom_components/sopor/translations" / f"{lang}.json"
        step = json.loads(path.read_text(encoding="utf-8"))["config"]["step"]["adress_omrade"]
        assert "{notice}" in step["description"]
        assert "{area_links}" in step["description"]


async def test_adress_som_saknas_ger_kommunens_omraden(hass, aioclient_mock):
    _mocka(aioclient_mock, "Kungsgatan 12", omraden=[_omrade()])
    result = await _sok(hass, "Kungsgatan 12, Avesta")
    assert result["step_id"] == "adress_omrade"
    assert result["description_placeholders"]["notice"] == "Kontrollera att området stämmer."
    assert (
        result["description_placeholders"]["area_links"] == "[Avesta kommun](https://sopor.hardyson.se/avesta/omraden)"
    )
    assert [v["value"] for v in _val(result)] == ["avesta/trakt-7"]
    assert str(aioclient_mock.mock_calls[-1][1]).endswith("/omraden?plats=Avesta")


async def test_utan_ort_fragas_inte_efter_omraden(hass, aioclient_mock):
    _mocka(
        aioclient_mock, "Kungsgatan 12", search={"apiVersion": "1", "addresses": [], "failed": []}, omraden=[_omrade()]
    )
    result = await _sok(hass, "Kungsgatan 12")
    assert result["errors"] == {"base": "not_found"}
    assert not [c for c in aioclient_mock.mock_calls if "/omraden" in str(c[1])]


async def test_fel_fran_omraden_ger_vanlig_text(hass, aioclient_mock):
    aioclient_mock.get(f"{BASE_URL}/sok", json={"apiVersion": "1", "addresses": [], "failed": []})
    aioclient_mock.get(f"{BASE_URL}/kallor", json=KALLOR)
    aioclient_mock.get(f"{BASE_URL}/omraden", status=502, text="Bad Gateway")
    result = await _sok(hass, "Kungsgatan 12, Avesta")
    assert result["step_id"] == "user"
    assert "base" in result["errors"]

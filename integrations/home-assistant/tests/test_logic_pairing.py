import json
from pathlib import Path

from custom_components.sopor.logic import (
    hit_label,
    hit_title,
    kommun_names,
    not_found_error,
    notice_text,
    parse_query,
    place_covered,
    place_key,
    places,
    search_outcome,
)

FIXTURES = Path(__file__).parent / "fixtures"


def hit(street="Storgatan 2", locality="Uppsala", kommun="Uppsala kommun", detail=None):
    return {
        "id": f"{street}-{locality}",
        "street": street,
        "locality": locality,
        "kommun": kommun,
        "source": "uppsala",
        "detail": detail,
        "url": "https://example.test/adress",
    }


def search(*hits, failed=()):
    return {"addresses": list(hits), "failed": list(failed)}


def test_parse_query():
    assert parse_query(" Storgatan 2 , Uppsala ") == ("Storgatan 2", "Uppsala")
    assert parse_query("Storgatan 2") == ("Storgatan 2", "")
    assert parse_query("Storgatan 2, Västra Götaland, Borås") == ("Storgatan 2", "Västra Götaland, Borås")


def test_ort_filtrerar_pa_ordborjan():
    s = search(hit(), hit(locality="Salem", kommun="Salems kommun"))
    assert search_outcome(s, "upp") == ("found", [s["addresses"][0]])
    assert search_outcome(s, "sala") == ("none", [])


def test_ort_matchar_kommun():
    s = search(hit(locality="Storvreta", kommun="Uppsala kommun"))
    assert search_outcome(s, "uppsala")[0] == "found"


def test_ort_ignorerar_versaler_och_skiljetecken():
    s = search(hit(locality="Älvsjö", kommun="Stockholms kommun"))
    assert search_outcome(s, "ÄLVSJÖ,")[0] == "found"


def test_alla_ord_i_orten_maste_matcha():
    s = search(hit())
    assert search_outcome(s, "uppsala borås")[0] == "none"


def test_fler_an_12_ger_places():
    data = json.loads((FIXTURES / "sok.json").read_text(encoding="utf-8"))
    assert len(data["addresses"]) > 12
    result, hits = search_outcome(data, "")
    assert result == "places"
    assert hits == data["addresses"]


def test_exakt_12_ger_found():
    assert search_outcome(search(*[hit(street=f"Gata {i}") for i in range(12)]), "")[0] == "found"


def test_inga_traffar_och_failed_ger_failed():
    assert search_outcome(search(failed=["uppsala"]), "") == ("failed", [])
    assert search_outcome(search(), "") == ("none", [])


def test_places_flest_forst_sedan_namn():
    hits = [
        hit(locality="Örebro", kommun="Örebro kommun"),
        hit(locality="Alby", kommun="Botkyrka kommun"),
        hit(),
        hit(),
    ]
    result = places(hits)
    assert [(p.key, p.label, p.count) for p in result] == [
        ("Uppsala|Uppsala kommun", "Uppsala, Uppsala kommun", 2),
        ("Alby|Botkyrka kommun", "Alby, Botkyrka kommun", 1),
        ("Örebro|Örebro kommun", "Örebro, Örebro kommun", 1),
    ]


def test_places_utan_ort_visar_kommunen():
    result = places([hit(locality="", kommun="Gotlands kommun")])
    assert result[0].label == "Gotlands kommun"
    assert result[0].key == "|Gotlands kommun"


def test_place_key():
    assert place_key(hit()) == "Uppsala|Uppsala kommun"


def test_hit_title_och_label():
    assert hit_title(hit()) == "Storgatan 2, Uppsala"
    assert hit_title(hit(locality="", kommun="Gotlands kommun")) == "Storgatan 2, Gotlands kommun"
    assert hit_label(hit()) == "Storgatan 2, Uppsala"


def test_omradestraff_ger_label_med_trakt():
    omrade = hit(
        street="Avesta tätort, Östanfors m.fl.",
        locality="",
        kommun="Avesta kommun",
        detail="Tisdag, jämn vecka · Trakt 7",
    )
    assert hit_label(omrade) == "Avesta tätort, Östanfors m.fl., Avesta kommun, Tisdag, jämn vecka · Trakt 7"


def test_hit_label_med_detail():
    assert hit_label(hit(detail="Lgh 1101")) == "Storgatan 2, Uppsala, Lgh 1101"


def test_kommun_names_unika_utan_ordet_kommun():
    sources = {
        "sources": [
            {
                "id": "a",
                "kommuner": [{"code": "0380", "name": "Uppsala kommun"}, {"code": "1880", "name": "Örebro kommun"}],
            },
            {"id": "b", "kommuner": [{"code": "0380", "name": "Uppsala kommun"}, {"code": "0980", "name": "Gotland"}]},
        ]
    }
    assert kommun_names(sources) == ["Gotland", "Uppsala", "Örebro"]


def test_kommun_names_ur_fixtur():
    data = json.loads((FIXTURES / "kallor.json").read_text(encoding="utf-8"))
    names = kommun_names(data)
    assert "Uppsala" in names
    assert not any(n.lower().endswith("kommun") for n in names)
    assert len(names) == len(set(names))


def test_place_covered():
    names = ["Gotland", "Uppsala", "Västerås"]
    assert place_covered(names, "upp")
    assert place_covered(names, "Uppsala")
    assert not place_covered(names, "Lund")


def test_not_found_error():
    names = ["Uppsala"]
    assert not_found_error("", names) == "not_found"
    assert not_found_error("Uppsala", names) == "not_found_covered"
    assert not_found_error("Kiruna", names) == "not_found_elsewhere"


def _traff(notice):
    return {"source": "x", "id": "y", "street": "Trakt 1", "locality": "", "kommun": "Avesta kommun", "notice": notice}


def test_notice_text_tom_utan_notice():
    assert notice_text([_traff(None)]) == ""


def test_notice_text_samma_text_en_gang_ocksa_i_blandad_lista():
    assert notice_text([_traff(None), _traff("Avesta"), _traff("Avesta")]) == "Avesta"


def test_notice_text_varje_kallas_egen_text_i_listans_ordning():
    assert notice_text([_traff("Avesta"), _traff("Säter")]) == "Avesta\n\nSäter"

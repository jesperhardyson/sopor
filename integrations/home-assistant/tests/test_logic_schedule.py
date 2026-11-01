import json
from pathlib import Path

from custom_components.sopor.logic import (
    ScheduleChange,
    change_text,
    days_to_next,
    fraction_ids,
    fraction_name,
    fractions_on,
    join_short,
    next_event,
    schedule_changes,
    summary,
    upcoming,
    without_fractions,
)


def fraction(name, short):
    return {"name": name, "short": short, "color": "#000000", "icon": "trash-2"}


def event(day, fractions, estimated=False, reason=None):
    deviation = {"originalDate": None, "reason": reason} if reason else None
    return {"date": day, "fractions": fractions, "estimated": estimated, "deviation": deviation, "warning": None}


def schedule(events, fractions=None):
    return {
        "apiVersion": "1",
        "today": "2026-10-30",
        "address": {
            "id": "storgatan-2_uppsala-1",
            "street": "Storgatan 2",
            "locality": "Uppsala",
            "kommun": "Uppsala kommun",
            "source": "uppsala",
            "detail": None,
        },
        "events": events,
        "fractions": fractions
        if fractions is not None
        else {
            "rest": fraction("Restavfall", "Rest"),
            "plast": fraction("Plastförpackningar", "Plast"),
            "metall": fraction("Metall", "Metall"),
        },
        "links": {"ics": "https://sopor.hardyson.se/ics/x.ics", "web": "https://sopor.hardyson.se/x"},
    }


# Svaret hämtades i går. "I dag" är den 31 oktober.
TODAY = "2026-10-31"
S = schedule(
    [
        event("2026-10-30", ["rest"]),
        event("2026-11-01", ["plast", "metall"]),
        event("2026-11-04", ["rest", "tradgard"], estimated=True),
    ]
)


def test_fraction_ids_tar_med_okanda_id_sist():
    s = schedule(
        [event("2026-11-04", ["tradgard", "plast"])], {"rest": fraction("Rest", "Rest"), "plast": fraction("P", "P")}
    )
    assert fraction_ids(s) == ["rest", "plast", "tradgard"]


def test_fraction_name_faller_tillbaka_pa_id():
    assert fraction_name(S, "plast") == "Plastförpackningar"
    assert fraction_name(S, "tradgard") == "tradgard"


def test_join_short():
    assert join_short(S, ["plast", "metall"]) == "Plast & metall"
    assert join_short(S, ["rest", "plast", "metall"]) == "Rest, plast & metall"
    assert join_short(S, ["rest"]) == "Rest"
    assert join_short(S, ["tradgard"]) == "tradgard"


def test_upcoming_hoppar_over_passerade():
    assert [e["date"] for e in upcoming(S, TODAY)] == ["2026-11-01", "2026-11-04"]


def test_summary():
    assert summary(S, TODAY, "sv") == "Plast & metall – i morgon"
    assert summary(S, "2026-10-31", "en") == "Plast & metall – tomorrow"
    s = schedule([event("2026-11-04", ["plast", "metall"])])
    assert summary(s, "2026-11-01", "sv") == "Plast & metall – om 3 dagar"


def test_summary_utan_kommande():
    assert summary(S, "2027-01-01", "sv") == "Inga kommande hämtningar"
    assert summary(S, "2027-01-01", "en") == "No upcoming collections"


def test_days_to_next_i_dag_ar_noll_och_tomt_ar_none():
    assert days_to_next(S, TODAY) == 1
    assert days_to_next(S, "2026-11-01") == 0
    assert days_to_next(S, "2026-11-05") is None


def test_fractions_on_i_morgon():
    assert fractions_on(S, TODAY, 1) == ["plast", "metall"]
    assert fractions_on(S, TODAY, 0) == []


def test_next_event_hoppar_over_passerade():
    assert next_event(S, TODAY, "rest") == S["events"][2]
    assert next_event(S, TODAY, "plast") == S["events"][1]
    assert next_event(S, TODAY, "glas") is None


def test_schedule_changes_flyttad_borttagen_ny():
    before = schedule([event("2026-11-04", ["plast"]), event("2026-11-06", ["rest"]), event("2026-11-07", ["metall"])])
    after = schedule(
        [
            event("2026-11-05", ["plast"], reason="Allhelgonahelgen"),
            event("2026-11-06", ["rest"]),
            event("2026-11-08", ["glas"]),
        ]
    )
    assert schedule_changes(before, after, TODAY) == [
        ScheduleChange("plast", "2026-11-04", "2026-11-05", "Allhelgonahelgen"),
        ScheduleChange("metall", "2026-11-07", None, None),
        ScheduleChange("glas", None, "2026-11-08", None),
    ]


def test_schedule_changes_ignorerar_passerade():
    before = schedule([event("2026-10-30", ["rest"]), event("2026-11-06", ["rest"])])
    after = schedule([event("2026-11-06", ["rest"])])
    assert schedule_changes(before, after, TODAY) == []


def test_change_text():
    assert (
        change_text(S, ScheduleChange("plast", "2026-11-04", "2026-11-05", None), "sv")
        == "Plastförpackningar flyttas från ons 4 nov till tors 5 nov"
    )
    assert (
        change_text(S, ScheduleChange("plast", "2026-11-04", None, None), "sv")
        == "Plastförpackningar hämtas inte ons 4 nov"
    )
    assert change_text(S, ScheduleChange("glas", None, "2026-11-04", None), "sv") == "glas hämtas ons 4 nov"
    assert (
        change_text(S, ScheduleChange("plast", "2026-11-04", "2026-11-05", None), "en")
        == "Plastförpackningar moves from Wed 4 Nov to Thu 5 Nov"
    )


def test_without_fractions_tar_bort_tomma_events():
    visible = without_fractions(S, ["rest"])
    assert [(e["date"], e["fractions"]) for e in visible["events"]] == [
        ("2026-11-01", ["plast", "metall"]),
        ("2026-11-04", ["tradgard"]),
    ]
    assert list(visible["fractions"]) == ["plast", "metall"]
    assert without_fractions(S, []) is S
    assert len(S["events"]) == 3  # originalet är orört


def test_alla_dolda_ger_tomt_schema():
    s = without_fractions(S, ["rest", "plast", "metall", "tradgard"])
    assert s["events"] == []
    assert summary(s, TODAY, "sv") == "Inga kommande hämtningar"


def test_fixturen_tolkas():
    data = json.loads((Path(__file__).parent / "fixtures" / "adress.json").read_text(encoding="utf-8"))
    assert len(fraction_ids(data)) >= 3
    assert any(e["estimated"] for e in data["events"])
    assert summary(data, data["today"], "sv") == data["summary"]

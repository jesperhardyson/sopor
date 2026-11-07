from datetime import UTC, datetime

from custom_components.sopor.logic import (
    TEXTS,
    add_days,
    days_between,
    lang_of,
    relative_day_label,
    short_date,
    today_in_stockholm,
)


def test_add_days_over_manadsskifte():
    assert add_days("2026-10-31", 1) == "2026-11-01"


def test_add_days_over_sommartid():
    assert add_days("2026-03-28", 2) == "2026-03-30"


def test_days_between():
    assert days_between("2026-11-01", "2026-11-05") == 4


def test_today_i_stockholm_fast_utc_ar_gardag():
    assert today_in_stockholm(datetime(2026, 11, 1, 23, 30, tzinfo=UTC)) == "2026-11-02"


def test_relative_day_label():
    assert [relative_day_label(d, "sv") for d in (0, 1, 2, 4)] == ["i dag", "i morgon", "i övermorgon", "om 4 dagar"]
    assert [relative_day_label(d, "en") for d in (2, 4)] == ["in 2 days", "in 4 days"]


def test_short_date():
    assert short_date("2026-11-04", "sv") == "ons 4 nov"
    assert short_date("2026-11-04", "en") == "Wed 4 Nov"


def test_lang_of():
    assert (lang_of("sv"), lang_of("en-GB"), lang_of("nb")) == ("sv", "en", "en")


def test_texter_for_schemalogiken():
    sv, en = TEXTS["sv"], TEXTS["en"]
    assert sv["moved"]("Matavfall", "ons 4 nov", "tors 5 nov") == "Matavfall flyttas från ons 4 nov till tors 5 nov"
    assert en["cancelled"]("Food", "Wed 4 Nov") == "Food is not collected on Wed 4 Nov"
    assert sv["added"]("Glas", "ons 4 nov") == "Glas hämtas ons 4 nov"
    assert (sv["none"], sv["nothing"], sv["estimated"]) == ("Inga kommande hämtningar", "Inget", "beräknat")
    assert (en["none"], en["nothing"], en["estimated"]) == ("No upcoming collections", "Nothing", "estimated")

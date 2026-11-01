"""Ren logik för Sophämtning: datum och texter. Ingen import från homeassistant.

Datum är YYYY-MM-DD. Aritmetiken görs på hela dagar, som i Homey-appens lib/dates.mts.
"""

from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

Lang = Literal["sv", "en"]

# Texterna som integrationen räknar fram själv. Avfallstypernas namn kommer från Sopor och är alltid svenska.
TEXTS = {
    "sv": {
        "weekdays": ["sön", "mån", "tis", "ons", "tors", "fre", "lör"],
        "months": ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"],
        "today": "i dag",
        "tomorrow": "i morgon",
        "in_days": lambda days: f"om {days} dagar",
        "estimated": "beräknat",
        "none": "Inga kommande hämtningar",
        "nothing": "Inget",
        "moved": lambda name, from_, to: f"{name} flyttas från {from_} till {to}",
        "cancelled": lambda name, date: f"{name} hämtas inte {date}",
        "added": lambda name, date: f"{name} hämtas {date}",
    },
    "en": {
        "weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        "months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "today": "today",
        "tomorrow": "tomorrow",
        "in_days": lambda days: f"in {days} days",
        "estimated": "estimated",
        "none": "No upcoming collections",
        "nothing": "Nothing",
        "moved": lambda name, from_, to: f"{name} moves from {from_} to {to}",
        "cancelled": lambda name, date: f"{name} is not collected on {date}",
        "added": lambda name, date: f"{name} is collected on {date}",
    },
}

_STOCKHOLM = ZoneInfo("Europe/Stockholm")


def lang_of(language: str) -> Lang:
    """Home Assistants språk till integrationens: svenska för svenska, engelska för allt annat."""
    return "sv" if language == "sv" else "en"


def add_days(date_: str, days: int) -> str:
    return date.fromordinal(date.fromisoformat(date_).toordinal() + days).isoformat()


def days_between(from_: str, to: str) -> int:
    return date.fromisoformat(to).toordinal() - date.fromisoformat(from_).toordinal()


def today_in_stockholm(now: datetime) -> str:
    return now.astimezone(_STOCKHOLM).date().isoformat()


def relative_day_label(days: int, lang: Lang = "sv") -> str:
    t = TEXTS[lang]
    if days == 0:
        return t["today"]
    if days == 1:
        return t["tomorrow"]
    return t["in_days"](days)


def short_date(date_: str, lang: Lang = "sv") -> str:
    """Till exempel ons 4 nov eller Wed 4 Nov."""
    d = date.fromisoformat(date_)
    t = TEXTS[lang]
    # isoweekday: måndag 1 ... söndag 7, tabellen börjar på söndag
    return f"{t['weekdays'][d.isoweekday() % 7]} {d.day} {t['months'][d.month - 1]}"

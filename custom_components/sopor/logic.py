"""Ren logik för Sophämtning: datum och texter. Ingen import från homeassistant.

Datum är YYYY-MM-DD. Aritmetiken görs på hela dagar, som i Homey-appens lib/dates.mts.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING, Literal
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from .api import Event, Schedule

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


def upcoming(schedule: Schedule, today: str) -> list[Event]:
    """Händelserna från och med i dag."""
    return [event for event in schedule["events"] if event["date"] >= today]


def fraction_ids(schedule: Schedule) -> list[str]:
    """Avfallstyperna i registrets ordning, och sist de som bara finns i events."""
    ids = dict.fromkeys(schedule["fractions"])
    for event in schedule["events"]:
        ids.update(dict.fromkeys(event["fractions"]))
    return list(ids)


def fraction_name(schedule: Schedule, fraction_id: str) -> str:
    fraction = schedule["fractions"].get(fraction_id)
    return fraction["name"] if fraction else fraction_id


def fractions_on(schedule: Schedule, today: str, days_ahead: int) -> list[str]:
    """Avfallstyperna som hämtas `days_ahead` dagar efter `today`."""
    day = add_days(today, days_ahead)
    return [id_ for event in schedule["events"] if event["date"] == day for id_ in event["fractions"]]


def next_event(schedule: Schedule, today: str, fraction_id: str) -> Event | None:
    return next((event for event in upcoming(schedule, today) if fraction_id in event["fractions"]), None)


def join_short(schedule: Schedule, ids: list[str]) -> str:
    """Plast & metall: korta namn, versal bara först."""
    names = []
    for i, id_ in enumerate(ids):
        fraction = schedule["fractions"].get(id_)
        short = fraction["short"] if fraction else id_
        names.append(short if i == 0 else short.lower())
    return f"{', '.join(names[:-1])} & {names[-1]}" if len(names) > 1 else "".join(names)


def summary(schedule: Schedule, today: str, lang: Lang = "sv") -> str:
    """Plast & metall – i morgon, som API:ts `summary`."""
    coming = upcoming(schedule, today)
    if not coming:
        return TEXTS[lang]["none"]
    first = coming[0]
    return (
        f"{join_short(schedule, first['fractions'])} – {relative_day_label(days_between(today, first['date']), lang)}"
    )


def days_to_next(schedule: Schedule, today: str) -> int | None:
    """Dagar till nästa hämtning av någon avfallstyp, eller None när inget väntar."""
    coming = upcoming(schedule, today)
    return days_between(today, coming[0]["date"]) if coming else None


@dataclass(frozen=True)
class ScheduleChange:
    fraction: str
    # Nästa datum före ändringen, None om avfallstypen inte hade något
    from_: str | None
    to: str | None
    # Källans förklaring till avvikelsen, om den finns
    reason: str | None


def schedule_changes(before: Schedule, after: Schedule, today: str) -> list[ScheduleChange]:
    """Avfallstyper vars nästa hämtning (från i dag) har flyttats, försvunnit eller tillkommit."""
    changes = []
    for fraction_id in dict.fromkeys([*fraction_ids(before), *fraction_ids(after)]):
        old = next_event(before, today, fraction_id)
        new = next_event(after, today, fraction_id)
        from_ = old["date"] if old else None
        to = new["date"] if new else None
        if from_ == to:
            continue
        deviation = new["deviation"] if new else None
        changes.append(ScheduleChange(fraction_id, from_, to, (deviation["reason"] if deviation else None) or None))
    return changes


def change_text(schedule: Schedule, change: ScheduleChange, lang: Lang = "sv") -> str:
    """Plastförpackningar flyttas från ons 4 nov till tors 5 nov."""
    name = fraction_name(schedule, change.fraction)
    t = TEXTS[lang]
    if change.from_ and change.to:
        return t["moved"](name, short_date(change.from_, lang), short_date(change.to, lang))
    if change.from_:
        return t["cancelled"](name, short_date(change.from_, lang))
    assert change.to
    return t["added"](name, short_date(change.to, lang))


def without_fractions(schedule: Schedule, hidden: list[str]) -> Schedule:
    """Schemat utan avfallstyper som användaren dolt. Händelser utan kvarvarande avfallstyper tas bort."""
    if not hidden:
        return schedule
    events = [
        {**event, "fractions": [f for f in event["fractions"] if f not in hidden]} for event in schedule["events"]
    ]
    return {
        **schedule,
        "events": [event for event in events if event["fractions"]],
        "fractions": {id_: f for id_, f in schedule["fractions"].items() if id_ not in hidden},
    }

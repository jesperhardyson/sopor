"""Ren logik för Sophämtning: datum och texter. Ingen import från homeassistant.

Datum är YYYY-MM-DD. Aritmetiken görs på hela dagar, som i Homey-appens lib/dates.mts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING, Literal
from zoneinfo import ZoneInfo

from .const import MAX_LIST

if TYPE_CHECKING:
    from .api import Event, Schedule, Search, SearchHit, Sources

Lang = Literal["sv", "en"]

# Texterna som integrationen räknar fram själv. Avfallstypernas namn kommer från Sopor och är alltid svenska.
TEXTS = {
    "sv": {
        "weekdays": ["sön", "mån", "tis", "ons", "tors", "fre", "lör"],
        "months": ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"],
        "today": "i dag",
        "tomorrow": "i morgon",
        "day_after_tomorrow": "i övermorgon",
        "in_days": lambda days: f"om {days} dagar",
        "estimated": "beräknat",
        "none": "Inga kommande hämtningar",
        "nothing": "Inget",
        "moved": lambda name, from_, to: f"{name} flyttas från {from_} till {to}",
        "cancelled": lambda name, date: f"{name} hämtas inte {date}",
        "added": lambda name, date: f"{name} hämtas {date}",
        "estimated_date": "Beräknat datum.",
        "moved_from": lambda date, reason: _moved_line("Flyttad", "från", date, reason),
    },
    "en": {
        "weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        "months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "today": "today",
        "tomorrow": "tomorrow",
        "day_after_tomorrow": "in 2 days",
        "in_days": lambda days: f"in {days} days",
        "estimated": "estimated",
        "none": "No upcoming collections",
        "nothing": "Nothing",
        "moved": lambda name, from_, to: f"{name} moves from {from_} to {to}",
        "cancelled": lambda name, date: f"{name} is not collected on {date}",
        "added": lambda name, date: f"{name} is collected on {date}",
        "estimated_date": "Estimated date.",
        "moved_from": lambda date, reason: _moved_line("Moved", "from", date, reason),
    },
}

_STOCKHOLM = ZoneInfo("Europe/Stockholm")


def _moved_line(moved: str, from_word: str, date_: str | None, reason: str) -> str:
    """Flyttad från ons 4 nov: Helgdag. Utan ursprungsdatum eller orsak utelämnas den delen."""
    line = f"{moved} {from_word} {date_}" if date_ else moved
    return f"{line}: {reason}" if reason else f"{line}."


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
    if days == 2:
        return t["day_after_tomorrow"]
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


# Adressökningen i parningen: ett fält, "gata husnummer" och gärna ", ort".
# Orten filtreras här och inte i API:t, eftersom källorna tolkar ort i frågan olika.

SearchResult = Literal["found", "places", "failed", "none"]


@dataclass(frozen=True)
class Place:
    # "<ort>|<kommun>"
    key: str
    label: str
    count: int


def parse_query(text: str) -> tuple[str, str]:
    """ "Storgatan 2, Uppsala" blir ("Storgatan 2", "Uppsala")."""
    q, _, place = text.partition(",")
    return q.strip(), place.strip()


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[^\w]+", text.casefold()) if w]


def _starts_words(haystack: list[str], place: str) -> bool:
    """Varje ord i `place` ska vara början på ett ord i `haystack`."""
    return all(any(h.startswith(w) for h in haystack) for w in _words(place))


def _in_place(hit: SearchHit, place: str) -> bool:
    return _starts_words(_words(f"{hit['locality']} {hit['kommun']}"), place)


def search_outcome(search: Search, place: str, max_list: int = MAX_LIST) -> tuple[SearchResult, list[SearchHit]]:
    hits = [hit for hit in search["addresses"] if _in_place(hit, place)] if place else search["addresses"]
    if len(hits) > max_list:
        return "places", hits
    if hits:
        return "found", hits
    return ("failed" if search["failed"] else "none"), hits


def place_key(hit: SearchHit) -> str:
    return f"{hit['locality']}|{hit['kommun']}"


def places(hits: list[SearchHit]) -> list[Place]:
    """Orterna bland träffarna, flest träffar först, sedan i bokstavsordning (utan hänsyn till versaler)."""
    counts: dict[str, int] = {}
    labels: dict[str, str] = {}
    for hit in hits:
        key = place_key(hit)
        counts[key] = counts.get(key, 0) + 1
        labels[key] = f"{hit['locality']}, {hit['kommun']}" if hit["locality"] else hit["kommun"]
    found = [Place(key, labels[key], count) for key, count in counts.items()]
    return sorted(found, key=lambda p: (-p.count, p.label.casefold()))


def hit_title(hit: SearchHit) -> str:
    return f"{hit['street']}, {hit['locality'] or hit['kommun']}"


def notice_text(hits: list[SearchHit]) -> str:
    """Källornas varningar om områdesval, varje text en gång. Tom när ingen träff har någon."""
    return "\n\n".join(dict.fromkeys(hit["notice"] for hit in hits if hit.get("notice")))


def area_links(hits: list[SearchHit]) -> str:
    """Länkar till områdessidorna, en per kommun. Tom när ingen träff är ett område."""
    links = {hit["areasUrl"]: hit["kommun"] for hit in hits if hit.get("areasUrl")}
    return ", ".join(f"[{kommun}]({url})" for url, kommun in links.items())


def hit_label(hit: SearchHit) -> str:
    return f"{hit_title(hit)}, {hit['detail']}" if hit["detail"] else hit_title(hit)


def kommun_names(sources: Sources) -> list[str]:
    """Kommunerna som Sopor har, en gång var och utan ordet "kommun"."""
    by_code = {
        k["code"]: re.sub(r"\s+kommun$", "", k["name"], flags=re.IGNORECASE)
        for source in sources["sources"]
        for k in source["kommuner"]
    }
    return sorted(by_code.values(), key=str.casefold)


def place_covered(names: list[str], place: str) -> bool:
    """Om orten användaren skrev är en av kommunerna. Avgör vad "ingen adress hittades" ska säga."""
    return any(_starts_words(_words(name), place) for name in names)


def not_found_error(place: str, names: list[str]) -> str:
    """Felnyckeln när ingen adress hittades."""
    if not place:
        return "not_found"
    return "not_found_covered" if place_covered(names, place) else "not_found_elsewhere"


def event_description(event: Event, lang: Lang = "sv") -> str:
    """Beräknat datum och/eller flyttad från, på var sin rad. Tom när hämtningen är som vanligt."""
    t = TEXTS[lang]
    lines = []
    if event["estimated"]:
        lines.append(t["estimated_date"])
    if deviation := event["deviation"]:
        original = deviation["originalDate"]
        lines.append(t["moved_from"](short_date(original, lang) if original else None, deviation["reason"]))
    return "\n".join(lines)

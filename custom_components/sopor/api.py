"""Typer för Soporas publika API v1. Bara det integrationen behöver av svaren är med."""

from typing import TypedDict


class Address(TypedDict):
    id: str
    street: str
    locality: str
    kommun: str
    source: str
    detail: str | None


class SearchHit(Address):
    url: str


class Search(TypedDict):
    addresses: list[SearchHit]
    failed: list[str]


class Deviation(TypedDict):
    originalDate: str | None
    reason: str


class Event(TypedDict):
    date: str
    fractions: list[str]
    estimated: bool
    deviation: Deviation | None
    warning: str | None


class Fraction(TypedDict):
    name: str
    short: str
    color: str
    icon: str


class Links(TypedDict):
    ics: str
    web: str


class Schedule(TypedDict):
    apiVersion: str
    today: str
    address: Address
    events: list[Event]
    fractions: dict[str, Fraction]
    links: Links


class SourceKommun(TypedDict):
    code: str
    name: str


class Source(TypedDict):
    id: str
    kommuner: list[SourceKommun]


class Sources(TypedDict):
    sources: list[Source]

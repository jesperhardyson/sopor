"""Typer för Soporas publika API v1. Bara det integrationen behöver av svaren är med."""

from typing import Any, TypedDict, cast

import aiohttp

from .const import BASE_URL, TIMEOUT, VERSION

USER_AGENT = f"Sopor-HomeAssistant/{VERSION} (+https://sopor.hardyson.se)"


class Address(TypedDict):
    id: str
    street: str
    locality: str
    kommun: str
    source: str
    detail: str | None


class SearchHit(Address):
    url: str
    notice: str | None


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


class SoporError(Exception):
    """`status` 0 betyder nätfel eller timeout. `code` är API:ts felkod."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class SoporClient:
    """Klient mot Soporas publika API v1. Sessionen kommer utifrån."""

    def __init__(self, session: aiohttp.ClientSession) -> None:
        self._session = session

    async def _get(self, url: str, params: dict[str, str] | None = None) -> Any:
        try:
            async with self._session.get(
                url,
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=aiohttp.ClientTimeout(total=TIMEOUT),
            ) as res:
                try:
                    body = await res.json(content_type=None)
                except ValueError:
                    body = None
                status = res.status
        except (TimeoutError, aiohttp.ClientError) as error:
            raise SoporError(0, "network", f"Sopor svarar inte ({error})") from error
        if 200 <= status < 300 and body is not None:
            return body
        error = body.get("error") if isinstance(body, dict) else None
        error = error if isinstance(error, dict) else {}
        fallback = "source_unavailable" if status == 502 else "unknown"
        raise SoporError(status, error.get("code") or fallback, error.get("message") or f"Sopor svarade {status}")

    async def search(self, q: str) -> Search:
        return cast(Search, await self._get(f"{BASE_URL}/sok", {"q": q}))

    async def areas(self, place: str) -> Search:
        return cast(Search, await self._get(f"{BASE_URL}/omraden", {"plats": place}))

    async def schedule(self, url: str) -> Schedule:
        return cast(Schedule, await self._get(url))

    async def sources(self) -> Sources:
        return cast(Sources, await self._get(f"{BASE_URL}/kallor"))

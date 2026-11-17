"""Coordinatorn: hämtar schemat var sjätte timme och sparar det senaste svaret."""

import logging
from datetime import datetime
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import Schedule, SoporClient, SoporError
from .const import CONF_HIDDEN, DOMAIN, UPDATE_INTERVAL
from .logic import (
    ScheduleChange,
    active_messages,
    lang_of,
    message_text,
    schedule_changes,
    today_in_stockholm,
    without_fractions,
)

_LOGGER = logging.getLogger(__name__)

type SoporConfigEntry = ConfigEntry[SoporCoordinator]


def message_issue_prefix(source: str) -> str:
    """Ärendena för källans meddelanden. Ett per meddelande och källa, så att två adresser hos samma källa delar det."""
    return f"message_{source}_"


@callback
def delete_message_issues(hass: HomeAssistant, source: str, keep: set[str] | None = None) -> None:
    """Tar bort källans ärenden för meddelanden som inte finns i `keep`."""
    prefix = message_issue_prefix(source)
    for domain, issue_id in list(ir.async_get(hass).issues):
        if domain == DOMAIN and issue_id.startswith(prefix) and issue_id not in (keep or set()):
            ir.async_delete_issue(hass, DOMAIN, issue_id)


def store_for(hass: HomeAssistant, entry_id: str) -> Store[dict[str, Any]]:
    """Postens sparade svar: {"url": adressens url, "schedule": Schedule}."""
    return Store(hass, 1, f"{DOMAIN}.{entry_id}")


class SoporCoordinator(DataUpdateCoordinator[Schedule]):
    config_entry: SoporConfigEntry

    def __init__(self, hass: HomeAssistant, entry: SoporConfigEntry) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=UPDATE_INTERVAL)
        self._client = SoporClient(async_get_clientsession(hass))
        self._store = store_for(hass, entry.entry_id)
        self._issue_id = f"address_gone_{entry.entry_id}"
        # Bara ifyllt under den uppdatering då ändringarna upptäcktes
        self.changes: list[ScheduleChange] = []

    @property
    def today(self) -> str:
        return today_in_stockholm(dt_util.utcnow())

    @property
    def hidden(self) -> list[str]:
        return self.config_entry.options.get(CONF_HIDDEN, [])

    @property
    def visible(self) -> Schedule | None:
        """Schemat utan de dolda avfallstyperna."""
        return without_fractions(self.data, self.hidden) if self.data is not None else None

    async def async_load(self) -> bool:
        """Läser in det sparade svaret. Sant om det fanns och gäller postens adress."""
        stored = await self._store.async_load()
        if (
            not isinstance(stored, dict)
            or stored.get("url") != self.config_entry.data["url"]
            or not isinstance(stored.get("schedule"), dict)
        ):
            return False
        self.async_set_updated_data(stored["schedule"])
        return True

    @callback
    def async_update_listeners(self) -> None:
        """Håller ärendena för källans meddelanden i takt med datan och dagens datum."""
        super().async_update_listeners()
        self._sync_message_issues()

    @callback
    def _sync_message_issues(self) -> None:
        if self.data is None:
            return
        source = self.config_entry.data["source"]
        prefix = message_issue_prefix(source)
        active = active_messages(self.data, self.today)
        for message in active:
            # Ett ignorerat ärende förblir ignorerat när det skapas igen med samma id
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                prefix + message["id"],
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key="source_message",
                translation_placeholders={
                    "title": message["title"],
                    "text": message_text(message, lang_of(self.hass.config.language)),
                },
            )
        delete_message_issues(self.hass, source, {prefix + m["id"] for m in active})

    @callback
    def async_tick(self, now: datetime | None = None) -> None:
        """Tömmer changes och säger till lyssnarna, som räknar om sina texter (i dag, i morgon). Anropar inte API:t."""
        self.changes = []
        self.async_update_listeners()

    async def _async_update_data(self) -> Schedule:
        self.changes = []
        url = self.config_entry.data["url"]
        try:
            schedule = await self._client.schedule(url)
        except SoporError as error:
            if error.status == 404:
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    self._issue_id,
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="address_gone",
                    translation_placeholders={"title": self.config_entry.title},
                )
            raise UpdateFailed(error.message) from error
        if self.data is not None:
            hidden = self.hidden
            self.changes = schedule_changes(
                without_fractions(self.data, hidden), without_fractions(schedule, hidden), self.today
            )
        # Byttes adressen under hämtningen ska det gamla svaret inte sparas över det raderade
        if self.config_entry.data["url"] == url:
            await self._store.async_save({"url": url, "schedule": schedule})
        ir.async_delete_issue(self.hass, DOMAIN, self._issue_id)
        return schedule

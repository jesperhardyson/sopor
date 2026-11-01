"""Konfigurationsflödet: sök adress, välj ort om det blir många träffar, välj adress."""

from typing import Any

import probatio
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

from .api import SearchHit, SoporClient, SoporError
from .const import DOMAIN
from .logic import (
    hit_label,
    hit_title,
    kommun_names,
    not_found_error,
    parse_query,
    place_key,
    places,
    search_outcome,
)

MIN_LENGTH = 3
ENTRY_KEYS = ("source", "id", "url", "street", "locality", "kommun", "detail")


def _hit_value(hit: SearchHit) -> str:
    return f"{hit['source']}/{hit['id']}"


class SoporConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._hits: list[SearchHit] = []
        # None tills /kallor är hämtad; tom lista om den misslyckades
        self._names: list[str] | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        client = SoporClient(async_get_clientsession(self.hass))
        errors: dict[str, str] = {}
        place = ""
        if user_input is not None:
            q, place = parse_query(user_input["adress"])
            if len(q) < MIN_LENGTH:
                errors["adress"] = "too_short"
            else:
                try:
                    result, hits = search_outcome(await client.search(q), place)
                except SoporError:
                    errors["base"] = "cannot_connect"
                else:
                    if result == "found":
                        self._hits = hits
                        return await self.async_step_adress()
                    if result == "places":
                        self._hits = hits
                        return await self.async_step_ort()
                    if result == "failed":
                        errors["base"] = "sources_failed"
                    else:
                        names = await self._kommun_names(client)
                        # Utan kommunlista går det inte att säga om orten ingår
                        errors["base"] = not_found_error(place, names) if names else "not_found"
        names = await self._kommun_names(client)
        # Utan kommunlista används ett steg med egna texter som inte nämner antalet
        return self.async_show_form(
            step_id="user" if names else "user_utan_antal",
            data_schema=probatio.Schema({probatio.Required("adress"): TextSelector()}),
            errors=errors,
            description_placeholders={"count": str(len(names)) if names else "", "place": place},
        )

    async def async_step_user_utan_antal(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.async_step_user(user_input)

    async def _kommun_names(self, client: SoporClient) -> list[str]:
        """Kommunernas namn, hämtade en gång. Tom lista när /kallor inte svarar."""
        if self._names is None:
            try:
                self._names = kommun_names(await client.sources())
            except SoporError:
                self._names = []
        return self._names

    async def async_step_ort(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._hits = [hit for hit in self._hits if place_key(hit) == user_input["ort"]]
            return await self.async_step_adress()
        options = [SelectOptionDict(value=p.key, label=f"{p.label} ({p.count})") for p in places(self._hits)]
        return self.async_show_form(
            step_id="ort",
            data_schema=probatio.Schema(
                {
                    probatio.Required("ort"): SelectSelector(
                        SelectSelectorConfig(options=options, mode=SelectSelectorMode.LIST)
                    )
                }
            ),
        )

    async def async_step_adress(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            hit = next(hit for hit in self._hits if _hit_value(hit) == user_input["adress"])
            return await self._finish(hit)
        options = [SelectOptionDict(value=_hit_value(hit), label=hit_label(hit)) for hit in self._hits]
        return self.async_show_form(
            step_id="adress",
            data_schema=probatio.Schema(
                {
                    probatio.Required("adress"): SelectSelector(
                        SelectSelectorConfig(options=options, mode=SelectSelectorMode.LIST)
                    )
                }
            ),
        )

    async def _finish(self, hit: SearchHit) -> ConfigFlowResult:
        """Avslutar med den valda träffen. Reconfigure grenar här."""
        await self.async_set_unique_id(_hit_value(hit))
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=hit_title(hit), data={key: hit[key] for key in ENTRY_KEYS})

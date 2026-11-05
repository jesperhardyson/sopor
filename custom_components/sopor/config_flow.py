"""Konfigurationsflödet: sök adress, välj ort om det blir många träffar, välj adress.

Samma steg byter adress (reconfigure). Alternativen döljer avfallstyper.
"""

from typing import Any

import probatio
from homeassistant.config_entries import (
    SOURCE_RECONFIGURE,
    ConfigEntry,
    ConfigEntryState,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.core import callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

from .api import SearchHit, SoporClient, SoporError
from .const import CONF_HIDDEN, DOMAIN, KOMMUNER_URL
from .coordinator import SoporConfigEntry, store_for
from .logic import (
    area_links,
    fraction_ids,
    fraction_name,
    hit_label,
    hit_title,
    kommun_names,
    not_found_error,
    notice_text,
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

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> SoporOptionsFlow:
        return SoporOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self._search(user_input)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self._search(user_input)

    async def _search(self, user_input: dict[str, Any] | None) -> ConfigFlowResult:
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
                    # Utan träff på en namngiven ort väljer användaren bland kommunens områden.
                    # Utan ort frågas inte, eftersom samma gatunamn finns i många kommuner.
                    if place and (areas := await self._areas(client, place)):
                        self._hits = areas
                        return await self.async_step_adress()
                    if result == "failed":
                        errors["base"] = "sources_failed"
                    else:
                        names = await self._kommun_names(client)
                        # Utan kommunlista går det inte att säga om orten ingår
                        errors["base"] = not_found_error(place, names) if names else "not_found"
        names = await self._kommun_names(client)
        if self.source == SOURCE_RECONFIGURE:
            # Reconfigure-stegets texter nämner inte antalet
            step_id = "reconfigure"
        else:
            # Utan kommunlista används ett steg med egna texter som inte nämner antalet
            step_id = "user" if names else "user_utan_antal"
        return self.async_show_form(
            step_id=step_id,
            data_schema=probatio.Schema({probatio.Required("adress"): TextSelector()}),
            errors=errors,
            description_placeholders={
                "count": str(len(names)) if names else "",
                "place": place,
                # Hassfest tillåter inga länkar i översättningarna
                "kommuner_url": KOMMUNER_URL,
            },
        )

    async def async_step_user_utan_antal(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.async_step_user(user_input)

    async def _areas(self, client: SoporClient, place: str) -> list[SearchHit]:
        """Fel behandlas som inga områden, så att användaren får den vanliga texten."""
        try:
            return (await client.areas(place))["addresses"]
        except SoporError:
            return []

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
        # Texten före källans varning finns bara i det egna stegets översättningar
        notice = notice_text(self._hits)
        return self.async_show_form(
            step_id="adress_omrade" if notice else "adress",
            description_placeholders={"notice": notice, "area_links": area_links(self._hits)} if notice else None,
            data_schema=probatio.Schema(
                {
                    probatio.Required("adress"): SelectSelector(
                        SelectSelectorConfig(options=options, mode=SelectSelectorMode.LIST)
                    )
                }
            ),
        )

    async def async_step_adress_omrade(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.async_step_adress(user_input)

    async def _finish(self, hit: SearchHit) -> ConfigFlowResult:
        """Avslutar med den valda träffen. Reconfigure grenar här."""
        unique_id = _hit_value(hit)
        await self.async_set_unique_id(unique_id)
        self._abort_if_unique_id_configured()
        data = {key: hit[key] for key in ENTRY_KEYS}
        if self.source != SOURCE_RECONFIGURE:
            return self.async_create_entry(title=hit_title(hit), data=data)
        entry = self._get_reconfigure_entry()
        # Det gamla svaret får inte jämföras med den nya adressens (då avfyras "Schemat ändrades")
        await store_for(self.hass, entry.entry_id).async_remove()
        ir.async_delete_issue(self.hass, DOMAIN, f"address_gone_{entry.entry_id}")
        # unique_id byts med avsikt: det är adressen. Därför inte _abort_if_unique_id_mismatch,
        # utan kontrollen ovan att ingen annan post redan har den.
        return self.async_update_reload_and_abort(entry, unique_id=unique_id, title=hit_title(hit), data=data)


class SoporOptionsFlow(OptionsFlowWithReload):
    """Döljer avfallstyper. Det som sparas är de dolda, så att nya typer hos källan syns."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        entry: SoporConfigEntry = self.config_entry
        if entry.state is not ConfigEntryState.LOADED or entry.runtime_data.data is None:
            return self.async_abort(reason="not_loaded")
        schedule = entry.runtime_data.data
        ids = fraction_ids(schedule)
        if user_input is not None:
            return self.async_create_entry(data={CONF_HIDDEN: [i for i in ids if i not in user_input["visa"]]})
        hidden = entry.runtime_data.hidden
        options = [SelectOptionDict(value=i, label=fraction_name(schedule, i)) for i in ids]
        return self.async_show_form(
            step_id="init",
            data_schema=probatio.Schema(
                {
                    probatio.Required("visa", default=[i for i in ids if i not in hidden]): SelectSelector(
                        SelectSelectorConfig(options=options, multiple=True, mode=SelectSelectorMode.LIST)
                    )
                }
            ),
        )

"""Sophämtning: sophämtning per adress från sopor.hardyson.se."""

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN, TICK_INTERVAL
from .coordinator import SoporConfigEntry, SoporCoordinator, store_for

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR, Platform.CALENDAR, Platform.EVENT]


async def async_setup_entry(hass: HomeAssistant, entry: SoporConfigEntry) -> bool:
    coordinator = SoporCoordinator(hass, entry)
    if await coordinator.async_load():
        # Det sparade svaret räcker för att starta, även om hämtningen misslyckas
        await coordinator.async_refresh()
    else:
        await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    entry.async_on_unload(async_track_time_interval(hass, coordinator.async_tick, TICK_INTERVAL))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: SoporConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: SoporConfigEntry) -> None:
    """Raderar postens sparade svar och reparationsärende."""
    await store_for(hass, entry.entry_id).async_remove()
    ir.async_delete_issue(hass, DOMAIN, f"address_gone_{entry.entry_id}")

"""Basen för integrationens entiteter."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import SoporCoordinator
from .logic import Lang, lang_of


def lang(hass: HomeAssistant) -> Lang:
    return lang_of(hass.config.language)


class SoporEntity(CoordinatorEntity[SoporCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: SoporCoordinator) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        web = (coordinator.data or {}).get("links", {}).get("web")
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            entry_type=DeviceEntryType.SERVICE,
            manufacturer="Sopor",
            configuration_url=web or "https://sopor.hardyson.se",
        )

    @property
    def available(self) -> bool:
        # Medvetet inte last_update_success: entiteterna visar det sparade svaret även när en hämtning misslyckas
        return self.coordinator.data is not None

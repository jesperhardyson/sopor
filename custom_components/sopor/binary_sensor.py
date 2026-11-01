"""Binärsensorerna: hämtas något i dag eller i morgon."""

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import SoporConfigEntry, SoporCoordinator
from .entity import SoporEntity
from .logic import fractions_on, join_short


async def async_setup_entry(
    hass: HomeAssistant, entry: SoporConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        [SoporDayBinarySensor(coordinator, "today", 0), SoporDayBinarySensor(coordinator, "tomorrow", 1)]
    )


class SoporDayBinarySensor(SoporEntity, BinarySensorEntity):
    """På när något hämtas `days_ahead` dagar från i dag."""

    def __init__(self, coordinator: SoporCoordinator, key: str, days_ahead: int) -> None:
        super().__init__(coordinator)
        self._days_ahead = days_ahead
        self._attr_translation_key = key
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{key}"

    def _ids(self) -> list[str]:
        visible = self.coordinator.visible
        return fractions_on(visible, self.coordinator.today, self._days_ahead) if visible else []

    @property
    def is_on(self) -> bool:
        return bool(self._ids())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        ids = self._ids()
        return {"avfallstyper": join_short(self.coordinator.visible, ids) if ids else ""}

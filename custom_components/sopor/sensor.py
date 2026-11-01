"""Sensorerna: nästa hämtning per avfallstyp, sammanfattning och dagar kvar."""

from datetime import date
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .coordinator import SoporConfigEntry, SoporCoordinator
from .entity import SoporEntity, lang
from .logic import days_to_next, fraction_ids, fraction_name, next_event, summary


async def async_setup_entry(
    hass: HomeAssistant, entry: SoporConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    async_add_entities([SoporSummarySensor(coordinator), SoporDaysSensor(coordinator)])
    registry = er.async_get(hass)
    added: set[str] = set()

    @callback
    def sync_fractions() -> None:
        """Lägger till sensorer för nya avfallstyper och tar bort de för försvunna."""
        visible = coordinator.visible
        if visible is None:
            return
        current = set(fraction_ids(visible))
        new = [id_ for id_ in fraction_ids(visible) if id_ not in added]
        if new:
            async_add_entities([SoporFractionSensor(coordinator, id_) for id_ in new])
        for gone in added - current:
            unique_id = f"{entry.entry_id}_next_{gone}"
            if entity_id := registry.async_get_entity_id("sensor", DOMAIN, unique_id):
                registry.async_remove(entity_id)
        added.clear()
        added.update(current)

    entry.async_on_unload(coordinator.async_add_listener(sync_fractions))
    sync_fractions()


class SoporFractionSensor(SoporEntity, SensorEntity):
    """Nästa hämtningsdatum för en avfallstyp."""

    _attr_device_class = SensorDeviceClass.DATE

    def __init__(self, coordinator: SoporCoordinator, fraction_id: str) -> None:
        super().__init__(coordinator)
        self._fraction_id = fraction_id
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_next_{fraction_id}"
        # Namnet kommer från Sopor och är alltid svenskt. Okänd avfallstyp får sitt id som namn
        self._attr_name = fraction_name(coordinator.visible, fraction_id)

    def _next(self):
        visible = self.coordinator.visible
        return next_event(visible, self.coordinator.today, self._fraction_id) if visible else None

    @property
    def native_value(self) -> date | None:
        event = self._next()
        return date.fromisoformat(event["date"]) if event else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        event = self._next()
        deviation = event["deviation"] if event else None
        return {
            "beraknat": event["estimated"] if event else None,
            "avvikelse": (deviation["reason"] or None) if deviation else None,
        }


class SoporSummarySensor(SoporEntity, SensorEntity):
    _attr_translation_key = "summary"

    def __init__(self, coordinator: SoporCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_summary"

    @property
    def native_value(self) -> str | None:
        visible = self.coordinator.visible
        return summary(visible, self.coordinator.today, lang(self.hass)) if visible else None


class SoporDaysSensor(SoporEntity, SensorEntity):
    _attr_translation_key = "days"
    _attr_native_unit_of_measurement = UnitOfTime.DAYS

    def __init__(self, coordinator: SoporCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_days"

    @property
    def native_value(self) -> int | None:
        visible = self.coordinator.visible
        return days_to_next(visible, self.coordinator.today) if visible else None

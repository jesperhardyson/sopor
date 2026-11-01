"""Händelsen "Schemat ändrades": avfyras för varje avfallstyp vars nästa hämtning ändrats."""

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import SoporConfigEntry, SoporCoordinator
from .entity import SoporEntity, lang
from .logic import change_text, fraction_name

EVENT_CHANGED = "andrat"


async def async_setup_entry(
    hass: HomeAssistant, entry: SoporConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([SoporChangedEvent(entry.runtime_data)])


class SoporChangedEvent(SoporEntity, EventEntity):
    _attr_translation_key = "changed"

    def __init__(self, coordinator: SoporCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_event_types = [EVENT_CHANGED]
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_changed"

    def _fire_changes(self) -> None:
        visible = self.coordinator.visible
        if visible is None:
            return
        for change in self.coordinator.changes:
            self._trigger_event(
                EVENT_CHANGED,
                {
                    "avfallstyp": fraction_name(visible, change.fraction),
                    "text": change_text(visible, change, lang(self.hass)),
                    "tidigare": change.from_,
                    "nytt": change.to,
                    "orsak": change.reason,
                },
            )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # Ändringar som upptäcktes i startens hämtning, innan entiteten fanns
        self._fire_changes()
        self.async_write_ha_state()

    @callback
    def _handle_coordinator_update(self) -> None:
        self._fire_changes()
        self.async_write_ha_state()

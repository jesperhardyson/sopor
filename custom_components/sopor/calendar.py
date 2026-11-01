"""Kalendern: hämtningarna som heldagshändelser."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import Event
from .coordinator import SoporConfigEntry, SoporCoordinator
from .entity import SoporEntity, lang
from .logic import add_days, event_description, join_short, upcoming

_STOCKHOLM = ZoneInfo("Europe/Stockholm")


async def async_setup_entry(
    hass: HomeAssistant, entry: SoporConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([SoporCalendar(entry.runtime_data)])


class SoporCalendar(SoporEntity, CalendarEntity):
    _attr_translation_key = "schedule"

    def __init__(self, coordinator: SoporCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_calendar"

    def _calendar_event(self, event: Event) -> CalendarEvent:
        visible = self.coordinator.visible
        assert visible is not None
        day = event["date"]
        return CalendarEvent(
            start=date.fromisoformat(day),
            end=date.fromisoformat(add_days(day, 1)),
            summary=join_short(visible, event["fractions"]),
            description=event_description(event, lang(self.hass)) or None,
            # Samma form som sajtens ICS-UID
            uid=f"{self.coordinator.config_entry.data['id']}-{day}@sopor.hardyson.se",
        )

    @property
    def event(self) -> CalendarEvent | None:
        visible = self.coordinator.visible
        coming = upcoming(visible, self.coordinator.today) if visible else []
        return self._calendar_event(coming[0]) if coming else None

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        """Heldagshändelserna som överlappar [start_date, end_date), dygnen räknade i Stockholmstid."""
        visible = self.coordinator.visible
        if visible is None:
            return []
        found = []
        for event in visible["events"]:
            day = date.fromisoformat(event["date"])
            starts = datetime.combine(day, time.min, _STOCKHOLM)
            ends = datetime.combine(day + timedelta(days=1), time.min, _STOCKHOLM)
            if starts < end_date and ends > start_date:
                found.append(self._calendar_event(event))
        return found

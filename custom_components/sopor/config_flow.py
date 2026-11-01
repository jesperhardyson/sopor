"""Konfigurationsflödet. Bara skelettet: Home Assistant läser in plattformen innan en post sätts upp."""

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN


class SoporConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

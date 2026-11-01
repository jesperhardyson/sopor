"""Konstanter för Sophämtning."""

import json
from datetime import timedelta
from pathlib import Path

DOMAIN = "sopor"
BASE_URL = "https://sopor.hardyson.se/api/v1"
UPDATE_INTERVAL = timedelta(hours=6)
TICK_INTERVAL = timedelta(minutes=15)
TIMEOUT = 15
MAX_LIST = 12
CONF_HIDDEN = "dolda"

VERSION: str = json.loads((Path(__file__).parent / "manifest.json").read_text(encoding="utf-8"))["version"]

"""Hjälptexten vid tom sökning ska nämna kommunerna där man söker på område."""

import json
from pathlib import Path

import pytest

TRANSLATIONS = Path(__file__).parents[3] / "custom_components" / "sopor" / "translations"


@pytest.mark.parametrize("locale", ["sv", "en"])
@pytest.mark.parametrize("key", ["not_found", "not_found_covered"])
def test_hjalptexten_namner_kommunerna_med_omradesval(locale, key):
    errors = json.loads((TRANSLATIONS / f"{locale}.json").read_text(encoding="utf-8"))["config"]["error"]
    for expected in ("Avesta", "Säter", "Bispberg"):
        assert expected in errors[key]

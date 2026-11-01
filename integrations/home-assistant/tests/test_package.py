import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
PAKET = REPO / "custom_components" / "sopor"


def test_manifest():
    manifest = json.loads((PAKET / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["domain"] == "sopor"
    assert manifest["config_flow"] is True
    assert manifest["iot_class"] == "cloud_polling"
    assert manifest["integration_type"] == "service"
    assert re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])
    assert manifest["documentation"].startswith("https://github.com/jesperhardyson/sopor")
    assert manifest["issue_tracker"].startswith("https://github.com/jesperhardyson/sopor")


def test_hacs_json():
    hacs = json.loads((REPO / "hacs.json").read_text(encoding="utf-8"))
    assert hacs["name"] == "Sophämtning"
    assert hacs["country"] == "SE"
    assert hacs["hide_default_branch"] is True
    assert hacs["homeassistant"] == "2026.3.0"


def test_gransen_mot_sajten():
    """Integrationen pratar bara med det publika API:t och rör aldrig sajtens kod (regel 8)."""
    fel = []
    for fil in PAKET.rglob("*.py"):
        text = fil.read_text(encoding="utf-8")
        if re.search(r"""^\s*(from|import)\s+src\b|["'][^"']*\bsrc/""", text, re.MULTILINE):
            fel.append(f"{fil.relative_to(REPO)}: refererar src/")
        for punkter, _ in re.findall(r"^\s*from\s+(\.+)([\w.]*)\s+import", text, re.MULTILINE):
            if len(punkter) > 1:
                fel.append(f"{fil.relative_to(REPO)}: relativ import utanför paketet")
    assert fel == []


def test_versionen_kommer_ur_manifestet():
    from custom_components.sopor import const

    manifest = json.loads((PAKET / "manifest.json").read_text(encoding="utf-8"))
    assert const.VERSION == manifest["version"]

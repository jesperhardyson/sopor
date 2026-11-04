import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release

REPO = Path(__file__).resolve().parents[3]


def test_bump_problem():
    assert release.bump_problem("0.1.0", "0.1.0")
    assert release.bump_problem("0.1.0", "0.0.9")
    assert release.bump_problem("0.1.0", "0.2.0") is None
    assert release.bump_problem("0.1.9", "0.1.10") is None
    assert release.bump_problem("0.1.0", "x")
    assert release.bump_problem("0.1.0", "1.0")


def test_tag_prefix():
    assert release.TAG_PREFIX == "ha-v"


def test_set_version_andrar_bara_version(tmp_path):
    manifest = tmp_path / "manifest.json"
    original = json.loads((REPO / "custom_components/sopor/manifest.json").read_text(encoding="utf-8"))
    manifest.write_text(json.dumps(original, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    release.set_version(manifest, "0.2.0")
    ny = json.loads(manifest.read_text(encoding="utf-8"))
    assert ny == {**original, "version": "0.2.0"}
    assert manifest.read_text(encoding="utf-8").endswith("\n")
    assert "Sophämtning" in manifest.read_text(encoding="utf-8")


def test_main_utan_version_avslutar_med_fel():
    with pytest.raises(SystemExit) as fel:
        release.main([])
    assert fel.value.code != 0


def _skapar_release(text: str) -> bool:
    return "gh release" in text or "softprops/action-gh-release" in text


def test_bara_kanda_arbetsfloden_skapar_github_releaser():
    # HACS tar den första releasen som inte är utkast eller förhandsversion, så ingen annan får skapa en
    arbetsfloden = sorted((REPO / ".github" / "workflows").glob("*.yml"))
    assert arbetsfloden
    for fil in arbetsfloden:
        skapar = _skapar_release(fil.read_text(encoding="utf-8"))
        assert skapar == (fil.name in {"home-assistant-release.yml", "homey-release.yml"}), fil.name


def test_homey_releaser_ar_forhandsversioner_sa_att_hacs_hoppar_over_dem():
    # HACS läser inte flaggan Latest, så --latest=false skulle inte räcka
    text = (REPO / ".github" / "workflows" / "homey-release.yml").read_text(encoding="utf-8")
    assert "--prerelease" in text


def test_home_assistant_releaser_ar_inte_forhandsversioner():
    text = (REPO / ".github" / "workflows" / "home-assistant-release.yml").read_text(encoding="utf-8")
    assert "--prerelease" not in text

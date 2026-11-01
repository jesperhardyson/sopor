"""Speglingen till jesperhardyson/sopor-home-assistant: rätt filer, och inget skräp följer med."""

import json
import subprocess
from pathlib import Path

SKRIPT = Path(__file__).resolve().parents[1] / "scripts" / "spegla.sh"


def test_spegla_lagger_integrationen_i_roten(tmp_path):
    (tmp_path / ".git").mkdir()
    (tmp_path / "gammal.txt").write_text("borttagen i sopor")
    subprocess.run([str(SKRIPT), str(tmp_path)], check=True)

    assert (tmp_path / ".git").is_dir()
    assert not (tmp_path / "gammal.txt").exists()
    assert json.loads((tmp_path / "custom_components/sopor/manifest.json").read_text())["domain"] == "sopor"
    assert (tmp_path / "custom_components/sopor/brand/icon.png").is_file()
    assert json.loads((tmp_path / "hacs.json").read_text())["name"] == "Sophämtning"
    assert (tmp_path / "LICENSE").is_file()
    assert "spegling" in (tmp_path / "README.md").read_text()
    assert (tmp_path / ".github/workflows/validera.yml").is_file()
    assert (tmp_path / ".github/workflows/release.yml").is_file()
    assert not list(tmp_path.rglob("__pycache__"))

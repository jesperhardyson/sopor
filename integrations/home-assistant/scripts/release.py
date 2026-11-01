"""uv run scripts/release.py <version>

Sätter versionen i manifest.json, committar och taggar ha-v<version>.
Pushen gör du själv. Taggen startar GitHub-releasen i CI (HACS läser den som version).
"""

import json
import re
import subprocess
import sys
from pathlib import Path

TAG_PREFIX = "ha-v"
REPO = Path(__file__).resolve().parents[3]
MANIFEST = REPO / "custom_components" / "sopor" / "manifest.json"


def _parse(version: str) -> tuple[int, ...] | None:
    return tuple(int(n) for n in version.split(".")) if re.fullmatch(r"\d+\.\d+\.\d+", version) else None


def bump_problem(current: str, wanted: str) -> str | None:
    """Varför `wanted` inte duger som ny version, eller None om den duger."""
    nytt = _parse(wanted)
    if nytt is None:
        return f"{wanted} är inte en version på formen x.y.z"
    nuvarande = _parse(current)
    if nuvarande is not None and nytt <= nuvarande:
        return f"{wanted} är inte högre än {current}"
    return None


def set_version(manifest_path: Path, version: str) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version"] = version
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()
    except subprocess.CalledProcessError as err:
        _fail(f"git {' '.join(args)} misslyckades: {err.stderr.strip()}")
        raise


def _fail(message: str) -> None:
    print(f"✖ {message}", file=sys.stderr)
    raise SystemExit(1)


def main(argv: list[str]) -> None:
    if len(argv) != 1:
        _fail("Användning: uv run scripts/release.py 0.2.0")
    version = argv[0]
    manifest = MANIFEST.resolve()
    if _git("status", "--porcelain"):
        _fail("Det finns ocommittade ändringar. Committa eller stasha dem först.")
    problem = bump_problem(json.loads(manifest.read_text(encoding="utf-8"))["version"], version)
    if problem:
        _fail(problem)
    set_version(manifest, version)
    _git("add", str(manifest))
    _git("commit", "-m", f"Home Assistant-integrationen {version}")
    _git("tag", TAG_PREFIX + version)
    print(
        f"✓ {TAG_PREFIX}{version} är committad och taggad. Pusha med:\n  git push && git push origin {TAG_PREFIX}{version}"
    )


if __name__ == "__main__":
    main(sys.argv[1:])

"""uv run scripts/smoke.py

Rökprov mot produktions-API:t: sök, hämta en adress och tolka svaret.
Avslutar med felkod om något inte stämmer.
"""

import asyncio
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import aiohttp
from custom_components.sopor.api import SoporClient
from custom_components.sopor.logic import fraction_ids, summary, today_in_stockholm


async def run() -> str:
    async with aiohttp.ClientSession() as session:
        client = SoporClient(session)
        search = await client.search("Storgatan 2")
        if not search["addresses"]:
            raise AssertionError("Storgatan 2 gav inga träffar")
        schedule = await client.schedule(search["addresses"][0]["url"])
    today = today_in_stockholm(datetime.now().astimezone())
    ids = fraction_ids(schedule)
    text = summary(schedule, today, "sv")
    if not ids or not text:
        raise AssertionError("schemat saknar avfallstyper eller sammanfattning")
    return f"{len(search['addresses'])} träffar, {len(ids)} avfallstyper: {text}"


def main() -> None:
    try:
        print(f"✓ Rökprovet gick bra: {asyncio.run(run())}")
    except Exception as err:
        print(f"✖ Rökprovet misslyckades: {err!r}", file=sys.stderr)
        raise SystemExit(1) from err


if __name__ == "__main__":
    main()

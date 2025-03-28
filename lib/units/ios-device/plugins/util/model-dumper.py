import asyncio
import aiohttp
import typing
import json
import logging
from bs4 import BeautifulSoup
from pathlib import Path

source_path = Path(__file__).resolve()
source_dir = source_path.parent

PAGES: typing.Final[dict[str, str]] = {
    "iphones": "https://everymac.com/systems/apple/iphone/index-iphone-specs.html",
    "ipads": "https://everymac.com/systems/apple/ipad/index-ipad-specs.html",
    "appletvs": "https://everymac.com/systems/apple/apple-tv/index-appletv.html",
    "watches": "https://everymac.com/systems/apple/apple-watch/index-apple-watch-specs.html",
    "homepods": "https://everymac.com/systems/apple/homepod/index-homepod-specs.html",
    "visionpros": "https://everymac.com/systems/apple/vision/index-apple-vision.html",
}

KEYS = {
    "introduced": ["Intro."],
    "discontinued": ["Disc."],
    "model": ["Model"],
    "device_id": ["ID"],
    "order": ["Order"],
    "full_family": ["Family"],
    # "battery_voice": ["Voice Use:"],
    # "battery_music": ["Music Use:"],
    # "battery_total": ["Battery Life:"],
    # "network": ["Network:"],
    # "ram": ["RAM"],
    # "vram": ["VRAM"],
}


async def parse_page(page_type: str):
    assert page_type in PAGES
    url = PAGES[page_type]
    async with aiohttp.ClientSession(
        headers={
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
        }
    ) as sess:
        page = await sess.get(url)
        bs = BeautifulSoup(await page.text(), "html.parser")
        secs = bs.find_all(id="contentcenter_specs_externalnav_wrapper")[1:]
        devices = []
        for sec in secs:
            full_name_a = sec.find("a")
            full_name = full_name_a.string
            data = {}
            for key, search_patterns in KEYS.items():
                for search_pattern in search_patterns:
                    find_res = sec.find_next("td", string=search_pattern)
                    if find_res:
                        if key in data:
                            logging.warning(
                                f"Found second entry of {key} for device {full_name}"
                            )
                        data[key] = find_res.find_next("td").getText()
                    else:
                        logging.warning(
                            f"Could not find search pattern {search_pattern} for device {full_name}"
                        )
            devices.append({"full_name": full_name, **data})
        return devices


async def main():
    res = await asyncio.gather(*(parse_page(page_type) for page_type in PAGES.keys()))
    with open(source_dir / "devices.json", "w") as f:
        json.dump([x for xs in res for x in xs], f)


if __name__ == "__main__":
    asyncio.run(main())

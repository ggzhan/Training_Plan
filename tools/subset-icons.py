#!/usr/bin/env python3
"""Rebuild the self-hosted Bootstrap Icons subset.

Only the icons the templates and scripts use go into the font (a few KB
instead of 130 KB). Run it after using a new `bi-*` icon:

    python3 -m venv /tmp/ftv && /tmp/ftv/bin/pip install fonttools brotli
    /tmp/ftv/bin/python tools/subset-icons.py

It downloads bootstrap-icons 1.11.0 from jsDelivr, so it needs the network.
"""
import io
import pathlib
import re
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = "1.11.0"
BASE = f"https://cdn.jsdelivr.net/npm/bootstrap-icons@{VERSION}/font/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "src/main/resources"
OUT = RES / "static/vendor/bootstrap-icons"


def fetch(path):
    with urllib.request.urlopen(BASE + path) as response:
        return response.read()


def used_icons():
    names = set()
    for folder in (RES / "templates", RES / "static/js"):
        for file in folder.rglob("*"):
            if file.suffix in (".html", ".js"):
                names.update(re.findall(r"\bbi-[a-z0-9-]+", file.read_text(encoding="utf-8")))
    return names


def main():
    css = fetch("bootstrap-icons.css").decode("utf-8")
    codepoints = dict(re.findall(r'\.(bi-[a-z0-9-]+)::before\s*\{\s*content:\s*"\\([0-9a-f]+)"', css))
    names = sorted(n for n in used_icons() if n in codepoints)
    missing = sorted(n for n in used_icons() if n not in codepoints)
    if missing:
        print("not Bootstrap icons (ignored):", ", ".join(missing))

    font = TTFont(io.BytesIO(fetch("fonts/bootstrap-icons.woff2")))
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = []
    options.name_IDs = []
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[int(codepoints[n], 16) for n in names])
    subsetter.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUT / "icons.woff2")

    rules = "\n".join(f'.{n}::before {{ content: "\\{codepoints[n]}"; }}' for n in names)
    (OUT / "icons.css").write_text(f"""/* Bootstrap Icons {VERSION} (MIT), subset by tools/subset-icons.py: {len(names)} icons */
@font-face {{
    font-display: block;
    font-family: "bootstrap-icons";
    src: url("icons.woff2?v={len(names)}") format("woff2");
}}

.bi::before,
[class^="bi-"]::before,
[class*=" bi-"]::before {{
    display: inline-block;
    font-family: bootstrap-icons !important;
    font-style: normal;
    font-weight: normal !important;
    font-variant: normal;
    text-transform: none;
    line-height: 1;
    vertical-align: -.125em;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}}

{rules}
""", encoding="utf-8")
    print(f"{len(names)} icons, {(OUT / 'icons.woff2').stat().st_size} bytes")


if __name__ == "__main__":
    main()

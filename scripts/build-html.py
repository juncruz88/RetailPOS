#!/usr/bin/env python3
"""Bundle www/ into a single self-contained dist/store-pos.html.

Everything is inlined (styles, scripts, barcode library, icon) so the file can
be opened straight from disk, emailed, or dropped on any static host without
the rest of the www/ tree.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / "www"
OUT = ROOT / "dist" / "store-pos.html"


def data_uri(relative):
    raw = (WWW / relative).read_bytes()
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def main():
    html = (WWW / "index.html").read_text(encoding="utf-8")

    # A single file has no manifest to point at; the icon travels inline.
    html = re.sub(r"\s*<link rel=\"manifest\"[^>]*>", "", html)
    html = html.replace('href="icons/icon-192.png"', 'href="' + data_uri("icons/icon-192.png") + '"')

    css = (WWW / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")

    def inline(match):
        code = (WWW / match.group(1)).read_text(encoding="utf-8")
        return "<script>\n" + code + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

    for leftover in re.findall(r'(?:src|href)="(?!data:|#)([^"]+)"', html):
        raise SystemExit("still references a file: %s" % leftover)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print("HTML: %s (%.0f KB)" % (OUT, OUT.stat().st_size / 1024))


if __name__ == "__main__":
    main()

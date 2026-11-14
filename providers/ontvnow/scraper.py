#!/usr/bin/env python3
"""Fetch the public onTVnow UK sports XMLTV feed and normalize it for Specta."""
from __future__ import annotations
import argparse, hashlib, json, os, sys, tempfile, urllib.error, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SOURCE = "ontvnow_uk"
SOURCE_URL = "https://ontvnow.co.uk/api/v1/listings.xml?group=sport"
USER_AGENT = "SpectaEPG/1.0 (+https://github.com/ayoubhaid/specta-broadcaster-epg)"
MAX_BYTES = 50 * 1024 * 1024

def parse_xmltv_time(value: str) -> datetime:
    value = value.strip()
    for fmt in ("%Y%m%d%H%M%S %z", "%Y%m%d%H%M%S%z"):
        try:
            return datetime.strptime(value, fmt).astimezone(timezone.utc)
        except ValueError:
            pass
    try:
        return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ValueError(f"Unsupported XMLTV timestamp: {value!r}") from exc

def _text(element: ET.Element | None) -> str:
    return "" if element is None else " ".join("".join(element.itertext()).split())

def _stable_id(channel_id: str, start: int, end: int, title: str) -> str:
    raw = f"{SOURCE}|{channel_id}|{start}|{end}|{title.casefold()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]

def parse_xmltv(xml_data: bytes, fetched_at: str | None = None, source_url: str = SOURCE_URL) -> dict[str, Any]:
    root = ET.fromstring(xml_data)
    if root.tag != "tv":
        raise ValueError(f"Expected XMLTV <tv> root, received <{root.tag}>")
    channel_names: dict[str, str] = {}
    for node in root.findall("channel"):
        channel_id = (node.get("id") or "").strip()
        display_name = next((_text(item) for item in node.findall("display-name") if _text(item)), channel_id)
        if channel_id:
            channel_names[channel_id] = display_name

    grouped: dict[str, list[dict[str, Any]]] = {}
    for node in root.findall("programme"):
        channel_id = (node.get("channel") or "").strip()
        title = _text(node.find("title"))
        if not channel_id or not title:
            continue
        try:
            start_dt = parse_xmltv_time(node.get("start") or "")
            end_dt = parse_xmltv_time(node.get("stop") or "")
        except ValueError:
            continue
        if end_dt <= start_dt:
            continue
        start, end = int(start_dt.timestamp()), int(end_dt.timestamp())
        categories = [_text(item) for item in node.findall("category") if _text(item)]
        programme: dict[str, Any] = {
            "id": _stable_id(channel_id, start, end, title),
            "title": title,
            "description": _text(node.find("desc")),
            "start": start_dt.isoformat().replace("+00:00", "Z"),
            "end": end_dt.isoformat().replace("+00:00", "Z"),
            "startEpochSeconds": start,
            "endEpochSeconds": end,
            "source": SOURCE,
            "sourceChannelId": channel_id,
            "sourceUrl": source_url,
        }
        if categories:
            programme["categories"] = categories
        grouped.setdefault(channel_id, []).append(programme)

    channels = []
    for channel_id, programmes in sorted(grouped.items()):
        programmes.sort(key=lambda item: (item["startEpochSeconds"], item["id"]))
        channels.append({
            "id": channel_id, "name": channel_names.get(channel_id, channel_id),
            "region": "GB", "canonicalChannelId": "", "programmes": programmes,
        })
    total = sum(len(channel["programmes"]) for channel in channels)
    return {
        "schemaVersion": 1, "provider": SOURCE, "providerName": "onTVnow UK Sports Listings",
        "sourceUrl": source_url, "region": "GB", "timezone": "UTC",
        "generatedAt": fetched_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "coverage": {"daysRequested": 7, "channelsFound": len(channels), "programmesFound": total,
                     "successfulRequests": 1, "failedRequests": 0},
        "mapping": {"canonicalChannelIdsMapped": 0, "canonicalChannelIdsMissing": len(channels),
                    "note": "Source channel IDs require explicit review in data/mapping/channel-map.csv"},
        "channels": channels,
    }

def fetch_xmltv(url: str = SOURCE_URL, timeout: int = 45) -> bytes:
    request = urllib.request.Request(url, headers={
        "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.1", "User-Agent": USER_AGENT,
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content_type = response.headers.get("Content-Type", "").lower()
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise RuntimeError(f"XMLTV response exceeds {MAX_BYTES} bytes")
            if response.status != 200:
                raise RuntimeError(f"onTVnow returned HTTP {response.status}")
            if "json" in content_type:
                raise RuntimeError(f"Expected XMLTV, received {content_type}")
            return data
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"onTVnow HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"onTVnow request failed: {exc.reason}") from exc

def write_atomic(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                     prefix=path.name + ".", suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(document, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="data/review/ontvnow_uk_unclassified.json")
    parser.add_argument("--url", default=os.environ.get("ONTVNOW_XMLTV_URL", SOURCE_URL))
    args = parser.parse_args()
    try:
        document = parse_xmltv(fetch_xmltv(args.url), source_url=args.url)
        if not document["coverage"]["programmesFound"]:
            raise RuntimeError("Feed contained no usable programme rows; last good output preserved")
        write_atomic(Path(args.output), document)
        print(json.dumps({"provider": SOURCE, "channels": document["coverage"]["channelsFound"],
                          "programmes": document["coverage"]["programmesFound"], "output": args.output}, indent=2))
        return 0
    except Exception as exc:
        print(f"onTVnow EPG refresh failed: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())

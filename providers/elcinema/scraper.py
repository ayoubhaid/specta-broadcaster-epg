#!/usr/bin/env python3
"""Fetch the public elCinema English TV guide and normalize it for Specta.

The guide renders two date blocks per channel: the remainder of today and the
whole of tomorrow. Times are shown in GMT (the server clock), so the adapter
defaults to UTC. Override with ELCINEMA_TIMEZONE if that ever changes.

Only dated channel schedules are emitted. Programme titles, descriptions and
start/end instants are normalized to the shared schedule-v1 schema. Publishing
still requires an explicit row in data/mapping/channel-map.csv.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SOURCE = "elcinema"
SOURCE_URL = "https://elcinema.com/en/tvguide"
USER_AGENT = "SpectaEPG/1.0 (+https://github.com/ayoubhaid/specta-broadcaster-epg)"
MAX_BYTES = 2 * 1024 * 1024

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

DATE_BLOCK = re.compile(r'class="\s*dates\s*"[^>]*>([\s\S]*?)</div>', re.I)
CHANNEL_LINK = re.compile(r'href="/en/tvguide/(\d+)/"[^>]*>([\s\S]*?)</a>', re.I)
PAGE_TITLE = re.compile(r"<title>\s*TV Guide\s+(.*?)\s+Channel", re.I | re.S)
TIME = re.compile(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", re.I)
DURATION = re.compile(r"\[\s*(\d+)\s*(?:minutes?|mins?|دقيقة|دقائق)\s*\]", re.I)
WORK_LINK = re.compile(r'<a href="/(?:en/)?work/\d+/">([\s\S]*?)</a>', re.I)
ROW_SPLIT = re.compile(r'<div class="boxed-category-\d+', re.I)


def clean(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return " ".join(unescape(text).split())


def parse_channel_list(html: str) -> list[dict[str, str]]:
    rows = []
    seen = set()
    for match in CHANNEL_LINK.finditer(html):
        channel_id = match.group(1)
        name = clean(match.group(2))
        if not name or channel_id in seen:
            continue
        seen.add(channel_id)
        rows.append({"id": channel_id, "name": name})
    return rows


def parse_date_header(text: str, year: int) -> date:
    """Locale-independent 'Saturday 14 November' parsing."""
    words = clean(text).split()
    numeric = [word for word in words if word.isdigit()]
    if len(numeric) >= 2:
        day, parsed_year = int(numeric[0]), int(numeric[1])
    elif numeric:
        day, parsed_year = int(numeric[0]), year
    else:
        raise ValueError(f"Unreadable date header: {text!r}")
    month_word = next((word.lower() for word in words if word.lower() in MONTHS), None)
    if month_word is None:
        raise ValueError(f"Unreadable month in date header: {text!r}")
    return date(parsed_year, MONTHS[month_word], day)


def parse_time(text: str) -> tuple[int, int]:
    match = TIME.search(clean(text))
    if not match:
        raise ValueError(f"Unreadable time: {text!r}")
    hour, minute = int(match.group(1)), int(match.group(2))
    meridiem = (match.group(3) or "").upper()
    if meridiem == "PM" and hour != 12:
        hour += 12
    if meridiem == "AM" and hour == 12:
        hour = 0
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError(f"Out-of-range time: {text!r}")
    return hour, minute


def load_timezone(name: str):
    if name.upper() in {"UTC", "GMT"}:
        return timezone.utc
    return ZoneInfo(name)


def stable_id(channel_id: str, start: int, end: int, title: str) -> str:
    raw = f"{SOURCE}|{channel_id}|{start}|{end}|{title.casefold()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def parse_channel_page(
    html: str,
    channel_id: str,
    fallback_name: str,
    timezone_name: str = "UTC",
    now: datetime | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    tz = load_timezone(timezone_name)
    current = now or datetime.now(timezone.utc)
    title_match = PAGE_TITLE.search(html)
    channel_name = clean(title_match.group(1)) if title_match else fallback_name

    blocks = list(DATE_BLOCK.finditer(html))
    if not blocks:
        return channel_name, []

    programmes: list[dict[str, Any]] = []
    seen = set()
    for index, block in enumerate(blocks):
        header = clean(block.group(1))
        try:
            parsed = parse_date_header(header, current.year)
            if parsed < (current.date() - timedelta(days=180)):
                parsed = parsed.replace(year=parsed.year + 1)
        except ValueError:
            continue
        content_end = blocks[index + 1].start() if index + 1 < len(blocks) else len(html)
        content = html[block.end():content_end]
        previous_start: datetime | None = None

        pending: list[dict[str, Any]] = []
        for chunk in ROW_SPLIT.split(content)[1:]:
            time_match = re.search(r"<li>\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*</li>", chunk, re.I)
            if not time_match:
                continue
            title = ""
            for link in WORK_LINK.finditer(chunk):
                candidate = clean(link.group(1))
                if candidate:
                    title = candidate
                    break
            if not title:
                continue
            try:
                hour, minute = parse_time(time_match.group(1))
            except ValueError:
                continue
            local_start = datetime(parsed.year, parsed.month, parsed.day, hour, minute, tzinfo=tz)
            if previous_start is not None and local_start < previous_start - timedelta(hours=12):
                local_start += timedelta(days=1)
            previous_start = local_start
            duration_match = DURATION.search(chunk)
            duration = int(duration_match.group(1)) if duration_match else 0
            description = ""
            meta = re.search(r"</a></li>\s*<li>\s*([\s\S]*?)</li>", chunk, re.I)
            if meta:
                text = clean(meta.group(1))
                if re.search(r"\((?:19|20)\d{2}\)", text) or text in {"Movie", "Series", "Episode", "Programme"}:
                    description = text
            pending.append({
                "title": title,
                "description": description,
                "start_local": local_start,
                "duration": duration,
            })

        for position, row in enumerate(pending):
            if row["duration"] > 0:
                end_local = row["start_local"] + timedelta(minutes=row["duration"])
            elif position + 1 < len(pending):
                end_local = pending[position + 1]["start_local"]
            else:
                end_local = row["start_local"] + timedelta(minutes=30)
            start_utc = row["start_local"].astimezone(timezone.utc)
            end_utc = end_local.astimezone(timezone.utc)
            if end_utc <= start_utc:
                continue
            start_epoch = int(start_utc.timestamp())
            end_epoch = int(end_utc.timestamp())
            key = (start_epoch, end_epoch, row["title"].casefold())
            if key in seen:
                continue
            seen.add(key)
            programmes.append({
                "id": stable_id(channel_id, start_epoch, end_epoch, row["title"]),
                "title": row["title"],
                "description": row["description"],
                "start": start_utc.isoformat().replace("+00:00", "Z"),
                "end": end_utc.isoformat().replace("+00:00", "Z"),
                "startEpochSeconds": start_epoch,
                "endEpochSeconds": end_epoch,
                "source": SOURCE,
                "sourceChannelId": channel_id,
                "sourceTimezone": timezone_name,
            })

    programmes.sort(key=lambda item: (item["startEpochSeconds"], item["id"]))
    return channel_name, programmes


def fetch(url: str, timeout: int = 30) -> str:
    request = urllib.request.Request(url, headers={
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise RuntimeError(f"elCinema response exceeds {MAX_BYTES} bytes")
            if response.status != 200:
                raise RuntimeError(f"elCinema returned HTTP {response.status}")
            return data.decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"elCinema HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"elCinema request failed: {exc.reason}") from exc


def build_feed(channels: list[dict[str, Any]], timezone_name: str, generated_at: str, days: int) -> dict[str, Any]:
    total = sum(len(channel["programmes"]) for channel in channels)
    return {
        "schemaVersion": 1,
        "provider": SOURCE,
        "providerName": "elCinema Arabic TV Guide",
        "sourceUrl": SOURCE_URL,
        "region": "AR",
        "timezone": timezone_name,
        "generatedAt": generated_at,
        "coverage": {
            "daysRequested": days,
            "channelsFound": len(channels),
            "programmesFound": total,
            "successfulRequests": len(channels),
            "failedRequests": 0,
        },
        "mapping": {
            "canonicalChannelIdsMapped": 0,
            "canonicalChannelIdsMissing": len(channels),
            "note": "Source channel IDs require explicit review in data/mapping/channel-map.csv",
        },
        "channels": channels,
    }


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
    parser.add_argument("--output", default="data/review/elcinema_ar_unclassified.json")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--delay-ms", type=int, default=150)
    parser.add_argument("--timezone", default=os.environ.get("ELCINEMA_TIMEZONE", "UTC"))
    parser.add_argument("--base-url", default=SOURCE_URL)
    args = parser.parse_args()

    try:
        load_timezone(args.timezone)
    except Exception as exc:
        print(f"elCinema EPG refresh failed: unknown timezone {args.timezone}", file=sys.stderr)
        return 1

    try:
        listing = fetch(args.base_url)
        directory = parse_channel_list(listing)
        if not directory:
            raise RuntimeError("Channel directory was empty or changed")
        if args.limit:
            directory = directory[: args.limit]

        now = datetime.now(timezone.utc)
        channels: list[dict[str, Any]] = []
        failed = 0
        for index, item in enumerate(directory):
            url = f"{args.base_url.rstrip('/')}/{item['id']}/"
            try:
                html = fetch(url)
                name, programmes = parse_channel_page(html, item["id"], item["name"], args.timezone, now)
                if programmes:
                    channels.append({
                        "id": item["id"],
                        "name": name or item["name"],
                        "region": "AR",
                        "canonicalChannelId": "",
                        "programmes": programmes,
                    })
                else:
                    failed += 1
            except Exception as exc:
                failed += 1
                print(f"Warning: elCinema channel {item['id']} {item['name']}: {exc}", file=sys.stderr)
            if args.delay_ms > 0 and index + 1 < len(directory):
                time.sleep(args.delay_ms / 1000)

        if not channels:
            raise RuntimeError("No programme data was collected; existing output preserved")

        generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        document = build_feed(channels, args.timezone, generated_at, 2)
        document["coverage"]["failedRequests"] = failed
        write_atomic(Path(args.output), document)
        print(json.dumps({
            "provider": SOURCE,
            "channels": document["coverage"]["channelsFound"],
            "programmes": document["coverage"]["programmesFound"],
            "failed": failed,
            "output": args.output,
        }, indent=2))
        return 0
    except Exception as exc:
        print(f"elCinema EPG refresh failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

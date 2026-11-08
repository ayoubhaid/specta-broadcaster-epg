#!/usr/bin/env python3
"""Scrape SuperSport's public Media Schedules into a normalized EPG CSV."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
from datetime import date, datetime, time as dtime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

SOURCE_URL = "https://wsd.supersport.com/media/ms_schedule.asp"
SOURCE = "supersport_media_schedules"
SOURCE_TZ = "Africa/Johannesburg"
FIELDS = ["canonical_channel_id", "source_channel_name", "source_channel_code", "title", "description", "start_utc", "end_utc", "source_timezone", "source_id", "source_url", "fetched_at_utc", "source_record_id", "status"]


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean(value).casefold()).strip()


class ScheduleParser(HTMLParser):
    """Read table rows without depending on the legacy page's presentation CSS."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_td = False
        self.in_tr = False
        self.cell = []
        self.row = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "tr":
            self.in_tr, self.row = True, []
        elif tag.lower() in ("td", "th") and self.in_tr:
            self.in_td, self.cell = True, []
        elif tag.lower() == "br" and self.in_td:
            self.cell.append(" ")

    def handle_endtag(self, tag):
        if tag.lower() in ("td", "th") and self.in_td:
            self.row.append(clean("".join(self.cell)))
            self.in_td = False
        elif tag.lower() == "tr" and self.in_tr:
            if self.row:
                self.rows.append(self.row)
            self.in_tr = False

    def handle_data(self, data):
        if self.in_td:
            self.cell.append(data)


def get_table_rows(html: str):
    parser = ScheduleParser()
    parser.feed(html)
    rows = []
    for row in parser.rows:
        if len(row) < 8 or row[0].strip().upper() == "DATE":
            continue
        # Legacy page columns: DATE, SPORT, PROGRAMME TITLE, EPISODE / DETAIL,
        # START, END, CHANNEL, STATUS.
        if not re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}", row[0]):
            continue
        rows.append(row[:8])
    return rows


def parse_channel(channel: str):
    match = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", channel)
    if match:
        return clean(match.group(1)), clean(match.group(2))
    return clean(channel), ""


def load_registry(path: Path | None):
    """Build exact alias/code maps; ambiguous aliases are intentionally ignored."""
    if path is None:
        return {}, {}
    aliases, codes = {}, {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            cid = next((clean(row.get(k, "")) for k in ("canonical_channel_id", "channel_id", "id") if clean(row.get(k, ""))), "")
            if not cid:
                continue
            names = []
            for key in ("canonical_name", "name", "channel_name", "source_channel_name", "aliases"):
                val = clean(row.get(key, ""))
                if val:
                    names.extend(val.split("|"))
            for name in names:
                key = norm(name)
                if key:
                    aliases.setdefault(key, set()).add(cid)
            code = clean(row.get("supersport_code", ""))
            if code:
                codes.setdefault(code.casefold(), set()).add(cid)
    return aliases, codes


def canonical_id(name: str, code: str, maps):
    aliases, codes = maps
    code_hits = codes.get(code.casefold(), set()) if code else set()
    name_hits = aliases.get(norm(name), set())
    hits = code_hits or name_hits
    return next(iter(hits)) if len(hits) == 1 else ""


def request_day(day: date, retries=3):
    body = f"f_year={day.year}&f_month={day.month}&f_day={day.day}&f_days=1&btn_process=Fetch+results".encode()
    req = Request(SOURCE_URL, data=body, headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SpectaEPGResearch/1.0 (+public schedule ingestion)"})
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=30) as response:
                return response.read().decode("latin-1"), response.geturl()
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1 + attempt)


def parse_rows(html: str, page_url: str, fetched: str, zone=SOURCE_TZ):
    try:
        tz = ZoneInfo(zone)
    except Exception:
        # South Africa has used UTC+02:00 year-round; this fallback keeps the
        # scraper usable on minimal Windows Python installs without tzdata.
        if zone != SOURCE_TZ:
            raise
        tz = timezone(timedelta(hours=2), name="SAST")
    out, seen = [], set()
    for row in get_table_rows(html):
        day_s, sport, title, detail, start_s, end_s, channel, status = row
        channel_name, code = parse_channel(channel)
        try:
            d = datetime.strptime(day_s, "%Y-%m-%d").date()
            start = datetime.combine(d, dtime.fromisoformat(start_s), tz)
            end = datetime.combine(d, dtime.fromisoformat(end_s), tz)
        except ValueError:
            continue
        # A schedule slot ending at/before its start crosses local midnight.
        if end <= start:
            end += timedelta(days=1)
        title = clean(title)
        description = clean(" — ".join(x for x in (sport, detail) if x))
        fingerprint = "|".join((code.casefold(), start.isoformat(), end.isoformat(), norm(title), norm(description)))
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        record_id = hashlib.sha256(f"{SOURCE}|{fingerprint}".encode()).hexdigest()[:24]
        out.append({"canonical_channel_id": "", "source_channel_name": channel_name, "source_channel_code": code, "title": title, "description": description, "start_utc": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), "end_utc": end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), "source_timezone": zone, "source_id": SOURCE, "source_url": page_url, "fetched_at_utc": fetched, "source_record_id": record_id, "status": clean(status)})
    return out


def scrape(start: date, days: int, maps, zone=SOURCE_TZ):
    records, seen = [], set()
    for offset in range(days):
        day = start + timedelta(days=offset)
        html, page_url = request_day(day)
        fetched = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        for row in parse_rows(html, page_url, fetched, zone):
            row["canonical_channel_id"] = canonical_id(row["source_channel_name"], row["source_channel_code"], maps)
            key = row["source_record_id"]
            if key not in seen:
                seen.add(key)
                records.append(row)
    return records


def write_csv(records, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)


def make_epg_document(records, days_requested: int):
    """Render the Specta beIN repository's schemaVersion 1 JSON envelope."""
    grouped = {}
    for row in records:
        key = row["source_channel_code"] or row["source_channel_name"]
        channel = grouped.setdefault(key, {
            "id": key,
            "name": row["source_channel_name"],
            "region": "multi-region",
            "canonicalChannelId": row["canonical_channel_id"],
            "sourceChannelCode": row["source_channel_code"],
            "programmes": []
        })
        start_epoch = int(datetime.fromisoformat(row["start_utc"].replace("Z", "+00:00")).timestamp())
        end_epoch = int(datetime.fromisoformat(row["end_utc"].replace("Z", "+00:00")).timestamp())
        channel["programmes"].append({
            "id": row["source_record_id"],
            "title": row["title"],
            "description": row["description"],
            "start": row["start_utc"],
            "end": row["end_utc"],
            "startEpochSeconds": start_epoch,
            "endEpochSeconds": end_epoch,
            "source": SOURCE,
            "sourceChannelCode": row["source_channel_code"],
            "sourceRecordId": row["source_record_id"],
            "sourceUrl": row["source_url"],
            "fetchedAt": row["fetched_at_utc"],
            "sourceTimezone": row["source_timezone"]
        })
    for channel in grouped.values():
        channel["programmes"].sort(key=lambda item: (item["start"], item["id"]))
    fetched = max((r["fetched_at_utc"] for r in records), default=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    total_programmes = sum(len(ch["programmes"]) for ch in grouped.values())
    return {
        "schemaVersion": 1,
        "provider": "supersport",
        "providerName": "SuperSport",
        "sourceUrl": "https://supersport.com/tv-guide",
        "region": "multi-region",
        "timezone": "UTC",
        "generatedAt": fetched,
        "coverage": {
            "daysRequested": days_requested,
            "channelsFound": len(grouped),
            "programmesFound": total_programmes,
            "successfulRequests": days_requested,
            "failedRequests": 0
        },
        "mapping": {
            "canonicalChannelIdsMapped": sum(bool(ch["canonicalChannelId"]) for ch in grouped.values()),
            "canonicalChannelIdsMissing": sum(not bool(ch["canonicalChannelId"]) for ch in grouped.values()),
            "note": "channels[].id is the source channel code; canonicalChannelId is populated only from a unique registry match"
        },
        "channels": list(grouped.values())
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--date", default=date.today().isoformat(), help="First local schedule date YYYY-MM-DD")
    ap.add_argument("--days", type=int, default=1, help="Number of consecutive dates (1-14)")
    ap.add_argument("--registry", type=Path, help="Specta channel CSV; supports canonical_channel_id and name/aliases/supersport_code columns")
    ap.add_argument("--output", type=Path, default=Path("supersport-schedule.csv"))
    ap.add_argument("--json-output", type=Path, help="SchemaVersion 1 JSON path; defaults beside --output with a .json extension")
    ap.add_argument("--timezone", default=SOURCE_TZ)
    args = ap.parse_args(argv)
    if not 1 <= args.days <= 14:
        ap.error("--days must be between 1 and 14")
    try:
        date.fromisoformat(args.date)
        records = scrape(date.fromisoformat(args.date), args.days, load_registry(args.registry), args.timezone)
        write_csv(records, args.output)
        json_path = args.json_output or args.output.with_suffix(".json")
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(make_epg_document(records, args.days), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception as exc:
        print(f"Scrape failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"source": SOURCE, "date": args.date, "days": args.days, "records": len(records), "mapped": sum(bool(r['canonical_channel_id']) for r in records), "unmapped_channels": sorted({r['source_channel_name'] for r in records if not r['canonical_channel_id']}), "output": str(args.output), "json_output": str(json_path)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

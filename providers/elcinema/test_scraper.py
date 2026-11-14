from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from scraper import parse_channel_list, parse_channel_page, parse_date_header, parse_time

FIXTURE = Path(__file__).parent / "fixtures" / "tvguide-1132.html"


class ElcinemaParserTest(unittest.TestCase):
    def test_parse_time_handles_pm_and_midnight(self) -> None:
        self.assertEqual(parse_time("05:30  PM"), (17, 30))
        self.assertEqual(parse_time("12:00 AM"), (0, 0))
        self.assertEqual(parse_time("12:00 PM"), (12, 0))
        self.assertEqual(parse_time("23:45"), (23, 45))

    def test_parse_date_header_is_locale_independent(self) -> None:
        self.assertEqual(parse_date_header("Saturday 14 November", 2026), date(2026, 11, 14))
        self.assertEqual(parse_date_header("Sunday 15 November 2026", 2025), date(2026, 11, 15))

    def test_parse_channel_list(self) -> None:
        html = (
            '<a href="/en/tvguide/1132/">MBC MAX</a>'
            '<a href="/en/tvguide/1128/">MBC 2</a>'
            '<a href="/en/tvguide/1132/">MBC MAX</a>'
        )
        self.assertEqual(parse_channel_list(html), [
            {"id": "1132", "name": "MBC MAX"},
            {"id": "1128", "name": "MBC 2"},
        ])

    def test_parses_captured_mbc_max_page(self) -> None:
        html = FIXTURE.read_text(encoding="utf-8")
        name, programmes = parse_channel_page(
            html,
            "1132",
            "MBC MAX",
            "UTC",
            datetime(2026, 11, 14, 17, 35, tzinfo=timezone.utc),
        )
        self.assertEqual(name, "MBC MAX")
        self.assertGreater(len(programmes), 10)
        self.assertEqual(programmes[0]["title"], "Spotlight")
        self.assertEqual(programmes[0]["start"], "2026-11-14T17:30:00Z")
        self.assertTrue(all(p["endEpochSeconds"] > p["startEpochSeconds"] for p in programmes))
        self.assertTrue(any(p["start"].startswith("2026-11-15") for p in programmes))

    def test_empty_page_produces_no_programmes(self) -> None:
        name, programmes = parse_channel_page("<html></html>", "1", "Unknown")
        self.assertEqual(name, "Unknown")
        self.assertEqual(programmes, [])


if __name__ == "__main__":
    unittest.main()

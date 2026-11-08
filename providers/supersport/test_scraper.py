import unittest
from datetime import date
from pathlib import Path

import scraper as adapter


class SuperSportAdapterTests(unittest.TestCase):
    def test_real_official_response_contains_schedule_rows(self):
        html = (Path(__file__).parent / "supersport_schedule.html").read_text(encoding="utf-8-sig")
        rows = adapter.get_table_rows(html)
        self.assertGreater(len(rows), 1000)
        self.assertEqual(rows[0][0], "2026-11-8")

    def test_channel_code_extraction(self):
        self.assertEqual(adapter.parse_channel("SuperSport Premier League Africa (EPLA)"), ("SuperSport Premier League Africa", "EPLA"))

    def test_timezone_and_midnight_rollover(self):
        html = """<table><tr><td>2026-11-8</td><td>Football</td><td>Late programme</td><td>Final</td><td>23:30</td><td>00:15</td><td>SuperSport Action (ACT)</td><td>R</td></tr></table>"""
        result = adapter.parse_rows(html, adapter.SOURCE_URL, "2026-11-08T00:00:00Z")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["start_utc"], "2026-11-08T21:30:00Z")
        self.assertEqual(result[0]["end_utc"], "2026-11-08T22:15:00Z")

    def test_exact_registry_mapping_only(self):
        maps = ({"supersport action": {"ss:act"}}, {"act": {"ss:act"}})
        self.assertEqual(adapter.canonical_id("SuperSport Action", "ACT", maps), "ss:act")
        self.assertEqual(adapter.canonical_id("SuperSport Unknown", "", maps), "")

    def test_shared_schema_v1_json_document(self):
        html = """<table><tr><td>2026-11-8</td><td>Football</td><td>Late programme</td><td>Final</td><td>23:30</td><td>23:45</td><td>SuperSport Action (ACT)</td><td>R</td></tr></table>"""
        rows = adapter.parse_rows(html, adapter.SOURCE_URL, "2026-11-08T00:00:00Z")
        doc = adapter.make_epg_document(rows, 1)
        self.assertEqual(doc["schemaVersion"], 1)
        self.assertEqual(doc["coverage"]["channelsFound"], 1)
        programme = doc["channels"][0]["programmes"][0]
        self.assertEqual(programme["source"], "supersport_media_schedules")
        self.assertTrue(programme["start"].endswith("Z"))
        self.assertIn("sourceUrl", programme)


if __name__ == "__main__":
    unittest.main()

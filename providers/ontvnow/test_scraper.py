import unittest
from scraper import build_summary, parse_xmltv, parse_xmltv_time

SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="sport.one"><display-name>Sport One</display-name><display-name>Sport One HD</display-name></channel>
  <programme start="20261114090000 +0000" stop="20261114100000 +0000" channel="sport.one">
    <title lang="en">Morning Sport</title><desc lang="en">Daily sports news</desc><category lang="en">Sports</category>
  </programme>
  <programme start="20261114100000 +0000" stop="20261114110000 +0000" channel="sport.one">
    <title lang="en">Live Coverage</title>
  </programme>
</tv>"""

class OnTVNowScraperTests(unittest.TestCase):
    def test_parse_xmltv_time_with_offset(self):
        value = parse_xmltv_time("20261114090000 +0100")
        self.assertEqual(value.isoformat(), "2026-11-14T08:00:00+00:00")

    def test_normalizes_channel_and_programmes(self):
        feed = parse_xmltv(SAMPLE, fetched_at="2026-11-14T00:00:00Z")
        self.assertEqual(feed["provider"], "ontvnow_uk")
        self.assertEqual(feed["coverage"]["channelsFound"], 1)
        self.assertEqual(feed["coverage"]["programmesFound"], 2)
        channel = feed["channels"][0]
        self.assertEqual(channel["id"], "sport.one")
        self.assertEqual(channel["name"], "Sport One")
        self.assertEqual(channel["programmes"][0]["title"], "Morning Sport")
        self.assertEqual(channel["programmes"][0]["categories"], ["Sports"])
        self.assertEqual(channel["programmes"][0]["start"], "2026-11-14T09:00:00Z")
        self.assertEqual(len(channel["programmes"][0]["id"]), 24)

    def test_compact_summary_keeps_channel_counts_not_schedule_rows(self):
        feed = parse_xmltv(SAMPLE, fetched_at="2026-11-14T00:00:00Z")
        summary = build_summary(feed)
        self.assertEqual(summary["coverage"]["channelsFound"], 1)
        self.assertEqual(summary["coverage"]["programmesFound"], 2)
        self.assertEqual(summary["channels"], [
            {"id": "sport.one", "name": "Sport One", "programmesFound": 2}
        ])
        self.assertNotIn("description", summary["channels"][0])
        self.assertNotIn("programmes", summary["channels"][0])

    def test_ignores_invalid_rows_and_empty_titles(self):
        xml = b"""<tv><channel id="x"><display-name>X</display-name></channel>
          <programme start="bad" stop="bad" channel="x"><title>Bad time</title></programme>
          <programme start="20261114090000 +0000" stop="20261114080000 +0000" channel="x"><title>Bad range</title></programme>
          <programme start="20261114090000 +0000" stop="20261114100000 +0000" channel="x"><title>  </title></programme>
        </tv>"""
        feed = parse_xmltv(xml)
        self.assertEqual(feed["coverage"]["channelsFound"], 0)
        self.assertEqual(feed["coverage"]["programmesFound"], 0)

if __name__ == "__main__":
    unittest.main()

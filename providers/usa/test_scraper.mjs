import test from "node:test";
import assert from "node:assert/strict";
import { parseXmltvTimestamp, parseXmltv, sourceUrl, SOURCES } from "./scraper.mjs";

const sample = '<?xml version="1.0"?><tv>' +
  '<channel id="ESPN.us"><display-name lang="en">ESPN</display-name></channel>' +
  '<channel id="WABC-DT.us"><display-name>ABC New York</display-name></channel>' +
  '<channel id="invalid.channel"><display-name>Ignore</display-name></channel>' +
  '<programme start="20261112010000 +0000" stop="20261112020000 +0000" channel="ESPN.us"><title>Sports &amp; More</title><desc>Live &amp; recorded.</desc></programme>' +
  '<programme start="20261112020000 +0000" stop="20261112030000 +0000" channel="WABC-DT.us"><title>Local News</title></programme>' +
  '<programme start="20261112030000 +0000" stop="20261112040000 +0000" channel="invalid.channel"><title>Ignored</title></programme></tv>';

test("parses XMLTV timestamps and offsets", () => {
  assert.equal(parseXmltvTimestamp("20261112010000 +0000"), Date.UTC(2026, 10, 12, 1) / 1000);
  assert.equal(parseXmltvTimestamp("20261112010000 -0500"), Date.UTC(2026, 10, 12, 6) / 1000);
  assert.equal(parseXmltvTimestamp("bad"), null);
});
test("keeps only US IDs and normalizes programmes", () => {
  const oldNow = Date.now;
  Date.now = () => Date.parse("2026-11-12T00:00:00Z");
  try {
    const feed = parseXmltv(sample, { source: "tvtv.us", sourceUrl: "https://example.test/us.xml", fetchedAt: "2026-11-12T00:00:00Z", days: 2 });
    assert.equal(feed.channels.length, 2);
    assert.equal(feed.coverage.programmesFound, 2);
    assert.equal(feed.channels.find(x => x.id === "ESPN.us").canonicalChannelId, "ESPN.us");
    assert.equal(feed.channels.find(x => x.id === "ESPN.us").programmes[0].title, "Sports & More");
  } finally { Date.now = oldNow; }
});
test("provides configured US source URLs", () => {
  assert.deepEqual(Object.keys(SOURCES), ["tvtv.us", "tvguide.com", "gatotv.com", "ontvtonight.com", "directv.com"]);
  assert.equal(sourceUrl("tvtv.us", "us-ny"), "https://iptv-org.github.io/epg/guides/us-ny/tvtv.us.epg.xml");
  assert.throws(() => sourceUrl("unknown"), /Unsupported US source/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { parseXmltv, parseXmltvTimestamp, sourceUrl, SOURCES } from "./scraper.mjs";

const sample = '<?xml version="1.0"?><tv>' +
  '<channel id="BBCOne.uk"><display-name lang="en">BBC One</display-name></channel>' +
  '<channel id="France2.fr"><display-name>France 2</display-name></channel>' +
  '<channel id="AdultChannel.uk"><display-name>Adult Channel</display-name></channel>' +
  '<programme start="20261114010000 +0000" stop="20261114020000 +0000" channel="BBCOne.uk"><title>News &amp; Weather</title><desc>Daily update</desc></programme>' +
  '<programme start="20261114020000 +0000" stop="20261114030000 +0000" channel="France2.fr"><title>Ignored</title></programme>' +
  '<programme start="20261114030000 +0000" stop="20261114040000 +0000" channel="BBCOne.uk"><title>Restricted category</title><category>Adult</category></programme></tv>';

test("parses XMLTV timestamps with offsets", () => {
  assert.equal(parseXmltvTimestamp("20261114010000 +0000"), Date.UTC(2026, 10, 14, 1) / 1000);
  assert.equal(parseXmltvTimestamp("20261114010000 -0500"), Date.UTC(2026, 10, 14, 6) / 1000);
  assert.equal(parseXmltvTimestamp("bad"), null);
});

test("keeps only channel IDs belonging to the configured market", () => {
  const oldNow = Date.now;
  Date.now = () => Date.parse("2026-11-13T00:00:00Z");
  try {
    const feed = parseXmltv(sample, {
      sourceId: "uk_ontvtonight",
      fetchedAt: "2026-11-13T00:00:00Z",
      days: 2
    });
    assert.equal(feed.channels.length, 1);
    assert.equal(feed.channels[0].id, "BBCOne.uk");
    assert.equal(feed.channels[0].canonicalChannelId, "BBCOne.uk");
    assert.equal(feed.coverage.programmesFound, 1);
    assert.equal(feed.channels.some(channel => channel.id === "AdultChannel.uk"), false);
    assert.equal(feed.channels[0].programmes[0].title, "News & Weather");
  } finally {
    Date.now = oldNow;
  }
});

test("exposes the expected market guide URLs", () => {
  assert.equal(sourceUrl("uk_ontvtonight"), "https://iptv-org.github.io/epg/guides/uk/ontvtonight.com.epg.xml");
  assert.equal(sourceUrl("ke_dstv"), "https://iptv-org.github.io/epg/guides/ke/dstv.com.epg.xml");
  assert.equal(sourceUrl("ca_tvtv"), "https://iptv-org.github.io/epg/guides/ca/tvtv.us.epg.xml");
  assert.throws(() => sourceUrl("unknown"), /Unsupported market source/);
  assert.ok(Object.keys(SOURCES).length >= 10);
});

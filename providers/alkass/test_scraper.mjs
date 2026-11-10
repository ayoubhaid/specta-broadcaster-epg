import test from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "./scraper.mjs";

test("parses Alkass schedule cards and converts Qatar local time to UTC", () => {
  const html = '<section><img alt="Alkass One" /><p>00:00 - 00:30 News</p><p>00:30 - 01:00 Football Review</p><p>01:00 - 02:00 Qatar League</p><p>02:00 - 03:00 Sports News</p></section>' +
    '<section><img alt="Alkass Two" /><p>00:00 - 00:30 News</p><p>00:30 - 01:00 Football Review</p><p>01:00 - 02:00 Qatar League</p><p>02:00 - 03:00 Sports News</p></section>';
  const doc = parseGuide(html, "2026-11-10T00:00:00.000Z", "2026-11-10");
  assert.equal(doc.coverage.channelsFound, 2);
  assert.equal(doc.channels[0].name, "Alkass One");
  assert.equal(doc.channels[1].name, "Alkass Two");
  assert.equal(doc.channels[0].programmes.length, 4);
  assert.equal(doc.channels[0].programmes[0].start, "2026-11-09T21:00:00.000Z");
  assert.ok(doc.channels.every(c => c.programmes.every(p => Date.parse(p.end) > Date.parse(p.start))));
});

test("fails closed on an unknown page layout", () => {
  assert.throws(() => parseGuide("<html><body>Schedule not available</body></html>"), /No Alkass channel schedules parsed/);
});

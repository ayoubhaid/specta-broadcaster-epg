import test from "node:test";
import assert from "node:assert/strict";
import { normalizeResponse } from "./scraper.mjs";

test("normalizes official Fox Sports Australia JSON programme rows", () => {
  const payload = { "channel-programme": [
    { channelId: 501, channelName: "Fox Sports 501", programmeTitle: "Live Cricket", title: "Australia v India", synopsis: "Day session", startTime: "2026-11-11T08:00:00+11:00", endTime: "2026-11-11T12:00:00+11:00", programmeId: "p1" },
    { channelId: 501, channelName: "Fox Sports 501", programmeTitle: "Highlights", title: "", synopsis: "", startTime: "2026-11-11T12:00:00+11:00", endTime: "2026-11-11T13:00:00+11:00", programmeId: "p2" },
    { channelId: 503, channelName: "Fox Sports 503", programmeTitle: "Motorsport", startTime: "2026-11-11T13:00:00+11:00", endTime: "2026-11-11T14:00:00+11:00" }
  ] };
  const doc = normalizeResponse(payload, "2026-11-11T00:00:00.000Z", "https://tvguide.foxsports.com.au/granite-api/programmes.json?from=2026-11-11&to=2026-11-13");
  assert.equal(doc.coverage.channelsFound, 2);
  assert.equal(doc.coverage.programmesFound, 3);
  assert.equal(doc.channels[0].programmes[0].start, "2026-11-10T21:00:00.000Z");
  assert.equal(doc.channels[0].programmes[0].end, "2026-11-11T01:00:00.000Z");
  assert.equal(doc.channels[0].programmes[0].description, "Day session — Australia v India");
  assert.ok(doc.channels.every(c => c.region === "AU"));
});

test("fails closed if the source response shape changes", () => {
  assert.throws(() => normalizeResponse({ programmes: [] }, "2026-11-11T00:00:00.000Z", "https://example.test"), /channel-programme array/);
});

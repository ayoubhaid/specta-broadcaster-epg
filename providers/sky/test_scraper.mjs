import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeResponse } from "./scraper.mjs";

test("normalizes the captured official Sky response", async () => {
  const payload = JSON.parse(await readFile(new URL("./fixtures/schedule-2026-11-08.json", import.meta.url), "utf8"));
  const sourceUrl = "https://awk.epgsky.com/hawk/linear/schedule/20261108/1301,1302,1303,4091";
  const document = normalizeResponse(payload, "2026-11-08T14:00:00.000Z", sourceUrl);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.coverage.channelsFound, 4);
  assert.ok(document.coverage.programmesFound > 50);
  assert.deepEqual(document.channels.map(channel => channel.id).sort(), ["1301", "1302", "1303", "4091"]);
  const programmes = document.channels.flatMap(channel => channel.programmes);
  assert.ok(programmes.every(programme => Date.parse(programme.start) < Date.parse(programme.end)));
  assert.ok(programmes.every(programme => programme.sourceUrl === sourceUrl && programme.fetchedAt));
  assert.ok(programmes.every(programme => programme.startEpochSeconds === Math.floor(Date.parse(programme.start) / 1000)));
});

test("normalizes source duration and flags PPV without turning events into fixtures", () => {
  const payload = { date: "20261108", schedule: [{ sid: "1301", events: [{ sid: "1301", eid: "sample", st: 1794161400, d: 1800, t: "Programme title", sy: "Description", ippv: true }] }] };
  const document = normalizeResponse(payload, "2026-11-08T14:00:00.000Z", "https://example.test/schedule");
  const programme = document.channels[0].programmes[0];
  assert.equal(programme.endEpochSeconds - programme.startEpochSeconds, 1800);
  assert.equal(programme.isIppv, true);
  assert.equal(programme.broadcastStatus, "ppv");
  assert.equal(programme.source, "sky_uk");
});

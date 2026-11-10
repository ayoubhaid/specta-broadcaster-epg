import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHANNELS, localTimeToIso, parseScheduleHtml } from "./scraper.mjs";

const fixture = await readFile(new URL("./fixtures/snrt-tamazight-2025-01-13.html", import.meta.url), "utf8");
const channel = CHANNELS.find(item => item.id === "4075");

test("converts Morocco local wall-clock time to UTC", () => {
  assert.equal(localTimeToIso("20250113", "00H15"), "2025-01-12T23:15:00.000Z");
});

test("parses dated SNRT programme rows and derives positive end times", () => {
  const result = parseScheduleHtml(fixture, channel, "2025-01-13T00:00:00.000Z");
  assert.equal(result.id, "4075");
  assert.equal(result.name, "Tamazight");
  assert.equal(result.programmes.length, 27);
  assert.deepEqual(result.programmes[0], assert.matching({
    title: "الموعد الرياضي",
    start: "2025-01-12T23:15:00.000Z",
    end: "2025-01-12T23:30:00.000Z"
  }));
  assert.ok(result.programmes.every(p => Date.parse(p.end) > Date.parse(p.start)));
  assert.ok(result.programmes.every(p => p.sourceTimezone === "Africa/Casablanca"));
});

test("rejects empty or changed page layouts rather than producing an empty feed", () => {
  assert.throws(() => parseScheduleHtml("<html><body>maintenance</body></html>", channel), /No SNRT programme rows parsed/);
});

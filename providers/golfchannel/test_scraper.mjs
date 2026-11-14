import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSchedule, parseTime, toUtcEpoch } from "./scraper.mjs";

test("parses the captured Golf Channel on-air schedule", async () => {
  const html = await readFile(new URL("./fixtures/on-air-schedule.html", import.meta.url), "utf8");
  const programmes = parseSchedule(html);
  assert.ok(programmes.length > 5);
  assert.ok(programmes.every(programme => programme.title));
  assert.ok(programmes.every(programme => programme.endEpochSeconds > programme.startEpochSeconds));
  assert.ok(programmes.every(programme => programme.source === "golfchannel"));
  assert.ok(programmes.some(programme => programme.title.includes("Austin Championship")));
});

test("converts Eastern wall time to UTC", () => {
  assert.deepEqual(parseTime("1:00PM EST"), { hour: 13, minute: 0, suffix: "EST" });
  assert.deepEqual(parseTime("12:00 AM"), { hour: 0, minute: 0, suffix: "" });
  assert.equal(
    toUtcEpoch("2026-11-14", { hour: 13, minute: 0, suffix: "EST" }),
    Date.UTC(2026, 10, 14, 18, 0) / 1000,
  );
});

test("an empty page produces no programmes", () => {
  assert.deepEqual(parseSchedule("<html></html>"), []);
});

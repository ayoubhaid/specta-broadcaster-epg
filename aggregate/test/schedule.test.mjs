import test from "node:test";
import assert from "node:assert/strict";
import { epochSeconds, inspectFeed, normalizeProgramme } from "../lib/schedule.mjs";

test("epochSeconds accepts seconds, milliseconds and ISO-8601", () => {
  assert.equal(epochSeconds(1794139200), 1794139200);
  assert.equal(epochSeconds(1794139200000), 1794139200);
  assert.equal(epochSeconds("2026-11-08T12:00:00.000Z"), 1794139200);
  assert.equal(epochSeconds("2026-11-08T13:00:00+01:00"), 1794139200);
  assert.equal(epochSeconds("1794139200"), 1794139200);
});

test("epochSeconds rejects unreadable values", () => {
  assert.equal(epochSeconds("not a date"), null);
  assert.equal(epochSeconds(""), null);
  assert.equal(epochSeconds(null), null);
  assert.equal(epochSeconds(Number.NaN), null);
});

test("normalizeProgramme prefers the epoch fields and trims the text", () => {
  const { programme, reason } = normalizeProgramme({
    title: "  Espanyol   vs Deportivo ",
    description: "  Two   spaces  ",
    start: "2026-11-08T12:00:00Z",
    end: "2026-11-08T14:00:00Z",
    startEpochSeconds: 1794139200,
    endEpochSeconds: 1794146400,
  });
  assert.equal(reason, null);
  assert.deepEqual(programme, {
    title: "Espanyol vs Deportivo",
    description: "Two spaces",
    start: 1794139200,
    stop: 1794146400,
  });
});

test("normalizeProgramme rejects what the app would drop anyway", () => {
  const base = { startEpochSeconds: 1794139200, endEpochSeconds: 1794142800 };
  assert.equal(normalizeProgramme({ ...base, title: "   " }).reason, "title");
  assert.equal(normalizeProgramme({ ...base, title: "x", endEpochSeconds: 1794139200 }).reason, "range");
  assert.equal(normalizeProgramme({ ...base, title: "x", endEpochSeconds: 1794139200 - 60 }).reason, "range");
  assert.equal(normalizeProgramme({ ...base, title: "x", endEpochSeconds: 1794139200 + 13 * 3600 }).reason, "duration");
  assert.equal(normalizeProgramme({ ...base, title: "x", startEpochSeconds: null, endEpochSeconds: null }).reason, "time");
});

test("normalizeProgramme caps the description at 400 characters", () => {
  const { programme } = normalizeProgramme({
    title: "Long description",
    description: "wort ".repeat(200),
    startEpochSeconds: 1794139200,
    endEpochSeconds: 1794139500,
  });
  assert.ok(programme.description.length <= 402);
  assert.ok(programme.description.endsWith(" …"));
});

test("inspectFeed only accepts the shared schedule-v1 envelope", () => {
  assert.equal(inspectFeed({ schemaVersion: 1, provider: "bein_mena", channels: [] }).ok, true);
  assert.equal(inspectFeed({ schemaVersion: 2, provider: "x", channels: [] }).ok, false);
  assert.equal(inspectFeed({ schemaVersion: 1, provider: "", channels: [] }).ok, false);
  assert.equal(inspectFeed({ schemaVersion: 1, provider: "x" }).ok, false);
});

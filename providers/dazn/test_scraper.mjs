import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRail } from "./scraper.mjs";

test("normalizes the captured DAZN Spain rail", async () => {
  const payload = JSON.parse(await readFile(new URL("./fixtures/rail-es.json", import.meta.url), "utf8"));
  const channels = normalizeRail(payload, "ES");
  assert.ok(channels.length >= 5);
  const programmes = channels.flatMap(channel => channel.programmes);
  assert.ok(programmes.length > 20);
  assert.ok(programmes.every(programme => programme.title));
  assert.ok(programmes.every(programme => programme.endEpochSeconds > programme.startEpochSeconds));
  assert.ok(programmes.every(programme => programme.source === "dazn"));
  assert.ok(channels.some(channel => /DAZN 1/i.test(channel.name)));
});

test("combines the episode title with the programme title", () => {
  const payload = {
    Tiles: [{
      AssetId: "sample",
      Title: "DAZN 1",
      LinearSchedule: {
        Now: {
          Title: "League",
          EpisodeTitle: "Team A - Team B",
          Start: "2026-11-14T18:00:00Z",
          End: "2026-11-14T20:00:00Z",
          Description: "Live match",
        },
      },
    }],
  };
  const [channel] = normalizeRail(payload, "ES");
  assert.equal(channel.programmes[0].title, "League - Team A - Team B");
  assert.equal(channel.programmes[0].description, "Live match");
});

test("drops invalid and duplicate rows and tolerates an empty rail", () => {
  const payload = {
    Tiles: [{
      AssetId: "sample",
      Title: "DAZN 1",
      LinearSchedule: {
        Now: { Title: "Bad", Start: "not-a-date", End: "2026-11-14T20:00:00Z" },
        Next: { Title: "Good", Start: "2026-11-14T20:00:00Z", End: "2026-11-14T21:00:00Z" },
        Later: [{ Title: "Good", Start: "2026-11-14T20:00:00Z", End: "2026-11-14T21:00:00Z" }],
      },
    }],
  };
  const [channel] = normalizeRail(payload, "ES");
  assert.equal(channel.programmes.length, 1);
  assert.equal(normalizeRail({ Tiles: [] }, "ES").length, 0);
});

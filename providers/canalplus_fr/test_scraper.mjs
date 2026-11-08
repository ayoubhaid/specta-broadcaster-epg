import test from "node:test";
import assert from "node:assert/strict";
import { parseGuideHtml } from "./scraper.mjs";

const listing = `{"altText":"L'émission spéciale, Sur CANAL+, {sticker}, Diffusé Aujourd'hui à 19h10","contentID":"epg-42","title":"L'émission spéciale","subtitle":"Épisode 1","startTime":1794161400000,"endTime":1794165000000}`;

test("extracts channel programme data from the official page JSON", () => {
  const document = parseGuideHtml(`<html><script>${listing}</script></html>`, "2026-11-08T14:00:00.000Z");
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.coverage.channelsFound, 1);
  const programme = document.channels[0].programmes[0];
  assert.equal(document.channels[0].name, "CANAL+");
  assert.equal(programme.title, "L'émission spéciale");
  assert.equal(programme.description, "Épisode 1");
  assert.equal(programme.endEpochSeconds - programme.startEpochSeconds, 3600);
  assert.equal(programme.sourceTimezone, "Europe/Paris");
});

test("deduplicates repeated embedded schedule objects", () => {
  const document = parseGuideHtml(`<script>${listing}${listing}</script>`, "2026-11-08T14:00:00.000Z");
  assert.equal(document.coverage.programmesFound, 1);
});

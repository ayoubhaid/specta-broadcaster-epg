import test from "node:test";
import assert from "node:assert/strict";
import { buildDocument, normalizeSchedule } from "./scraper.mjs";

test("normalizes official channel schedule rows with explicit duration", () => {
  const channel = { id: 12, nome: "SPORT TV 1" };
  const rows = [
    { id: 101, data: "2026-11-11T20:00:00+00:00", duracao: 5400000, descricao: "Football", evento: { nome: "League match" } },
    { id: 102, data: "2026-11-11T21:30:00+00:00", duracao: 1800000, descricao: "Highlights" }
  ];
  const normalized = normalizeSchedule(channel, rows, "2026-11-11T12:00:00.000Z", "https://www.sporttv.pt/api/channels/epg?test");
  assert.equal(normalized.id, "12");
  assert.equal(normalized.name, "SPORT TV 1");
  assert.equal(normalized.programmes.length, 2);
  assert.equal(normalized.programmes[0].end, "2026-11-11T21:30:00.000Z");
  assert.equal(normalized.programmes[0].description, "League match");
  assert.ok(normalized.programmes.every(p => Date.parse(p.start) < Date.parse(p.end)));
  assert.ok(normalized.programmes.every(p => p.sourceUrl.includes("sporttv.pt/api/channels/epg")));
});

test("interprets timezone-less timestamps as Portugal local time", () => {
  const channel = { id: 1, nome: "SPORT TV 1" };
  const row = { data: "2026-11-11 20:00:00", duracao: 3600000, descricao: "Programa" };
  const result = normalizeSchedule(channel, [row], "2026-11-11T12:00:00.000Z", "https://example.test");
  assert.equal(result.programmes[0].start, "2026-11-11T20:00:00.000Z");
});

test("keeps empty/invalid schedule rows out rather than fabricating programmes", () => {
  const result = normalizeSchedule({ id: 1, nome: "SPORT TV 1" }, [
    { data: "not-a-date", duracao: 0, descricao: "bad" },
    { data: "2026-11-11T20:00:00Z", duracao: 60000, descricao: "" }
  ], "2026-11-11T12:00:00.000Z", "https://example.test");
  assert.equal(result.programmes.length, 0);
  const doc = buildDocument([result], "2026-11-11T12:00:00.000Z", 1);
  assert.equal(doc.coverage.channelsFound, 0);
});

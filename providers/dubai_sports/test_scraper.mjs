import test from "node:test";
import assert from "node:assert/strict";
import { parseObservations } from "./scraper.mjs";

test("captures official channel/title/time observations without inventing programme intervals", () => {
  const html = `
    <h2>ملخص الدراجات الهوائية</h2><p>دبي الرياضية 1</p><p>GMT: 02:30 UAE: 06:30</p>
    <h2>الجماهيــــــــر</h2><p>دبي الرياضية 2</p><p>GMT: 18:30 UAE: 22:30</p>
    <h2>ملخص الدراجات الهوائية</h2><p>دبي الرياضية 3</p><p>GMT: 02:30 UAE: 06:30</p>`;
  const result = parseObservations(html, "2026-11-10T12:00:00.000Z");
  assert.equal(result.observations.length, 3);
  assert.equal(result.publicationStatus, "blocked_missing_verified_programme_end_times");
  assert.equal(result.observations[0].channelName, "Dubai Sports 1");
  assert.equal(result.observations[0].sourceClock.uae, "06:30");
  assert.equal(result.observations[0].intervalVerified, false);
  assert.ok(!("start" in result.observations[0]));
  assert.ok(!("end" in result.observations[0]));
});

test("fails closed when source markup has no schedule cards", () => {
  assert.throws(() => parseObservations("<html><body>No future programmes available</body></html>"), /No Dubai Sports schedule observations parsed/);
});

/**
 * Reading and validating provider feeds in the shared schedule-v1 schema.
 * Nothing here changes a feed: bad rows are reported, never silently repaired.
 */

import { cleanText, clipText } from "./xmltv.mjs";

export const PROGRAMME_LIMITS = {
  /** The app drops anything longer, so such rows can never reach a screen. */
  maxDurationSeconds: 12 * 3600,
  descriptionMax: 400,
};

/** Accepts ISO-8601 strings, epoch seconds and epoch milliseconds -> epoch seconds. */
export function epochSeconds(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.floor(value > 1e11 ? value / 1000 : value);
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return epochSeconds(Number(text));
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

export function inspectFeed(document) {
  if (!document || typeof document !== "object") return { ok: false, reason: "not an object" };
  if (document.schemaVersion !== 1) return { ok: false, reason: "schemaVersion" };
  if (typeof document.provider !== "string" || !document.provider.trim()) return { ok: false, reason: "provider" };
  if (!Array.isArray(document.channels)) return { ok: false, reason: "channels" };
  return { ok: true, reason: null };
}

/**
 * Returns { programme, reason }. A reason means the row was rejected and the caller
 * should count it in the coverage report.
 */
export function normalizeProgramme(row, limits = PROGRAMME_LIMITS) {
  if (!row || typeof row !== "object") return { programme: null, reason: "row" };
  const title = cleanText(row.title);
  if (!title) return { programme: null, reason: "title" };
  const start = epochSeconds(row.startEpochSeconds ?? row.start);
  const stop = epochSeconds(row.endEpochSeconds ?? row.end);
  if (start == null || stop == null) return { programme: null, reason: "time" };
  if (stop <= start) return { programme: null, reason: "range" };
  if (stop - start > limits.maxDurationSeconds) return { programme: null, reason: "duration" };
  return {
    programme: {
      title,
      description: clipText(cleanText(row.description), limits.descriptionMax),
      start,
      stop,
    },
    reason: null,
  };
}

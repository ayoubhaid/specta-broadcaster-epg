import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE = "foxsports_au";
const API = "https://tvguide.foxsports.com.au/granite-api/programmes.json";
const USER_AGENT = "Mozilla/5.0 (compatible; SpectaEPG/1.0; public programme guide)";

function dateInZone(date, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateText, count) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function recordId(channelId, item, start, title) {
  return createHash("sha256").update(`${SOURCE}|${channelId}|${item.programmeId ?? item.id ?? ""}|${start}|${title}`).digest("hex").slice(0, 24);
}

export function normalizeResponse(payload, fetchedAt, sourceUrl) {
  const items = payload?.["channel-programme"];
  if (!Array.isArray(items)) throw new Error("Unexpected Fox Sports Australia response: missing channel-programme array");
  const grouped = new Map();
  for (const item of items) {
    const channelId = String(item?.channelId ?? "").trim();
    const channelName = String(item?.channelName ?? "").trim();
    const title = String(item?.programmeTitle ?? "").trim();
    const startMs = Date.parse(item?.startTime ?? "");
    const endMs = Date.parse(item?.endTime ?? "");
    if (!channelId || !channelName || !title || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    if (!grouped.has(channelId)) grouped.set(channelId, { id: channelId, name: channelName, region: "AU", canonicalChannelId: "", programmes: [] });
    const channel = grouped.get(channelId);
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();
    const key = `${start}|${title.toLocaleLowerCase("en-AU")}`;
    if (channel.programmes.some(p => `${p.start}|${p.title.toLocaleLowerCase("en-AU")}` === key)) continue;
    channel.programmes.push({
      id: recordId(channelId, item, start, title),
      title,
      description: [item.synopsis, item.title].filter(v => typeof v === "string" && v.trim()).join(" — "),
      start,
      end,
      startEpochSeconds: Math.floor(startMs / 1000),
      endEpochSeconds: Math.floor(endMs / 1000),
      source: SOURCE,
      sourceEventId: String(item.programmeId ?? item.id ?? ""),
      sourceChannelId: channelId,
      sourceUrl,
      fetchedAt,
      sourceTimezone: "Australia/Sydney"
    });
  }
  const channels = [...grouped.values()];
  for (const channel of channels) channel.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds);
  return {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "Fox Sports Australia",
    sourceUrl: API,
    region: "AU",
    timezone: "Australia/Sydney",
    generatedAt: fetchedAt,
    coverage: {
      daysRequested: 2,
      channelsFound: channels.length,
      programmesFound: channels.reduce((sum, c) => sum + c.programmes.length, 0),
      successfulRequests: 1,
      failedRequests: 0
    },
    mapping: {
      canonicalChannelIdsMapped: 0,
      canonicalChannelIdsMissing: channels.length,
      note: "Official Fox Sports Australia channel IDs are retained; exact playlist identity and channel-region mapping remain under review."
    },
    channels
  };
}

export async function fetchFeed(days = 2, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > 5) throw new Error("days must be an integer from 1 to 5");
  const fromDate = dateInZone(new Date(now), "Australia/Sydney");
  const toDate = addDays(fromDate, days);
  const sourceUrl = `${API}?from=${fromDate}&to=${toDate}`;
  const response = await fetch(sourceUrl, { headers: { accept: "application/json", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Fox Sports Australia guide HTTP ${response.status}`);
  const payload = await response.json();
  const document = normalizeResponse(payload, new Date().toISOString(), sourceUrl);
  document.coverage.daysRequested = days;
  if (!document.coverage.channelsFound || !document.coverage.programmesFound) {
    throw new Error("Fox Sports Australia returned no dated programme rows; refusing to write empty feed");
  }
  return document;
}

async function main() {
  const output = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/review/foxsports_au_unclassified.json");
  const days = Number(process.env.EPG_DAYS || 3);
  const document = await fetchFeed(days);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(document, null, 2) + "\n");
  console.log(`Fox Sports Australia review feed: ${document.coverage.channelsFound} channels, ${document.coverage.programmesFound} programmes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHANNELS = JSON.parse(await readFile(new URL("./channels.json", import.meta.url), "utf8"));
const SOURCE = "sky_uk";
const API = "https://awk.epgsky.com/hawk/linear/schedule";

function iso(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString();
}

function recordId(sid, event) {
  const raw = `${SOURCE}|${sid}|${event.eid ?? ""}|${event.st}|${event.t}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function normalizeResponse(payload, fetchedAt, sourceUrl) {
  if (!payload || !Array.isArray(payload.schedule)) {
    throw new Error("Unexpected Sky response: expected schedule array");
  }
  const byId = new Map(CHANNELS.map(channel => [channel.id, channel]));
  const grouped = new Map();
  for (const schedule of payload.schedule) {
    const sid = String(schedule.sid ?? "");
    const channel = byId.get(sid);
    if (!channel || !Array.isArray(schedule.events)) continue;
    const seen = new Set();
    const programmes = [];
    for (const event of schedule.events) {
      const startSeconds = Number(event.st);
      const durationSeconds = Number(event.d);
      const title = typeof event.t === "string" ? event.t.trim() : "";
      if (!Number.isFinite(startSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !title) continue;
      const start = iso(startSeconds);
      const end = iso(startSeconds + durationSeconds);
      const key = `${event.eid ?? ""}|${start}|${title.toLocaleLowerCase("en-GB")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      programmes.push({
        id: recordId(sid, event),
        title,
        description: typeof event.sy === "string" ? event.sy.trim() : "",
        start,
        end,
        startEpochSeconds: startSeconds,
        endEpochSeconds: startSeconds + durationSeconds,
        source: SOURCE,
        sourceEventId: event.eid == null ? "" : String(event.eid),
        sourceChannelId: sid,
        sourceUrl,
        fetchedAt,
        sourceTimezone: "Europe/London",
        broadcastStatus: event.ippv || event.oppv ? "ppv" : "scheduled",
        isIppv: Boolean(event.ippv),
        isOnDemandPpv: Boolean(event.oppv)
      });
    }
    programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds || a.id.localeCompare(b.id));
    grouped.set(sid, { ...channel, canonicalChannelId: "", programmes });
  }
  const channels = [...grouped.values()];
  const programmesFound = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
  return {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "Sky Sports UK",
    sourceUrl: "https://www.skysports.com/watch/sport-on-sky",
    region: "GB",
    timezone: "UTC",
    generatedAt: fetchedAt,
    coverage: { daysRequested: 1, channelsFound: channels.length, programmesFound, successfulRequests: 1, failedRequests: 0 },
    mapping: {
      canonicalChannelIdsMapped: 0,
      canonicalChannelIdsMissing: channels.length,
      note: "channels[].id is the Sky source service ID; canonicalChannelId awaits reviewed playlist mapping"
    },
    channels
  };
}

export async function fetchDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  const yyyymmdd = date.replaceAll("-", "");
  const sids = CHANNELS.map(channel => channel.id).join(",");
  const sourceUrl = `${API}/${yyyymmdd}/${sids}`;
  const response = await fetch(sourceUrl, { headers: { accept: "application/json", "user-agent": "SpectaEPG/1.0 public schedule ingestion" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Sky schedule HTTP ${response.status}`);
  const payload = await response.json();
  if (String(payload.date) !== yyyymmdd) throw new Error(`Sky returned date ${payload.date}, expected ${yyyymmdd}`);
  return normalizeResponse(payload, new Date().toISOString(), sourceUrl);
}

export async function fetchDays(firstDate, days = 1) {
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("days must be an integer from 1 to 14");
  const byId = new Map();
  let successfulRequests = 0;
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(`${firstDate}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) throw new Error("date must be YYYY-MM-DD");
    day.setUTCDate(day.getUTCDate() + offset);
    const document = await fetchDate(day.toISOString().slice(0, 10));
    successfulRequests++;
    for (const channel of document.channels) {
      const existing = byId.get(channel.id) ?? { ...channel, programmes: [] };
      const ids = new Set(existing.programmes.map(programme => programme.id));
      for (const programme of channel.programmes) {
        if (!ids.has(programme.id)) existing.programmes.push(programme);
      }
      existing.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds || a.id.localeCompare(b.id));
      byId.set(channel.id, existing);
    }
  }
  const channels = [...byId.values()];
  const programmesFound = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "Sky Sports UK",
    sourceUrl: "https://www.skysports.com/watch/sport-on-sky",
    region: "GB",
    timezone: "UTC",
    generatedAt,
    coverage: { daysRequested: days, channelsFound: channels.length, programmesFound, successfulRequests, failedRequests: 0 },
    mapping: { canonicalChannelIdsMapped: 0, canonicalChannelIdsMissing: channels.length, note: "channels[].id is the Sky source service ID; canonicalChannelId awaits reviewed playlist mapping" },
    channels
  };
}

async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const days = Number(process.argv[3] ?? 1);
  const output = process.argv[4] ?? "data/review/sky_uk_unclassified.json";
  const document = await fetchDays(date, days);
  if (!document.coverage.programmesFound) throw new Error("No Sky schedule entries received; existing feed preserved");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ date, channels: document.coverage.channelsFound, programmes: document.coverage.programmesFound, output }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error(`Sky EPG refresh failed: ${error.message}`); process.exitCode = 1; });
}

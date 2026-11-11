import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE = "sporttv_pt";
export const SOURCE_URL = "https://www.sporttv.pt/api/channels/live";
export const TIME_ZONE = "Europe/Lisbon";
const HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent": "Mozilla/5.0 (compatible; SpectaEPG/1.0; public programme guide)",
  "x-client-platform": "web",
  "x-device-platform": "web"
};

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

function zonedLocalToIso(day, clock) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  const target = Date.UTC(year, month - 1, date, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const correction = target - represented;
    if (!correction) break;
    guess += correction;
  }
  return new Date(guess).toISOString();
}

function parseSourceTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return zonedLocalToIso(`${match[1]}-${match[2]}-${match[3]}`, `${match[4]}:${match[5]}`);
}

function programmeId(channelId, item, start, title) {
  return createHash("sha256").update(`${SOURCE}|${channelId}|${item.id ?? ""}|${start}|${title}`).digest("hex").slice(0, 24);
}

export function normalizeSchedule(channel, items, fetchedAt, sourceUrl) {
  const programmes = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const title = String(item?.descricao ?? "").trim();
    const start = parseSourceTime(item?.data);
    const durationMs = Number(item?.duracao);
    if (!title || !start || !Number.isFinite(durationMs) || durationMs <= 0) continue;
    const startMs = Date.parse(start);
    const end = new Date(startMs + durationMs).toISOString();
    const key = `${start}|${title.toLocaleLowerCase("pt-PT")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    programmes.push({
      id: programmeId(String(channel.id), item, start, title),
      title,
      description: [item?.evento?.nome, item?.sinopse].filter(v => typeof v === "string" && v.trim()).join(" — "),
      start,
      end,
      startEpochSeconds: Math.floor(startMs / 1000),
      endEpochSeconds: Math.floor(Date.parse(end) / 1000),
      source: SOURCE,
      sourceEventId: item?.id == null ? "" : String(item.id),
      sourceChannelId: String(channel.id),
      sourceUrl,
      fetchedAt,
      sourceTimezone: TIME_ZONE
    });
  }
  programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds);
  return {
    id: String(channel.id),
    name: String(channel.nome ?? channel.name ?? "").trim(),
    region: "PT",
    canonicalChannelId: "",
    programmes
  };
}

export function buildDocument(channelRows, fetchedAt, daysRequested = 2) {
  const channels = channelRows.filter(c => c.name && c.programmes.length > 0);
  return {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "Sport TV Portugal",
    sourceUrl: SOURCE_URL,
    region: "PT",
    timezone: TIME_ZONE,
    generatedAt: fetchedAt,
    coverage: {
      daysRequested,
      channelsFound: channels.length,
      programmesFound: channels.reduce((sum, c) => sum + c.programmes.length, 0),
      successfulRequests: channelRows.length,
      failedRequests: 0
    },
    mapping: {
      canonicalChannelIdsMapped: 0,
      canonicalChannelIdsMissing: channels.length,
      note: "Official Sport TV source IDs are retained; canonical playlist mapping remains review-only until exact regional channel identity is confirmed."
    },
    channels
  };
}

export async function fetchFeed(days = 2) {
  if (!Number.isInteger(days) || days < 1 || days > 3) throw new Error("days must be an integer from 1 to 3");
  const response = await fetch(SOURCE_URL, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Sport TV channel list HTTP ${response.status}`);
  const rawChannels = await response.json();
  if (!Array.isArray(rawChannels)) throw new Error("Unexpected Sport TV channel list: expected array");
  const channels = rawChannels.filter(c => c && Number(c.id) > 0 && String(c.nome ?? c.name ?? "").trim());
  if (!channels.length) throw new Error("Sport TV returned no identifiable channels");
  const fetchedAt = new Date().toISOString();
  const byChannel = new Map(channels.map(c => [String(c.id), { ...c, id: String(c.id), programmes: [] }]));
  let successfulRequests = 0;
  const firstLocalDate = dateInZone(new Date(), TIME_ZONE);
  for (let offset = 0; offset < days; offset++) {
    const localDate = addDays(firstLocalDate, offset);
    const nextDate = addDays(firstLocalDate, offset + 1);
    const startParam = encodeURIComponent(`${localDate.split("-").reverse().join("/")} 00:00`);
    const endParam = encodeURIComponent(`${nextDate.split("-").reverse().join("/")} 00:00`);
    for (const channel of channels) {
      const url = `https://www.sporttv.pt/api/channels/epg?dataInicio=${startParam}&dataFim=${endParam}&tipoMedia=thumbnail&idCanal=${encodeURIComponent(channel.id)}`;
      const result = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (!result.ok) throw new Error(`Sport TV schedule HTTP ${result.status} for channel ${channel.id}`);
      const items = await result.json();
      if (!Array.isArray(items)) throw new Error(`Unexpected Sport TV schedule for channel ${channel.id}: expected array`);
      const normalized = normalizeSchedule(channel, items, fetchedAt, url);
      byChannel.get(String(channel.id)).programmes.push(...normalized.programmes);
      successfulRequests++;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  const rows = [...byChannel.values()].map(channel => ({
    ...channel,
    programmes: channel.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds)
  }));
  const doc = buildDocument(rows, fetchedAt, days);
  doc.coverage.successfulRequests = successfulRequests + 1;
  return doc;
}

async function main() {
  const output = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/review/sporttv_pt_unclassified.json");
  const days = Number(process.env.EPG_DAYS || 2);
  const document = await fetchFeed(days);
  if (!document.coverage.channelsFound || !document.coverage.programmesFound) {
    throw new Error("Sport TV source returned no dated programmes; refusing to publish an empty feed");
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(document, null, 2) + "\n");
  console.log(`Sport TV review feed: ${document.coverage.channelsFound} channels, ${document.coverage.programmesFound} programmes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE = "alkass_qa";
export const SOURCE_URL = "https://www.alkass.net/tvguide";
export const TIME_ZONE = "Asia/Qatar";
const CHANNELS = [
  { id: "33", name: "Alkass One", canonicalChannelId: "AlkassOne.qa@SD" },
  { id: "34", name: "Alkass Two", canonicalChannelId: "AlkassTwo.qa@SD" },
  { id: "35", name: "Alkass Three", canonicalChannelId: "AlkassThree.qa@SD" },
  { id: "36", name: "Alkass Four", canonicalChannelId: "AlkassFour.qa@SD" },
  { id: "37", name: "Alkass Five", canonicalChannelId: "AlkassFive.qa@SD" },
  { id: "38", name: "Alkass Six", canonicalChannelId: "AlkassSix.qa@SD" },
  { id: "39", name: "Alkass Seven", canonicalChannelId: "AlkassSeven.qa@SD" },
  { id: "40", name: "Alkass Eight", canonicalChannelId: "AlkassEight.qa@SD" }
];

function decode(value = "") {
  return value.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function plain(html) {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")).replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ").trim();
}
function localIso(day, clock) {
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

// Extract likely channel cards from the official server-rendered guide. Fail closed
// if the layout changes instead of publishing an empty or guessed schedule.
export function parseGuide(html, fetchedAt = new Date().toISOString(), day = new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE })) {
  const imgRe = /<img\b[^>]*(?:alt|title)\s*=\s*["']([^"']*)["'][^>]*>/gi;
  const markers = [];
  let m;
  while ((m = imgRe.exec(html))) markers.push({ index: m.index, label: decode(m[1]) });
  const rowRe = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+([^\n\r]{1,240}?)(?=\s+\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}|$)/g;
  const channels = [];
  const seenChannels = new Set();
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = markers[i + 1]?.index ?? html.length;
    const block = plain(html.slice(start, end));
    const rows = [];
    let row;
    rowRe.lastIndex = 0;
    while ((row = rowRe.exec(block))) {
      const title = row[3].trim();
      if (!title || /^schedule not available$/i.test(title)) continue;
      rows.push({ startClock: row[1], endClock: row[2], title });
    }
    if (rows.length < 4) continue;
    const label = markers[i].label;
    const namedIndex = CHANNELS.findIndex(c => label.toLowerCase().includes(c.name.toLowerCase()) || label.toLowerCase().includes(c.name.replace("Alkass ", "").toLowerCase()));
    const channel = CHANNELS[namedIndex >= 0 ? namedIndex : channels.length];
    if (!channel || seenChannels.has(channel.id)) continue;
    seenChannels.add(channel.id);
    const programmes = [];
    const seen = new Set();
    for (const item of rows) {
      const startIso = localIso(day, item.startClock);
      let endDay = day;
      if (item.endClock <= item.startClock) {
        const next = new Date(day + "T12:00:00Z");
        next.setUTCDate(next.getUTCDate() + 1);
        endDay = next.toISOString().slice(0, 10);
      }
      const endIso = localIso(endDay, item.endClock);
      const startEpochSeconds = Math.floor(Date.parse(startIso) / 1000);
      const endEpochSeconds = Math.floor(Date.parse(endIso) / 1000);
      if (!(endEpochSeconds > startEpochSeconds)) continue;
      const key = startEpochSeconds + "|" + item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      programmes.push({
        id: createHash("sha256").update(SOURCE + "|" + channel.id + "|" + key).digest("hex").slice(0, 24),
        title: item.title, description: "", start: startIso, end: endIso,
        startEpochSeconds, endEpochSeconds, source: SOURCE,
        sourceEventId: key, sourceChannelName: channel.name, sourceUrl: SOURCE_URL,
        fetchedAt, sourceTimezone: TIME_ZONE
      });
    }
    if (programmes.length) channels.push({ ...channel, region: "QA", programmes });
  }
  if (!channels.length) throw new Error("No Alkass channel schedules parsed; refusing to publish an empty feed");
  return {
    schemaVersion: 1, provider: SOURCE, providerName: "Alkass Sports Qatar",
    sourceUrl: SOURCE_URL, region: "QA", timezone: "UTC", generatedAt: fetchedAt,
    coverage: { daysRequested: 1, channelsFound: channels.length, programmesFound: channels.reduce((n, c) => n + c.programmes.length, 0), successfulRequests: 1, failedRequests: 0 },
    mapping: { canonicalChannelIdsMapped: channels.length, canonicalChannelIdsMissing: 0, note: "Channel IDs follow the beIN public channel catalogue; review before publishing to a provider playlist." },
    channels
  };
}

export async function fetchGuide() {
  const response = await fetch(SOURCE_URL, { headers: { accept: "text/html", "user-agent": "SpectaEPG/1.0 public schedule ingestion" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Alkass guide HTTP " + response.status);
  return parseGuide(await response.text());
}
async function main() {
  const output = process.argv[2] ?? "data/review/alkass_qa_unclassified.json";
  const document = await fetchGuide();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(document, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ channels: document.coverage.channelsFound, programmes: document.coverage.programmesFound, output }, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error("Alkass EPG refresh failed: " + error.message); process.exitCode = 1; });
}

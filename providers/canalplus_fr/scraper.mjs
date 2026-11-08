import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "canalplus_fr";
const GUIDE_URL = "https://www.canalplus.com/live-tv/programme-tv/";

function decodeJsonString(value) {
  let decoded;
  try { decoded = JSON.parse(`"${value}"`); }
  catch { return ""; }
  return decoded
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function slug(value) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function idFor(channel, contentId, start, title) {
  return createHash("sha256").update(`${SOURCE}|${channel}|${contentId}|${start}|${title}`).digest("hex").slice(0, 24);
}

export function parseGuideHtml(html, fetchedAt, sourceUrl = GUIDE_URL) {
  const pattern = /"altText":"((?:\\.|[^"\\])*)","contentID":"((?:\\.|[^"\\])*)","title":"((?:\\.|[^"\\])*)","subtitle":"((?:\\.|[^"\\])*)","startTime":(\d+),"endTime":(\d+)/g;
  const grouped = new Map();
  const seen = new Set();
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const [altText, contentId, title, subtitle] = match.slice(1, 5).map(decodeJsonString);
    const startMs = Number(match[5]);
    const endMs = Number(match[6]);
    const channelMatch = altText.match(/\bSur\s+(.+?)(?=,\s*\{sticker\}|,\s*Diffus[eé]|$)/i);
    const channelName = channelMatch?.[1]?.trim();
    if (!channelName || !title || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    const channelId = `${SOURCE}:${slug(channelName)}`;
    const startEpochSeconds = Math.floor(startMs / 1000);
    const endEpochSeconds = Math.floor(endMs / 1000);
    const dedupeKey = `${channelId}|${contentId}|${startEpochSeconds}|${title.toLocaleLowerCase("fr-FR")}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const channel = grouped.get(channelId) ?? { id: channelId, name: channelName, region: "FR", canonicalChannelId: "", programmes: [] };
    channel.programmes.push({
      id: idFor(channelId, contentId, startEpochSeconds, title),
      title,
      description: subtitle,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      startEpochSeconds,
      endEpochSeconds,
      source: SOURCE,
      sourceEventId: contentId,
      sourceChannelName: channelName,
      sourceUrl,
      fetchedAt,
      sourceTimezone: "Europe/Paris"
    });
    grouped.set(channelId, channel);
  }
  const channels = [...grouped.values()];
  for (const channel of channels) channel.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds || a.id.localeCompare(b.id));
  const programmesFound = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
  return {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "CANAL+ France",
    sourceUrl: GUIDE_URL,
    region: "FR",
    timezone: "UTC",
    generatedAt: fetchedAt,
    coverage: { daysRequested: 1, channelsFound: channels.length, programmesFound, successfulRequests: 1, failedRequests: 0 },
    mapping: { canonicalChannelIdsMapped: 0, canonicalChannelIdsMissing: channels.length, note: "channels[].id is derived from the official source channel name; canonicalChannelId awaits reviewed playlist mapping" },
    channels
  };
}

export async function fetchGuide() {
  const response = await fetch(GUIDE_URL, {
    headers: { "accept": "text/html", "accept-language": "fr-FR,fr;q=0.9", "user-agent": "SpectaEPG/1.0 public schedule ingestion" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`CANAL+ guide HTTP ${response.status}`);
  const html = await response.text();
  const document = parseGuideHtml(html, new Date().toISOString());
  if (!document.coverage.programmesFound) throw new Error("No programme rows found; existing feed preserved");
  return document;
}

async function main() {
  const output = process.argv[2] ?? "data/review/canalplus_fr_unclassified.json";
  const document = await fetchGuide();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ region: document.region, channels: document.coverage.channelsFound, programmes: document.coverage.programmesFound, output }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error(`CANAL+ EPG refresh failed: ${error.message}`); process.exitCode = 1; });
}

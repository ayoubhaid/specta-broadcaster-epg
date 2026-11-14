import { writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "dazn";
const SOURCE_URL = "https://www.dazn.com/";
const API_BASE = "https://rail-router.discovery.indazn.com/eu/v10/Rail";
const USER_AGENT = "SpectaEPG/1.0 (+https://github.com/ayoubhaid/specta-broadcaster-epg)";
const OUT = process.env.EPG_OUTPUT ?? "data/review/dazn_unclassified.json";

const LANGUAGES = { DE: "de", GB: "en", US: "en", IT: "it", ES: "es", FR: "fr", PT: "pt" };
const COUNTRIES = (process.env.DAZN_COUNTRIES ?? Object.keys(LANGUAGES).join(","))
  .split(",")
  .map(value => value.trim().toUpperCase())
  .filter(value => value && LANGUAGES[value]);
const DELAY_MS = Number.parseInt(process.env.REQUEST_DELAY_MS ?? "200", 10);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recordId(channelId, start, end, title) {
  return createHash("sha256")
    .update(`${SOURCE}|${channelId}|${start}|${end}|${title.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

function railUrl(country) {
  const params = new URLSearchParams({
    platform: "web",
    id: "Livetvschedule",
    country,
    brand: "dazn",
    languageCode: LANGUAGES[country] ?? "en",
  });
  return `${API_BASE}?${params.toString()}`;
}

export function normalizeRail(payload, country) {
  const tiles = Array.isArray(payload?.Tiles) ? payload.Tiles : [];
  const channels = [];
  for (const tile of tiles) {
    const schedule = tile?.LinearSchedule;
    if (!tile?.AssetId || !schedule) continue;
    const channelId = `${country}:${tile.AssetId}`;
    const channelName = clean(tile.Title);
    if (!channelName) continue;

    const items = [schedule.Now, schedule.Next, ...(Array.isArray(schedule.Later) ? schedule.Later : [])].filter(Boolean);
    const seen = new Set();
    const programmes = [];
    for (const item of items) {
      const start = Date.parse(item.Start);
      const end = Date.parse(item.End);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const base = clean(item.Title);
      if (!base) continue;
      const episode = clean(item.EpisodeTitle);
      const title = episode && !base.toLowerCase().includes(episode.toLowerCase())
        ? `${base} - ${episode}`
        : base;
      const startEpoch = Math.floor(start / 1000);
      const endEpoch = Math.floor(end / 1000);
      const key = `${startEpoch}|${endEpoch}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      programmes.push({
        id: recordId(channelId, startEpoch, endEpoch, title),
        title,
        description: clean(item.Description),
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        startEpochSeconds: startEpoch,
        endEpochSeconds: endEpoch,
        source: SOURCE,
        sourceChannelId: channelId,
        sourceTimezone: "UTC",
      });
    }
    if (!programmes.length) continue;
    programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds || a.id.localeCompare(b.id));
    channels.push({
      id: channelId,
      name: channelName,
      region: country,
      canonicalChannelId: "",
      programmes,
    });
  }
  return channels;
}

async function fetchRail(country) {
  const response = await fetch(railUrl(country), {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
      referer: "https://www.dazn.com/",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`DAZN ${country} HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const channels = [];
  let successful = 0;
  let failed = 0;
  for (const [index, country] of COUNTRIES.entries()) {
    try {
      const payload = await fetchRail(country);
      channels.push(...normalizeRail(payload, country));
      successful++;
    } catch (error) {
      failed++;
      console.error(`Warning: DAZN ${country}: ${error.message}`);
    }
    if (DELAY_MS > 0 && index + 1 < COUNTRIES.length) await sleep(DELAY_MS);
  }

  const programmes = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
  if (!programmes) throw new Error("No DAZN programmes found; existing output preserved");

  const document = {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "DAZN",
    sourceUrl: SOURCE_URL,
    region: "multi-region",
    timezone: "UTC",
    generatedAt: new Date().toISOString(),
    coverage: {
      daysRequested: 3,
      channelsFound: channels.length,
      programmesFound: programmes,
      successfulRequests: successful,
      failedRequests: failed,
    },
    channels,
  };

  const destination = path.resolve(OUT);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
  console.log(`Wrote ${programmes} DAZN programmes across ${channels.length} channels to ${destination}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error(`DAZN EPG refresh failed: ${error.message}`);
    process.exitCode = 1;
  });
}

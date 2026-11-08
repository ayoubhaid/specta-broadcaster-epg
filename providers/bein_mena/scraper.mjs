import { writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://www.beinsports.com/api/opta";
const REGION = process.env.BEIN_REGION ?? "en-mena";
const DAYS = clampInt(process.env.EPG_DAYS, 5, 1, 14);
const DELAY_MS = clampInt(process.env.REQUEST_DELAY_MS, 300, 100, 5000);
const OUT = process.env.EPG_OUTPUT ?? "docs/bein-epg.json";
const USER_AGENT =
  "SpectaEPG/1.0 (public TV guide ingestion; contact: project maintainer)";

function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": USER_AGENT
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeProgramme(row, channel) {
  const start = validDate(row.startDate);
  const end = validDate(row.endDate);
  const title = typeof row.title === "string" ? row.title.trim() : "";

  if (!start || !end || Date.parse(end) <= Date.parse(start) || !title) {
    return null;
  }

  return {
    id: `${channel.id}:${Date.parse(start)}:${title.toLowerCase()}`,
    title,
    description: typeof row.description === "string" ? row.description.trim() : "",
    start,
    end,
    startEpochSeconds: Math.floor(Date.parse(start) / 1000),
    endEpochSeconds: Math.floor(Date.parse(end) / 1000),
    source: "bein_mena"
  };
}

async function fetchChannels() {
  const url = `${API_BASE}/tv-channel?region=${encodeURIComponent(REGION)}`;
  const payload = await getJson(url);
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error("Unexpected channel response: expected a rows array");
  }

  return payload.rows
    .filter(row => row && row.id && row.name)
    .map(row => ({
      id: String(row.id),
      name: String(row.name).trim(),
      region: REGION,
      programmes: []
    }));
}

function dayWindow(dayOffset) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + dayOffset);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  // The source endpoint accepts ISO-like UTC values without the trailing Z
  // in the timestamp, followed by a literal Z (matching iptv-org/epg).
  const format = date => date.toISOString().replace("Z", "");
  return { start, end, startParam: `${format(start)}Z`, endParam: `${format(end)}Z` };
}

async function fetchChannelDay(channel, dayOffset) {
  const { startParam, endParam } = dayWindow(dayOffset);
  const query = new URLSearchParams({
    startBefore: endParam,
    endAfter: startParam,
    channelIds: channel.id
  });
  const payload = await getJson(`${API_BASE}/tv-event?${query.toString()}`);
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error(`Unexpected programme response for channel ${channel.name}`);
  }
  return payload.rows
    .map(row => normalizeProgramme(row, channel))
    .filter(Boolean);
}

async function main() {
  console.log(`Loading beIN channels for region ${REGION}…`);
  const channels = await fetchChannels();
  if (!channels.length) throw new Error("No channels returned; refusing to write empty feed.");

  let successfulRequests = 0;
  let failedRequests = 0;

  // Sequential requests with a delay are deliberate: avoid hammering the public source.
  for (const channel of channels) {
    for (let day = 0; day < DAYS; day++) {
      try {
        const programmes = await fetchChannelDay(channel, day);
        channel.programmes.push(...programmes);
        successfulRequests++;
      } catch (error) {
        failedRequests++;
        console.error(`Warning: ${channel.name}, day +${day}: ${error.message}`);
      }
      await sleep(DELAY_MS);
    }

    const seen = new Set();
    channel.programmes = channel.programmes
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .filter(programme => {
        const key = `${programme.start}|${programme.end}|${programme.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const programmeCount = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
  if (!programmeCount || !successfulRequests) {
    throw new Error("No programme data was collected; existing output has been preserved.");
  }

  const output = {
    schemaVersion: 1,
    provider: "bein_mena",
    providerName: "beIN SPORTS MENA",
    sourceUrl: "https://www.beinsports.com/en-mena/tv-guide",
    apiBase: API_BASE,
    region: REGION,
    timezone: "UTC",
    generatedAt: new Date().toISOString(),
    coverage: {
      daysRequested: DAYS,
      channelsFound: channels.length,
      programmesFound: programmeCount,
      successfulRequests,
      failedRequests
    },
    channels
  };

  const destination = path.resolve(OUT);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, destination);

  console.log(`Wrote ${programmeCount} programmes across ${channels.length} channels to ${destination}`);
  console.log(`Requests: ${successfulRequests} succeeded, ${failedRequests} failed.`);
  if (failedRequests > 0) {
    console.warn("Feed was written with partial coverage. Check logs before publishing.");
  }
}

main().catch(error => {
  console.error(`EPG generation failed: ${error.message}`);
  process.exitCode = 1;
});

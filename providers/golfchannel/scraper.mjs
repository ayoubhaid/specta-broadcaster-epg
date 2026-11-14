import { writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "golfchannel";
const SOURCE_URL = "https://www.golfchannel.com/watch/on-air-schedule";
const USER_AGENT = "SpectaEPG/1.0 (+https://github.com/ayoubhaid/specta-broadcaster-epg)";
const OUT = process.env.EPG_OUTPUT ?? "data/review/golfchannel_us_unclassified.json";

const DAY = /<div class="WatchScheduleModule-items-item" data-day="(\d{4}-\d{2}-\d{2})">/g;
const TIME_TEXT = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(EST|EDT)?/i;
const TITLE_BLOCK = /<div class="WatchScheduleItem-title">([\s\S]*?)<\/div>/i;
const CHANNEL = /<div class="WatchScheduleItem-channel">([\s\S]*?)<\/div>/i;
const CATEGORY = /<div class="WatchScheduleItem-category">([\s\S]*?)<\/div>/i;

function clean(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseTime(text) {
  const match = TIME_TEXT.exec(clean(text));
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] ?? "").toUpperCase();
  const suffix = (match[4] ?? "").toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, suffix };
}

function zoneOffsetMs(utcMs, timeZone) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = format.formatToParts(new Date(utcMs));
  const get = type => Number(parts.find(part => part.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") === 24 ? 0 : get("hour"), get("minute"));
  return wall - utcMs;
}

export function toUtcEpoch(day, time) {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date, time.hour, time.minute);
  const fixed = time.suffix === "EST" ? -5 : time.suffix === "EDT" ? -4 : null;
  const utcMs = fixed == null
    ? guess - zoneOffsetMs(guess, "America/New_York")
    : guess - fixed * 3600 * 1000;
  return Math.floor(utcMs / 1000);
}

function stableId(start, end, title) {
  return createHash("sha256")
    .update(`${SOURCE}|${start}|${end}|${title.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

export function parseSchedule(html) {
  const days = [...html.matchAll(DAY)];
  const programmes = [];
  for (let index = 0; index < days.length; index++) {
    const day = days[index][1];
    const end = index + 1 < days.length ? days[index + 1].index : html.length;
    const content = html.slice(days[index].index, end);
    for (const chunk of content.split('<div class="WatchScheduleItem">').slice(1)) {
      const timeMatch = chunk.match(/<div class="WatchScheduleItem-time"[^>]*>/i);
      if (!timeMatch || /data-live/i.test(timeMatch[0])) continue;
      const time = parseTime(chunk);
      if (!time) continue;
      const channel = clean(CHANNEL.exec(chunk)?.[1] ?? "");
      if (channel && !/^golf channel$/i.test(channel)) continue;
      const title = clean(TITLE_BLOCK.exec(chunk)?.[1] ?? "");
      if (!title) continue;
      const category = clean(CATEGORY.exec(chunk)?.[1] ?? "");
      const start = toUtcEpoch(day, time);
      programmes.push({ title, description: category, start, day });
    }
  }

  programmes.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  return programmes.map((programme, index) => {
    const next = programmes[index + 1]?.start;
    const stop = next && next > programme.start && next - programme.start <= 6 * 3600
      ? next
      : programme.start + 3600;
    return {
      id: stableId(programme.start, stop, programme.title),
      title: programme.title,
      description: programme.description,
      start: new Date(programme.start * 1000).toISOString(),
      end: new Date(stop * 1000).toISOString(),
      startEpochSeconds: programme.start,
      endEpochSeconds: stop,
      source: SOURCE,
      sourceChannelId: "golfchannel",
      sourceUrl: SOURCE_URL,
      sourceTimezone: "America/New_York",
    };
  });
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Golf Channel HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const html = await fetchPage(SOURCE_URL);
  const programmes = parseSchedule(html);
  if (!programmes.length) throw new Error("No Golf Channel programmes found; existing output preserved");

  const document = {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "Golf Channel US",
    sourceUrl: SOURCE_URL,
    region: "US",
    timezone: "America/New_York",
    generatedAt: new Date().toISOString(),
    coverage: {
      daysRequested: 2,
      channelsFound: 1,
      programmesFound: programmes.length,
      successfulRequests: 1,
      failedRequests: 0,
    },
    channels: [{
      id: "golfchannel",
      name: "Golf Channel",
      region: "US",
      canonicalChannelId: "",
      programmes,
    }],
  };

  const destination = path.resolve(OUT);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
  console.log(`Wrote ${programmes.length} Golf Channel programmes to ${destination}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error(`Golf Channel EPG refresh failed: ${error.message}`);
    process.exitCode = 1;
  });
}

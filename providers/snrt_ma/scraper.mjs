import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const SOURCE = "snrt_ma";
export const SOURCE_URL = "https://www.snrt.ma/ar/node/";
export const TIME_ZONE = "Africa/Casablanca";
export const DEFAULT_DAYS = 2;

// Site node IDs and XMLTV identities are taken from the public iptv-org/epg
// SNRT channel list. Radio services are intentionally excluded from this TV feed.
export const CHANNELS = [
  { id: "1208", name: "Al Aoula", canonicalChannelId: "AlAoula.ma@SD" },
  { id: "4069", name: "Laayoune TV", canonicalChannelId: "LaayouneTV.ma@SD" },
  { id: "4070", name: "Arryadia", canonicalChannelId: "Arryadia.ma@HD" },
  { id: "4071", name: "Athaqafia", canonicalChannelId: "Athaqafia.ma@SD" },
  { id: "4072", name: "Al Maghribia", canonicalChannelId: "AlMaghribia.ma@SD" },
  { id: "4073", name: "Assadissa", canonicalChannelId: "Assadissa.ma@SD" },
  { id: "4075", name: "Tamazight", canonicalChannelId: "TamazightTV.ma@SD" }
];

const USER_AGENT = "SpectaEPG/1.0 (public broadcaster schedule ingestion)";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function decodeEntities(value = "") {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function textContent(html = "") {
  return decodeEntities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ").trim();
}

function firstClassText(block, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp('<(?:div|h[1-6]|span|p)[^>]*class="[^"]*\\b' + escaped + '\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:div|h[1-6]|span|p)>', "i");
  return textContent(block.match(re)?.[1] ?? "");
}

function parseClock(value) {
  const match = value.trim().match(/^(\d{1,2})\s*[Hh:]\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// Convert a wall-clock time in Africa/Casablanca to an actual UTC instant without
// third-party dependencies. The iteration also handles Morocco's DST offset changes.
export function localTimeToIso(dateKey, clockText) {
  const clock = parseClock(clockText);
  if (!/^\d{8}$/.test(dateKey) || !clock) return null;
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const target = Date.UTC(year, month - 1, day, clock.hour, clock.minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
      .filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1,
      Number(parts.day), Number(parts.hour), Number(parts.minute));
    const correction = target - represented;
    if (!correction) break;
    guess += correction;
  }
  return new Date(guess).toISOString();
}

function parseRows(html) {
  const starts = [];
  const re = /<div\b[^>]*class=["'][^"']*\bgrille-line\b[^"']*["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) starts.push({ index: match.index, tag: match[0] });
  const rows = [];
  for (let i = 0; i < starts.length; i++) {
    const begin = starts[i].index;
    const end = starts[i + 1]?.index ?? html.length;
    const block = html.slice(begin, end);
    const dateMatch = starts[i].tag.match(/\b(20\d{6})\b/);
    if (!dateMatch) continue;
    const clockText = firstClassText(block, "grille-time");
    const title = firstClassText(block, "program-title-sm");
    if (!title) continue;
    const start = localTimeToIso(dateMatch[1], clockText);
    if (!start) continue;
    rows.push({
      dateKey: dateMatch[1],
      title,
      description: firstClassText(block, "program-description-sm"),
      category: firstClassText(block, "genre-first"),
      start
    });
  }
  return rows;
}

export function parseScheduleHtml(html, channel, fetchedAt = new Date().toISOString(), sourceUrl = SOURCE_URL + channel.id) {
  const rows = parseRows(html).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title));
  if (!rows.length) throw new Error(`No SNRT programme rows parsed for ${channel.name}; refusing empty feed`);
  const programmes = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const startMs = Date.parse(row.start);
    const next = rows[i + 1];
    let endMs;
    if (next && Date.parse(next.start) > startMs) {
      endMs = Date.parse(next.start);
    } else {
      const date = new Date(startMs);
      const localParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
      const localDate = `${localParts.year}${localParts.month}${localParts.day}`;
      const nextDate = new Date(Date.UTC(Number(localDate.slice(0,4)), Number(localDate.slice(4,6))-1, Number(localDate.slice(6,8))+1));
      const nextKey = `${nextDate.getUTCFullYear()}${String(nextDate.getUTCMonth()+1).padStart(2,"0")}${String(nextDate.getUTCDate()).padStart(2,"0")}`;
      endMs = Date.parse(localTimeToIso(nextKey, "00H00"));
    }
    if (!Number.isFinite(endMs) || endMs <= startMs) continue;
    const key = `${startMs}|${row.title.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    programmes.push({
      id: `${channel.id}:${startMs}:${row.title.toLocaleLowerCase().replace(/\s+/g, "-").slice(0,80)}`,
      title: row.title,
      description: row.description,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      startEpochSeconds: Math.floor(startMs / 1000),
      endEpochSeconds: Math.floor(endMs / 1000),
      source: SOURCE,
      sourceEventId: `${channel.id}:${row.dateKey}:${startMs}`,
      sourceChannelName: channel.name,
      sourceUrl,
      fetchedAt,
      sourceTimezone: TIME_ZONE,
      ...(row.category ? { category: row.category } : {})
    });
  }
  return {
    id: channel.id,
    name: channel.name,
    region: "MA",
    canonicalChannelId: channel.canonicalChannelId,
    programmes
  };
}

async function fetchChannel(channel) {
  const url = SOURCE_URL + channel.id;
  const response = await fetch(url, {
    headers: { accept: "text/html", "accept-language": "ar,fr;q=0.8", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`SNRT HTTP ${response.status} for ${channel.name}`);
  const html = await response.text();
  return parseScheduleHtml(html, channel, new Date().toISOString(), url);
}

async function main() {
  const output = path.resolve(process.env.EPG_OUTPUT ?? "data/source-feeds/snrt_ma.json");
  const delay = Math.max(100, Math.min(5000, Number(process.env.REQUEST_DELAY_MS ?? 350)));
  const fetchedAt = new Date().toISOString();
  const channels = [];
  const errors = [];
  for (const channel of CHANNELS) {
    try {
      const parsed = await fetchChannel(channel);
      channels.push(parsed);
      console.log(`${channel.name}: ${parsed.programmes.length} programmes`);
    } catch (error) {
      errors.push(`${channel.name}: ${error.message}`);
      console.error(errors.at(-1));
    }
    await sleep(delay);
  }
  const programmesFound = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
  if (channels.length !== CHANNELS.length || !programmesFound) {
    throw new Error(`SNRT refresh incomplete (${channels.length}/${CHANNELS.length} channels, ${programmesFound} programmes). Existing feed preserved. ${errors.join("; ")}`);
  }
  const feed = {
    schemaVersion: 1,
    provider: SOURCE,
    providerName: "SNRT Morocco",
    sourceUrl: "https://www.snrt.ma/ar/node/1208",
    region: "MA",
    timezone: TIME_ZONE,
    generatedAt: fetchedAt,
    coverage: {
      daysRequested: DEFAULT_DAYS,
      channelsFound: channels.length,
      programmesFound,
      successfulRequests: channels.length,
      failedRequests: 0
    },
    channels
  };
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = output + ".tmp";
  await writeFile(temporary, JSON.stringify(feed, null, 2) + "\n", "utf8");
  await rename(temporary, output);
  console.log(`Wrote ${programmesFound} programmes across ${channels.length} SNRT channels to ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error(`SNRT EPG refresh failed: ${error.message}`); process.exitCode = 1; });
}

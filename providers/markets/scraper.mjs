import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://iptv-org.github.io/epg/guides";
const RESTRICTED_CHANNEL = /\b(adult|xxx|porn|playboy|hustler|erotic|casino|gambling|sportsbook|betting|poker|lottery)\b/i;
const RESTRICTED_CATEGORY = /\b(adult|xxx|porn|erotic|casino|gambling|sportsbook|betting|poker|lottery)\b/i;

export const SOURCES = {
  uk_ontvtonight: { market: "uk", site: "ontvtonight.com", name: "On TV Tonight UK", region: "GB", suffixes: [".uk", ".gb"] },
  ie_ontvtonight: { market: "ie", site: "ontvtonight.com", name: "On TV Tonight Ireland", region: "IE", suffixes: [".ie"] },
  au_ontvtonight: { market: "au", site: "ontvtonight.com", name: "On TV Tonight Australia", region: "AU", suffixes: [".au"] },
  ca_tvtv: { market: "ca", site: "tvtv.us", name: "TVTV Canada", region: "CA", suffixes: [".ca"] },
  za_dstv: { market: "za", site: "dstv.com", name: "DStv South Africa", region: "ZA", suffixes: [".za"] },
  ng_dstv: { market: "ng", site: "dstv.com", name: "DStv Nigeria", region: "NG", suffixes: [".ng"] },
  gh_dstv: { market: "gh", site: "dstv.com", name: "DStv Ghana", region: "GH", suffixes: [".gh"] },
  ke_dstv: { market: "ke", site: "dstv.com", name: "DStv Kenya", region: "KE", suffixes: [".ke"] },
  ug_dstv: { market: "ug", site: "dstv.com", name: "DStv Uganda", region: "UG", suffixes: [".ug"] },
  zm_dstv: { market: "zm", site: "dstv.com", name: "DStv Zambia", region: "ZM", suffixes: [".zm"] },
  zw_dstv: { market: "zw", site: "dstv.com", name: "DStv Zimbabwe", region: "ZW", suffixes: [".zw"] },
  bw_dstv: { market: "bw", site: "dstv.com", name: "DStv Botswana", region: "BW", suffixes: [".bw"] },
  na_dstv: { market: "na", site: "dstv.com", name: "DStv Namibia", region: "NA", suffixes: [".na"] }
};

function decodeXml(value = "") {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity) => {
    const key = entity.toLowerCase();
    if (key === "amp") return "&";
    if (key === "lt") return "<";
    if (key === "gt") return ">";
    if (key === "quot") return '"';
    if (key === "apos") return "'";
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return all;
  }).replace(/<[^>]*>/g, "").trim();
}

function attribute(tag, name) {
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if (match[1].toLowerCase() === name.toLowerCase()) return decodeXml(match[2] ?? match[3] ?? "");
  }
  return "";
}

function textTag(block, name) {
  const match = block.match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decodeXml(match[1]) : "";
}

export function parseXmltvTimestamp(value) {
  const match = String(value || "").trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, sign, offsetHour = "00", offsetMinute = "00"] = match;
  const local = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const offset = (+offsetHour * 60 + +offsetMinute) * (sign === "-" ? -1 : 1);
  return Math.floor((local - offset * 60000) / 1000);
}

function stableId(provider, channel, start, title) {
  return createHash("sha256").update([provider, channel, start, title].join("|")).digest("hex").slice(0, 24);
}

export function sourceUrl(sourceId) {
  const source = SOURCES[sourceId];
  if (!source) throw new Error("Unsupported market source: " + sourceId);
  return `${BASE}/${source.market}/${source.site}.epg.xml`;
}

export function parseXmltv(xml, { sourceId, fetchedAt, days = 5 } = {}) {
  const source = SOURCES[sourceId];
  if (!source) throw new Error("Unsupported market source: " + sourceId);
  if (typeof xml !== "string" || !/<tv\b/i.test(xml)) throw new Error("Invalid XMLTV document");

  const channels = new Map();
  for (const match of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) {
    const id = attribute(match[1], "id");
    if (!id || !source.suffixes.some(suffix => id.toLowerCase().endsWith(suffix))) continue;
    const names = [...match[2].matchAll(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi)]
      .map(item => decodeXml(item[1])).filter(Boolean);
    const name = names[0] || id;
    if (RESTRICTED_CHANNEL.test(name)) continue;
    channels.set(id, {
      id,
      name,
      region: source.region,
      canonicalChannelId: id,
      programmes: []
    });
  }

  const now = Math.floor(Date.now() / 1000);
  for (const match of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const channelId = attribute(match[1], "channel");
    const channel = channels.get(channelId);
    if (!channel) continue;
    const start = parseXmltvTimestamp(attribute(match[1], "start"));
    const end = parseXmltvTimestamp(attribute(match[1], "stop"));
    const title = textTag(match[2], "title");
    const category = textTag(match[2], "category");
    if (!start || !end || end <= start || !title || RESTRICTED_CATEGORY.test(category) || start < now - 43200 || start > now + days * 86400) continue;

    channel.programmes.push({
      id: stableId(sourceId, channelId, start, title),
      title,
      description: textTag(match[2], "desc"),
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      startEpochSeconds: start,
      endEpochSeconds: end,
      source: sourceId,
      sourceChannelId: channelId,
      sourceUrl: sourceUrl(sourceId),
      fetchedAt,
      sourceTimezone: "XMLTV-offset"
    });
  }

  const result = [...channels.values()]
    .map(channel => ({
      ...channel,
      programmes: channel.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds)
    }))
    .filter(channel => channel.programmes.length)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion: 1,
    provider: "market_" + sourceId,
    providerName: source.name,
    sourcePriority: 3,
    sourceUrl: sourceUrl(sourceId),
    region: source.region,
    timezone: "XMLTV-offset",
    generatedAt: fetchedAt,
    coverage: {
      daysRequested: days,
      channelsFound: result.length,
      programmesFound: result.reduce((sum, channel) => sum + channel.programmes.length, 0),
      successfulRequests: 1,
      failedRequests: 0,
      market: source.market
    },
    mapping: {
      canonicalChannelIdsMapped: result.length,
      canonicalChannelIdsMissing: 0,
      note: "Exact upstream iptv-org XMLTV channel IDs are retained only when their country suffix matches this market."
    },
    channels: result
  };
}

async function fetchSource(sourceId, days) {
  const url = sourceUrl(sourceId);
  const response = await fetch(url, {
    headers: { accept: "application/xml,text/xml;q=0.9", "user-agent": "SpectaEPG/1.0 (market guide import)" },
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) throw new Error(`${sourceId}: HTTP ${response.status}`);
  const xml = await response.text();
  if (xml.length < 100 || !/<tv\b/i.test(xml)) throw new Error(`${sourceId}: invalid XMLTV response`);
  const fetchedAt = new Date().toISOString();
  const feed = parseXmltv(xml, { sourceId, fetchedAt, days });
  if (!feed.channels.length || !feed.coverage.programmesFound) {
    throw new Error(`${sourceId}: no matching channels with dated programmes; previous output preserved`);
  }
  return feed;
}

export async function scrape({ sources = "all", days = 5, outputDir = "data/review" } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("days must be 1..14");
  const selected = sources === "all" ? Object.keys(SOURCES) : sources.split(",").map(value => value.trim()).filter(Boolean);
  if (!selected.length || selected.some(sourceId => !SOURCES[sourceId])) {
    throw new Error("Unknown market source. Available: " + Object.keys(SOURCES).join(", "));
  }

  const outputs = [];
  const errors = [];
  await mkdir(outputDir, { recursive: true });

  for (const sourceId of selected) {
    try {
      const feed = await fetchSource(sourceId, days);
      const output = path.join(outputDir, "market_" + sourceId + "_unclassified.json");
      await writeFile(output, JSON.stringify(feed, null, 2) + "\n", "utf8");
      outputs.push({
        source: sourceId,
        output,
        channels: feed.coverage.channelsFound,
        programmes: feed.coverage.programmesFound
      });
    } catch (error) {
      errors.push({ source: sourceId, error: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return { outputs, errors };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }));
  const result = await scrape({
    sources: args.sources || "all",
    days: Number(args.days || 5),
    outputDir: args.output || "data/review"
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.outputs.length) throw new Error("No market EPG source returned usable programme data.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error("Market EPG scrape failed: " + error.message);
    process.exitCode = 1;
  });
}

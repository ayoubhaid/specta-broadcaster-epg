import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://iptv-org.github.io/epg/guides";
const STATES = "al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(" ");
export const SOURCES = {
  "tvtv.us": { name: "TVTV US", stateMarkets: true },
  "tvguide.com": { name: "TV Guide US" },
  "gatotv.com": { name: "Gato TV US" },
  "ontvtonight.com": { name: "On TV Tonight US" },
  "directv.com": { name: "DIRECTV US" }
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
  const m = String(value || "").trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, sign, oh = "00", om = "00"] = m;
  const local = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const offset = (+oh * 60 + +om) * (sign === "-" ? -1 : 1);
  return Math.floor((local - offset * 60000) / 1000);
}
function stableId(source, channel, start, title) {
  return createHash("sha256").update([source, channel, start, title].join("|")).digest("hex").slice(0, 24);
}
export function sourceUrl(source, market = "us") {
  if (!SOURCES[source]) throw new Error("Unsupported US source: " + source);
  return BASE + "/" + market + "/" + source + ".epg.xml";
}
export function parseXmltv(xml, options) {
  const { source, sourceUrl: url, fetchedAt, market = "us", days = 5 } = options;
  if (typeof xml !== "string" || !/<tv\b/i.test(xml)) throw new Error("Invalid XMLTV document");
  const channels = new Map();
  for (const m of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) {
    const id = attribute(m[1], "id");
    if (!id || !/\.us$/i.test(id)) continue;
    const names = [...m[2].matchAll(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi)].map(x => decodeXml(x[1])).filter(Boolean);
    channels.set(id, { id, name: names[0] || id, region: market.toUpperCase(), canonicalChannelId: id, programmes: [] });
  }
  const now = Math.floor(Date.now() / 1000);
  for (const m of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const channelId = attribute(m[1], "channel");
    const channel = channels.get(channelId);
    if (!channel) continue;
    const start = parseXmltvTimestamp(attribute(m[1], "start"));
    const end = parseXmltvTimestamp(attribute(m[1], "stop"));
    const title = textTag(m[2], "title");
    if (!start || !end || end <= start || !title || start < now - 43200 || start > now + days * 86400) continue;
    channel.programmes.push({
      id: stableId(source, channelId, start, title), title, description: textTag(m[2], "desc"),
      start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString(),
      startEpochSeconds: start, endEpochSeconds: end, source, sourceChannelId: channelId,
      sourceUrl: url, fetchedAt, sourceTimezone: "XMLTV-offset"
    });
  }
  const result = [...channels.values()].map(c => ({
    ...c, programmes: c.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds)
  })).filter(c => c.programmes.length).sort((a, b) => a.name.localeCompare(b.name));
  return {
    schemaVersion: 1, provider: "usa_" + source.replace(/[^a-z0-9]+/gi, "_"),
    providerName: SOURCES[source].name, sourceUrl: url, region: "US", timezone: "UTC",
    generatedAt: fetchedAt,
    coverage: { daysRequested: days, channelsFound: result.length,
      programmesFound: result.reduce((n, c) => n + c.programmes.length, 0), successfulRequests: 1, failedRequests: 0, market },
    mapping: { canonicalChannelIdsMapped: result.length, canonicalChannelIdsMissing: 0,
      note: "Only upstream XMLTV IDs ending in .us are retained; IDs are preserved exactly." },
    channels: result
  };
}
async function fetchMarket(source, market, days) {
  const url = sourceUrl(source, market);
  const response = await fetch(url, {
    headers: { accept: "application/xml,text/xml;q=0.9", "user-agent": "SpectaEPG/1.0" },
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) throw new Error(source + " " + market + ": HTTP " + response.status);
  const xml = await response.text();
  if (xml.length < 100 || !/<tv\b/i.test(xml)) throw new Error(source + " " + market + ": invalid XMLTV response");
  return parseXmltv(xml, { source, sourceUrl: url, fetchedAt: new Date().toISOString(), market, days });
}
export async function scrape({ source = "all", markets = "us", days = 5, outputDir = "data/review" } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("days must be 1..14");
  const selected = source === "all" ? Object.keys(SOURCES) : [source];
  selected.forEach(key => { if (!SOURCES[key]) throw new Error("Unknown source: " + key); });
  const marketList = markets === "all" ? ["us", ...STATES.map(s => "us-" + s)] : markets.split(",").map(x => x.trim()).filter(Boolean);
  if (marketList.some(m => !/^us(?:-[a-z]{2})?$/.test(m))) throw new Error("Markets must be us or us-<state>");

  const outputs = [];
  const errors = [];
  for (const key of selected) {
    try {
      const list = SOURCES[key].stateMarkets ? marketList : ["us"];
      const grouped = new Map();
      let successfulRequests = 0, failedRequests = 0;
      const sourceErrors = [];
      for (const market of list) {
        try {
          const feed = await fetchMarket(key, market, days);
          successfulRequests++;
          for (const channel of feed.channels) {
            const current = grouped.get(channel.id) || { ...channel, programmes: [] };
            const seen = new Set(current.programmes.map(p => p.id));
            for (const programme of channel.programmes) if (!seen.has(programme.id)) current.programmes.push(programme);
            current.programmes.sort((a, b) => a.startEpochSeconds - b.startEpochSeconds);
            grouped.set(channel.id, current);
          }
        } catch (error) {
          failedRequests++;
          sourceErrors.push({ market, error: error.message });
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const channels = [...grouped.values()];
      const programmesFound = channels.reduce((sum, channel) => sum + channel.programmes.length, 0);
      if (!successfulRequests || !programmesFound) {
        errors.push({ source: key, errors: sourceErrors, message: "No usable programme data; previous output preserved." });
        continue;
      }

      const document = {
        schemaVersion: 1,
        provider: "usa_" + key.replace(/[^a-z0-9]+/gi, "_"),
        providerName: SOURCES[key].name,
        sourcePriority: 3,
        sourceUrl: sourceUrl(key),
        region: "US",
        timezone: "UTC",
        generatedAt: new Date().toISOString(),
        coverage: {
          daysRequested: days,
          channelsFound: channels.length,
          programmesFound,
          successfulRequests,
          failedRequests,
          markets: list
        },
        mapping: {
          canonicalChannelIdsMapped: channels.length,
          canonicalChannelIdsMissing: 0,
          note: "Only upstream XMLTV IDs ending in .us are retained; IDs are preserved exactly."
        },
        channels: channels.sort((a, b) => a.name.localeCompare(b.name))
      };
      await mkdir(outputDir, { recursive: true });
      const output = path.join(outputDir, "usa_" + key.replace(/[^a-z0-9]+/gi, "_") + "_unclassified.json");
      await writeFile(output, JSON.stringify(document, null, 2) + "\n", "utf8");
      outputs.push({ source: key, output, channels: channels.length, programmes: programmesFound, successfulRequests, failedRequests });
    } catch (error) {
      errors.push({ source: key, message: error.message });
    }
  }
  return { outputs, errors };
}
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const pair = arg.replace(/^--/, "").split("=");
    return [pair.shift(), pair.join("=")];
  }));
  const result = await scrape({ source: args.source || "all", markets: args.markets || "us",
    days: Number(args.days || 5), outputDir: args.output || "data/review" });
  console.log(JSON.stringify(result, null, 2));
  if (!result.outputs.length) throw new Error("No US EPG source returned usable programme data.");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error("US EPG scrape failed: " + error.message); process.exitCode = 1; });
}

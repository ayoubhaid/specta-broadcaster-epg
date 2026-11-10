import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_URL = "https://www.dubaisports.ae/content/dubaisports/home/_jcr_content/channel-programs.home-live-schedule.html";
const CHANNELS = new Map([
  ["دبي الرياضية 1", "Dubai Sports 1"],
  ["دبي الرياضية 2", "Dubai Sports 2"],
  ["دبي الرياضية 3", "Dubai Sports 3"],
]);

function decode(s = "") {
  return s.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function textOf(s) {
  return decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/[\u200e\u200f\u202a-\u202e]/g, " "))
    .replace(/\s+/g, " ").trim();
}

/**
 * This endpoint currently exposes only a small "today/next" card list and
 * local-clock observations, not programme start/end intervals. Keep this as
 * an audit artifact, never a schemaVersion:1 schedule feed.
 */
export function parseObservations(html, fetchedAt = new Date().toISOString()) {
  const body = textOf(html);
  const observations = [];
  const headingRe = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let m;
  const headings = [];
  while ((m = headingRe.exec(html))) headings.push({ title: textOf(m[1]), end: headingRe.lastIndex });
  for (const heading of headings) {
    const next = headings.find(h => h.end > heading.end);
    const chunk = textOf(html.slice(heading.end, next?.end ?? html.length));
    const channelMatch = chunk.match(/(دبي الرياضية [123])/);
    const timeMatch = chunk.match(/GMT\s*:\s*(\d{1,2}:\d{2})\s+UAE\s*:\s*(\d{1,2}:\d{2})/i);
    if (!channelMatch || !timeMatch || !heading.title) continue;
    const channelName = CHANNELS.get(channelMatch[1]);
    if (!channelName) continue;
    observations.push({
      channelName,
      programmeTitle: heading.title,
      sourceClock: { gmt: timeMatch[1], uae: timeMatch[2] },
      intervalVerified: false,
      reason: "Official endpoint exposes a listed clock time but no programme end time; not eligible for XMLTV publication.",
    });
  }
  const unique = [...new Map(observations.map(x => [x.channelName + "|" + x.programmeTitle + "|" + x.sourceClock.gmt, x])).values()];
  if (!unique.length) throw new Error("No Dubai Sports schedule observations parsed; refusing to write an empty audit");
  return {
    auditSchemaVersion: 1,
    provider: "dubai_sports_ae",
    sourceUrl: SOURCE_URL,
    fetchedAt,
    sourceTimezone: "Asia/Dubai",
    observations: unique,
    publicationStatus: "blocked_missing_verified_programme_end_times",
    limitations: [
      "The official page exposes only a short today/next card list.",
      "Programme end times are not present in the observed response and must not be inferred.",
      "These observations are deliberately not shaped as XMLTV schedule rows."
    ]
  };
}

export async function fetchObservations() {
  const response = await fetch(SOURCE_URL, {
    headers: { accept: "text/html", "user-agent": "SpectaEPG/1.0 public schedule source audit" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Dubai Sports schedule HTTP " + response.status);
  return parseObservations(await response.text());
}
async function main() {
  const output = process.argv[2] ?? "data/review/dubai_sports_observations.json";
  const audit = await fetchObservations();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(audit, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ observations: audit.observations.length, publicationStatus: audit.publicationStatus, output }, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error("Dubai Sports source audit failed: " + error.message); process.exitCode = 1; });
}

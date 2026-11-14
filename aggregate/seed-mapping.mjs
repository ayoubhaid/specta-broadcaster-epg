/**
 * Appends every provider channel that has no mapping row yet.
 * Existing rows are never modified. The build publishes only rows with an explicit Specta ID
 * and a reviewed permanent-linear or approved channel class.
 *
 *   node aggregate/seed-mapping.mjs
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapping, mappingKey, quoteCsv } from "./lib/mapping.mjs";
import { inspectFeed } from "./lib/schedule.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAPPING = path.join(ROOT, "data/mapping/channel-map.csv");
const HEADER = "provider,source_channel_id,source_channel_name,canonical_channel_id,channel_class,territory,status,notes,playlist_aliases";

const feeds = [];
for (const directory of ["data/source-feeds", "data/review"]) {
  let names;
  try {
    names = (await readdir(path.join(ROOT, directory))).sort();
  } catch {
    continue;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const document = JSON.parse(await readFile(path.join(ROOT, directory, name), "utf8"));
    if (inspectFeed(document).ok) feeds.push(document);
  }
}

const existing = await loadMapping(MAPPING);
const rows = [];
for (const feed of feeds) {
  for (const channel of feed.channels) {
    const key = mappingKey(feed.provider, channel.id);
    if (existing.has(key)) continue;
    rows.push(
      [
        feed.provider,
        channel.id,
        channel.name ?? "",
        "",
        "unclassified",
        channel.region ?? feed.region ?? "",
        "unreviewed",
        "",
        "",
      ]
        .map(quoteCsv)
        .join(",")
    );
  }
}

if (!rows.length) {
  console.log("Mapping already contains every provider channel.");
} else {
  let text;
  try {
    text = await readFile(MAPPING, "utf8");
  } catch {
    text = `${HEADER}\n`;
  }
  if (!text.endsWith("\n")) text += "\n";
  await writeFile(MAPPING, text + rows.join("\n") + "\n", "utf8");
  console.log(`Added ${rows.length} candidate rows to data/mapping/channel-map.csv.`);
}

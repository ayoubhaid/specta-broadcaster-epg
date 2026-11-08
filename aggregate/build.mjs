/**
 * Builds the app-facing XMLTV feed from the provider feeds and the reviewed mapping.
 *
 * Usage:
 *   node aggregate/build.mjs
 *   node aggregate/build.mjs --allow-unmapped          (diagnostic feed, not for the app)
 *   node aggregate/build.mjs --playlist=playlist.m3u   (report missing tvg-ids)
 *
 * Options: --feeds=dir1,dir2 --mapping=file --out=file --report=file
 *          --past=2 --future=40 --cap=80 --now=2026-11-08T12:00:00Z
 *          --require (exit non-zero when nothing is publishable)
 */

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapping } from "./lib/mapping.mjs";
import { buildFeed } from "./lib/pipeline.mjs";
import { tvgIdsFromM3u } from "./lib/playlist.mjs";
import { brandPrefixes, countryHints, indexRegistry, resolveChannel } from "./lib/registry.mjs";
import { inspectFeed } from "./lib/schedule.mjs";
import { toXmltv } from "./lib/xmltv.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REGISTRY_URL = "https://iptv-org.github.io/api/channels.json";
const USER_AGENT = "SpectaEPG/1.0 (broadcaster schedule ingestion)";

function parseArgs(argv) {
  const args = {};
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const body = argument.slice(2);
    const equals = body.indexOf("=");
    if (equals === -1) args[body] = true;
    else args[body.slice(0, equals)] = body.slice(equals + 1);
  }
  return args;
}

function intOption(value, fallback, min, max) {
  const number = Number.parseInt(value ?? "", 10);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, data, "utf8");
  await rename(temporary, file);
}

async function loadRegistry(args, warn) {
  if (args["no-registry"]) return null;
  const source = String(args.registry ?? REGISTRY_URL);
  try {
    if (/^https?:/i.test(source)) {
      const response = await fetch(source, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }
    return JSON.parse(await readFile(path.resolve(ROOT, source), "utf8"));
  } catch (error) {
    warn(`registry unavailable (${error.message}); only manual mapping rows will publish`);
    return null;
  }
}

async function loadFeeds(directories, warn) {
  const feeds = [];
  const seen = new Set();
  for (const directory of directories) {
    let names;
    try {
      names = (await readdir(directory)).sort();
    } catch (error) {
      warn(`skip ${directory}: ${error.message}`);
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(directory, name);
      let document;
      try {
        document = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        warn(`skip ${file}: ${error.message}`);
        continue;
      }
      const check = inspectFeed(document);
      if (!check.ok) {
        warn(`skip ${file}: ${check.reason}`);
        continue;
      }
      if (seen.has(document.provider)) {
        warn(`skip ${file}: duplicate provider ${document.provider}`);
        continue;
      }
      seen.add(document.provider);
      feeds.push({ ...document, file: path.relative(ROOT, file).replaceAll("\\", "/") });
    }
  }
  return feeds;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("node aggregate/build.mjs [--playlist=file.m3u] [--registry=file.json] [--no-registry] [--allow-unmapped] [--require]");
    return;
  }

  const now = args.now ? Math.floor(Date.parse(args.now) / 1000) : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(now)) throw new Error("--now is not a readable date");

  const feedDirs = String(args.feeds ?? "data/source-feeds,data/review")
    .split(",")
    .map((directory) => path.resolve(ROOT, directory.trim()))
    .filter(Boolean);
  const mappingFile = path.resolve(ROOT, args.mapping ?? "data/mapping/channel-map.csv");
  const outFile = path.resolve(ROOT, args.out ?? "docs/epg.xml");
  const reportFile = path.resolve(ROOT, args.report ?? "docs/coverage.json");

  const options = {
    pastHours: intOption(args.past, 2, 0, 168),
    futureHours: intOption(args.future, 40, 12, 168),
    maxPerChannel: intOption(args.cap, 80, 1, 400),
    allowUnmapped: Boolean(args["allow-unmapped"]),
  };

  const registry = await loadRegistry(args, (line) => console.warn(line));
  if (registry) {
    const index = indexRegistry(registry);
    options.resolve = (feed, channel) =>
      resolveChannel(index, {
        name: channel.name,
        countryHints: countryHints(feed.provider, feed.region),
        prefixes: brandPrefixes(feed.provider),
      });
    console.log(`Registry: ${registry.length} iptv-org channels indexed`);
  }

  const mapping = await loadMapping(mappingFile);
  const feeds = await loadFeeds(feedDirs, (line) => console.warn(line));
  if (!feeds.length) throw new Error("No provider feeds found; existing output preserved");

  const result = buildFeed({ feeds, mapping, now, options });
  const { report } = result;

  if (args.playlist) {
    const playlistFile = path.resolve(ROOT, args.playlist);
    const ids = tvgIdsFromM3u(await readFile(playlistFile, "utf8"));
    const published = new Set(result.channels.map((channel) => channel.id.toLowerCase()));
    const missing = [...ids].filter((id) => !published.has(id)).sort();
    report.playlist = {
      file: path.basename(playlistFile),
      tvgIds: ids.size,
      covered: ids.size - missing.length,
      missing,
    };
  }

  await writeAtomic(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Sources: ${feeds.map((feed) => feed.provider).join(", ")}`);
  for (const provider of report.providers) {
    const suffix = provider.error ? ` ERROR ${provider.error}` : "";
    console.log(
      `  ${provider.provider.padEnd(14)} ${String(provider.channels).padStart(3)} channels, ` +
        `${String(provider.programmes).padStart(6)} rows -> ${provider.publishedChannels} published ` +
        `(${provider.autoResolved} auto), ${provider.publishedProgrammes} programmes${suffix}`
    );
  }

  if (!result.channels.length) {
    console.warn("Nothing is publishable yet: docs/epg.xml was left untouched.");
    console.warn(`Unresolved source channels: ${report.held.unresolved.length} (see ${path.relative(ROOT, reportFile)}).`);
    if (args.require) process.exitCode = 1;
    return;
  }

  await writeAtomic(outFile, toXmltv(result.channels));
  console.log(`Feed: ${report.totals.channels} channels, ${report.totals.programmes} programmes -> ${path.relative(ROOT, outFile)}`);
  if (report.held.unresolved.length) console.log(`Held back: ${report.held.unresolved.length} unresolved source channels (see report)`);
  if (report.held.blocked.length) console.log(`Held back: ${report.held.blocked.length} temporary event channels (see report)`);
  if (report.held.collisions.length) console.warn(`Collisions: ${report.held.collisions.length} source channels claim a used tvg-id (see report)`);
  if (report.playlist) console.log(`Playlist coverage: ${report.playlist.covered}/${report.playlist.tvgIds} tvg-ids covered`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`EPG build failed: ${error.message}`);
    process.exitCode = 1;
  });
}

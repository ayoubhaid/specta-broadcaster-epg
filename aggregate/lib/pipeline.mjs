/**
 * Merges every provider feed into one list of app-facing channels.
 *
 * Identity, in order of precedence:
 * 1. a reviewed row in data/mapping/channel-map.csv (canonical_channel_id) — manual always wins
 * 2. automatic resolution against the iptv-org registry (config.resolve)
 * 3. diagnostic mode: namespaced id, only for smoke tests
 *
 * A row marked channel_class=temporary_event is never published, mapped or not.
 * Two source channels claiming the same id are a collision: the first is kept, the second reported.
 * Window, per-channel cap and the 12-hour limit match what the app's XMLTV reader keeps.
 */

import { mergeChannel } from "./merge.mjs";
import { mappingKey } from "./mapping.mjs";
import { normalizeProgramme } from "./schedule.mjs";

export const DEFAULT_OPTIONS = {
  pastHours: 2,
  futureHours: 40,
  maxPerChannel: 80,
  maxDurationSeconds: 12 * 3600,
  descriptionMax: 400,
  /** Diagnostic mode: publish unresolved channels under a namespaced id so the pipeline can be tested. */
  allowUnmapped: false,
  /** (feed, channel) -> { id, method } | { reason, candidates } | null */
  resolve: null,
};

export function buildFeed({ feeds, mapping, now, options = {} }) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const window = {
    from: now - config.pastHours * 3600,
    to: now + config.futureHours * 3600,
    cap: config.maxPerChannel,
  };
  const limits = {
    maxDurationSeconds: config.maxDurationSeconds,
    descriptionMax: config.descriptionMax,
  };

  const channels = new Map();
  const owners = new Map();
  const report = {
    generatedAt: new Date(now * 1000).toISOString(),
    diagnostic: Boolean(config.allowUnmapped),
    window: {
      from: new Date(window.from * 1000).toISOString(),
      to: new Date(window.to * 1000).toISOString(),
      maxPerChannel: window.cap,
    },
    totals: { channels: 0, programmes: 0 },
    providers: [],
    resolved: [],
    held: { unresolved: [], blocked: [], collisions: [] },
    rejected: { row: 0, title: 0, time: 0, range: 0, duration: 0 },
  };

  for (const feed of feeds) {
    const stat = {
      provider: feed.provider,
      providerName: feed.providerName ?? feed.provider,
      file: feed.file ?? null,
      channels: 0,
      programmes: 0,
      publishedChannels: 0,
      publishedProgrammes: 0,
      autoResolved: 0,
      rejected: { row: 0, title: 0, time: 0, range: 0, duration: 0 },
      error: null,
    };

    try {
      for (const channel of feed.channels) {
        stat.channels++;
        const key = mappingKey(feed.provider, channel.id);
        const row = mapping.get(key);
        stat.programmes += Array.isArray(channel.programmes) ? channel.programmes.length : 0;

        if (row?.channelClass === "temporary_event") {
          report.held.blocked.push({ key, name: channel.name, channelClass: row.channelClass });
          continue;
        }

        let publishId = row?.canonicalChannelId ?? "";
        let method = publishId ? "manual" : "";
        if (!publishId && config.allowUnmapped) {
          publishId = key;
          method = "diagnostic";
        }
        if (!publishId && config.resolve) {
          const result = config.resolve(feed, channel);
          if (result?.id) {
            publishId = result.id;
            method = result.method ?? "registry";
            stat.autoResolved++;
          } else {
            report.held.unresolved.push({
              key,
              provider: feed.provider,
              name: channel.name,
              reason: result?.reason ?? "unknown",
              candidates: result?.candidates ?? [],
            });
            continue;
          }
        }
        if (!publishId) {
          report.held.unresolved.push({ key, provider: feed.provider, name: channel.name, reason: "unmapped", candidates: [] });
          continue;
        }

        const owner = owners.get(publishId.toLowerCase());
        if (owner && owner !== key) {
          report.held.collisions.push({
            canonicalChannelId: publishId,
            kept: owner,
            dropped: key,
            name: channel.name,
          });
          continue;
        }
        owners.set(publishId.toLowerCase(), key);

        let target = channels.get(publishId);
        if (!target) {
          target = { id: publishId, name: channel.name, programmes: [] };
          channels.set(publishId, target);
        }
        stat.publishedChannels++;
        report.resolved.push({ key, name: channel.name, id: publishId, method });

        for (const programme of channel.programmes ?? []) {
          const normalized = normalizeProgramme(programme, limits);
          if (!normalized.programme) {
            stat.rejected[normalized.reason] = (stat.rejected[normalized.reason] ?? 0) + 1;
            report.rejected[normalized.reason] = (report.rejected[normalized.reason] ?? 0) + 1;
            continue;
          }
          target.programmes.push(normalized.programme);
          stat.publishedProgrammes++;
        }
      }
    } catch (error) {
      stat.error = error.message;
    }

    report.providers.push(stat);
  }

  const output = [];
  for (const channel of channels.values()) {
    const merged = mergeChannel(channel.programmes, window);
    if (!merged.length) continue;
    output.push({ ...channel, programmes: merged });
  }
  output.sort((a, b) => a.id.localeCompare(b.id));

  report.resolved.sort((a, b) => a.id.localeCompare(b.id));
  report.totals.channels = output.length;
  report.totals.programmes = output.reduce((sum, channel) => sum + channel.programmes.length, 0);
  return { channels: output, report };
}

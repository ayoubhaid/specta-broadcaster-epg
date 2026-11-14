import test from "node:test";
import assert from "node:assert/strict";
import { buildFeed } from "../lib/pipeline.mjs";

const NOW = 1794139200; // 2026-11-08T12:00:00Z

function demoFeed() {
  return {
    provider: "demo",
    providerName: "Demo Broadcaster",
    file: "demo.json",
    channels: [
      {
        id: "ch1",
        name: "Demo One",
        programmes: [
          { title: "Show", startEpochSeconds: NOW, endEpochSeconds: NOW + 3600 },
          { title: "Show", startEpochSeconds: NOW, endEpochSeconds: NOW + 3600 },
          { title: "Marathon", startEpochSeconds: NOW, endEpochSeconds: NOW + 13 * 3600 },
          { title: "Tomorrow", startEpochSeconds: NOW + 41 * 3600, endEpochSeconds: NOW + 42 * 3600 },
          { title: "   ", startEpochSeconds: NOW, endEpochSeconds: NOW + 60 },
        ],
      },
      {
        id: "ch2",
        name: "Demo Two",
        programmes: [{ title: "Late", startEpochSeconds: NOW + 10 * 3600, endEpochSeconds: NOW + 11 * 3600 }],
      },
    ],
  };
}

function mappingFor(...rows) {
  return new Map(rows.map(([key, canonicalChannelId, channelClass]) => [key, { canonicalChannelId, channelClass }]));
}

test("a mapped channel publishes; unmapped ones are held", () => {
  const { channels, report } = buildFeed({
    feeds: [demoFeed()],
    mapping: mappingFor(["demo:ch1", "demo.one", "permanent_linear"]),
    now: NOW,
  });
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, "demo.one");
  assert.equal(channels[0].name, "Demo One");
  assert.equal(channels[0].programmes.length, 1, "duplicate removed, long entry dropped, 41h entry outside window");
  assert.equal(report.held.unresolved.length, 1);
  assert.equal(report.held.unresolved[0].key, "demo:ch2");
  assert.equal(report.rejected.duration, 1);
  assert.equal(report.rejected.title, 1);
});

test("temporary event channels are held back even when mapped", () => {
  const { channels, report } = buildFeed({
    feeds: [demoFeed()],
    mapping: mappingFor(["demo:ch1", "demo.event", "temporary_event"]),
    now: NOW,
  });
  assert.equal(channels.length, 0);
  assert.equal(report.held.blocked.length, 1);
  assert.equal(report.held.blocked[0].channelClass, "temporary_event");
});

test("two source channels claiming one tvg-id are a reported collision", () => {
  const { channels, report } = buildFeed({
    feeds: [demoFeed()],
    mapping: mappingFor(["demo:ch1", "demo.one", "permanent_linear"], ["demo:ch2", "demo.one", "permanent_linear"]),
    now: NOW,
  });
  assert.equal(channels.length, 1);
  assert.equal(report.held.collisions.length, 1);
  assert.equal(report.held.collisions[0].kept, "demo:ch1");
  assert.equal(report.held.collisions[0].dropped, "demo:ch2");
});

test("the per-channel cap keeps the earliest programmes", () => {
  const feed = {
    provider: "demo",
    channels: [
      {
        id: "ch1",
        name: "Demo One",
        programmes: Array.from({ length: 100 }, (_, index) => ({
          title: `Show ${index}`,
          startEpochSeconds: NOW + index * 600,
          endEpochSeconds: NOW + index * 600 + 600,
        })),
      },
    ],
  };
  const { channels } = buildFeed({
    feeds: [feed],
    mapping: mappingFor(["demo:ch1", "demo.one", "permanent_linear"]),
    now: NOW,
    options: { maxPerChannel: 80 },
  });
  assert.equal(channels[0].programmes.length, 80);
  assert.equal(channels[0].programmes[0].title, "Show 0");
  assert.equal(channels[0].programmes[79].title, "Show 79");
});

test("diagnostic mode publishes unmapped channels under a namespaced id", () => {
  const feed = demoFeed();
  feed.channels[0].programmes.push({
    title: "Inside window",
    startEpochSeconds: NOW - 1800,
    endEpochSeconds: NOW - 600,
  });
  const { channels, report } = buildFeed({ feeds: [feed], mapping: new Map(), now: NOW, options: { allowUnmapped: true } });
  assert.deepEqual(
    channels.map((channel) => channel.id),
    ["demo:ch1", "demo:ch2"]
  );
  assert.equal(report.diagnostic, true);
  assert.equal(report.held.unresolved.length, 0);
});

test("a broken provider does not stop the others", () => {
  const broken = { provider: "broken", channels: null };
  const { channels, report } = buildFeed({
    feeds: [broken, demoFeed()],
    mapping: mappingFor(["demo:ch1", "demo.one", "permanent_linear"]),
    now: NOW,
  });
  assert.equal(channels.length, 1);
  assert.ok(report.providers[0].error, "the broken provider reports an error");
  assert.equal(report.providers[1].publishedChannels, 1);
});

test("matching channels from different providers merge programmes under one canonical ID", () => {
  const first = {
    provider: "provider_a",
    channels: [{
      id: "source-a",
      name: "Channel One",
      programmes: [{ title: "Morning News", startEpochSeconds: NOW, endEpochSeconds: NOW + 1800 }]
    }]
  };
  const second = {
    provider: "provider_b",
    channels: [{
      id: "source-b",
      name: "Channel One",
      programmes: [{ title: "Afternoon Show", startEpochSeconds: NOW + 1800, endEpochSeconds: NOW + 3600 }]
    }]
  };
  const mapping = mappingFor(
    ["provider_a:source-a", "channel.one", "permanent_linear"],
    ["provider_b:source-b", "channel.one", "permanent_linear"]
  );
  const { channels, report } = buildFeed({ feeds: [first, second], mapping, now: NOW });
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, "channel.one");
  assert.equal(channels[0].programmes.length, 2);
  assert.equal(report.held.collisions.length, 0);
  assert.equal(report.providers[0].publishedChannels, 1);
  assert.equal(report.providers[1].publishedChannels, 1);
});

test("near-identical schedules from different providers are deduplicated within two minutes", () => {
  const first = {
    provider: "provider_a",
    channels: [{
      id: "source-a",
      name: "Channel One",
      programmes: [{ title: "Evening News", startEpochSeconds: NOW, endEpochSeconds: NOW + 1800 }]
    }]
  };
  const second = {
    provider: "provider_b",
    channels: [{
      id: "source-b",
      name: "Channel One",
      programmes: [{ title: "Evening News", startEpochSeconds: NOW + 60, endEpochSeconds: NOW + 1860 }]
    }]
  };
  const mapping = mappingFor(
    ["provider_a:source-a", "channel.one", "permanent_linear"],
    ["provider_b:source-b", "channel.one", "permanent_linear"]
  );
  const { channels } = buildFeed({ feeds: [first, second], mapping, now: NOW });
  assert.equal(channels.length, 1);
  assert.equal(channels[0].programmes.length, 1);
  assert.equal(channels[0].programmes[0].start, NOW);
});


test("playlist aliases are retained on the canonical Specta channel", () => {
  const mapping = new Map([["demo:ch1", {
    canonicalChannelId: "specta.demo.channel-one",
    channelClass: "permanent_linear",
    playlistAliases: ["legacy.channel.one", "playlist.channel.one"]
  }]]);
  const { channels } = buildFeed({ feeds: [demoFeed()], mapping, now: NOW });
  assert.equal(channels[0].id, "specta.demo.channel-one");
  assert.deepEqual(channels[0].aliases, ["legacy.channel.one", "playlist.channel.one"]);
});

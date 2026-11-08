# Specta Broadcaster EPG

Provider adapters and dated programme data for Specta. Each broadcaster feed keeps its own source channel IDs; mapping to Specta's canonical playlist IDs happens in a separate reviewed mapping file.

## Current feeds

| Provider | Path | State |
|---|---|---|
| beIN SPORTS MENA | `data/source-feeds/bein_mena.json` | Source feed snapshot from the existing [beIN scraper](https://github.com/ayoubhaid/specta-bein-epg); 40 source channels and 2,458 programmes at generation time. Source guide IDs are not Specta playlist IDs. |
| SuperSport | `data/review/supersport_unclassified.json` | 1,630 dated programme rows from the official Media Schedules page. Held for review because source channels have not been matched to the Specta registry or classified as permanent linear versus temporary/OTT feeds. |

The SuperSport CSV beside the JSON is a flat audit export. SuperSport schedule rows that describe matches remain programme listings; they are not imported as football fixture records. No playlist URLs, stream credentials, or temporary event-feed inventory are included.

## Shared schema

Both provider feeds use the beIN project's `schemaVersion: 1` envelope. Programme `start` and `end` are ISO-8601 UTC values; epoch fields use seconds. Every SuperSport programme includes its source URL, fetch time, source timezone, source code, and stable source-record ID. `channels[].id` is the broadcaster's guide identity. `canonicalChannelId` is separate and remains empty until an exact, unique registry mapping is reviewed.

The JSON Schema is in [`schema/schedule-v1.schema.json`](schema/schedule-v1.schema.json). This repository is a source-feed store, not a merged production EPG. Do not promote `data/review/` feeds to an app-facing endpoint until the mapping and channel-class review is complete.

## Refresh and validation

Run the provider scrapers manually with Node.js 20+ and Python 3.11+:

```sh
cd providers/bein_mena
EPG_DAYS=5 EPG_OUTPUT=../../data/source-feeds/bein_mena.json npm run scrape
cd ../..
python providers/supersport/scraper.py --date 2026-11-08 --days 5 \
  --output data/review/supersport_unclassified.csv \
  --json-output data/review/supersport_unclassified.json
```

SuperSport dates are broadcaster-local dates in `Africa/Johannesburg`; output timestamps are UTC. The refresh workflow is manual so the sources and request volume can be reviewed before collection.

Run checks:

```sh
cd providers/bein_mena && npm run check
cd ../..
python -m unittest discover -s providers/supersport -p 'test_*.py'
```

## Channel mapping workflow

Populate `data/mapping/channel-map.csv` from the actual playlist inventory and approved Phase 3 registry. Keep one row per provider source channel. Use `permanent_linear`, `temporary_event`, or `unclassified` for `channel_class`. Never infer identity from a sports event title or a temporary stream label. Preserve collisions for human review rather than choosing a mapping silently.

## Sources and limits

- beIN: public MENA TV guide endpoints documented in `providers/bein_mena/README.md`; the endpoint contract may change.
- SuperSport: [TV Guide](https://supersport.com/tv-guide) and [Media Schedules](https://wsd.supersport.com/media/ms_schedule.asp). The dated Media Schedules page returns programme listings with channel codes and local clock times.
- Public guide data availability and provider terms may change. Keep request rates conservative and validate each generated feed before publishing it for app consumption.

# Specta Broadcaster EPG

Provider adapters and dated programme data for Specta. Each broadcaster feed keeps its own source channel IDs; `aggregate/` resolves them to iptv-org ids automatically and publishes one XMLTV feed.

## Current feeds

| Provider | Path | State |
|---|---|---|
| SNRT Morocco | `data/source-feeds/snrt_ma.json` | Seven SNRT linear TV channels from the official SNRT programme grid; source times are converted from Africa/Casablanca to UTC and refreshed every six hours. |
| beIN SPORTS MENA | `data/source-feeds/bein_mena.json` | Source feed snapshot from the existing [beIN scraper](https://github.com/ayoubhaid/specta-bein-epg); 40 source channels and 2,458 programmes at generation time. Source guide IDs are not Specta playlist IDs. |
| SuperSport | `data/review/supersport_unclassified.json` | 1,630 dated programme rows from the official Media Schedules page. Held for review because source channels have not been matched to the Specta registry or classified as permanent linear versus temporary/OTT feeds. |
| Sky Sports UK | `data/review/sky_uk_unclassified.json` | Five-day official EPG response: four linear channels and 591 programmes. Source service IDs are retained; Sky Sports+ interactive service is excluded. |
| CANAL+ France | `data/review/canalplus_fr_unclassified.json` | 220 dated programmes across seven channels extracted from the official France guide. This is France-only coverage, not CANAL+ Afrique. |\n| Dubai Sports | `data/review/dubai_sports_observations.json` | Official today/next schedule observations are captured for audit only. The page does not expose verified programme end times, so this is not an XMLTV feed and is not counted as EPG coverage. |

The SuperSport CSV beside the JSON is a flat audit export. SuperSport and Sky schedule rows that describe matches remain programme listings; they are not imported as football fixture records. CANAL+ and Sky feeds are held for review pending channel mapping. No playlist URLs, stream credentials, or temporary event-feed inventory are included.

## Shared schema

Provider feeds use the beIN project's `schemaVersion: 1` envelope. Programme `start` and `end` are ISO-8601 UTC values; epoch fields use seconds. Rows preserve their source URL, fetch time, source timezone, source code, and stable source-record ID. `channels[].id` is the broadcaster's guide identity. `canonicalChannelId` is separate and remains empty until an exact, unique registry mapping is reviewed.

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
node providers/sky/scraper.mjs 2026-11-08 5 data/review/sky_uk_unclassified.json
node providers/canalplus_fr/scraper.mjs data/review/canalplus_fr_unclassified.json
```

SuperSport dates are broadcaster-local dates in `Africa/Johannesburg`; Sky dates are fetched from the official dated schedule API; CANAL+ guide timestamps are epoch milliseconds. Output timestamps are UTC. All feeds refresh automatically every six hours.

Run checks:

```sh
cd providers/bein_mena && npm run check
cd ../..
python -m unittest discover -s providers/supersport -p 'test_*.py'
node --test providers/sky/test_scraper.mjs providers/canalplus_fr/test_scraper.mjs
```

## Channel mapping workflow

Identity is resolved automatically against the iptv-org registry, so the CSV is an override list, not a checklist. `aggregate/seed-mapping.mjs` appends every provider channel as `unclassified`; fill `canonical_channel_id` only when the automatic result is wrong or missing, and use `temporary_event` to keep a feed out of the app entirely. Never infer identity from a sports event title or a temporary stream label. Ambiguous names and collisions are reported in `docs/coverage.json` instead of being guessed.

## App-facing XMLTV feed

`aggregate/build.mjs` merges the provider feeds into one XMLTV document for Specta. Identity is resolved automatically: every provider channel is matched against the public iptv-org channel registry by name, with provider-specific country hints (QA for beIN, UK for Sky, FR for CANAL+, ZA for SuperSport). Nothing has to be filled in by hand.

- **Input:** `data/source-feeds/*.json` and `data/review/*.json` (schedule-v1 only; files without `schemaVersion: 1` are skipped).
- **Identity:** the matching iptv-org id (`beINSports1.qa`, `SkySportsMainEvent.uk`, `SuperSportAction.za`). A row in `data/mapping/channel-map.csv` with `canonical_channel_id` overrides the automatic result. `channel_class = temporary_event` is never published.
- **No guessing:** a name that matches several countries, or a country hint that matches none, is held back and listed with its candidates.
- **Output:** `docs/epg.xml` (XMLTV) and `docs/coverage.json` (what was resolved, held back, rejected or collided).

```sh
npm run build                               # fetch registry, resolve, write docs/
npm run build -- --playlist=playlist.m3u    # additionally report uncovered tvg-ids
node aggregate/build.mjs --registry=data/iptv-channels.json   # offline registry copy
npm test                                    # aggregation pipeline tests
```

`docs/epg.xml` is never replaced when nothing is publishable, so a broken refresh cannot blank the feed for users. `docs/coverage.json` is the work queue: `held.unresolved` lists names that need an override, with the registry candidates that were too close to choose from, and `rejected` counts rows the app could not have shown (for example programmes longer than 12 hours).

Enable **GitHub Pages** for this repository (branch `main`, folder `/docs`). The feed then lives at `https://<user>.github.io/specta-broadcaster-epg/epg.xml` and is pasted into **Settings → Live → TV-Programm (EPG)** in the app. The app matches `programme@channel` against the playlist's `tvg-id`, case-insensitively — the published ids are iptv-org ids, so playlists that use those ids match directly. A playlist with provider-specific ids needs an override row (or a name fallback in the app).

The build applies the app's own XMLTV limits so the file contains nothing the app would discard: 36 hours ahead are used, at most 80 programmes per channel, descriptions are capped at 400 characters, and entries longer than 12 hours are rejected. This repository does not change the app; it only publishes a file the app already reads.

## Sources and limits

- beIN: public MENA TV guide endpoints documented in `providers/bein_mena/README.md`; the endpoint contract may change.
- SuperSport: [TV Guide](https://supersport.com/tv-guide) and [Media Schedules](https://wsd.supersport.com/media/ms_schedule.asp). The dated Media Schedules page returns programme listings with channel codes and local clock times.
- Sky Sports UK: [Watch: sport on Sky](https://www.skysports.com/watch/sport-on-sky) and its public dated schedule API. Only four verified linear sports channels are currently included.
- CANAL+ France: [Programme TV](https://www.canalplus.com/live-tv/programme-tv/); the page embeds dated channel programme objects. This adapter covers the France guide only.
- Dubai Sports official source audit: [TV schedule component](https://www.dubaisports.ae/content/dubaisports/home/_jcr_content/channel-programs.home-live-schedule.html). It currently exposes a short list of cards and clock observations, not complete programme intervals; the adapter preserves this evidence without fabricating end times.\n- ESPN and other broadcasters are not yet in the refresh set: an official channel schedule source must be verified before adding a feed. Sports fixture APIs and event calendars are not substitutes for linear channel listings.
- Public guide data availability and provider terms may change. Keep request rates conservative and validate each generated feed before publishing it for app consumption.

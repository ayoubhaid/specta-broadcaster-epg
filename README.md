# Specta EPG

Specta owns the complete EPG pipeline: source adapters, raw schedule collection, normalization, channel identity, validation, aggregation, XMLTV output and coverage reporting. External broadcasters and guide providers are schedule inputs only. No third-party EPG repository or channel registry is required at build time.

## Current programme sources

| Source | Market | Adapter | Programme data | Publishing |
|---|---|---|---|---|
| beIN SPORTS | MENA English guide | `providers/bein_mena/` | Official guide API; dated channel schedules | Explicitly mapped channels |
| SuperSport | South Africa / regional services | `providers/supersport/` | Official Media Schedules; dated channel programmes | Reviewed permanent channels only |
| Sky Sports | UK | `providers/sky/` | Dated linear-channel EPG response | Four reviewed linear channels |
| SNRT | Morocco | `providers/snrt_ma/` | Official SNRT programme grid | Seven reviewed channels |
| CANAL+ | France | `providers/canalplus_fr/` | Official France programme guide | Reviewed France channels only |

The SuperSport source contains regional and OTT services. OTT, event-only and ambiguous channel identities are not promoted by the Specta registry. Match programmes remain ordinary channel schedule entries; fixtures and sports-event feeds are never used as EPG programme rows.

## Architecture

```text
Official broadcaster guides ─┐
Independent TV-guide sources ├─> Provider adapters
                             │
                             v
                       Raw schedule feeds
                             |
                             v
                    Normalize + validate
                             |
                             v
                 Specta channel registry
                  (source ID -> Specta ID)
                             |
                             v
                   Aggregate + deduplicate
                             |
                             v
                  XMLTV + coverage report
                             |
                             v
                 GitHub Pages / Specta app
```

The registry is `data/mapping/channel-map.csv`. Each source channel must have an explicit, reviewed mapping to a stable `specta.*` ID. `playlist_aliases` retains previously used playlist `tvg-id` values for backwards compatibility. XMLTV emits the Specta ID and each approved alias, including programme rows, so existing playlists continue matching while Specta can move toward its own IDs.

There is no name-based auto-resolution. Unknown, ambiguous, temporary and unmapped channels are held back and reported. The build never downloads a third-party channel registry.

## Data contract

Provider adapters emit `schemaVersion: 1` JSON. Every programme must contain a title and valid start/end instants. Timestamps are normalized to UTC while the original source timezone and provenance are retained where available.

The shared schema is `schema/schedule-v1.schema.json`.

## Run locally

Requirements: Node.js 20+ and Python 3.11+.

```sh
# Refresh each provider independently
cd providers/bein_mena && EPG_DAYS=5 EPG_OUTPUT=../../data/source-feeds/bein_mena.json npm run scrape
cd ../..
python providers/supersport/scraper.py --date 2026-11-14 --days 5 --output data/review/supersport_unclassified.csv --json-output data/review/supersport_unclassified.json
node providers/sky/scraper.mjs 2026-11-14 5 data/review/sky_uk_unclassified.json
node providers/canalplus_fr/scraper.mjs data/review/canalplus_fr_unclassified.json
node providers/snrt_ma/scraper.mjs

# Build using only the checked-in Specta registry
npm run build
npm test
npm run check
```

`data/source-feeds/` contains production source snapshots. `data/review/` may contain feeds with more source channels than the registry approves; only exact registry mappings are published.

## Refresh

GitHub Actions refreshes supported adapters every six hours, then runs the local aggregation pipeline. Each adapter preserves its last good output if the source fails or returns no usable schedule. The workflow does not import third-party XMLTV feeds.

## XMLTV endpoint

Enable GitHub Pages for the repository using branch `main`, folder `/docs`. The published feed is:

`https://<owner>.github.io/specta-broadcaster-epg/epg.xml`

Add that URL in Specta's EPG settings. The XMLTV includes both Specta-owned IDs and reviewed playlist aliases. The app can continue using its existing playlist IDs; future playlist generation can use the `specta.*` IDs.

## Validation and safety rules

- Only dated programme schedules attached to an actual channel are EPG input.
- Fixtures, match calendars, event listings without a channel schedule and VOD metadata are excluded.
- Channel identity is explicit; names alone never authorize a mapping.
- Temporary/event services and OTT-only streams are not classified as permanent linear channels.
- Schedules outside the configured publication window, invalid intervals, empty titles and programmes longer than 12 hours are rejected.
- Independent sources may be combined only after their channel identities have been reviewed.
- Source terms, rate limits, caching and redistribution rights must be checked before a new adapter is automated.
- No playlist URLs, stream credentials or private provider data belong in this repository.

See `docs/source-catalog.md` for the 15 broadcaster-family source audit and onboarding status.

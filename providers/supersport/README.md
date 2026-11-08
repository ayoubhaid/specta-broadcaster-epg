# SuperSport adapter

`scraper.py` posts a selected local date to SuperSport's public Media Schedules endpoint and parses dated programme rows from the returned HTML.

## Behavior

- Uses `Africa/Johannesburg` for the source's local clock times; output instants are UTC.
- Requests each date once, retries transient failures, and emits stable source record IDs.
- Removes exact duplicated records while retaining the same programme on distinct source channels.
- Writes the shared `schemaVersion: 1` JSON envelope plus a flat CSV audit export.
- Uses source channel abbreviations for `channels[].id`; writes `canonicalChannelId` only for a unique exact match from a supplied registry.
- Does not convert match-title programme listings into a football fixtures feed.

The source listing contains a mix of regional, OTT, and other channel rows. Until the Specta channel registry is supplied and reviewed, generated data belongs under `data/review/` and must not be treated as a permanent-linear-only feed.

## Run

```sh
python scraper.py --date 2026-11-08 --days 1 \
  --output ../../data/review/supersport_unclassified.csv \
  --json-output ../../data/review/supersport_unclassified.json
```

Optional `--registry` accepts CSV columns `canonical_channel_id` (or `channel_id`/`id`) plus source/canonical names, pipe-separated `aliases`, and/or `supersport_code`. Ambiguous mappings remain blank.

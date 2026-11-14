# Golf Channel US adapter

`scraper.mjs` reads the public Golf Channel on-air schedule page and normalizes it to the shared `schemaVersion: 1` feed.

## What it collects

- The page exposes two day blocks (`data-day="YYYY-MM-DD"`): the rest of today and tomorrow.
- Each item has a start time, a title, a category and a channel.
- Only items whose channel is `Golf Channel` are kept; NBC/USA simulcasts are ignored.
- Live rows with no clock time are skipped.

## Timezone

Times carry an `EST`/`EDT` suffix. The adapter converts them to UTC using the suffix, and falls back to `America/New_York` when no suffix is present. Programme end times come from the next programme's start, capped at one hour for the final row or a gap longer than six hours.

## Run

```sh
node providers/golfchannel/scraper.mjs
```

Set `EPG_OUTPUT` to change the output path. The default is `data/review/golfchannel_us_unclassified.json`.

The adapter writes atomically and leaves the last good output untouched when the page returns no programmes.

## Tests

```sh
node --test providers/golfchannel/test_scraper.mjs
```

The fixture is a captured on-air schedule page. It covers title extraction from both `<a>` and `<span>` links, live-row skipping, Eastern-to-UTC conversion, and the empty-page failure path.

## Publishing

Add the source row to `data/mapping/channel-map.csv`. The current mapping covers `GolfChannel.us`, `Golf Channel` and `GolfChannel.pl`.

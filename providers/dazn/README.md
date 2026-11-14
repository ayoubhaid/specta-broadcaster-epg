# DAZN adapter

`scraper.mjs` reads DAZN's public rail schedule endpoint and normalizes the linear-channel schedule to the shared `schemaVersion: 1` feed.

## What it collects

- One rail request per country. No per-channel requests.
- Countries: Germany, UK, US, Italy, Spain, France and Portugal.
- Each tile carries a `LinearSchedule` with `Now`, `Next` and `Later`; the later window covers roughly three days.
- Programme title combines the base title and episode title when both are present.

## Source and terms

The endpoint is a public web API used by DAZN's own site, but it is not a documented public contract. Review DAZN's current terms before automated collection or redistribution. The adapter is review-only: a channel publishes only after an explicit row is added to `data/mapping/channel-map.csv`.

## Run

```sh
node providers/dazn/scraper.mjs
```

Environment options:

- `EPG_OUTPUT`: output path (default `data/review/dazn_unclassified.json`).
- `DAZN_COUNTRIES`: comma-separated country list (default `DE,GB,US,IT,ES,FR,PT`).
- `REQUEST_DELAY_MS`: delay between country requests (default 200).

The adapter writes atomically and preserves the last good output when no programmes are collected.

## Tests

```sh
node --test providers/dazn/test_scraper.mjs
```

The fixture is a captured Spain rail. It covers title/episode composition, invalid-row rejection, duplicate removal, and the empty-rail case.

## Publishing

The current mapping covers DAZN Spain (LaLiga, 1, 2), Germany (1, 2), Portugal (2–5), Italy (1) and the DAZN US Fubo Sports channel.

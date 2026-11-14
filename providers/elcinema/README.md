# elCinema Arabic adapter

`scraper.py` reads the public English elCinema TV guide (`elcinema.com/en/tvguide`) and normalizes it to the shared `schemaVersion: 1` feed. It is a review-only adapter: a source channel publishes only after an explicit row is added to `data/mapping/channel-map.csv`.

## What it collects

- The channel directory at `/en/tvguide` (currently 101 channels with usable schedules).
- Each channel page under `/en/tvguide/{id}/`.
- The page renders the remainder of today plus tomorrow; some OSN pages expose up to four days.
- Each row contains a time, a duration in minutes, a title, and a type/year such as `Movie (2015)`.

## Timezone

The page renders times against the server clock, which is GMT. The adapter therefore defaults to `UTC`. Override with `ELCINEMA_TIMEZONE` if the source ever changes.

## Row layouts

Two server-rendered containers are in use: `boxed-category-1` for movies and `boxed-category-3` for series. The parser splits on `boxed-category-<n>` so both work.

## Run

```sh
python providers/elcinema/scraper.py --output data/review/elcinema_ar_unclassified.json
```

Optional flags:

- `--limit 3` for a quick smoke test
- `--delay-ms 150` between channel requests
- `--timezone UTC`

The adapter writes atomically and leaves the previous output untouched when no programmes are collected.

## Tests

```sh
python -m unittest discover -s providers/elcinema -p 'test_*.py'
```

The fixture `fixtures/tvguide-1132.html` is a captured MBC MAX page. It covers PM/midnight parsing, date headers, both row layouts, tomorrow's programmes, and the empty-page failure path.

## Publishing

Add one row per source channel to `data/mapping/channel-map.csv` with the numeric source ID and the playlist aliases. No name-based auto-mapping is performed.

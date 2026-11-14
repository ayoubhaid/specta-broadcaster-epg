# Sky Sports UK adapter

`scraper.mjs` reads the public Sky EPG schedule endpoint (`awk.epgsky.com`) for service IDs verified from Sky's own services endpoint. It returns real programme rows (title, description, start, duration) as a `schemaVersion: 1` feed.

The channel set is discovered from the UK bouquet (`/hawk/linear/services/4101/1`), which returns each service ID, name and channel number. The adapter covers 21 sports channels carried on Sky:

- Sky Sports Main Event, Premier League, Football, Sky Sports+, Cricket, Golf, F1, Tennis, News, NFL, Racing and Mix
- TNT Sports 1–4
- Premier Sports 1–2
- MUTV, LFCTV and Racing TV

The schedule endpoint rejects long service-ID lists, so requests are split into chunks of ten. Programme times arrive as Unix seconds and are UTC instants; `Europe/London` is retained as source timezone. Sky's day response overlaps adjacent dates, so records are deduplicated by source event identity.

Run five dates:

```sh
node providers/sky/scraper.mjs 2026-11-15 5 data/review/sky_uk_unclassified.json
```

Publishing is controlled by explicit rows in `data/mapping/channel-map.csv`; the adapter never publishes a source channel on its own. PPV flags stay programme-level metadata. Match programmes remain schedule rows, not standalone fixture records.

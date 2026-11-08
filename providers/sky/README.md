# Sky Sports UK adapter

`scraper.mjs` reads the public Sky EPG schedule endpoint (`awk.epgsky.com`) for service IDs verified on Sky's official Watch page. It returns real programme rows (title, description, start, duration) as a `schemaVersion: 1` feed.

The initial verified source channel set is limited to Sky Sports Main Event, Cricket, Premier League, and Mix. The `Sky Sports+` ID found on the page is an interactive event service, so it is excluded from this linear schedule feed. Programme times arrive as Unix seconds and are UTC instants; `Europe/London` is retained as source timezone. Sky's day response overlaps adjacent dates, so records are deduplicated by source event identity.

Run five dates:

```sh
node providers/sky/scraper.mjs 2026-11-08 5 data/review/sky_uk_unclassified.json
```

Canonical playlist IDs are blank until the playlist inventory is available. PPV flags stay programme-level metadata. Match programmes remain schedule rows, not standalone fixture records.

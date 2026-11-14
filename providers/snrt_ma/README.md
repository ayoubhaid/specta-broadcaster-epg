# SNRT Morocco EPG adapter

Scrapes the dated programme grid from SNRT's public channel pages and writes the Specta provider schedule v1 format.

- Official source: https://www.snrt.ma/ar/node/1208
- SNRT source node IDs and Specta XMLTV identities are maintained in this repository's own adapter and channel registry.
- Source timezone: `Africa/Casablanca`; programme instants are normalized to UTC.
- TV channels included: Al Aoula, Laayoune TV, Arryadia, Athaqafia, Al Maghribia, Assadissa, and Tamazight.
- Radio services are excluded.

## Run

Requires Node.js 20+; no external npm dependencies are required.

```sh
node providers/snrt_ma/scraper.mjs
npm test
npm run check
```

Environment variables:

- `EPG_OUTPUT`: output path; defaults to `data/source-feeds/snrt_ma.json`.
- `REQUEST_DELAY_MS`: delay between channel requests, clamped to 100–5000 ms.

The scraper requests each channel sequentially and fails closed: if any channel cannot be fetched or parsed, it exits without replacing the previous feed. Programme end times are derived from the next dated programme start; the final slot ends at the next local midnight. A captured HTML fixture is used for deterministic parser and timezone tests.

SNRT can change its page markup or schedule. Check refresh logs and validate generated coverage after upstream changes; do not synthesize programmes when the source is unavailable.

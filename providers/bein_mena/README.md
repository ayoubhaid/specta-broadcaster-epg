# Specta beIN MENA JSON EPG scraper

Creates a normalized JSON electronic programme guide from the public beIN SPORTS MENA guide API used by the open-source `iptv-org/epg` scraper.

Source page: https://www.beinsports.com/en-mena/tv-guide

## What it creates

`docs/bein-epg.json` with this shape:

```json
{
  "schemaVersion": 1,
  "provider": "bein_mena",
  "providerName": "beIN SPORTS MENA",
  "sourceUrl": "https://www.beinsports.com/en-mena/tv-guide",
  "region": "en-mena",
  "timezone": "UTC",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "coverage": {
    "daysRequested": 5,
    "channelsFound": 24,
    "programmesFound": 100,
    "successfulRequests": 120,
    "failedRequests": 0
  },
  "channels": [
    {
      "id": "source-channel-id",
      "name": "beIN SPORTS 1",
      "region": "en-mena",
      "programmes": [
        {
          "id": "source-channel-id:timestamp:title",
          "title": "Programme title",
          "description": "",
          "start": "2026-01-01T18:00:00.000Z",
          "end": "2026-01-01T20:00:00.000Z",
          "startEpochSeconds": 1767290400,
          "endEpochSeconds": 1767297600,
          "source": "bein_mena"
        }
      ]
    }
  ]
}
```

The example above documents the schema only; it is not live scraped data.

## Run locally

Requires Node.js 20 or later. No npm dependencies are required.

```bash
npm run check
npm run scrape
```

Options:

- `EPG_DAYS=5` — days to request, 1–14.
- `BEIN_REGION=en-mena` — source region/language.
- `REQUEST_DELAY_MS=300` — delay between requests, 100–5000 ms.
- `EPG_OUTPUT=docs/bein-epg.json` — output path.

Example:

```bash
EPG_DAYS=5 REQUEST_DELAY_MS=500 npm run scrape
```

The script uses sequential requests and a timeout. If the channel endpoint fails, or no programme data is collected, it exits without replacing the previous JSON file. If some individual requests fail, it logs partial coverage; review the logs before publishing.

## Publish as a static JSON endpoint

1. Push this project to a GitHub repository you control.
2. Enable GitHub Actions and GitHub Pages for the repository (serve the `docs/` directory from the branch).
3. Run the **Update beIN MENA JSON EPG** workflow manually once.
4. Your app can then fetch `https://YOUR-USERNAME.github.io/YOUR-REPO/bein-epg.json`.

Do not hardcode the placeholder URL. Set the final URL in Specta's EPG provider configuration after deployment.

## Specta integration notes

- Parse `channels[].programmes[]` into the app's existing EPG domain model.
- Treat `start` and `end` as ISO-8601 UTC timestamps.
- Use the stable source channel `id` as the guide identity, not as a playlist stream ID.
- Map guide channels to playlist channels explicitly (prefer M3U `tvg-id`; use normalized names only as a fallback).
- Cache the feed locally and keep the last known-good data if a refresh fails.
- Do not fetch this JSON on every Compose recomposition or channel focus change.
- Validate `schemaVersion` before parsing.
- This is schedule metadata only; it does not provide video streams.

## Source and maintenance

The endpoint pattern is based on the public beIN guide API used by the open-source project [iptv-org/epg](https://github.com/iptv-org/epg), particularly `sites/beinsports.com/beinsports.com.config.js`. The upstream endpoint is not a guaranteed public API contract and may change. Check beIN's terms and usage policies before deploying frequent automated collection, and keep request rates conservative.

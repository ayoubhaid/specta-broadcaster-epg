# Morocco broadcaster EPG research

This directory tracks candidate Moroccan linear-TV guide sources before a scraper is promoted into the automated refresh pipeline.

## Source policy

A source is not considered production-ready merely because a web page displays programme names. Before adding a scraper, verify:

- the source is controlled by the broadcaster or is a stable, attributable guide provider;
- the response exposes dated programme start and end times, channel identity, and enough metadata to distinguish channels;
- the timezone and date rollover are understood;
- pagination and date selection are understood;
- a captured fixture can be used for deterministic parser tests;
- the scraper fails closed and never overwrites the last known-good feed with an empty or malformed result.

Do not infer programme times from promotional pages, social posts, search snippets, or generic channel descriptions.

## Candidate source inventory

| Candidate | Guide/source | Initial status | Notes |
|---|---|---|---|
| SNRT portfolio | https://www.snrt.ma/fr/node/4019 | Discovery | Official portfolio confirms the broadcaster's channel family; this page is not itself a dated EPG. |
| Al Aoula | https://www.snrt.ma/fr/al-aoula | Discovery | Official channel page; a machine-readable dated schedule endpoint still needs to be identified and captured. |
| Canal212 Morocco TV guide | https://en.canal212.ma/programme-tv-maroc/ | Discovery / third-party guide | Lists Moroccan channels including SNRT services and 2M. Treat as an aggregator, not as the broadcaster's own feed. Verify its terms, timezone, and underlying schedule response before relying on it. |
| 2M | https://en.canal212.ma/television/2m/ | Discovery / third-party guide | Candidate channel-specific listing. Confirm whether a stable date-aware response exists. |
| Al Kass | https://alkasswebsite-origin.alkass.net/tvguide | Discovery | Public TV guide candidate for Qatar. Verify dated schedule coverage and exact channel names before implementation. |

## Morocco channel discovery targets

Initial channel names to investigate (not yet approved feed identities):

- Al Aoula
- 2M
- Arryadia
- Athaqafia
- Assadissa
- Al Maghribia
- Tamazight
- Laâyoune TV
- Medi1 TV

The list is a research checklist, not a statement that every channel currently has a publicly accessible EPG.

## Data contract

When a verified source is available, the adapter must emit the repository's `schemaVersion: 1` envelope. Keep broadcaster/source channel IDs separate from IPTV playlist IDs. Use IANA timezone `Africa/Casablanca` for Moroccan wall-clock listings and convert each programme instant to ISO-8601 UTC before aggregation. Preserve source URL, fetch timestamp, source event ID where available, and source channel label.

New rows must first land in `data/review/`. Do not add a Morocco step to `.github/workflows/refresh-provider-feeds.yml` until the scraper has fixture-based tests and has been exercised against the live source.

## Promotion checklist

1. Capture a real response from a permitted source, with secrets and personal data excluded.
2. Identify the actual schedule payload and date/channel query parameters.
3. Add parser fixtures representing multiple channels, midnight rollover, missing descriptions, and malformed rows.
4. Test stable IDs, UTC conversion, deduplication, positive durations, and empty-feed failure.
5. Run the repository test suite and aggregate in diagnostic mode.
6. Review channel mappings against the actual source labels and the playlist registry.
7. Only then add the scraper to the scheduled workflow and publish its feed.

## Current state

Research only. No Moroccan programme feed is published by this directory yet. This is deliberate: the currently identified SNRT page is a channel portfolio and the Canal212 pages are third-party guide pages; the live schedule payload and its stability have not yet been verified sufficiently for automated ingestion.

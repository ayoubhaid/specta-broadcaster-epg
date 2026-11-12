# United States EPG adapters

Imports US XMLTV guide outputs published by the iptv-org EPG project and normalizes them into Specta's schedule-v1 review schema.

## Sources

- tvtv.us: national US guide and optional state/local market guides.
- tvguide.com, gatotv.com, ontvtonight.com and directv.com: US national guide candidates.

Only channel IDs ending in \`.us\` are retained. Those IDs are preserved exactly as canonical iptv-org IDs; the scraper never guesses identity from display names.

## Run

\`\`\`sh
npm run scrape:usa
node providers/usa/scraper.mjs --source=tvtv.us --days=5
node providers/usa/scraper.mjs --source=tvtv.us --markets=us,us-ca,us-ny,us-tx --days=5
node providers/usa/scraper.mjs --source=tvtv.us --markets=all --days=5
node providers/usa/scraper.mjs --source=tvguide.com --days=5
\`\`\`

Outputs are written separately to \`data/review/usa_<source>_unclassified.json\`. The TVTV all-markets option requests the national guide and 50 state feeds. Non-T VTV sources use the national US feed only. Existing output is preserved if every request fails or no programmes are returned.

## Promotion requirements

These are upstream generated feeds, not direct broadcaster APIs. Keep them in review until live refreshes confirm availability, programme coverage and correct channel IDs, and source terms are checked for Specta's intended caching and redistribution. State/local feeds can be large; enable all markets only after checking workflow duration and repository size.

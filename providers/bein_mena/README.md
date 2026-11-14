# beIN SPORTS schedule adapter

Collects dated programme listings from the public beIN SPORTS TV guides. The same adapter produces separate feeds for MENA, France, US and Australia; each feed uses its own provider id so channel identities stay distinct.

Source guides:

- MENA: https://www.beinsports.com/en-mena/tv-guide
- France: https://www.beinsports.com/fr-fr/tv-guide
- US: https://www.beinsports.com/en-us/tv-guide
- Australia: https://www.beinsports.com/en-au/tv-guide

The adapter reads the guide's channel catalogue and requests programme rows for each channel/day. It writes the shared `schemaVersion: 1` schedule format. Source channel IDs remain separate from Specta channel IDs; the Specta registry maps only reviewed channel identities.

## Run

Requires Node.js 20+. No npm dependencies are required.

```sh
npm run check
EPG_DAYS=5 REQUEST_DELAY_MS=500 EPG_OUTPUT=../../data/source-feeds/bein_mena.json npm run scrape
```

Regional example:

```sh
BEIN_PROVIDER=bein_fr \
BEIN_PROVIDER_NAME="beIN SPORTS France" \
BEIN_REGION=fr-fr \
BEIN_SOURCE_URL=https://www.beinsports.com/fr-fr/tv-guide \
EPG_OUTPUT=../../data/source-feeds/bein_fr.json \
npm run scrape
```

Environment options:

- `EPG_DAYS`: number of UTC days to request (1–14, default 5).
- `BEIN_REGION`: guide region (default `en-mena`; supported values include `fr-fr`, `en-us`, `es-us`, `en-au`, `en-nz`, `en-hk`, `bein-xtra`).
- `BEIN_PROVIDER`: provider id written into the feed (default `bein_mena`).
- `BEIN_PROVIDER_NAME`: human-readable provider name.
- `BEIN_SOURCE_URL`: source guide URL written into the feed.
- `REQUEST_DELAY_MS`: delay between requests (100–5000 ms, default 300).
- `EPG_OUTPUT`: output JSON path.

Requests are sequential and time-limited. The previous output is preserved if no programme data is collected. Partial failures are reported in the generated coverage metadata and logs.

## Data and limitations

- Source channel IDs are guide identities, not playlist IDs.
- Programme start/end values are normalized to UTC.
- This is schedule metadata only; it does not provide streams.
- The guide endpoint is not a guaranteed public API contract and may change.
- Review beIN's current terms and usage policies before automated collection or redistribution. Keep request rates conservative.

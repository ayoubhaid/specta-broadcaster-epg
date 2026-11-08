# CANAL+ France adapter

`scraper.mjs` reads the official French [Programme TV](https://www.canalplus.com/live-tv/programme-tv/) page. Its server-rendered page state contains programme title, subtitle, channel label, and millisecond start/end timestamps. The adapter emits the shared `schemaVersion: 1` JSON envelope, UTC instants, and Europe/Paris source timezone.

This is the France guide. Do not treat it as CANAL+ Afrique or another regional feed. Channel identities are derived from official channel labels and remain unmapped until the Specta playlist registry is available. Output is staged under `data/review/`.

Run:

```sh
node providers/canalplus_fr/scraper.mjs data/review/canalplus_fr_unclassified.json
```

The guide provides current-day listings. Match programmes remain schedule entries and are not turned into a separate fixtures dataset.

# onTVnow UK sports adapter

This adapter downloads the public XMLTV export documented at
https://ontvnow.co.uk/data-access and requests the sports group feed.

The source documents public JSON/XMLTV feeds without an account or token,
a seven-day default window, and a 60-request-per-minute limit. Specta uses
one XMLTV request per refresh. The feed is normalized to schemaVersion 1
and written to data/review/ontvnow_uk_unclassified.json.

## Run

    python providers/ontvnow/scraper.py
    python -m unittest discover -s providers/ontvnow -p 'test_*.py'

Override the feed URL with ONTVNOW_XMLTV_URL or --url for an authorized URL.

## Publication

All returned channel IDs remain unclassified. Review each exact channel
edition and add an explicit mapping to data/mapping/channel-map.csv before
it can appear in Specta's app-facing XMLTV. The adapter retains source
channel IDs, source URL, categories and programme provenance. It does not
infer playlist identity from channel names.

Times are converted from XMLTV offsets to UTC instants. The feed supplies
programme metadata only; no video, stream URL, account session or
subscription content is accessed.

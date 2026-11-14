# onTVnow UK listings adapter

This adapter downloads the public XMLTV export documented at
https://ontvnow.co.uk/data-access and requests the unfiltered UK listings feed, rather than the sports-only group.

The source documents public JSON/XMLTV feeds without an account or token,
with a seven-day default window, optional filters for terrestrial, entertainment
and sport groups, and a 60-request-per-minute limit. Specta uses one unfiltered
XMLTV request per refresh so the review feed can include linear TV channels
outside the sports group.

The adapter writes two outputs:
- `data/review/ontvnow_uk_summary.json`: compact, committed inventory with source channel IDs, names and per-channel programme counts.
- `data/review/ontvnow_uk_unclassified.json`: full programme-level review feed, retained as a seven-day GitHub Actions artifact rather than committed to Git history.

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

## First live refresh result

The earlier sports-only request returned two radio services (BBC Radio 5 Sports Xtra and talkSPORT) with 85 programme rows. The adapter now requests the complete public listings export. The compact inventory is the durable review surface; the full schedule payload is available as a short-lived workflow artifact. Keep radio, temporary/event, ambiguous and non-linear services unclassified. Only verified permanent TV channels may be mapped into Specta.

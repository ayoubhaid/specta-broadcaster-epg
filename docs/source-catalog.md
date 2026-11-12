# EPG source catalogue

This catalogue records the upstream programme-guide sources reviewed for Specta. A source listed here is a discovery candidate, not automatically approved for production. A provider must pass channel-identity, schedule freshness, timezone, duplicate, reliability, and reuse-rights checks before its data is merged into `docs/epg.xml`.

## Existing first-party adapters

| Source | Coverage / role | Current repository status |
|---|---|---|
| [SNRT programme guide](https://www.snrt.ma/) | Moroccan public broadcaster | Integrated: `providers/snrt_ma/` |
| [beIN SPORTS MENA TV guide](https://www.beinsports.com/en-mena/tv-guide) | MENA beIN linear channels | Integrated: `providers/bein_mena/` |
| [SuperSport TV guide](https://supersport.com/tv-guide) and [Media Schedules](https://wsd.supersport.com/media/ms_schedule.asp) | SuperSport schedules | Captured in review; channel classification/mapping still required |
| [Sky Sports schedule](https://www.skysports.com/watch/sport-on-sky) | UK Sky Sports linear channels | Integrated as review feed: `providers/sky/` |
| [CANAL+ France programme guide](https://www.canalplus.com/live-tv/programme-tv/) | France-only CANAL+ guide | Integrated as review feed: `providers/canalplus_fr/` |

## iptv-org/epg source network

The [iptv-org/epg source index](https://github.com/iptv-org/epg/blob/master/SITES.md) is a catalogue of site-specific grabbers. Its `sites/` directory contains the channel IDs and scraper configurations; it is not one universal XMLTV feed. The project can generate XMLTV with its own grabber (see [README](https://github.com/iptv-org/epg#usage)).

The companion [iptv-org API guides index](https://iptv-org.github.io/api/guides.json) exposes each guide's channel/feed identity, source site, site-specific channel ID, language, and source URLs. [channels.json](https://iptv-org.github.io/api/channels.json) provides canonical channel metadata. These JSON files are discovery/metadata indexes; programme schedules must still be obtained from the listed source or grabber.

### Relevant site adapters discovered

| Upstream site | Relevant coverage | Upstream channel-list / guide reference | Specta assessment |
|---|---|---|---|
| `beinsports.com` | MENA Arabic and English, plus other regions | [MENA English channel list](https://github.com/iptv-org/epg/blob/master/sites/beinsports.com/beinsports.com_mena-en.channels.xml) · [site guide](https://github.com/iptv-org/epg/tree/master/sites/beinsports.com) | Strong cross-check / possible fallback against the existing beIN MENA adapter. Avoid double-counting the same schedules. |
| `bein.com` | Separate beIN guide implementation with Arabic and English channel lists | [site directory](https://github.com/iptv-org/epg/tree/master/sites/bein.com) | Candidate for additional channel discovery; validate region and schedule overlap before ingestion. |
| `dstv.com` | Multi-country African pay-TV guides | [site guide and country list](https://github.com/iptv-org/epg/tree/master/sites/dstv.com) | High-priority review candidate for African channels and SuperSport cross-checks. Do not assume every country's lineup applies to Morocco. |
| `canalplus.com` | Country-specific CANAL+ guides, including African market lists | [Burkina Faso channel list](https://github.com/iptv-org/epg/blob/master/sites/canalplus.com/canalplus.com_bf.channels.xml) · [site directory](https://github.com/iptv-org/epg/tree/master/sites/canalplus.com) | Candidate to extend beyond the existing France-only adapter. Each market must remain separately identified. |
| `snrt.ma` | Morocco / SNRT | [channel list](https://github.com/iptv-org/epg/blob/master/sites/snrt.ma/snrt.ma.channels.xml) | Already covered by the first-party SNRT adapter; use only as a validation comparison. |
| `epgshare01.online` | Aggregated channel lists, including a BEIN-labelled list | [BEIN list](https://github.com/iptv-org/epg/blob/master/sites/epgshare01.online/epgshare01.online_BEIN1.channels.xml) · [site directory](https://github.com/iptv-org/epg/tree/master/sites/epgshare01.online) | Secondary discovery candidate only. Channel labels are inconsistent and source provenance/rights need checking; never trust its IDs as canonical. |
| `sky.com` | Multiple Sky markets (the upstream list includes German services) | [site channel list](https://github.com/iptv-org/epg/blob/master/sites/sky.com/sky.com.channels.xml) | Not a replacement for the existing UK Sky Sports adapter; check country before considering any records. |

### Running the upstream grabber

The upstream project documents:

```sh
git clone --depth 1 -b master https://github.com/iptv-org/epg.git
cd epg
npm install
npm run grab --- --channels=sites/beinsports.com/beinsports.com_mena-en.channels.xml
```

Use the relevant channel-list file for each market. Keep each market in a separate output file during evaluation so that channel IDs and timezones are not accidentally mixed. The upstream project supports `--output`, `--days`, `--lang`, `--maxConnections`, and `--gzip`.

## EPGTalk

[EPGTalk](https://github.com/acidjesuz/EPGTalk) publishes combined, US, UK, Latino/Mexico, US-local, sports, and free-TV XMLTV guides. Its README identifies **ESPN** and **TVmaze** as third-party data sources (TVmaze episode metadata is marked CC BY-SA).

Published feed endpoints are documented in the [EPGTalk README](https://github.com/acidjesuz/EPGTalk#-your-epg-urls), and its [status report](https://github.com/acidjesuz/EPGTalk/blob/master/STATUS.md) reports current guide coverage. These feeds are primarily US/UK/Mexico-oriented and are not a direct source for the existing MENA/Morocco provider feeds.

**Reuse restriction:** EPGTalk's README says personal use is free, but commercial/ad-supported redistribution or bundling its guide requires written permission; it also asks developers to credit EPGTalk and its third-party sources and limit fetches. Therefore EPGTalk is recorded here for source research only. Its XMLTV files are **not** copied into this repository, downloaded by the scheduled workflow, or merged into Specta's published guide. Obtain written permission before any product integration.

## Source onboarding checklist

Before activating a discovered source:

1. Confirm that it provides actual dated programme rows, not only channel metadata, sports fixtures, or event calendars.
2. Record the source URL, fetch timestamp, source channel ID, language, market, and source timezone.
3. Match channels by exact identity and country/market; keep ambiguous and temporary/event-only services out of the published guide.
4. Compare overlapping programme windows against the existing broadcaster feed and measure missing rows, stale rows, duplicates, and title conflicts.
5. Confirm the source's terms permit the intended collection, caching, and redistribution.
6. Add automated tests and conservative request limits before enabling scheduled refresh.

## Important distinction

The iptv-org `GUIDES.md` file is a directory of community-hosted guide servers, not the same thing as the `sites/` grabber catalogue. Its current listing reports no active guide server, so Specta should use the site-specific grabbers/API source metadata rather than treating that page as a live XMLTV endpoint.

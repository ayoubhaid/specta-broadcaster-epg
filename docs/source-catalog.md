# EPG source catalogue — English-speaking markets

**Current research scope:** English-speaking countries only. Prioritise the United States, United Kingdom, Canada, Australia, New Zealand, Ireland, and English-language African markets such as South Africa, Nigeria, Ghana, Kenya, Uganda, Zambia, Zimbabwe, Botswana, and Namibia where a provider publishes a usable English-language guide.

Do not add French-, Arabic-, or Spanish-language market feeds in this phase. A multilingual provider may still be considered, but only its English-language market/edition should be evaluated. Country, language, and provider region must be stored separately; an English-language feed does not automatically mean it belongs to an English-speaking country.

Existing non-scope adapters are documented for repository history and are not part of new source discovery in this phase. Do not remove or silently disable them.

## Existing repository adapters

| Source | Current coverage | Status / scope note |
|---|---|---|
| [SNRT](https://www.snrt.ma/) | Morocco | Existing adapter; outside this phase's English-speaking-market expansion scope |
| [beIN SPORTS MENA](https://www.beinsports.com/en-mena/tv-guide) | MENA, English-language edition | Existing adapter; retain as-is, but do not expand MENA coverage in this phase |
| [SuperSport](https://supersport.com/tv-guide) and [Media Schedules](https://wsd.supersport.com/media/ms_schedule.asp) | Primarily South African sports broadcaster | In review; South Africa is in scope, but only verified linear channels and English listings should be considered |
| [Sky Sports UK](https://www.skysports.com/watch/sport-on-sky) | United Kingdom | Existing review feed; in scope |
| [CANAL+ France](https://www.canalplus.com/live-tv/programme-tv/) | France | Existing review feed; outside this phase's English-speaking-market expansion scope |

## Priority upstream: iptv-org/epg

The [iptv-org/epg source index](https://github.com/iptv-org/epg/blob/master/SITES.md) lists site-specific scrapers and their supported channel markets. It is not a single universal XMLTV feed. Its [grabber](https://github.com/iptv-org/epg#usage) can produce XMLTV for selected channel-list files.

The companion [iptv-org API guides index](https://iptv-org.github.io/api/guides.json) identifies guide source sites, market-specific source IDs, language, and source URLs. [channels.json](https://iptv-org.github.io/api/channels.json) provides canonical channel metadata. These API files are discovery metadata, not programme schedules.

### Candidate site adapters for English-speaking countries

| Upstream provider/site | English-speaking markets to investigate | Reference | Priority / notes |
|---|---|---|---|
| `sky.com` | UK (verify the UK edition only) | [site directory](https://github.com/iptv-org/epg/tree/master/sites/sky.com) | High for UK channel coverage. The site also contains non-UK records; filter by market and language. Do not mix German or other country listings into the UK feed. |
| `freeview.co.uk` | United Kingdom | [site directory](https://github.com/iptv-org/epg/tree/master/sites/freeview.co.uk) | High: active upstream scraper and a substantial channel catalogue; evaluate the UK-only channel list and confirm the current XMLTV output. |
| `tvpassport.com` | United States and Canada (market-by-market verification required) | [site directory](https://github.com/iptv-org/epg/tree/master/sites/tvpassport.com) | High: large listing catalogue; inspect local market coverage and provider terms before use. |
| `tvtv.us` | United States national and state/local markets | [site directory](https://github.com/iptv-org/epg/tree/master/sites/tvtv.us) | Adapter added at `providers/usa/`; supports national and all 50 state guide endpoints. Review-only pending live refresh validation. |
| `tvguide.com`, `gatotv.com`, `ontvtonight.com`, `directv.com` | United States | [iptv-org US guide outputs](https://iptv-org.github.io/epg/guides/us/) | Adapter added at `providers/usa/`; each source is isolated in its own review feed. Empty or non-US IDs are filtered. Review-only pending live validation and terms review. |
| `directv.com` | United States | [site directory](https://github.com/iptv-org/epg/tree/master/sites/directv.com) | High: US provider guide. |
| `dstv.com` | English-language African markets, especially South Africa, Nigeria, Ghana, Kenya, Uganda, Zambia, Zimbabwe, Botswana and Namibia where available | [site guide and market list](https://github.com/iptv-org/epg/tree/master/sites/dstv.com) | High: evaluate only the relevant country-specific channel lists; exclude French- or Portuguese-language markets and don't infer country from channel branding. |
| `beinsports.com` | Australia, New Zealand, UK/US only where the source has a matching English market edition | [site guide](https://github.com/iptv-org/epg/tree/master/sites/beinsports.com) | Medium: market-specific sports channel guide. Do not use MENA feeds as a substitute for local-country schedules. |
| `foxsports.com.au` | Australia | [site directory](https://github.com/iptv-org/epg/tree/master/sites/foxsports.com.au) | Medium: narrow sports schedule candidate; verify it represents linear channels rather than event-only listings. |
| `sky.co.nz` | New Zealand | [site directory](https://github.com/iptv-org/epg/tree/master/sites/sky.co.nz) | Medium: investigate NZ channel schedules and service IDs. |
| `epgshare01.online` | Only explicitly English-market channel lists (US/UK/CA/AU/NZ or English African markets) | [site directory](https://github.com/iptv-org/epg/tree/master/sites/epgshare01.online) | Secondary candidate. Aggregated labels and provenance need validation; do not trust IDs as canonical. |
| `snrt.ma` | Morocco | [channel list](https://github.com/iptv-org/epg/blob/master/sites/snrt.ma/snrt.ma.channels.xml) | Out of scope for this phase. |
| `canalplus.com` | France and Francophone African markets | [site directory](https://github.com/iptv-org/epg/tree/master/sites/canalplus.com) | Out of scope unless a distinct English-language country edition is verified. |

### Running the iptv-org grabber

Example using the MENA English edition only as a command illustration; for this phase, choose a channel-list file for an in-scope English-speaking country/market:

```sh
git clone --depth 1 -b master https://github.com/iptv-org/epg.git
cd epg
npm install
npm run grab --- --channels=sites/<site>/<market-specific-channels-file>.xml
```

Keep each country/market in its own output during evaluation. Record country, language, source timezone, site ID, XMLTV ID, fetch time, and source URL. The grabber supports `--output`, `--days`, `--lang`, `--maxConnections`, and `--gzip`.

## USA adapter implementation status

The repository now includes `providers/usa/scraper.mjs`, a shared XMLTV parser and five US source configurations: TVTV, TV Guide, Gato TV, On TV Tonight and DIRECTV. TVTV supports the national guide and individual state markets (`us-ca`, `us-ny`, etc.), including an opt-in all-50-states mode. It accepts only channel IDs ending in `.us`, preserves those exact IDs as canonical mappings, parses XMLTV timezone offsets, deduplicates overlapping programmes, and writes one review JSON per source.\n\nRun `npm run scrape:usa` for national source candidates, or `node providers/usa/scraper.mjs --source=tvtv.us --markets=all --days=5` for the national guide plus all state markets. The scraper is deliberately not part of the six-hour production refresh workflow yet: live endpoint checks, source terms, and channel coverage must be confirmed before publishing US data to the app-facing guide.\n\n
## Additional English-market candidates

| Upstream provider/site | Market | Reference | Priority / notes |
|---|---|---|---|
| `abc.net.au` | Australia | [site directory](https://github.com/iptv-org/epg/tree/master/sites/abc.net.au) | High research priority: regional channel-list variants exist (Adelaide, Brisbane, Canberra, Darwin, Gold Coast, Hobart, Melbourne and others). Keep each region separate and verify programme rows and IDs before counting coverage. |
| `entertainment.ie` | Ireland | [site directory](https://github.com/iptv-org/epg/tree/master/sites/entertainment.ie) | High research priority: Ireland-focused listings; inspect the channel list for Irish services versus imported UK channels and validate local timezone handling. |

These are **new candidates, not yet repository adapters or confirmed live feeds**. Do not add their channel counts to Specta's confirmed inventory until a generated XMLTV feed is fetched, checked for current programme rows, and mapped.

## EPGTalk — English-market candidates only

[EPGTalk](https://github.com/acidjesuz/EPGTalk) publishes US, UK, combined US/UK/Mexico, US-local, sports, Latino/Mexico, and free-TV guides. For this phase, investigate only the **US**, **UK**, **US Local**, and any clearly English-market **Sports** listings. Do not ingest the Latino/Mexico feed as part of this English-speaking-country scope.

- [US guide](https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/US_guide.xml.gz)
- [UK guide](https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/UK_guide.xml.gz)
- [US local guide](https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/US_local_guide.xml.gz)
- [Sports guide](https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/Sports_guide.xml.gz)

Its README identifies ESPN and TVmaze as third-party data sources (TVmaze episode metadata is marked CC BY-SA). See the [README](https://github.com/acidjesuz/EPGTalk#-your-epg-urls) and [status report](https://github.com/acidjesuz/EPGTalk/blob/master/STATUS.md) for feed details.

**Reuse restriction:** EPGTalk says personal use is free, but commercial/ad-supported redistribution or bundling its guide requires written permission. It also asks developers to credit EPGTalk and third-party sources and limit fetching. Therefore these feeds are research candidates only: they are not copied, automatically downloaded, or merged into Specta. Obtain written permission before product integration.

## Scope rules for new sources

1. Include only countries in the English-speaking-market scope above, and only the relevant country edition.
2. Prefer English-language schedules. Keep language metadata explicit for multilingual countries.
3. Do not treat English-language MENA or global feeds as proof of local-country coverage.
4. Confirm the source contains dated linear-channel programmes, not only fixtures, event calendars, VOD metadata, or channel metadata.
5. Record source URL, fetch timestamp, country, language, timezone, provider site ID, and XMLTV ID.
6. Match channels by exact identity and country. Hold ambiguous, temporary, and event-only services for review.
7. Compare overlapping programme windows with existing feeds; measure freshness, missing rows, duplicates, and title conflicts.
8. Confirm the source terms allow the intended collection, caching, and redistribution before automation.
9. Add tests and conservative request limits before enabling scheduled refresh.

## Important distinction

The iptv-org `GUIDES.md` file is a directory of community-hosted guide servers, not the `sites/` grabber catalogue. Use the site-specific grabbers and API source metadata to discover programme-guide sources; do not treat the directory as a live XMLTV endpoint.

# Specta EPG source catalogue

## Scope

Specta's sports-channel inventory contains 15 broadcaster families. A family may represent multiple countries, channel editions, and linear/OTT variants. A source is approved only when it returns dated programme records for the exact channel edition, not merely fixtures, match broadcast announcements, channel lineups or VOD metadata.

**Current rule:** an unverified family remains a research target. It is not represented as covered in the production feed.

## Existing verified adapters

| Broadcaster | Market / edition | Source | What is verified | Status |
|---|---|---|---|---|
| beIN SPORTS | MENA English | [Official beIN TV guide](https://www.beinsports.com/en-mena/tv-guide) | Dated programme rows associated with beIN channel IDs; current adapter uses the guide's channel and programme endpoints | Existing adapter; source contract and terms require periodic revalidation |
| SuperSport | South Africa / regional | [Media Schedules](https://wsd.supersport.com/media/ms_schedule.asp) | Dated schedule rows include programme title, start/end and source channel code | Existing adapter; publish only explicitly approved linear channels |
| Sky Sports | United Kingdom | [Sky Sports schedule](https://www.skysports.com/watch/sport-on-sky) | Dated schedule response for four identified linear channels | Existing adapter; four channels mapped |
| SNRT | Morocco | [SNRT](https://www.snrt.ma/) | Official dated programme grid | Existing adapter; separate general broadcaster feed |
| CANAL+ | France | [Programme TV](https://www.canalplus.com/live-tv/programme-tv/) | Dated channel programme objects in the France guide | Existing adapter; France-only, not CANAL+ Afrique |

## The 15 sports broadcaster families

| Family | Exact market/edition targets in inventory | Candidate first-party guide | Independent guide candidates | Current decision |
|---|---|---|---|---|
| DAZN | UK, Canada, Belgium, Germany, Spain, Italy, Portugal and other listed editions | DAZN help / channel guide varies by territory; no stable public linear schedule endpoint verified | TV Guide market listings; local platform guides | Research only; distinguish DAZN app events from linear channels |
| ESPN | US, Australia, New Zealand, South Africa, Latin America and other listed editions | [ESPN TV listings](https://www.espn.com/watch/schedule/_/type/upcoming) | TV Guide US; StarTimes where the actual ESPN edition is carried | Research only; US listings cannot be assigned to other editions |
| Eurosport | UK, France, Germany and other European editions | [Eurosport TV guide](https://www.eurosport.com/tvschedule.shtml) | Local operator TV guides | Research only; market and language must match |
| Fox Sports | US, Australia, Latin America and other listed editions | [FOX Sports TV schedule](https://www.foxsports.com/live) | TV Guide US; local operator guides | Research only; live-event pages alone are insufficient |
| Fubo Sports | US | [Fubo channel guide](https://www.fubo.tv/welcome/channels) | TV Guide US / local listings | Research only; verify actual dated programme grid rather than lineup |
| Golf Channel | US and listed international editions | [Golf Channel schedule](https://www.golfchannel.com/schedule) | TV Guide US | Research only; channel schedule must be separated from tournament tee times |
| Premier Sports | UK, Ireland, Hong Kong, Singapore, Malaysia and Philippines variants | [Premier Sports UK](https://www.premiersports.com/) | TV Guide UK; local operator guides | Research only; the UK guide cannot cover Hong Kong or Asian feeds |
| Sky Sports | UK, New Zealand, Australia and other playlist variants | [Sky Sports UK schedule](https://www.skysports.com/watch/sport-on-sky); [Sky NZ](https://www.sky.co.nz/) | TV Guide UK; local operator guides | UK adapter exists; other markets require their own validation |
| Sportsnet | Canada | [Sportsnet TV listings](https://www.sportsnet.ca/tv-listings/) | TV Guide Canada; TV Passport Canada | Research only; verify channel-level listings and Canadian timezone |
| SuperSport | South Africa and African regional editions | [SuperSport Media Schedules](https://wsd.supersport.com/media/ms_schedule.asp) | StarTimes and local operator guides where matching channel editions exist | Existing adapter; only mapped permanent channels publish |
| Tennis Channel | US | [Tennis Channel schedule](https://www.tennischannel.com/schedule) | TV Guide US | Research only; do not use tournament order-of-play as channel EPG |
| TNT Sports | UK and Latin American variants | [TNT Sports UK](https://www.tntsports.co.uk/tv-guide.shtml) | TV Guide UK; local guides | Research only; UK and Latin America are separate services |
| TSN | Canada | [TSN schedule](https://www.tsn.ca/tv-schedule) | TV Guide Canada; TV Passport Canada | Research only; channel feeds and regional timezones need matching |
| Viaplay | UK, Nordics and Netherlands variants | [Viaplay](https://viaplay.com/) | Local operator guides; TV listings providers | Research only; app event catalogue is not proof of linear schedule coverage |
| beIN SPORTS | MENA, Australia, US and other listed editions | [beIN MENA TV guide](https://www.beinsports.com/en-mena/tv-guide) | TV Guide market listings; local operator guides | MENA adapter exists; other country editions need separate feeds |

*Candidate links identify places to investigate; they are not claims that a stable, permitted scraping endpoint exists. Before implementation, inspect the actual page/API response and confirm dated channel programme rows for the precise playlist channel.*

## Independent source candidates

| Candidate | Potential markets | Useful evidence required before integration | Status |
|---|---|---|---|
| [TV Guide](https://www.tvguide.com/listings/) | US | Dated channel schedule, stable channel identity, pagination/timezone behavior and acceptable collection terms | Candidate only; no automated ingestion until rights are confirmed |
| [TV Passport](https://www.tvpassport.com/) | US and Canada | Dated channel listings are visible, but its terms prohibit scraping, extraction, caching, republishing and redistribution | Blocked without prior written permission |
| [On TV Tonight](https://www.ontvtonight.com/) | UK, Canada and Australia listings | Its legal notice limits programme listings to personal viewing/printing and prohibits copying, republishing, distribution and exploitation | Blocked without a separate written licence |
| [onTVnow data feeds](https://ontvnow.co.uk/data-access) | UK | Public JSON/XMLTV export; sports-group filter; seven-day default window | Adapter runs; first live refresh returned two radio services and 85 programmes, not target TV channels. Keep unclassified and out of TV coverage |
| [StarTimes TV Guide](https://www.official.startimestv.com/tv_guide) | African markets where the relevant broadcaster is carried | Exact channel edition, dated programme rows, local timezone and access terms | Candidate only; no automated ingestion until rights are confirmed |
| [TV Guide API](https://tvguideapi.com/data) | Broad international coverage claimed by provider | API terms permit display in apps but restrict bulk republishing/rebuilding a listings database and competing-product use | Not approved for Specta's feed without a separate agreement |

onTVnow now has an adapter for its documented public XMLTV sports export. The first live refresh returned BBC Radio 5 Sports Xtra and talkSPORT (85 programme rows), not TV channels. The feed is retained for review only and must not be counted as Specta TV coverage. Other independent candidates remain research-only until their page structures, schedule completeness, authorization and repeatable refresh behavior are verified. A provider's channel lineup, schedule landing page, sports event calendar or fixtures API is not sufficient evidence by itself.

## Adapter acceptance checklist

1. Confirm exact country, language and channel edition against the playlist record.
2. Fetch at least one real dated programme response for each proposed channel.
3. Verify each row has title, start, end and a stable source channel identity.
4. Determine timezone and daylight-saving behavior from source data, not from a guessed country.
5. Confirm whether the channel is permanent linear, OTT, temporary/event-only or VOD.
6. Review access restrictions, terms, rate limits, caching and redistribution permissions.
7. Build a parser fixture from a representative response and test empty, malformed and partial responses.
8. Compare overlapping schedules against an independent source when possible.
9. Add an explicit source-channel-to-Specta-ID row in `data/mapping/channel-map.csv`.
10. Enable scheduled refresh only after the source and mapping pass review.

## Identity and publication policy

- Specta IDs use the `specta.<provider>.<channel-slug>` namespace.
- `playlist_aliases` retains existing playlist `tvg-id` values for compatibility.
- A source channel without a reviewed mapping is held back.
- No fuzzy name resolution, country guessing or upstream channel registry lookup is allowed.
- One Specta channel may have several reviewed source adapters only when they refer to the same actual channel edition.
- Independent schedules are merged only after identity verification.
- Fixture/event data can enrich a programme record in a separate sports layer; it cannot create EPG programme records.

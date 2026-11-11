# UK / USA sports EPG source verification — 2026-11-11

## Purpose and acceptance rule

This audit supports expansion of Specta's broadcaster EPG beyond the currently integrated providers. It distinguishes official schedule pages from reusable programme-data feeds. A guide is not integration-ready until a reproducible source response provides channel identity, programme title, explicit start and end timestamps, timezone semantics, stable record identity, and enough date coverage for refresh automation.

Only verified records should be normalized. Do not synthesize programme ends from the next event, infer a linear channel from an event page, or promote unresolved channel mappings into the app-facing XMLTV.

## Confirmed official pages and current assessment

| Market | Broadcaster | Official source | What the public page establishes | Status |
|---|---|---|---|---|
| UK | Sky Sports | https://www.skysports.com/watch/tv-guide | Official Sky Watch page exposes channel-labelled "On Now" programming. The repo already has a tested adapter for Sky's schedule endpoint, but the current configured service list contains only four IDs. | Existing adapter; expand only after verifying additional service IDs against the UK playlist. |
| UK | TNT Sports | https://www.tntsports.co.uk/watch/schedule.shtml | Official dated schedule page exists. Its public rendering is sports/event-oriented and may include international listings; it does not yet prove a complete UK linear EPG with channel IDs and explicit intervals. | Research only; no adapter. |
| UK | Premier Sports | https://www.premiersports.com/gb/welcome-ios | Official UK page shows upcoming events and service/platform access. Event cards do not establish complete channel-by-channel programme intervals. | Research only; no adapter. |
| UK | Eurosport | https://www.eurosport.co.uk/watch/schedule.shtml | Official locale-specific schedule is a potential source. Publicly visible event listings are not sufficient evidence of a complete UK linear-channel feed. | Research only; verify UK territory and underlying data contract. |
| USA | ESPN | https://espnpressroom.com/espn-schedules/ ; https://support.espn.com/hc/en-us/articles/360039139552-Television-Listings-for-ESPN-Networks-and-sports-on-ABC | ESPN's official schedule browser supports browsing by date/network; ESPN Support says its online television listings cover ESPN networks and sports on ABC for roughly two weeks. Retrieved page content did not establish a reusable endpoint contract. | Source confirmed; adapter blocked pending interval-data verification. |
| USA | FOX Sports | https://www.foxsports.com/presspass/latest-news/weekly-schedule | Official weekly programming information exists, but a weekly press schedule is not automatically a complete channel EPG. | Research only; no adapter. |
| USA | Tennis Channel | https://www.tennischannel.com/en-us/page/schedule | Official schedule page is discoverable, but much of the public experience emphasizes live/upcoming tournaments and streaming content. Full linear-channel interval coverage and stable source IDs remain unverified. | Research only; no adapter. |
| USA | Golf Channel | https://www.golfchannel.com/watch/on-air-schedule | Official on-air schedule shows programme titles, channel labels and start times. The retrieved public schedule does not consistently expose explicit end times or a validated reusable feed. | Research only; no adapter. |
| USA | DAZN | https://www.dazn.com/ | Market-specific event schedules may differ from linear-channel grids. No reusable USA channel EPG contract verified in this pass. | Research only; no adapter. |
| USA | Fubo | https://www.fubo.tv/ ; https://support.fubo.tv/hc/en-ca/articles/22283884491277-How-do-I-use-the-Fubo-channel-guide | Official guide is an in-product personalized channel guide and may require authentication. Do not scrape private account data or assume public access. | No public feed verified. |
| USA / market-specific | beIN SPORTS | https://www.bein.com/en/tv-guide/ | Guide has a territory selector; the MENA feed already in this repo must not be treated as a USA feed. | Separate market verification required. |

## Key source findings

- Sky's public Watch page labels content by channel, and the repository's Sky adapter already uses the schedule endpoint `https://awk.epgsky.com/hawk/linear/schedule/YYYYMMDD/<service-ids>`. The current `providers/sky/channels.json` lists service IDs `1301`, `1302`, `1303`, and `4091` only. Do not guess additional IDs; capture them from verified channel inventory or observed official responses.
- TNT Sports' public guide can show dated schedules, but this audit has not established that every listing belongs to the UK linear TNT Sports 1–4 channels. Event listings must not be assigned to those channels by assumption.
- Premier Sports' official UK page lists event cards and channel/platform access. This is useful for research but insufficient as an app-facing linear EPG.
- ESPN's official press-room schedule browser is authoritative as a schedule destination, but its data contract remains unverified. ESPN scoreboard/event APIs are not substitutes for a linear TV schedule.
- Golf Channel's official on-air schedule is closer to a linear programme guide than event-only pages, but explicit end timestamps and a stable machine-readable response were not established. Do not invent ends from neighbouring start times.
- Tennis Channel's public schedule experience contains tournaments, replays and streaming feeds. It must be distinguished from a schedule for its linear Tennis Channel and TennisChannel 2 networks.

## Next engineering steps

1. Expand Sky's service inventory only from verified UK channel IDs and test each ID against a fresh official schedule response.
2. Inspect the underlying page data for TNT Sports, Premier Sports, ESPN, FOX Sports, Tennis Channel and Golf Channel. Record exact request URL, required non-secret headers, response schema, timezone, pagination and date range.
3. Save a real, redacted response fixture before implementing an adapter. Add fail-closed parser tests for missing channel IDs, missing titles, malformed timestamps and missing end times.
4. Write new output to `data/review/<provider>_unclassified.json` until the source's market, linear/event classification and exact playlist-channel mapping are reviewed.
5. Integrate a provider into `.github/workflows/refresh-provider-feeds.yml` only after live retrieval and fixture tests pass. Never publish an unverified adapter merely to increase provider count.

## Evidence references

- Sky official Watch page: https://www.skysports.com/watch/tv-guide
- TNT Sports official schedule: https://www.tntsports.co.uk/watch/schedule.shtml
- Premier Sports official UK page: https://www.premiersports.com/gb/welcome-ios
- ESPN Press Room schedules: https://espnpressroom.com/espn-schedules/
- ESPN Support television listings: https://support.espn.com/hc/en-us/articles/360039139552-Television-Listings-for-ESPN-Networks-and-sports-on-ABC
- FOX Sports Press Pass: https://www.foxsports.com/presspass/latest-news/weekly-schedule
- Tennis Channel schedule: https://www.tennischannel.com/en-us/page/schedule
- Golf Channel on-air schedule: https://www.golfchannel.com/watch/on-air-schedule


## Verification update — 2026-11-11

The official Sky channel-list page confirms UK service names and platform channel numbers, including Sky Sports Main Event, Premier League, Football, Cricket, Golf, F1, Tennis, News, Racing, Mix and Sky Sports+. These platform numbers are not the same thing as the service IDs consumed by the Sky schedule endpoint. They must not be copied into `providers/sky/channels.json` as if they were API IDs. Source: https://www.sky.com/help/articles/tv-channel-list-sky-glass

The official Golf Channel on-air schedule displays dated programme names, channel labels and start times, for example on the current schedule page. The public rendering reviewed here does not establish explicit programme end timestamps or a stable machine-readable endpoint. Source: https://www.golfchannel.com/watch/on-air-schedule

The official TNT Sports schedule page exposes a date selector, but the visible schedule output alone does not establish a UK-specific linear grid with explicit start/end timestamps and stable IDs. Source: https://www.tntsports.co.uk/watch/schedule.shtml

ESPN Support confirms its official online listings cover ESPN networks and sports on ABC for about two weeks. This confirms the schedule's authority and coverage window, but not an accessible reusable data contract. Source: https://support.espn.com/hc/en-us/articles/360039139552-Television-Listings-for-ESPN-Networks-and-sports-on-ABC

### Execution status

The existing scheduled refresh workflow's last inspected run successfully refreshed the current Sky Sports UK review feed. The same overall run later failed at Sport TV Portugal because that source returned no dated programmes, so the downstream aggregation step did not run in that attempt. This is an existing workflow reliability blocker, separate from the UK/USA source audit; do not treat the run as an overall green validation.

### Outcome

No new UK/USA adapter has been added in this pass because the sources inspected above do not yet provide a verified, reproducible contract with explicit start/end intervals and stable channel identities. This is deliberate fail-closed behavior, not a completed broadcaster integration. The next valid step is to capture the actual official guide network response in an environment that can access it, then build and test against a redacted real fixture.


## Additional source-contract check — 2026-11-11

Two third-party guide APIs surfaced during follow-up research, but neither should be presented as an official broadcaster feed:

- TV Schedule API documents stable channel IDs, UTC start/stop times, and XMLTV endpoints. Its published terms state that showing data in an app is allowed but republishing the data itself as a feed or API is not. It is therefore not a suitable source for committing a redistributable generated guide into this repository without separate written permission. Documentation: https://tvschedule.org/documentation and https://tvschedule.org/documentation/listings
- EPGTalk publishes public JSON guides, including US/UK/sports endpoints, with start/stop timestamps. It is a third-party aggregated guide rather than an official broadcaster source. Its licensing/redistribution basis and exact playlist channel identity still need confirmation before any production ingestion.

These services may help with research or comparison, but they do not remove the requirement to validate rights, market/territory, stable channel identity, and source timestamps. Do not copy their records into the published XMLTV merely because the endpoint is accessible.

## Workflow reliability follow-up

The Sport TV Portugal scraper is a review-only feed and does not supply the app-facing XMLTV aggregation. Its upstream currently returned no dated programmes in the inspected scheduled run, causing the combined workflow to stop before the validated-feed aggregation step. The workflow change on branch `fix/review-feed-failure-isolation` marks that one review-only step as non-blocking: its failure remains visible in Actions, but does not prevent XMLTV aggregation from running. This does not fix the Sport TV source itself or make its stale review output current.

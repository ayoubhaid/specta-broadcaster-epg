# Official EPG / TV-guide source audit

Scope: the 15 broadcaster families identified in the UK- and USA-labelled groups of the Specta sports playlist inventory. This file records first-party sources only; third-party listings are not accepted as authoritative EPG input. A public guide page is not automatically a reusable feed/API, and a guide is not considered integrated until its adapter is tested, emits explicit programme start/end times, and its channel identities are matched to the playlist.

## Source register

| Broadcaster family | Official guide / schedule | Repo state | Integration notes |
|---|---|---|---|
| Sky Sports (UK) | https://www.skysports.com/watch/tv-guide | Adapter: `providers/sky/scraper.mjs`; output currently review-only at `data/review/sky_uk_unclassified.json` | Official dated schedule adapter exists. Match source service IDs to the correct UK playlist channels before promoting. |
| ESPN (USA) | https://www.espn.com/watch/schedule/_/type/upcoming ; schedule directory: https://espnpressroom.com/espn-schedules/ | Research / not yet integrated in this repo | ESPN says its online listings cover about two weeks. The guide covers ESPN networks and sports on ABC, but regional ESPN playlist variants need separate identity checks. |
| DAZN | https://www.dazn.com/ | Research / not yet integrated | DAZN is market-specific and may expose event schedules rather than a linear-channel grid. Do not treat event pages as a complete channel EPG unless stable channel IDs and explicit start/end times are available. |
| TNT Sports (UK) | https://www.tntsports.co.uk/watch/schedule.shtml | Official guide located; adapter not yet in this repo | Public dated schedule page. Verify exact UK channel variants and whether the page exposes machine-readable programme intervals before implementing. |
| Premier Sports (UK) | https://www.premiersports.com/gb/welcome-ios | Official schedule/on-upcoming page located; adapter not yet in this repo | Page exposes current and upcoming events, but full linear programme intervals and stable channel IDs still need verification. |
| Eurosport | https://www.eurosport.fr/watch/schedule.shtml | Official guide located; adapter not yet in this repo | Public dated schedule. Locale matters: the French page is not proof of UK channel schedule coverage. Identify the playlist territory before using it. |
| SuperSport | https://www.dstv.com/ | Existing review adapter: `providers/supersport/scraper.py`; output `data/review/supersport_unclassified.json` | Uses the official DStv/Media Schedules source in the existing adapter. Review channel mapping and regional variants; do not count ambiguous feeds as confirmed playlist matches. |
| beIN SPORTS | https://www.bein.com/en/tv-guide/ | Existing separate source project; this repo stores snapshot at `data/source-feeds/bein_mena.json` | Guide has a territory selector. The US guide is not interchangeable with MENA/UK playlist variants; use the correct regional edition. |
| Viaplay / Viaplay Sports | https://viaplay.com/ | Research / not yet integrated | No verified public first-party linear EPG endpoint recorded yet. Confirm country and service brand; do not use third-party schedule pages as a substitute. |
| Fox Sports (USA) | https://www.foxsports.com/presspass/latest-news/weekly-schedule | Official first-party weekly programming schedule located; adapter not yet in this repo | Press Pass weekly schedule is not necessarily a complete channel-by-channel EPG. The separate Fox Sports Australia adapter must not be mislabelled as USA coverage. |
| Sportsnet (Canada) | https://watch.sportsnet.ca/channels | Official channel guide (EPG) located; adapter not yet in this repo | Guide may require sign-in. Confirm accessible schedule data, time zone, and exact Sportsnet channel variants. |
| Tennis Channel (USA) | https://www.tennischannel.com/ | Official site located; schedule tab surfaced on its broadcast page | Verify whether the public schedule exposes full channel intervals and stable IDs. Streaming event tiles alone are insufficient. |
| Fubo Sports / Fubo (USA) | https://www.fubo.tv/ | Official in-product guide documented by Fubo support: https://support.fubo.tv/hc/en-ca/articles/22283884491277-How-do-I-use-the-Fubo-channel-guide | Guide is personalized to the user's subscription and may require authentication. Do not scrape private account data or claim broad public EPG access. |
| Golf Channel (USA) | https://www.golfchannel.com/ | Official site located; schedule page still needs endpoint/interval validation | Confirm the specific Golf Channel feed and territory; do not rely on third-party listings for production data. |

## Existing adapter / review-feed paths

- Sky Sports UK: `providers/sky/scraper.mjs` → `data/review/sky_uk_unclassified.json`
- SuperSport: `providers/supersport/scraper.py` → `data/review/supersport_unclassified.json`
- beIN SPORTS MENA: existing upstream project → `data/source-feeds/bein_mena.json`
- ESPN, DAZN, TNT Sports, Premier Sports, Eurosport, Viaplay, Fox Sports USA, Sportsnet, Tennis Channel, Fubo, and Golf Channel still require separate adapter work or additional source validation.

## Acceptance rules

1. Prefer official broadcaster-owned pages and APIs. Do not silently substitute third-party guide sites.
2. Keep each market/territory separate (for example, Fox Sports USA versus Fox Sports Australia; beIN US versus beIN MENA; Eurosport UK versus Eurosport France).
3. Require explicit programme start and end times, a verified timezone, stable source record identity, and fail-closed parsing tests.
4. Preserve source channel IDs and write new adapters to `data/review/` until exact playlist matches and linear-versus-event classification have been reviewed.
5. Never invent programme ends from event duration assumptions. If the official source provides only event start times or “now/next” tiles, record it as a research/audit source, not as a complete EPG.
6. The app-facing feed should only be expanded after channel mapping, duplicate handling, and coverage reporting confirm that the new rows improve the actual playlist.

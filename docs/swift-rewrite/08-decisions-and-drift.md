# 08 — Decisions and Drift Register

Every item below is a decision the owner should confirm (or override) before the one-shot build
runs. Each has a short **id** usable verbatim inside a `[DECISION: id]` tag in the `04a`/`04b`/`04c`
screen specs, the **evidence** that raised it, the **default** the plan assumes, the **alternative**,
and the **impact** of getting it wrong.

Reading the defaults column top to bottom gives the complete set of assumptions the AI coding agent
must hold. `07-one-shot-prompt.md` restates them in condensed form; **this file is authoritative**
if the two ever disagree.

The governing rule, from the owner: **fidelity target is the current code's behaviour, not the
in-app documentation.** Where the original's docs and the original's code disagree, the code wins
and the disagreement is listed in §3. Where the current code is simply wrong, see §2 — those are
fixed forward rather than reproduced.

---

## 1. Decision register

### 1.1 Product scope — what the app is and isn't

| # | id | Evidence | Default (assumed) | Alternative | Impact |
|---|---|---|---|---|---|
| 1 | `pro-removed` | `spec/09` §0 and §3.3; `spec/02` §3.7; `spec/06` §14 — `SubscriptionsContext` is a stub returning `isPro: true`, no StoreKit/RevenueCat anywhere | The original "Hydra Pro" tier, its name, its feature list and its promo artwork are **not reproduced**. The rewrite ships a new, clean-room `APPNAME Plus` subscription designed in `05-monetization.md` | Ship everything free | Defines the entire monetization workstream (Phase 8). Also a clean-room boundary: reusing the old tier's marketing copy would import AGPL prose. |
| 2 | `ai-removed` | `spec/09` §0, §3.1–3.2; `spec/03` §15; `spec/06` §top — AI summaries and AI filters have settings keys but zero implementation; `api/AI.ts` only serves the in-app help search | **No AI features at all.** No post summaries, no comment summaries, no AI/"smart" filters, no on-device `SystemLanguageModel`, no Foundation Models dependency | Build summaries with on-device Foundation Models (iOS 26+, device-gated) | Removes an entire feature area (spec 08 area R, items 74, 262, 270, 276–280). Also removes any need for a server. |
| 3 | `push-removed` | `spec/09` §0, §4.1; `spec/06` §13; `spec/07` §top — `NotificationsContext` is an inert stub; no push-token registration exists | **No push notifications, no background refresh, no notification permission prompt.** The inbox is a 60-second foreground poll that updates the app-icon badge only | Add `BGAppRefreshTask` + local notifications for inbox alerts | Removes the Push Notifications entitlement and the APNs setup entirely. Badge freezes while backgrounded — accepted. |
| 4 | `monetization-model` | Owner: "roughly $1/month for most features" | Auto-renewable subscription group, $0.99/mo + $9.99/yr, 7-day trial, Family Sharing on, 11 gates per `05-monetization.md` §4 | Lifetime unlock; single monthly plan only; free with a tip jar (**not permitted** — guideline 3.1.1) | Drives the whole of Phase 8 and the App Store Connect setup. |
| 5 | `gate-matrix` | `05-monetization.md` §3 | The matrix as written: reading/voting/commenting/messaging/search always free; accounts, themes, gestures, filters, gallery depth, downloads, stats, icons paid | Any individual row flipped | Each flip changes `[GATE: …]` tags in `04a`–`04c` and the acceptance checklist. Flip before the build, not during. |
| 6 | `ipad-split-view-deferred` | `spec/01` §10; `spec/08` items 204–208, 253 — split view is a real, working iPad feature in the original | **iPhone only.** No split view, no iPad-specific layout, no `NavigationSplitView`, no `ArrangementView`. `postCompactMode`'s default (which keyed off screen width ≥768pt) becomes a flat `false` | Ship iPad support in v1 | Removes ~8 checklist items and a large chunk of `PostsPage` complexity. Design the feed/detail seam so a split view can be added later without a rewrite. |
| 7 | `android-out-of-scope` | `spec/08` item 327 | Not built, not considered | — | Nothing to do; noted so the agent does not port Android-only code paths described in the specs. |
| 8 | `guide-included-or-not` | `spec/06` §12; `spec/08` items 317–320 — the Guide is 38–43 bundled markdown docs, semantically searched via baked-in OpenAI embeddings + a live server call | **Ship a much smaller, hand-written in-app help section** (10–14 short topics), plain list + plain text search, **no embeddings, no server, no AI Q&A** | Reproduce the full 38-topic guide with a local embedding search | Removes the last reason to have a backend. See also `guide-prose-rewrite` (#9) for the clean-room constraint on the text itself. |
| 9 | `guide-prose-rewrite` | Clean-room rule; the original `documentation/*.md` is AGPL-3.0 licensed prose | **Every word of help text, every settings description, every alert string is written fresh.** No sentence is copied from the original app or its docs | — | Non-negotiable licence boundary. Behaviour may be reproduced; prose may not. |
| 10 | `self-hosted-server-row` | `spec/06` §10; `spec/09` §3.1; `spec/02` §2.13 — "Use Custom Server" toggle + URL validation against `/api/status` | **Removed.** No server setting, no `/api/status` check, no custom-host field | Keep a server setting for a future self-hosted component | The app makes zero requests to any host the owner operates. Simplifies the privacy label to "Data Not Collected". |
| 11 | `sentry-or-not` | `spec/01` §1.2, §20; `spec/06` §9; `spec/02` §6.7 — Sentry on by default, gated by a Privacy toggle, username attached on login | **Owner decides.** Plan assumes: Sentry-cocoa **included**, default **on**, opt-out toggle in Privacy settings, **username never attached**, no breadcrumbs containing Reddit content. MetricKit `MetricManager` (iOS 27) used regardless | No Sentry at all (privacy label stays "Data Not Collected") | Changes the App Privacy nutrition label and adds one dependency. Decide before Phase 0 so the dependency list is final. |
| 12 | `app-name` | Placeholder `APPNAME` throughout | Owner picks a name that does not contain "Reddit", does not evoke Hydra, and is clear of the Reddit trademark and trade dress | — | Blocks App Store Connect setup, the bundle id, the paywall copy and the icon brief. Needed before Phase 0 finishes. |
| 13 | `bundle-id` | Placeholder `com.OWNER.appname` | Owner's reverse-DNS; the share extension is `com.OWNER.appname.ShareExtension`; the custom URL scheme is a lowercase form of the app name | — | Baked into signing, IAP product ids and the URL scheme. Cannot change after first release. |
| 14 | `min-ios` | `spec/10` §A1 — iOS 27 GA 2026-09-14; iOS 26 at 79% as of 2026-06-07; Liquid Glass and everything architectural lives in 26 | **Deployment target iOS 26.0**, built with the **iOS 27 SDK / Xcode 27 / Swift 6.4**; iOS 27-only APIs behind `@available` | iOS 27.0 floor (defensible by ~Q1 2027, not now) | Determines which APIs need availability branches: `swipeActions` outside `List`, `AsyncImage(request:)`, `asyncImageURLSession`, `toolbarMinimizationBehavior`, `MetricManager`, the `prominent` tab role. |
| 15 | `universal-links-absent` | `spec/01` §6 source 4 and Open Question 1 — no `associatedDomains` evidence anywhere in the original | **Add Associated Domains** for `reddit.com` / `www.reddit.com` so tapping a Reddit link elsewhere on iOS opens the app, **if and only if** the owner can host an `apple-app-site-association` file. Otherwise fall back to: custom scheme + Share Extension + clipboard detection only | Reproduce the original exactly (no universal links) | Universal links need a domain the owner controls serving AASA — which we cannot do for `reddit.com`. **Realistic default is therefore: no universal links**; the App Intent / Shortcuts path (#16) replaces the original's iCloud Shortcut. |
| 16 | `shortcuts-intent` | `spec/06` §2.4; `spec/08` items 187, 239 — the original ships an iCloud Shortcuts link the user must install manually | Replace with a **first-class App Intent** ("Open in APPNAME") that appears in the share sheet automatically, plus keep the Share Extension | Reproduce the iCloud Shortcut link | Strictly better UX, no external hosting, and removes a link to a third-party URL from Settings. |

### 1.2 Features whose settings exist but do nothing (dead toggles)

| # | id | Evidence | Default (assumed) | Alternative | Impact |
|---|---|---|---|---|---|
| 17 | `post-summary-dead-setting` | `spec/09` §0; `spec/06` §4.1 — `showPostSummary` (default true) has no UI row and no consumer | **Setting deleted entirely.** Not shipped, not migrated | Build AI post summaries | One fewer Appearance row than the original's docs claim. |
| 18 | `comment-summary-dead-setting` | `spec/04` §15, Open Question 1; `spec/06` §4.2 — `showCommentSummary` same situation | **Setting deleted entirely** | Build AI comment summaries | As above. |
| 19 | `live-text-dead-setting` | `spec/05` §3.3 and Open Question 1 — `liveTextInteraction` exists, is toggleable, and is read by nothing | **Actually implement it.** Ship a working Live Text toggle (default **off**) wired to `ImageAnalysisInteraction` via a `UIViewRepresentable` in the full-screen image viewer, with the documented long-press disambiguation | Delete the setting (match code) or ship it always-on | The one place where "match the code" produces a worse app than "match the docs". Implementing it is cheap on iOS 26 and the toggle already has a name and a default. Explicitly flagged as a deliberate deviation from code fidelity. |
| 20 | `poll-voting-stub` | `spec/03` §4.9; `spec/04` Open Question 9; `spec/02` §4.8 — the poll card renders options, tapping selects locally, "Vote" calls `alert("voted")`, no API call, no results | **Render polls read-only**: question, options, total vote count, and a clear "Voting on polls isn't supported" note. Remove the fake Vote button and the fake selection state | Implement real poll voting (`/api/vote` on a poll option — undocumented, keyless support unverified) | The original's stub is actively misleading: users believe they voted. Read-only is honest and cheap. Poll *creation* remains unsupported either way. |

### 1.3 Behaviour to reproduce, confirm, or correct

| # | id | Evidence | Default (assumed) | Alternative | Impact |
|---|---|---|---|---|---|
| 21 | `comment-sort-six` | `spec/04` §9 and Open Question 2 — code offers exactly Best, New, Top, Controversial, Old, Q&A; the docs also list "Default" | **Match the code: six options**, no "Default" entry. The user's configured default comment sort still applies when navigating to a post | Add a seventh "Default" option meaning "omit the `sort` param" | Tiny UI difference; listed because the docs/code drift is real and the agent will otherwise have to guess. |
| 22 | `inbox-no-filter-tabs` | `spec/07` §2.3 and Open Question 3 — one interleaved list, `t1` + `t4` only, no All/Unread/Mentions segmentation | **Match the code: a single list.** No filter tabs, no separate "mentions" treatment | Add Unread / Messages / Replies segmentation | Affects checklist items 115–125. Segmentation is a genuine improvement but is net-new work, not a port. |
| 23 | `user-page-minimal` | `spec/07` §4.1 — no avatar (despite `icon` existing in the model), no trophies, no cake-day UI, no follow/unfollow, `friends` shown only as inert text in search rows | **Match the code**, with one exception: **do** render the user's avatar on the profile header (the data is already fetched; omitting it looks broken on a modern iPhone) | Strict parity (no avatar) | Small, visible, low-risk improvement. Flagged so it isn't mistaken for scope creep. |
| 24 | `no-video-longpress-menu` | `spec/05` §9.2, Open Question 4 — images have a 3-item long-press menu (Share / Save / Copy Link); videos have none anywhere; video share is only the viewer's overlay button | **Add a long-press menu on video tiles** matching the image one (Share Video / Save Video / Copy Video Link), because the original's own help text already describes this flow and its absence is a gap, not a design | Strict parity (no video long-press) | Also the natural home for `gate.downloads` on video. |
| 25 | `gallery-mode-no-blur` | `spec/05` §10.3, Open Question 3 — Gallery Mode grid cells render NSFW/spoiler media unblurred, unlike the normal feed | **Fix forward: apply the same NSFW/spoiler blur in Gallery Mode**, honouring `blurNSFW` / `blurSpoilers` | Strict parity (no blur) | Safety and App Store risk (4.x objectionable content / age rating). Strongly recommend fixing. |
| 26 | `prefs-force-over18-on-login` | `spec/07` §1.10; `spec/02` §2.10 — on login the app scrapes `old.reddit.com/prefs` and silently force-sets `media`, `over_18` and `search_include_over_18` to "on" on the user's Reddit account, throttled to once per 30 days **per device, not per account** | **Owner decides.** Plan assumes: **keep the behaviour** (the app's own NSFW blur then becomes the single gate, which is what the rest of the design assumes) but **make it visible** — a one-time explanatory prompt on first login, and a Settings toggle to turn it off. Also fix the throttle to be per-account, and write the throttle timestamp only on success | Remove it entirely (NSFW content then depends on each account's Reddit-side setting) | Silently mutating a user's account settings without consent is the single most surprising behaviour in the original app. Keeping it undisclosed is a defensible-parity choice but a poor one. |
| 27 | `cookie-expiry-rewrite` | `spec/02` §3.4; `spec/09` §2.2 — Reddit's `reddit_session` cookie has no expiry, so iOS drops it; after **every** API response the app rewrites it with `expires = now + 10,000 days`; logout pre-expires the cookie in both stores before `clearAll` to defeat a WebKit→HTTP resurrection bug | **Reproduce both behaviours** with `HTTPCookieStorage` + `WKHTTPCookieStore`, but rewrite the expiry **at most once per app session per account** rather than after every response | Rewrite after every response (exact parity); or don't rewrite (sessions die at every launch) | Without the expiry rewrite, multi-account login is broken. The per-response frequency is pure waste. The pre-expire-then-clear ordering on logout must be kept verbatim — it is defensive, not incidental. |
| 28 | `redgifs-memory-only` | `spec/05` §4.1; `spec/02` §6.1 — resolved Redgifs URLs are cached in memory only (signed, expire in hours); token persisted; 2 concurrent, LIFO queue, 3 retries, 30s cooldown on 429 | **Reproduce exactly**, including LIFO ordering, abort-on-scroll-off, the 30s global 429 cooldown, and the "playback error busts the cache and re-resolves once" recovery | Persist resolved URLs (would serve dead links at next launch) | This is the single most carefully-tuned subsystem in the original. Deviating produces rate-limit bans. Non-negotiable. |
| 29 | `no-429-handling` | `spec/02` §7, §8, Open Question 14 — Reddit 429s are not detected at all; only Redgifs has rate-limit logic; `api()` never inspects HTTP status codes | **Fix forward: add real HTTP status handling to the Reddit client.** Surface 429 with `Retry-After` honoured, a global backoff, and a distinct user-facing message; distinguish 5xx from "malformed body"; distinguish offline (`NWPathMonitor`) from server error | Strict parity (body-shape inspection only) | The original's "everything is a generic load failure" is the top source of confusing behaviour, and a keyless client hammering `www.reddit.com` is exactly the client that will get 429'd. Worth the extra day. |
| 30 | `raw-json-param` | `spec/02` §2 preamble, Open Question 6 — `raw_json=1` is never sent on listings; the app HTML-entity-decodes every text field client-side; one field (`hls_url`) is inconsistently left undecoded | **Keep the current contract**: do not send `raw_json=1`, decode entities client-side, and decode `hls_url` too (fixing the inconsistency) | Send `raw_json=1` and drop decoding | Sending `raw_json=1` changes rendering for text containing literal `&amp;`. Low risk either way; call it once and be consistent. |
| 31 | `pagination-cursor` | `spec/02` §5.1, Open Question 8 — the cursor is the **last item's own fullname**, not the listing envelope's `after` | **Reproduce exactly** (last item's fullname; `unfilteredAfter` tracked separately so client-side filtering never skips a page) | Use `data.after` | Changing this silently changes which posts are skipped on filtered feeds. Reproduce. |
| 32 | `time-format-parity` | `spec/09` §7.2; `spec/02` §4.13 — custom floor-based buckets, 30-day months, 365-day years, English-only, `RelativeDateTimeFormatter` would differ | **Reproduce the exact bucket arithmetic**, but **fix the 360–365-day seam** that reports "0 years" | Use `RelativeDateTimeFormatter` (locale-aware, different output) | Cheap to reproduce, and the strings appear on every post and comment. The seam is a plain bug (§2). |
| 33 | `number-format-parity` | `spec/09` §7.1; `spec/03` §4.11, §22 — `prettyNum` uses strictly-greater-than thresholds (so exactly 1000 prints "1000") and one decimal; the feed post card prints **raw** unabbreviated vote and comment counts; the Stats page has a *second*, different formatter | **Reproduce both formatters as separate functions**, but **abbreviate the feed card's vote/comment counts** (`prettyNum`) — printing "128437" in a feed row is a bug, not a style | Strict parity (raw integers in the feed) | Visible on every row. Recommend the fix. |
| 34 | `unpruned-tables` | `spec/09` §1.3, Open Question 2 — `custom_themes`, `counter_stats` and `subreddit_visits` have no maintenance routine and grow unbounded | **Add pruning for `subreddit_visits` only** (cap at 2,000 rows, keep highest counts). Leave `custom_themes` and `counter_stats` unpruned (both are naturally bounded and user-owned) | Strict parity (no pruning anywhere) | `subreddit_visits` is the only genuinely unbounded one, and it feeds a top-10 list. Keep `seen_posts` at 5,000 and `drafts` at 100 exactly as the original. |
| 35 | `theme-import-format-compat` | `spec/06` §3.6 — themes are shared by embedding `::hydra-theme-import::{…}` JSON in Reddit comment text; the detection regex handles only single-level braces | **New sentinel, new format.** Use `::appname-theme::` + base64url-encoded JSON, parsed with a brace-balanced scanner (not a naive regex). **Do not** import the original's format | Stay wire-compatible with Hydra themes so the two apps can share themes | Wire compatibility means adopting a format defined by an AGPL project and interoperating with its community; a fresh format keeps the clean-room boundary clean. Also fixes the nested-brace limitation. |
| 36 | `theme-count` | `spec/06` §3.3 — 12 built-in themes with full palettes, 19 colour roles, plus a fixed 6-colour comment-depth rainbow shared by all themes | **Ship 6–8 new built-in themes with new palettes**, all free. Keep the 19-role structure (it is a data shape, not expression) and keep a fixed comment-depth colour set, but **choose new depth colours** | Ship the original 12 palettes | Specific hex palettes are creative expression. The *structure* (19 roles, light/dark mode flag, status-bar flag) is functional and may be reproduced. |
| 37 | `app-icons-new-art` | `spec/01` §21; `spec/06` §5; `spec/08` §4 — 4 icons by 3 named community artists, with bios and links | **All-new artwork**: 1 default + 3 alternates, authored for this app, composed in Icon Composer with layered light/dark/clear/tinted variants (iOS 26+). **No artist-credit screens**, no bios, no external links | Commission or reuse | Copying the icons would be a straightforward licence violation. The per-icon detail screen with artist bio is dropped; the grid + "Set as App Icon" remains. |
| 38 | `snudown-renderer` | `spec/02` §4.13; `spec/04` §6.9 — Reddit-served HTML is rendered directly (never re-parsed from markdown); a WASM build of Reddit's own `snudown` is used **only** for composer live previews and the bundled docs | **Reproduce the split**: render Reddit's `*_html` via a native HTML→SwiftUI renderer; for composer previews use `swift-markdown`/cmark-gfm with Reddit-dialect shims (spoilers `>!…!<`, superscript `^`, `/r/` and `/u/` autolinks). Accept that preview fidelity is ~95%, not 100% | Ship snudown via WASM or a C bridge | The composer preview is the only place a mismatch can appear, and only for exotic markdown. Shipping Reddit's own C source is both a licence question and a build-system burden. |
| 39 | `comment-tree-renderer` | `spec/04` §3, §12 — the tree is flattened to rows and virtualized; `spec/10` §A3 recommends `List` over `LazyVStack` for 1000+ rows | **Flatten to `[CommentRow]` and render in a `List`** with plain style and stripped separators/insets; depth as a field, not nesting | `LazyVStack` in a `ScrollView` | Directly determines whether a 2,000-comment megathread is usable. Follow the platform baseline. |
| 40 | `swipe-forward-gesture` | `spec/01` §9 — a right-edge "swipe forward" gesture restores popped screens, undocumented and not user-configurable | **Drop it in v1.** It is invisible, undiscoverable, conflicts with "swipe anywhere to navigate", and fights `NavigationStack`'s own gestures | Reproduce it | One fewer gesture-conflict class. Cheap to add later if missed. |
| 41 | `scroll-to-next-button` | `spec/01` §13; `spec/04` §5 — a floating button: tap = next top-level comment, ~300ms hold = previous, 1s hold = drag to one of 10 snap positions | **Reproduce**, including the 10 snap positions and persistence, but make the previous-comment action a **long-press with haptic confirmation** rather than a 300ms timer that fires while held | Strict parity | The original's timing is genuinely confusing (holding fires "previous" before you release). The feature itself is well-loved and must stay. |
| 42 | `startup-modals` | `spec/01` §12.2; `spec/09` §11.5 — a priority queue: "what's new" once per version, then a rate-this-app prompt after 30 launches, permanently suppressed after any answer | **Keep both**, but use `SKStoreReviewController`/`requestReview` (via the `RequestReview` environment action) instead of deep-linking to the App Store's review page, and stop hand-rolling the "asked once" flag — the system already rate-limits | Drop both | Deep-linking to the write-a-review URL bypasses Apple's throttling and is discouraged. |
| 43 | `subscribe-nag-removed` | `spec/01` §12.3; `spec/09` §0 — an annual modal asking the user to subscribe to the developer's own subreddit | **Removed.** No community nag modal of any kind | Add one for the new app's subreddit | Pure noise; also a clean-room concern (the original targets `r/hydraclient`). |
| 44 | `clipboard-read-default` | `spec/01` §6 source 2 says default `false`; `spec/09` §2.1 says default `true`; `spec/06` §2.4 says default `false` — the surveys disagree | **Default `false`** (two of three sources, and it is the privacy-respecting choice — iOS prompts on every clipboard read) | Default `true` | Small, but the agent will otherwise pick arbitrarily. |
| 45 | `error-reporting-default` | `spec/06` §9; `spec/01` §1.2 — `allowErrorReporting` defaults to **on**, requires an app restart to take effect | **Default on** (only meaningful if `sentry-or-not` resolves to "include Sentry"), and **remove the restart requirement** — read the toggle reactively | Default off (opt-in) | Opt-out is the industry norm and matches the original; opt-in is friendlier. Owner's call. |
| 46 | `stats-obfuscation` | `spec/06` §8, Open Question 2; `spec/09` §0 — `obfuscateNumber`/`obfuscateText` are identity functions, so the docs' "free users see asterisks" is false | **Neither.** With `gate.stats` in place, free users see a **locked screen describing what is tracked**, not fake asterisked numbers. Counters keep accumulating while locked | Reproduce the asterisk obfuscation | Fake blurred data is a dark pattern and looks broken. |
| 47 | `hidden-posts-local` | `spec/03` §12; `spec/09` §1.2 — "Hide Post" is purely local (30-day expiry row in SQLite), never calls Reddit's hide API | **Reproduce exactly** (local, 30 days, lazy expiry at read time, swept at launch) | Call Reddit's `/api/hide` | Local hiding works logged-out and is reversible; keep it. |
| 48 | `captcha-webview-fallback` | `spec/02` §2.4; `spec/04` §11.5 — a `BAD_CAPTCHA` submit error offers to finish the post in an embedded web view at `new.reddit.com/…/submit`, copying the body to the clipboard for self-posts | **Reproduce** using `WebView`/`WebPage` (SwiftUI WebKit, iOS 26+) with the shared cookie store | Show an error and give up | Without it, posting simply fails for some accounts/subreddits. |
| 49 | `report-webview` | `spec/02` §2.11; `spec/04` §7.2, Open Question 5 — "Report" opens a generic `reddit.com/report` page, not scoped to the item | **Reproduce** (generic web view), since there is no keyless report API | Build a native report form | Needed for the App Store's UGC requirements; the generic flow satisfies them. |
| 50 | `wiki-webview` | `spec/07` §9; `spec/08` item 156 — the wiki is an embedded, re-skinned web view, not a native renderer | **Reproduce** with `WebView` + injected theme CSS and the same link-interception rule (in-app Reddit links hand off to native screens, everything else to the external-link handler) | Build a native wiki renderer | Big scope saving; matches current behaviour exactly. |
| 51 | `multireddit-merged-feed` | `spec/02` §2.9; `spec/07` §10.4 — multireddit feeds are read via the merged `r/a+b+c` URL because the multi's own listing is unreliable keyless; three definition fallbacks; "empty" vs "unavailable" are distinct | **Reproduce the entire fallback chain verbatim**, including the empty-vs-unavailable distinction | Use `/user/x/m/y.json` directly | This is load-bearing; naive implementations produce empty feeds for valid multis. |
| 52 | `background-audio-pip` | `spec/05` §7.4, §8.1, Open Question 7 — video is fully unmounted on backgrounding; no PiP, no background audio | **Reproduce: no PiP, no background audio.** Pause and tear down players on background | Add PiP (`AVPlayerViewController`) and a background-audio mode | Adding PiP means adding the Background Modes entitlement and an audio-session policy; it is a real feature request but it is net-new, not a port. |
| 53 | `feed-focus-playback` | `spec/03` §9.2; `spec/05` §7.1 — at most one feed video plays: the centre-most ≥70%-visible (or ≥60%-viewport-covering) post, 150 ms settle debounce, lenient stop, immediate release when fully off-screen, remembered positions (LRU 200) | **Reproduce the algorithm**, implemented on `onScrollTargetVisibilityChange` (the API Apple recommends for exactly this, `spec/10` §A3) rather than viewability-percentage callbacks | Simpler "play when visible" | The original's tuning is the difference between a smooth feed and a decoder-exhausted black-tile feed. |
| 54 | `shared-player-registry` | `spec/05` §5 — one `AVPlayer` per video, keyed on the pre-resolution URL, ref-counted, deferred release, LRU cap 12 | **Reproduce**, cap 12 | One player per view | Prevents the "tap to fullscreen reloads the video" regression and the ~16-player iOS decoder ceiling. |
| 55 | `share-extension` | `spec/08` §6; `spec/09` §5.3 — the original's share extension is generated by an Expo plugin, activation limited to exactly one web URL | **Build a real Share Extension target** with `NSExtensionActivationSupportsWebURLWithMaxCount = 1`, handing the URL to the app via the custom scheme or an app group | Skip it | Listed in the acceptance checklist (item 181) and cheap. |
| 56 | `nav-bar-tap-guard` | `spec/09` §10; `spec/08` §7 — the original patches `react-native-screens` because on iOS 26+ tapping an interactive nav-bar title triggers the system scroll-to-top gesture | **Verify, don't pre-solve.** Add a Phase 9 manual check: tapping the subreddit-switcher title must open the switcher, not scroll the feed to top. Only add a gesture-precedence workaround if the bug reproduces in SwiftUI | Pre-emptively hand-roll a guard gesture | The bug was an RN-bridging artefact; SwiftUI's `NavigationStack` probably does not have it. Cheap to check, expensive to work around blindly. |

---

## 2. Known bugs in the original that the rewrite should NOT reproduce

Default policy: **fix forward.** Each of these is a defect, not a design. They are listed so the
agent recognises them in the spec text and does not faithfully port them.

| id | Bug | Evidence | Correct behaviour |
|---|---|---|---|
| `validateHex-bug` | The hex-colour validator's regex is unparenthesised, so `^#` binds only to the first alternative and `$` only to the last — a bare 6- or 8-hex run inside any longer string validates | `spec/09` §7.3 | Anchor the whole alternation: a valid colour is `#` + exactly 3, 6 or 8 hex digits, whole-string, case-insensitive. Also make `hexToRgb` handle the 3- and 8-digit forms instead of silently returning black |
| `nested-list-render-bug` | Nested `<ol>`/`<ul>` re-number from their own local index, so nested lists render wrong | `spec/04` §6.1, `todo.txt` via `spec/08` §5 | Track list depth and ordinal in the renderer; nested ordered lists continue correctly and nested bullets use depth-appropriate markers |
| `giant-emoji-bug` | Emoji-only comment bodies render oversized because nothing clamps standalone emoji runs | `spec/04` §6.4 | Clamp emoji runs to the body text size |
| `message-modal-copy-bugs` | The reply-to-message modal is titled "New Message"; both message composers show "Failed to submit **comment**" on error | `spec/07` §3.2, §3.3, Open Question 7 | "Reply" and "New Message" titles respectively; error copy names the right noun |
| `postdetail-vote-not-reflected` | Upvoting inside post details is not reflected in the feed list behind it | `spec/08` item 164; `todo.txt` | Vote state is owned by a single store keyed by fullname; every surface observes it. This falls out of the Observation architecture for free |
| `newpost-type-switch-keeps-text` | Switching post type (Text/Link/Image) reuses the same `text` field, so a URL can end up in the body editor | `spec/04` §11.3, §11.5 | Separate fields per post kind; drafts keyed per kind |
| `unknown-error-rethrow` | The generic post-submit error path alerts **and** re-throws, surfacing an unhandled exception | `spec/04` §11.5 | Alert once; do not re-throw |
| `time-year-seam` | A post 360–365 days old reports "0 years" (months use /30, years use /365) | `spec/09` §7.2; `spec/02` §4.13 | Clamp: if the months bucket would reach 12, report 1 year |
| `edit-comment-crash` | Editing a comment on the user page then tapping its link crashes | `spec/08` §5 (`todo.txt`) | Covered by the value-typed navigation model; add a regression test |
| `list-divider-index` | Row dividers are computed from the unfiltered index, so a list whose last visible row isn't the last item draws a trailing divider | `spec/06` Open Question 8 | Compute dividers from the rendered collection |
| `account-settings-throttle` | The 30-day `/prefs` repair timestamp is written **before** the request and is global rather than per-account, so one failure burns the window for every account | `spec/02` §2.10, Open Question 12; `spec/07` §1.10 | Per-account key, written only on success (see `prefs-force-over18-on-login`) |
| `no-offline-detection` | Offline and server error produce the same generic message | `spec/02` §7, Open Question 13 | `NWPathMonitor`; distinct offline state with a retry affordance (see `no-429-handling`) |
| `gallery-offer-cancel` | Declining the "Try Gallery Mode?" prompt doesn't set the one-time flag, so it can reappear on another subreddit | `spec/05` §10.2 | Set the flag on either answer |
| `formatUser-null-guards` | `icon_img.split("?")` and `created_utc` are read with no null guard; a malformed user object crashes | `spec/02` Open Question 9 | Optional decoding everywhere; a malformed object yields a degraded row, never a crash |
| `more-stub-count-zero` | Reddit's "continue this thread" (`more` with `count: 0`, no child ids) renders as "0 more replies" and does nothing when tapped | `spec/02` §4.2, Open Question 10 | Detect it and render "Continue this thread →", navigating to the comment's permalink |
| `pencil-modal-close` | The "✕" on certain modals ignores Apple Pencil input | `spec/08` §5 (`todo.txt`) | Not applicable on iPhone-only; standard SwiftUI controls handle it |

Two deliberate **non**-fixes (reproduce the limitation, it is Reddit's, not ours): user search returns
a single page only (`spec/07` §5.4), and saved items have no folders, tags, sort or search
(`spec/08` items 172–173).

---

## 3. Documentation drift (original docs vs original code)

Catalogued so the agent never treats the original's help text as a specification. In every row the
**code** is the fidelity target; the rewrite's own behaviour is set by the decisions in §1.

| # | The in-app docs claim | The code actually does | Rewrite's answer |
|---|---|---|---|
| D1 | "Hydra Pro" is a live monthly subscription with a price, an upgrade button, grace-period display and a customer id | `isPro` is a hard-coded `true`; no purchase flow, no paywall, no StoreKit, no customer id UI | New `APPNAME Plus` subscription, designed fresh (`pro-removed`, `monetization-model`) |
| D2 | Inbox Alerts deliver push notifications when the app is closed | Inert notifications stub; a 60-second foreground poll that sets the app-icon badge | No push (`push-removed`) |
| D3 | AI post/comment summaries appear in the post view, on by default for Pro | Two settings keys with no UI and no consumer | Not built (`ai-removed`, `post-summary-dead-setting`, `comment-summary-dead-setting`) |
| D4 | AI ("Smart") filters with six named presets hide posts by natural-language description | No implementation anywhere | Not built (`ai-removed`) |
| D5 | Stats are Pro-gated; free users see asterisks | Obfuscation functions are identity passthroughs; everyone sees everything | Gated by `gate.stats`, with an honest locked screen (`stats-obfuscation`) |
| D6 | 5 of 12 themes are Pro-only with a 5-minute preview; the Theme Maker is Pro with a 5-minute trial | `cantUseTheme()` always returns false; every theme and the Theme Maker are free | All built-ins free; Theme Maker gated by `gate.customThemes`; **no** timed previews (`gate-matrix`) |
| D7 | Gallery Mode is capped at 100 posts for free users | No cap exists in code | Cap reinstated as `gate.galleryMode`, as an inline footer rather than a hard stop |
| D8 | A "Customer ID" appears at the bottom of Advanced Settings | No such field is rendered | Not built |
| D9 | Self-hosting a Hydra server grants Pro features | `isPro` is unconditional; `USING_CUSTOM_HYDRA_SERVER` is defined and never read | No server, no alternate unlock path (`self-hosted-server-row`) |
| D10 | Live Text can be enabled in Appearance and works on images | The setting exists; nothing reads it | Implemented for real (`live-text-dead-setting`) |
| D11 | Polls are an interactive supported post type | The Vote button calls `alert("voted")`; no API call, no results | Read-only polls (`poll-voting-stub`) |
| D12 | The comment long-press menu has 8 items | It has 9 — "Copy Text" is present and undocumented | Ship the full set, including Copy Text (`comment-sort-six` neighbours) |
| D13 | Comment sorts include "Default" | The action sheet hard-codes six options without it | Six (`comment-sort-six`) |
| D14 | Long-press a video → Share → "Save Video" | No long-press menu exists on any video tile | Added (`no-video-longpress-menu`) |
| D15 | "Read Links from Clipboard" default | One survey says `true`, two say `false` | `false` (`clipboard-read-default`) |
| D16 | Landscape works in the in-app browser | Listed as an open bug in the original's own backlog | Full-screen media viewer and in-app browser both support rotation; everything else is portrait-locked |
| D17 | Google sign-in is available on the login screen | Reported missing, root cause unknown | Out of our control — the login flow is Reddit's own web page rendered in a `WebView`; whatever Reddit shows is what the user gets |
| D18 | The Guide covers 38 topics with semantic search and an "ask a question" AI answer | True in code, but depends on a live server call for the query embedding, so it was never actually offline | A small hand-written help section, plain text search, no server (`guide-included-or-not`, `guide-prose-rewrite`) |
| D19 | Split View is available on iPad | True in code | Out of scope (`ipad-split-view-deferred`) |
| D20 | Universal links / `hydra://` deep links open Reddit URLs from other apps | Only `hydra://openurl?url=…` is handled; no associated domains found | App Intent + Share Extension + custom scheme (`universal-links-absent`, `shortcuts-intent`) |

---

## 4. Tag aliases (normalization)

The `04a`/`04b`/`04c` specs were written in parallel with this register and use a few alternative
spellings, plus some finer-grained ids for sub-behaviours covered here by a broader entry. The
canonical id is the one in §1 and §2. Resolve as follows:

| Variant seen in `04*` | Canonical entry here |
|---|---|
| `ipad-split-view` | `ipad-split-view-deferred` (#6) |
| `universal-links` | `universal-links-absent` (#15) |
| `open-in-appname-shortcut-vs-intent` | `shortcuts-intent` (#16) |
| `dead-setting-post-summary` | `post-summary-dead-setting` (#17) |
| `dead-setting-comment-summary` | `comment-summary-dead-setting` (#18) |
| `gallery-no-post-cap` | `gate.galleryMode` in `05-monetization.md` §4 (the cap is reinstated as a gate) |
| `gallery-no-nsfw-blur` | `gallery-mode-no-blur` (#25) |
| `force-nsfw-account-settings` | `prefs-force-over18-on-login` (#26) |
| `no-video-long-press-menu` | `no-video-longpress-menu` (#24) |
| `no-follow-avatar-trophies` | `user-page-minimal` (#23) |
| `no-mentions-category` | `inbox-no-filter-tabs` (#22) |
| `report-generic-webview` | `report-webview` (#49) |
| `wiki-is-a-webview` | `wiki-webview` (#50) |
| `pagination-cursor-fullname` | `pagination-cursor` (#31) |
| `time-format-12mo-seam` | `time-format-parity` (#32) + `time-year-seam` (§2) |
| `hls-url-entity-decoding` | `raw-json-param` (#30) |
| `no-pip` | `background-audio-pip` (#52) |
| `continue-thread-stub` | `more-stub-count-zero` (§2) |
| `detail-vote-not-in-feed` | `postdetail-vote-not-reflected` (§2) |
| `newpost-type-switch-shares-text` | `newpost-type-switch-keeps-text` (§2) |
| `newpost-unknown-error-rethrow` | `unknown-error-rethrow` (§2) |
| `nested-list-numbering` | `nested-list-render-bug` (§2) |
| `giant-emoji` | `giant-emoji-bug` (§2) |
| `list-separator-quirk` | `list-divider-index` (§2) |
| `message-error-copy`, `message-longpress-label`, `reply-title-copy` | `message-modal-copy-bugs` (§2) |
| `comment-menu-copy-text` | `comment-sort-six` (#21) — same "docs omit what the code does" family |
| `mark-seen-restart` | `mark-as-seen-restart`: **fix forward** — the setting takes effect immediately, no restart alert |
| `drop-update-group-footer` | Confirmed: the Settings footer shows name, version and build only; there is no OTA "update group" |
| `no-confirm-account-delete` | **Fix forward**: deleting an account asks for confirmation |
| `no-blocked-users-screen` | Confirmed: no blocked-users management screen in v1; blocking stays fire-and-forget |
| `search-no-sort` | Confirmed: the Search tab has no sort control (only in-subreddit search does) |
| `sidebar-single-stat` | Confirmed: the sidebar shows subscriber count, rules and description only |
| `composer-no-discard-confirm` | **Fix forward**: cancelling an *edit* with unsaved changes confirms first (new-post/new-comment drafts persist, so those need no prompt) |
| `context-no-highlight` | Confirmed: permalink/context mode adds only the "view all comments" banner, no target highlight |
| `crosspost-longpress` | Confirmed: a crosspost card has no long-press menu of its own; its embedded media keeps its own |
| `vote-no-optimistic-rollback`, `unhandled-save-failure` | **Fix forward**: vote and save apply optimistically and roll back with a transient error on failure; no unhandled rejections |
| `fullscreen-player-error-no-retry` | **Fix forward**: a hard player error in the full-screen viewer offers tap-to-retry, matching the inline player |
| `markdown-sup-no-baseline` | Confirmed: superscript renders smaller without true baseline shift (acceptable) |
| `text-height-repair-omit` | Confirmed: the original's fractional-height text workaround is an RN artefact and is not reproduced |
| `viewer-zoom-transition` | **Enhancement**: use `.navigationTransition(.zoom(sourceID:in:))` from thumbnail to viewer (iOS 18+); the original had no shared-element transition |
| `tab-hide-mechanism` | Confirmed: hide-tab-bar-on-scroll is implemented with the platform's own tab-bar minimization, not a hand-rolled translate |
| `login-no-instructions` | **Fix forward**: the login screen gets one line explaining that authentication happens on Reddit's own page |
| `no-429-handling` | As #29 — the id names the *original's* gap; the decision is to add handling |
| `D17` | The Google-sign-in row of §3 |

Any `[DECISION: …]` tag that resolves to none of the above is an error: treat the behaviour as
"match the current code as described in `spec/`", and record it in `PROGRESS.md` under
"Open questions".

---

## Traceability

| Section here | Derived from | Feeds into |
|---|---|---|
| §1.1 items 1–3 (pro/ai/push removed) | Owner's product decisions; `spec/09` §0, §3.3, §4.1; `spec/02` §3.7; `spec/06` §§13–14; `spec/07` §top | `05-monetization.md` §1.2; `06` Phases 5, 7, 8; `07` non-negotiables |
| §1.1 items 4–5 (monetization, gates) | `05-monetization.md` §§2–4 | `04a`/`04b`/`04c` `[GATE: …]` tags |
| §1.1 items 6–7 (iPhone only) | `spec/01` §10; `spec/08` items 204–208 | `06` acceptance checklist annotations |
| §1.1 items 8–10 (guide, clean room, server) | `spec/06` §12; `spec/09` §3.1–3.2; `spec/02` §2.13 | `06` Phase 7; `07` guardrails |
| §1.1 items 11–16 (Sentry, name, bundle, iOS floor, links, intents) | `spec/10` §A1; `spec/01` §1.2, §6; `spec/06` §2.4, §9 | `06` bootstrap + Phase 9; `07` kickoff checklist |
| §1.2 items 17–20 (dead toggles) | `spec/09` §0; `spec/06` §4.1–4.2; `spec/05` §3.3; `spec/03` §4.9; `spec/04` Open Q 9 | `04a` (polls), `04b` (Live Text), `04c` (Appearance rows) |
| §1.3 items 21–56 | `spec/02` §§2–8; `spec/03` §§9–14; `spec/04` §§3–12; `spec/05` §§4–10; `spec/06` §§2–11; `spec/07` §§1–10; `spec/09` §§1–10; `spec/01` §§6–13, §21 | `04a`–`04c` `[DECISION: …]` tags; `06` phase deliverables and risk register |
| §2 bug list | `spec/08` §5 (`todo.txt`); `spec/09` §7.3; `spec/04` §6.1, §6.4, §11.3, §11.5; `spec/06` Open Q 8; `spec/07` §3.2–3.3; `spec/02` Open Q 9, 10, 12, 13 | `06` "tests to write" per phase; `07` guardrails ("fix forward by default") |
| §3 drift table | `spec/06` §top; `spec/09` §0; `spec/02` §3.7; `spec/03` §15; `spec/05` §§3.3, 9.2, 10.1; `spec/07` §top, Open Q 1 | `07` reading-order note: the `04*` and `05` docs are the spec, the original's docs are not |

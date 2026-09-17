# REVIEW — cross-document consistency pass

Date: 2026-09-17. Scope: `docs/swift-rewrite/00`, `02`, `03`, `04a`, `04b`, `04c`, `05`, `06`, `07`,
`08`. The `spec/01`–`spec/10` surveys were **not** modified; they are the raw corpus and were used
only as evidence.

Files `02`–`08` were written concurrently by three agents from one survey corpus, so they carried two
parallel vocabularies and a set of genuine behavioural contradictions. This pass made the set
internally consistent. It did **not** add missing features; a separate gap audit covers that.

## Precedence rule applied

Where two documents disagreed, the conflict was resolved in this order, and the rule was applied
uniformly rather than case by case:

1. **Clean-room and licence questions** → `00` §Scope and `08`. Copied palettes, icon names, artist
   credits, a third-party sentinel format and a third-party subreddit in a URL were all removed.
2. **A `08` §2 bug id vs a `04*` "reproduce this"** → `08` wins (`00` principle 7: bugs are fixed
   forward unless the owner says otherwise).
3. **`02`/`03` engineering decisions argued in depth vs a stale `08` default** → `02`/`03` win, and
   the `08` entry was rewritten to match (this affected exactly two entries: #26 and #30).
4. **Names — gates, decision ids, routes, packages, settings keys, endpoint ids** → the document that
   owns the namespace wins: `05` §4 for gates, `08` §1–§3 for decisions, `02` §5.5 for routes,
   `02` §2.2/§3.1 for packages, `03` §8.1 for settings keys, `03` §5.2 for endpoint ids.

---

## 1. Contradictions found and how each was resolved

| # | Contradiction | Where it lived | Resolution |
|---|---|---|---|
| 1 | Silent `old.reddit.com/prefs` `over_18` rewrite on login | `04c` §3.4 + `08` #26 + `06` item 114c + `07` specced it; `02`/`03` §5.7 had dropped it | **Dropped everywhere.** No `/prefs` fetch, no `/post/options` write, no throttle, no `A1`/`A2` endpoints. Replaced by a one-time dismissible NSFW-visibility banner linking to Reddit's own settings. `08` #26 rewritten; `06` item 114c flipped CHANGED→CUT; `07`'s decisions block corrected |
| 2 | `raw_json=1`: `02` §9.1 + `03` §1.3 send it; `08` #30 + `07` said do not, and decode entities client-side | all five | **Sent on every read**, no client-side entity decoding anywhere, `hls_url` included. `08` #30 rewritten; `07` corrected; `04a` §14.2/§18 and `04b` §1.1 rule 1 corrected |
| 3 | Markdown pipeline: `02` §9 parses markdown source into an AST; `04a` §18 parsed Reddit's `body_html` and ran a second snudown/WASM path for previews | `02` vs `04a` | **One pipeline, `02`'s.** `04a` §18 rewritten: AST node → rendering table, `body_html` demoted to an emergency parity source (and the only path for sidebar/rules HTML, which Reddit exposes no markdown for), §18.2 preview now uses the same parser and renderer with a 150 ms debounce |
| 4 | Inline text selection on comment bodies | `02` §9.5/§18.4 disabled it; `04a` never said | **Disabled**, stated explicitly in `04a` §14.2 and §17; the Guide is the one place it is enabled |
| 5 | Gallery Mode NSFW/spoiler blur | `02` §10.6 + `08` #25 apply it; `04b` §10.3 said "no blur, recommend adding" | **Blur applies**, same rules and reveal keying as feed cards |
| 6 | Gallery Mode 100-item cap | `04b` §10.1 said no cap exists, do not build one; `05` §3.1/§4 reinstate it as `gate.galleryMode` | **Reinstated as a gate**, rendered as an inline "Continue with Plus" footer after 100 items, never a hard stop at entry |
| 7 | Simultaneous gallery players | `04b` §10.3 "every cell plays, bounded only by the 12-cap"; `02` §10.6 caps at 4 | **4**, from the focus engine's candidate set |
| 8 | Live Text | `02` §10.7 + `08` #19 implement it; `04c` §17.1 still called the key dead | **Implemented**; `04c` corrected |
| 9 | Guide search | `04c` §21.3 specced baked embeddings + cosine similarity + Accelerate; `02` §11.7 + `03` §9.6 spec on-device SQLite FTS5 + BM25 | **FTS5 + BM25**, `k = 5`, no model, no vectors, no network. `04c` §21.3 rewritten; the AI answer card confirmed dropped |
| 10 | Video long-press menu | `08` #24 adds Share/Save/Copy Link; `04b` §7.4 and §9.3 said no menu exists anywhere | **Menu added** on inline and gallery video tiles; `04b` §9.3 exposure table rebuilt; `gate.downloads` sits on Save Video |
| 11 | Viewer entry transition | `02` §10.5 uses `.navigationTransition(.zoom(…))`; `04b` §2.1 said none | **Zoom transition adopted**, suppressed under Reduce Motion |
| 12 | Hard player error in the fullscreen viewer | `03` §10.2 makes it tap-to-retry (`fullscreen-player-retry`); `04b` §8.3 reproduced the no-retry gap under a different id | **Tap-to-retry** in the viewer; the inline feed player keeps its non-tappable copy. One id: `fullscreen-player-retry` |
| 13 | Vote / save failure handling | `04a` §7.4/§7.5 "apply only after the call resolves, reproduce"; `08` §4 said fix forward | **Optimistic with rollback** plus a transient inline error; no rejection swallowed |
| 14 | Post-detail vote not reflected in the feed | `04a` §7.4 shipped the bug; `02` §6.3 + `08` §2 fix it via `FeedMutationBus` | **Fixed**; `06` item 164 already said FIXED |
| 15 | `more` stub with `count: 0` | `04a` §14.5 rendered "0 more replies"; `03` §4.6 + `08` §2 render "Continue this thread →" | **Detected and navigable** |
| 16 | "Mark as seen on scroll" restart alert | `04a` §7.7 + `04c` §16.3 kept the alert; `02` §11.4 + `03` §8.1 + `08` made it live | **Live, no alert.** One id: `mark-seen-live` (was also spelled `mark-seen-restart`) |
| 17 | Error-reporting restart alert | `04c` §20.3 + `03` §8.1 kept it; `08` #45 + `05` §8 removed it | **Live, no alert**, read reactively |
| 18 | Gallery-mode one-time offer flag | `03` §8.1 + `04a` §10 wrote it only on accept; `08` §2 `gallery-offer-cancel` says either answer | **Either answer** |
| 19 | Composer discard confirmation | `04a` §16.5 confirmed nothing; `08` §4 fixes forward | **New post/comment/message: no prompt** (drafts persist). **Edit with unsaved changes: confirm first** |
| 20 | Post-type switch shares one text field | `04a` §16.5.3 reproduced the quirk; `03` §7.5 + `08` §2 fix it | **Separate field per post kind**, drafts keyed per kind |
| 21 | Draft key formats | `04a` §16.5.3 and `04c` §5.1/§5.2 invented `newCommentDraft-…`, `newMessageDraft-Subject-…`; `03` §7.5 declares `comment.<fullname>`, `message.subject.<recipient>`, … | **`03` §7.5's formats** everywhere |
| 22 | Theme import format | `02` §8.5 accepted the legacy `::hydra-theme-import::` sentinel and kept a 12-key legacy alias map; `04c` §18.5 used `::APPNAME-theme-import::{…}`; `08` #35 specifies `::appname-theme::` + base64url | **`08` #35's format**, single sentinel, base64url payload, brace-balanced scan, no legacy import, no alias map, no dual-emit toggle |
| 23 | Built-in theme catalogue | `04c` §18.2 reproduced the original's 12 named themes and their full hex palettes plus its comment-depth cycle; `08` #36 + `02` §8.5 require 6–8 new themes with new palettes | **Palette tables deleted.** Replaced by a normative structural contract (19 roles × 4 renditions, mode/status-bar flags, a 6-colour depth cycle in **new** colours) plus authoring constraints. Clean-room violation removed |
| 24 | "Premium themes" gate | `04c` §18.2 carried `[GATE: premium-themes]`; `05` §3.1 row Q makes every built-in free | **Not a gate.** Replaced with prose; `05` §4.1 records why |
| 25 | App-icon screen | `04c` §19 reproduced the original's four icon names (`cerberus`, `hail_hydra`, …), artist bios, avatars and links; `08` #37 requires new art and no credit screens | **Grid only**, 1 default + 3 new alternates, no detail page, no bios, no links. `SettingsRoute.appIconDetails` removed |
| 26 | Stats screen free vs gated | `04c` §20.2 shipped it free; `05` §3.1 row T + `08` #46 gate it | **`gate.stats`** with an honest locked screen; counters keep incrementing |
| 27 | User-page avatar | `04c` §6.1 rendered none; `08` #23 renders it | **Avatar rendered** |
| 28 | Login `dest` URL | `04c` §2.1 used `…/r/HydraClient`; `03` §5.3 uses the Reddit home page | **Home page**; third-party subreddit removed |
| 29 | Login CSS injection | `04c` §2.1 reproduced it; `03` §5.3 injects nothing (`login-css-injection`) | **Nothing injected** |
| 30 | Login-screen instructions | `04c` §2.1 left it to `08`; nothing decided it | **One line of explanatory copy**, registered as `08` #72 |
| 31 | Keychain item shape | `04c` §2.5 used `redditSession-<username>` / `AfterFirstUnlock`; `03` §7.4 uses service `com.OWNER.appname.session` / `ThisDeviceOnly` | **`03` §7.4** |
| 32 | Session-cookie expiry rewrite frequency | `03` §5.4 + `04c` §2.5 said after every response; `08` #27 + `07` say once per session per account | **Once per app session per account** |
| 33 | Account deletion confirmation | `04c` §1.2 had none | **Confirmation added**, registered as `08` #71 |
| 34 | Message composer copy bugs | `04c` §4.3/§5.1/§5.2 reproduced "Failed to submit comment", the "New Message" reply title and the non-flipping long-press label | **All three fixed**, one id: `message-modal-copy-bugs` |
| 35 | Review prompt | `04c` §21.1 deep-linked the write-a-review URL; `02` §5.9 + `08` #42 use `requestReview` | **`requestReview`** |
| 36 | Community-subscribe nudge | `04c` §21.1 kept it conditionally; `02` §5.9 called it an open question; `08` #43 removes it | **Not built** |
| 37 | Universal links | `04c` §13 recommended adding Associated Domains; `02` §5.7 + `08` #15 note we cannot host an AASA for `reddit.com` | **Not enabled in v1** |
| 38 | "Open in APPNAME" | `04c` §16.4 kept the iCloud-Shortcut install row | **App Intent**, no install step; row rewritten as informational |
| 39 | `hexToRgb` / `validateHex` | `04c` §18.4 reproduced the 6-digit-only decoder; `08` §2 `validateHex-bug` fixes both | **3/6/8-digit decoding + anchored validator**; tests updated |
| 40 | Startup URL default | `04c` §16.5 kept `https://www.reddit.com/`; `03` §8.1 `startup-url-default` uses `""` | **Empty**, so the initial-tab setting actually works |
| 41 | `Feature` enum | `02` §13.1 declared 10 speculative cases (`themeMaker`, `statsDetail`, `savedSearches`, `iCloudBackup`, …); `05` §5.9 declares the 11 real ones | **`05`'s eleven cases**; `02` §13 rewritten |
| 42 | Gating modifier and lock styles | `02` §13.3 had `requires(_:)` with a `.hidden` style and a `.previewable(duration:)` timed trial; `05` §5.9 has `requiresEntitlement(_:style:)` with four styles and §3.3 forbids timed previews | **`05`'s API.** `.hidden` and `TrialPolicy` deleted; the data-driven `FeatureMatrix.json` replaced by the `Feature.isGated` table, in `02` §13.2 and `03` §8.2 |
| 43 | Entitlement seam call | `04a` §1.1 said `entitlements.isEnabled(.x)` | **`entitlements.isUnlocked(_:)`** |
| 44 | Package list | `02` §3.1 numbered 12 rows (incl. two non-packages) and §2.1 said "~15"; `06` §1.2/§6 used a different 15-package layout (`Core`, `RedditKit`, `MarkdownRender`, `Feature/*`) | **`02` §2.2/§3.1 is canonical: 18 packages** (9 infrastructure + 9 under `Features/`) plus the app target and `ShareExtension`. `02` §2.1 corrected to 18; `06` §1.2 tree, §6 size table and every `RedditKit`/`Core` reference rewritten; `07` points at `02` §2.2/§3.1 |
| 45 | Route case names | `04a` §1.1 and `04c` used `.postDetail(PostRef)`, `.user(…)`, `.wiki(URL)`, `.webview(URL)`, `.messages(id)`, `.error(URL?)` | **`02` §5.5's names**: `.postDetail(PostTarget)`, `.userProfile`, `.wiki(WikiTarget)`, `.webView(WebViewTarget)`, `.messageThread(MessageID)`, `.unsupported(URL?)` |
| 46 | Settings key names | `04a` §19 and the `04c` tables used the original's flat keys against `03` §8.1's namespaced ones | **`03` §8.1 is normative** (`settings-key-rename`, `08` #78). Pointer notes added in `04a` §19 and `04c` §22.1; the individual keys spot-checked below were corrected in place |
| 47 | Comment sort count | `04a` §16.3 says six; `04c` §16.2's picker lists seven | **Both correct, now stated**: six real sorts in the in-post menu, plus a `default` sentinel in the Settings picker. Noted in `04c` §16.2 and `08` #21 |
| 48 | `SWIFT_VERSION` | `06` §1.3 said `6.4`; `02` §1.4 says `6.0` (language mode) | **`6.0` language mode on a Swift 6.4 toolchain**, stated explicitly |
| 49 | Markdown dependency scope | `06` §1.4 scoped `swift-markdown` to "composer preview only" | **The whole pipeline**; `07`'s guardrail corrected too |
| 50 | Redgifs `User-Agent` | `04b` §6.3/§6.4 sent the literal `Hydra` | **`APPNAME`**, matching `03` §1.4 / §9.1 |
| 51 | Photos-denied alert copy | `04b` §9.2 said "Allow Hydra …" with an editorial note | **"Allow APPNAME …"**, plus a Settings deep link the original lacked |
| 52 | OpenGraph concurrency | `04b` §11 said "all concurrent, no cap"; `03` §9.4 caps at 6 | **6 concurrent** (`og-concurrency-cap`) |
| 53 | Self-hosted-server section | `04c` §20.4 phrased as an instruction to a porter ("DROP THIS SECTION") | Rewritten as a statement of what `APPNAME` is; same outcome |
| 54 | Settings root row 7 | `04c` §15 labelled it "APPNAME Pro" | **"APPNAME Plus"**, and marked as not-a-gate |
| 55 | Settings root list | `06` item 307 listed rows that do not match `04c` §15 | Rewritten to `04c` §15's actual 13 rows in order |
| 56 | Tab-bar hide mechanism | two ids for one decision: `tab-hide-mechanism` (`04c`) and `tab-hide-on-scroll` (`02`) | One id: **`tab-hide-on-scroll`** (`08` #89) |
| 57 | Superscript rendering | `02` §9.4 renders a true baseline offset (`superscript-baseline`); `04a` §18.1 reproduced the unraised original (`markdown-sup-no-baseline`) | **True superscript**, one id: `superscript-baseline` (`08` #65) |
| 58 | Nested-list numbering | `04a` §18.1 reproduced the bug | **Correct numbering**, honouring `start` (`nested-list-render-bug`) |
| 59 | Emoji-only bodies | `04a` §18.1 said "recommend normalizing" | **Clamped** (`giant-emoji-bug`) |
| 60 | Endpoint ids `A1`/`A2` | referenced by `04c` §3.4 and its traceability table; never existed in `03` §5.2 | Removed with the `/prefs` behaviour. **Every remaining endpoint id in `04a`/`04b`/`04c` (`C2`, `C3`, `G1`, `G2`, `I1`–`I6`, `M2`, `M4`, `M5`, `P2`, `P3`, `Q1`, `R4`, `R7`, `S2`, `U1`, `U3`, `V1`) verified present in `03` §5.2** |
| 61 | Non-gate `[GATE: …]` tags | `pro-entry`, `inbox-badge`, `premium-themes` | All three removed and replaced with prose; `05` §4.1 now records each with a one-paragraph rationale (inbox badge **free**; Plus row is the paywall's entry point; built-in themes free) |
| 62 | Placeholder tags | `[GATE: x]`, `[GATE:]`, `[GATE: …]`, `[GATE: name]`, `[DECISION: x]`, `[DECISION: id]`, `[DECISION:]`, `[DECISION: …]` across 8 files | Resolved to real ids where they marked a real seam; metalinguistic mentions rewritten as `` `[GATE: gate.*]` `` / `` `[DECISION: <id>]` ``; inventory headings renamed. **Zero placeholder tags remain** |
| 63 | Two normalization tables | `05` §4.1 (gate aliases) and `08` §4 (decision aliases) | Both **deleted**. `05` §4.1 is now the not-a-gate note; `08` §4 is a three-rule canonicality statement |
| 64 | `04c` heading structure | six H1s (`# Part I`–`# Part V`) | Parts demoted to H2 and their sections to H3/H4; §23–§24 promoted back to document level. **All ten files: exactly one H1, no skipped levels** |
| 65 | Two table rows broken by an unescaped `\|` inside a code span | `03` §2.3 row 12, `04c` §11.2 | Escaped; every table in the set now has a consistent column count |
| 66 | Stale doc links | `02` and `03` referenced `06-build-plan.md` | Corrected to `06-build-plan-and-acceptance.md`. All inter-document links verified to resolve |

### Verified already consistent (no change needed)

Swipe thresholds 75/130 pt · focus thresholds 70 %/60 % · settle debounce 150 ms · tap 10 pt/300 ms,
double-tap 280 ms/45 pt · dismiss overscroll 50 pt/40 pt · player cap 12 · resume-position LRU 200 ·
seen cap 5 000 · drafts cap 100 · hidden-post expiry 30 days · feed ramp 10/20/40/70/100 with 5
retries · gallery ramp 10/30/50 with 3 retries · comment page limit 75 · `more` batch 10 · OpenGraph
timeout 1 750 ms · Redgifs 2 concurrent / LIFO / 3 attempts / 1 s×attempt / 30 s on 429 · inbox poll
60 s · caches 512 MB / 256 MB / 1 GB · entitlement offline leeway 16 days · product ids
`com.OWNER.appname.plus.monthly` / `.yearly` at $0.99 / $9.99 with a 7-day trial and Family Sharing
on · iOS 26.0 floor, iOS 27 SDK, Xcode 27, Swift 6.4 toolchain, Liquid Glass non-optional, Swift
Testing for units with XCTest confined to UI/perf.

### Settings spot-check (28 keys, `spec/06-settings-themes.md` §11.2 as ground truth)

Checked `03` §8.1 against `04a` §19 and `04c` §16–§20 for: `theme`, `darkTheme`,
`useDifferentDarkTheme`, `swipeAnywhereToNavigate`, `postSwipeOptions`, `commentSwipeOptions`,
`filterSeenPosts`, `hideSeenURLs`, `filteredSubreddits`, `autoMarkAsSeen`, `filterText`,
`readClipboard`, `externalLinkBrowser`, `openInReaderMode`, `initialTab`, `startupURL`,
`defaultPostSort`, `defaultPostSortTop`, `rememberPostSubredditSort`, `defaultCommentSort`,
`sortHomePage`, `postCompactMode`, `postTitleLength`, `postTextLength`, `linkDescriptionLength`,
`blurNSFW`, `liveTextInteraction`, `allowErrorReporting`.

Mismatches found and fixed: **`startupURL`** default (`04c` still had the original's non-empty
default — now `""` per `startup-url-default`); **`externalLinkBrowser`** value names (`04c` used the
raw legacy strings — now `BrowserChoice.inApp` / `.system` etc.); **`allowErrorReporting`** restart
requirement (removed in `03` and `04c`); **`postTitleLength`** documented as having a `0 =
unlimited` case in `04a` that its own 1–10 range excludes (removed); **`autoMarkAsSeen`** restart
alert (removed); and the key-naming mismatch itself, handled by the `03` §8.1 pointer notes rather
than by renaming ~60 keys in two documents. All other defaults matched `spec/06` §11.2 exactly.

---

## 2. Canonical gate list (`05-monetization.md` §4)

Eleven ids. `05` §3.1's matrix, `05` §4's table, `05` §5.9's `Feature` enum, `02` §13.1's `Feature`
enum and the `04a`/`04b`/`04c` traceability inventories were verified to agree exactly.

| Gate id | Default | Where the tag lives |
|---|---|---|
| `gate.multiAccount` | gated | `04c` §1.1, §2.7 |
| `gate.customThemes` | gated | `04c` §18.1, §18.3, §18.5; `04a` §4.5, §16.5.1, §18.1 |
| `gate.gestures` | gated | `04c` §16.1 |
| `gate.filters` | gated | `04c` §16.3; `04a` §7.3, §7.6, §7.7, §7.8 |
| `gate.galleryMode` | gated (100-item free allowance, inline footer) | `04b` §10.1; `04a` §10, §11.1 |
| `gate.downloads` | gated | `04b` §3.4, §7.4, §9 |
| `gate.stats` | gated | `04c` §20.2 |
| `gate.appIcons` | gated | `04c` §19 |
| `gate.sortMemory` | **OWNER**, gated | `04a` §16.4; `04c` §16.2 |
| `gate.videoAutoplay` | **OWNER**, free | `04a` §9; `04b` §7.2 |
| `gate.compose` | **OWNER**, free | `04a` §16.5 |

**Not gates** (recorded in `05` §4.1): the Settings → APPNAME Plus row, the inbox badge and its
polling, and the built-in theme catalogue.

---

## 3. Canonical decision-id list (`08-decisions-and-drift.md`)

Three sets, no aliases. Every `[DECISION: …]` tag in `02`–`07` was verified to name a member of one
of them.

### §1 — 95 numbered decisions

1 `pro-removed` · 2 `ai-removed` · 3 `push-removed` · 4 `monetization-model` · 5 `gate-matrix` ·
6 `ipad-split-view-deferred` · 7 `android-out-of-scope` · 8 `guide-included-or-not` ·
9 `guide-prose-rewrite` · 10 `self-hosted-server-row` · 11 `sentry-or-not` · 12 `app-name` ·
13 `bundle-id` · 14 `min-ios` · 15 `universal-links-absent` · 16 `shortcuts-intent` ·
17 `post-summary-dead-setting` · 18 `comment-summary-dead-setting` · 19 `live-text-dead-setting` ·
20 `poll-voting-stub` · 21 `comment-sort-six` · 22 `inbox-no-filter-tabs` · 23 `user-page-minimal` ·
24 `no-video-longpress-menu` · 25 `gallery-mode-no-blur` · 26 `prefs-force-over18-on-login` ·
27 `cookie-expiry-rewrite` · 28 `redgifs-memory-only` · 29 `no-429-handling` · 30 `raw-json-param` ·
31 `pagination-cursor` · 32 `time-format-parity` · 33 `number-format-parity` · 34 `unpruned-tables` ·
35 `theme-import-format-compat` · 36 `theme-count` · 37 `app-icons-new-art` · 38 `snudown-renderer` ·
39 `comment-tree-renderer` · 40 `swipe-forward-gesture` · 41 `scroll-to-next-button` ·
42 `startup-modals` · 43 `subscribe-nag-removed` · 44 `clipboard-read-default` ·
45 `error-reporting-default` · 46 `stats-obfuscation` · 47 `hidden-posts-local` ·
48 `captcha-webview-fallback` · 49 `report-webview` · 50 `wiki-webview` ·
51 `multireddit-merged-feed` · 52 `background-audio-pip` · 53 `feed-focus-playback` ·
54 `shared-player-registry` · 55 `share-extension` · 56 `nav-bar-tap-guard` ·
57 `comment-menu-copy-text` · 58 `crosspost-longpress` · 59 `context-no-highlight` ·
60 `vote-no-optimistic-rollback` · 61 `unhandled-save-failure` · 62 `composer-no-discard-confirm` ·
63 `edit-draft` · 64 `text-height-repair-omit` · 65 `superscript-baseline` · 66 `quote-first-line` ·
67 `no-speculative-preload` · 68 `viewer-zoom-transition` · 69 `fullscreen-player-retry` ·
70 `gallery-video-cap` · 71 `no-confirm-account-delete` · 72 `login-no-instructions` ·
73 `login-css-injection` · 74 `user-agent-string` · 75 `stale-modhash-recovery` ·
76 `og-concurrency-cap` · 77 `startup-url-default` · 78 `settings-key-rename` · 79 `mark-seen-live` ·
80 `drop-update-group-footer` · 81 `no-blocked-users-screen` · 82 `search-no-sort` ·
83 `sidebar-single-stat` · 84 `data-use-copy-typo` · 85 `stats-no-reset` · 86 `stats-tracking-epoch` ·
87 `review-prompt-mechanism` · 88 `guide-ai-answer-drop` · 89 `tab-hide-on-scroll` ·
90 `tab-longpress-mechanism` · 91 `background-inbox-refresh` · 92 `op-mod-badges` ·
93 `persistence-wrapper` · 94 `xcproj-format` · 95 `warnings-as-errors`

**#57–#95 are new entries written in this pass**, each with the register's full five columns
(evidence, default, alternative, impact). They replace the "(new)" lists that `02` §21.2 and `03`
§14.2 used to carry and the fix-forward one-liners that `08` §4's alias table used to carry.

### §2 — 16 original-app bugs, fixed forward

`validateHex-bug` · `nested-list-render-bug` · `giant-emoji-bug` · `message-modal-copy-bugs` ·
`postdetail-vote-not-reflected` · `newpost-type-switch-keeps-text` · `unknown-error-rethrow` ·
`time-year-seam` · `edit-comment-crash` · `list-divider-index` · `account-settings-throttle` ·
`no-offline-detection` · `gallery-offer-cancel` · `formatUser-null-guards` · `more-stub-count-zero` ·
`pencil-modal-close`

### §3 — 20 documentation-drift rows

`D1`–`D20`, usable as tag ids (only `D17`, the Google-sign-in row, is currently referenced).

### Aliases retired in this pass

`ipad-split-view` → `ipad-split-view-deferred` · `universal-links` → `universal-links-absent` ·
`open-in-appname-shortcut-vs-intent` → `shortcuts-intent` · `dead-setting-post-summary` →
`post-summary-dead-setting` · `dead-setting-comment-summary` → `comment-summary-dead-setting` ·
`gallery-no-nsfw-blur` → `gallery-mode-no-blur` · `gallery-no-post-cap` → `gate-matrix` (+
`gate.galleryMode`) · `force-nsfw-account-settings` → `prefs-force-over18-on-login` ·
`no-video-long-press-menu` → `no-video-longpress-menu` · `no-follow-avatar-trophies` →
`user-page-minimal` · `no-mentions-category` → `inbox-no-filter-tabs` · `report-generic-webview` →
`report-webview` · `wiki-is-a-webview` → `wiki-webview` · `pagination-cursor-fullname` →
`pagination-cursor` · `time-format-12mo-seam` → `time-format-parity` · `hls-url-entity-decoding` →
`raw-json-param` · `no-pip` → `background-audio-pip` · `continue-thread-stub` →
`more-stub-count-zero` · `detail-vote-not-in-feed` → `postdetail-vote-not-reflected` ·
`newpost-type-switch-shares-text` → `newpost-type-switch-keeps-text` · `newpost-unknown-error-rethrow`
→ `unknown-error-rethrow` · `nested-list-numbering` → `nested-list-render-bug` · `giant-emoji` →
`giant-emoji-bug` · `list-separator-quirk` → `list-divider-index` · `message-error-copy`,
`message-longpress-label`, `reply-title-copy` → `message-modal-copy-bugs` · `mark-seen-restart` →
`mark-seen-live` · `self-hosted-server-drop` → `self-hosted-server-row` · `validatehex-regex` →
`validateHex-bug` · `app-icon-art` → `app-icons-new-art` · `stats-free` → `gate-matrix` ·
`premium-themes-free` → `theme-count` · `fullscreen-player-error-no-retry` →
`fullscreen-player-retry` · `markdown-sup-no-baseline` → `superscript-baseline` ·
`tab-hide-mechanism` → `tab-hide-on-scroll` · `community-subscribe-nudge` → `subscribe-nag-removed` ·
`apple-app-site-association` → `universal-links-absent` · `react-native-screens` →
`nav-bar-tap-guard` · `swift-markdown` → `snudown-renderer`

---

## 4. Known residual issues (not fixed here — out of scope)

- **Theme palettes are now a contract, not data.** `04c` §18.2 specifies the shape of the built-in
  catalogue but contains no actual colours, because the originals could not be reused. Someone has to
  author 6–8 palettes before Phase 0 can finish; `07` §A gained a kickoff item (13a) saying so.
- **Guide corpus.** `04c` §21.3 specifies 10–14 topics and the categories they cover, but every word
  of the prose still has to be written (`guide-prose-rewrite`).
- **Feature completeness was not audited.** This pass only reconciled what the documents already
  said; a separate gap audit covers anything the set is missing against `spec/08`'s 327-item
  inventory.

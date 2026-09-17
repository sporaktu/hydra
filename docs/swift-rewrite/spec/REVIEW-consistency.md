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

---

## 5. iPad reinstatement (2026-09-17, after §§1–4)

The owner reversed one product decision: **iPad support, including the original's split view, is in
scope for v1** and is "very important". Decision #6 in `08` changed from `ipad-split-view-deferred`
(iPhone only) to **`ipad-split-view-in-scope`** (parity with `spec/01` §10). This section records what
changed and on what evidence. Nothing in `spec/01`–`spec/10` was edited; the surveys remain the ground
truth, and this pass reads them rather than revising them.

**The retired id.** `ipad-split-view-deferred` no longer exists anywhere in `00`–`08`. §3's
normalization table above still lists the earlier-draft spelling `ipad-split-view` mapping onto it;
that mapping is historical, and the live id for the subject is `ipad-split-view-in-scope`.

### 5.1 New decision ids

| # | id | Subject |
|---|---|---|
| 6 | `ipad-split-view-in-scope` | **Rewritten.** iPhone **and** iPad, `TARGETED_DEVICE_FAMILY = 1,2`, the original's two-pane split view at parity. Default = full parity per `spec/01` §10; alternative = a `NavigationSplitView`-based simplification |
| 96 | `split-view-column-ratio` | 40 % feed / 60 % detail (the original's `flex: 1` / `flex: 1.5`), hairline divider, 320 pt minimum feed column, not draggable in v1 |
| 97 | `split-view-tab-style` | Keep a plain `TabView`; do **not** adopt `.tabViewStyle(.sidebarAdaptable)`; the iPad bar sits at the top, so `02` §5.4's inset allow-list applies to the top edge |
| 98 | `split-view-pane-navigation` | The pane owns a `NavigationStack` + `Router`; `RouteDestination.for(_:)` decides pane-vs-tab placement; Fullscreen transfers the pane's top route. The one knowing divergence from the original's split-view behaviour |
| 99 | `gallery-mode-wide-columns` | Gallery Mode's column count becomes width-derived (2–5); every current iPhone width still yields exactly 2 |
| 100 | `ipad-keyboard-shortcuts` | A minimal shortcut set surfaced through `.commands`, so the iPadOS 26 menu bar is not empty. The only net-new UX in this pass |

Drift row **D19** was rewritten from "out of scope" to "reproduced at full parity". Bug id
`pencil-modal-close` lost its "not applicable on iPhone-only" disposition and became a Phase 9 iPad
device check.

### 5.2 Files and sections changed

| File | Sections |
|---|---|
| `00-README.md` | Intro line; principle 3 (now "iPhone and iPad"); principle 8 id range (#1–#100); owner-decisions table (Platform row rewritten, new "iPad split view" row); reading-order row for `08` (95 → 100 decisions). Reading order otherwise unchanged — no new file was added |
| `02-architecture.md` | Header line; §0.4 non-goals (iPad row replaced by "three-or-more panes / app-level sidebar"); §1.1 (Devices, Orientation, new Windowing row); §1.4 (`TARGETED_DEVICE_FAMILY = 1,2`); §3.1 (AppRouting responsibilities); §5.4 (iPad tab-bar placement); §5.10 rule 2 (three → four `glassEffect` sites); §5.11 (split iPhone/iPad orientation policy); **new §5.15 "iPad shell and split view"** with §5.15.1 the restated contract, §5.15.2 the SwiftUI mapping and the five reasons not to use `NavigationSplitView`, §5.15.3 pane routing, §5.15.4 window resize, §5.15.5 layout/chrome/Liquid Glass, §5.15.6 pointer and keyboard, §5.15.7 the compact-mode default; §19 (door-open table rewritten); §20 (new traceability row, §5.11 and §19 rows updated); §21.1 (#6 entry) and §21.2 (four new ids) |
| `03-data-and-networking.md` | §8.1 — `post.compactMode`'s default restored to `deviceSupportsSplitView`; new `post.splitViewEnabled` row with its default rule, visibility rule and consumer; the `splitViewEnabled` row removed from the "Removed" block. No other split-view key exists in `spec/01` |
| `04a-feeds-posts-comments.md` | Target line; scope note rewritten; **new §3.5 "Split view (iPad)"** (§3.5.1 activation, §3.5.2 layout, §3.5.3 tap-to-pane, §3.5.4 selection state and what clears it, §3.5.5 pane controls, §3.5.6 inside the pane, §3.5.7 pane vs. pushed); §4 compact-mode default; §6 tap-target note; §15.4 container note; §19 settings table; §21.1 traceability; §21.2 decision inventory |
| `04b-media.md` | Target line; deferral note replaced; §2.1 orientation bullet made device-aware; **new §2.1a "The viewer on iPad"**; §10.3 width-derived gallery columns and the unchanged 4-player cap; §16.1 traceability; §16.2 decision inventory |
| `04c-accounts-inbox-search-subs-settings.md` | Target line; scope note; §12 browser-orientation row; §17.1 — `postCompactMode` default corrected and the **"Enable split view"** row restored in `spec/06` §4.1's position, with label, description copy, default rule, key, visibility rule and effect, plus a row-order and divider note; §13 "Open in APPNAME" copy ("your device"); §4 avatar rationale; §22 startup orientation step; §24.1 traceability; §24.2 decision inventory |
| `05-monetization.md` | §3.1 row **M** — split view named explicitly as free structural navigation, with the reasoning; no gate id added, and the row states that none may be |
| `06-build-plan-and-acceptance.md` | §1.3 (`TARGETED_DEVICE_FAMILY = 1,2`, `UISupportedInterfaceOrientations~ipad`, `UIRequiresFullScreen` absent — in both the settings table and the deliberately-absent table); §1.6 CI (new `build-ipad` job, `ui-smoke` on two destinations); §1.8 assets (iPad screenshot set); §2 gate paragraph; Phase 0 (deliverables, DoD, tests, smoke, new iPad smoke); Phase 2, 3, 4, 7, 9 (deliverables and new iPad smoke lists); Phase 9 Liquid Glass audit run per device class; Phase 10 screenshots; §3 verification method items 1 and 4; §4 items 204–208 un-CUT and rewritten, new 208d–208g, 252, 253, 312, 90; §5 risks **R13** (live-resize state loss), **R14** (Liquid Glass placement on iPad), **R15** (iPad review assets); §6 size estimate (+~1,400 LoC, 11–15 weeks) |
| `07-one-shot-prompt.md` | Mission line; §A new kickoff items **13c** (an iPad-class test device) and **13d** (iPad App Store screenshots) and item 14 (both simulator runtimes); non-negotiable **2** rewritten; the phase gate block (second `xcodebuild build` destination); verification method (compile, UI smoke, new iPad manual smoke); assumed-decisions block (new iPad paragraph); output artifacts 1–4; id range #1–#100; traceability |
| `08-decisions-and-drift.md` | Counts (95 → 100); **#6 rewritten** as `ipad-split-view-in-scope` with evidence, default, alternative and impact; **#96–#100 appended** after #95; §2 `pencil-modal-close` disposition; §3 rows **D16** and **D19**; §4 gained a "one id has been retired" paragraph; Traceability rows for §1.1 items 6–7 and §1.4 |

### 5.3 Platform facts verified for this pass (cited in `02` §1.1, §5.11, §5.15, §20)

- [TN3192 — Migrating your iPad app from the deprecated `UIRequiresFullScreen` key](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key)
- [`UIRequiresFullScreen`](https://developer.apple.com/documentation/BundleResources/Information-Property-List/UIRequiresFullScreen) — deprecated; ignored in a future release
- [WWDC25 282 — Make your UIKit app more flexible](https://developer.apple.com/videos/play/wwdc2025/282/) — resizable scenes, window controls, `sizeRestrictions.minimumSize` as a best-effort preference, "build adaptive UIs rather than locking orientation"
- [`horizontalSizeClass`](https://developer.apple.com/documentation/swiftui/environmentvalues/horizontalsizeclass) · [`onGeometryChange(for:of:action:)`](https://developer.apple.com/documentation/swiftui/view/ongeometrychange(for:of:action:)) · [`containerRelativeFrame(_:alignment:_:)`](https://developer.apple.com/documentation/swiftui/view/containerrelativeframe(_:alignment:_:))
- [Building and customizing the menu bar with SwiftUI](https://developer.apple.com/documentation/SwiftUI/Building-and-customizing-the-menu-bar-with-SwiftUI) · [WWDC25 256 — What's new in SwiftUI](https://developer.apple.com/videos/play/wwdc2025/256/) · [`keyboardShortcut`](https://developer.apple.com/documentation/swiftui/keyboardshortcut)
- [`NavigationSplitView`](https://developer.apple.com/documentation/swiftui/navigationsplitview) · [`TabViewStyle.sidebarAdaptable`](https://developer.apple.com/documentation/SwiftUI/TabViewStyle/sidebarAdaptable) · [WWDC24 10147 — Elevate your tab and sidebar experience in iPadOS](https://developer.apple.com/videos/play/wwdc2024/10147/)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) · [WWDC25 323 — Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/) — inset glass sidebars with content flowing behind them
- [What's new in iPadOS 27](https://developer.apple.com/ipados/whats-new/) — platform/SwiftUI additions
- [MacRumors — iPadOS 26 multitasking](https://www.macrumors.com/2025/09/17/ipados-26-multitasking-tips-and-tricks/) — the consumer-facing shape of the change (Full-Screen Apps / Windowed Apps / Stage Manager; Split Screen and Slide Over folded into windowing). Secondary source, used only where Apple documents the API rather than the mode names

### 5.4 Programmatic checks run after the pass

A checker over `00`–`08` (10 files) asserts, and passes on, all of:

1. No occurrence of the retired id, of "iPhone only" / "iPhone-only", of `TARGETED_DEVICE_FAMILY = 1`
   without `,2`, of "no iPad"/"No iPad", or of "out of scope" on a line mentioning iPad or split view
   (the three-or-more-pane exclusions are the only sanctioned exception and are matched explicitly).
2. Every `[DECISION: <id>]` tag names a numbered entry in `08` §1 (now #1–#100, contiguous and
   duplicate-free), a bug id in §2, or a drift row `D1`–`D20` in §3.
3. Every `[GATE: gate.*]` tag names one of the eleven canonical gate ids.
4. All 305 `` `NN` §N.N `` cross-references between `02`–`06` resolve to a real heading in the target
   document — including every new pointer from `06`'s checklist into `04a` §3.5 and `04c` §17.1.
5. Exactly one H1 per file.
6. Every Markdown table has a consistent column count across its header, delimiter and body rows.
7. Positive assertions that each new section, key, setting row, plist key and decision id is present.

The checker was verified against deliberately injected faults (a dangling `§99.9` reference, a second
H1, a ragged table row) before being run for real.

---

## 6. Native polish integration (2026-09-17, after §5)

The owner added a requirement: *"enable quality-of-life features like the high-quality touch
vibration you get on native iPhone apps for ALL gestures, and make sure we're using the latest modern
iPhone capabilities and software features."* This pass researched what is GA on iOS 26/27 today,
wrote a new normative document, and threaded it through the set.

### 6.1 The new document

`09-native-polish-and-platform-features.md` — §1 principles, §2 the haptic map (153 enumerated
interactions across six maps, plus the implementation pattern, the global toggle, a ten-item do-not
list and a test method), §3 the modern platform features (nineteen shipped, one optional-off, four
deferred, eight rejected), §4 the per-surface accessibility baseline and its eight-part verification,
§5 motion polish with a per-animation Reduce Motion fallback table, §6 traceability and citations.

**Three research findings changed the design rather than confirming it.**

1. **Five `SensoryFeedback` cases are documented no-ops on iOS.** `.start`/`.stop` play only on
   watchOS; `.increase`/`.decrease` only on watchOS and visionOS; `.levelChange` only on macOS. A
   naive map would have used `.start` for entering the floating button's reposition mode and
   `.increase`/`.decrease` for the Theme Maker's sliders, and both would have shipped as silence.
   They are banned outright and the lint rule enforces it.
2. **iOS 26 added a control-semantic haptic family** — `.press(_:)`, `.release(_:)` and
   `.selection(_:)` with `PressFeedback` / `ReleaseFeedback` / `SelectionFeedback` — which is at the
   deployment floor. It is used for the two **custom** RGB sliders' end stops and nowhere else,
   because every other control in the app is a system control and the HIG states that switches,
   sliders and pickers already play Apple's haptics.
3. **Picture in Picture requires the `audio` background mode**, which contradicted the plan's "no
   `UIBackgroundModes` at all". Resolved in favour of shipping PiP with the mode narrowed to it
   alone, under five testable guardrails; `08` #52 was split accordingly and every document that
   repeated the old statement was updated.

### 6.2 Contradictions found and resolved

| # | Contradiction | Resolution |
|---|---|---|
| N1 | `02` §14.7, `06` §1.3 and `07`'s guardrails all said **no** `UIBackgroundModes`; PiP cannot exist without `audio` | Ship PiP; declare `audio` and only `audio`; narrow it with five guardrails (`09` §3.8.1). `08` #52's PiP half superseded by #114, its background-audio half kept. `02` §14.7, §19, `04b` §7.4, §8.1, `06` §1.3, `07` guardrails and assumed decisions all rewritten |
| N2 | `02` §5.13's three-call haptic vocabulary vs a map that needs twelve cues | `02` §5.13 rewritten to carry only the structural facts and to name `09` §2 as normative |
| N3 | `02` §5.13 and `04a` §2.4 fired the pull-to-refresh haptic on **commit**; the crossing is the commitment and firing on both breaks the one-per-action rule | Cue moved to the threshold crossing, once per drag; commit is silent. Both documents updated |
| N4 | The brief suggested "band exit: none", but `04a` §20.2's `oneHapticPerTransition` test asserts four haptics for 0→80→140→80→0 | Inward transitions keep a cue, at a lighter intensity. The test is unchanged |
| N5 | "No backend of any kind" vs shipping iCloud sync | iCloud KVS and Handoff are Apple-operated services inside the user's own Apple Account. Stated explicitly in `09` §1.1 rule 6, `02` §14.10, `03` §8.3 and `07` non-negotiable 11; `[DECISION: self-hosted-server-row]` and the "Data Not Collected" label are unchanged |
| N6 | "No AI features" vs `IndexedEntity`, whose documentation says it makes entities "discoverable by Apple Intelligence" | Ship it, with the plain `CSSearchableItem` path as the canonical write so the feature is identical without Apple Intelligence, and a documented two-line fallback if the owner vetoes the association (`09` §3.5) |
| N7 | "No AI features" vs Writing Tools, which Apple documents as using LLMs and Apple Intelligence | Not adopted — and **not suppressed** either, because it is a system affordance in every text view and disabling it in one app is hostile (`09` §3.15, `[DECISION: writing-tools-not-adopted]`) |
| N8 | "No push notifications" vs WidgetKit and ControlWidget, both of which *can* refresh over APNs | Widgets use `TimelineReloadPolicy.never` and in-app reloads; controls refresh when used. No APNs entitlement, no `NSSupportsLiveActivities` (`09` §3.2, §3.3, §3.15) |
| N9 | The package count "exactly 18" appeared in `02` §2.2/§3.1, `06` §1.2 and `07` | Now **20** packages (11 infrastructure + 9 feature) and **three** non-package targets. Every occurrence updated |

### 6.3 Files and sections changed

| File | Sections |
|---|---|
| `09-native-polish-and-platform-features.md` | **New.** §§1–6 |
| `00-README.md` | Reading order (new `09` row; `08` count 100 → 127); principle 6 (AI/push survival note); **new principle 8** "Native quality of life", old 8 renumbered to 9 (#1–#127); owner-decisions table (new "Native polish" row) |
| `02-architecture.md` | §0.4 (four new non-goals); §2.2 (layout, 18 → 20 packages, `WidgetsExtension`); §3.1 (new rows 13 `AppIntentsKit`, 14 `SyncKit`, 15 `WidgetsExtension`); §3.3 (diagram nodes and edges); §5.12 (band-haptic pointer); **§5.13 rewritten**; §11.5 (no Keychain sync); §13.4 (new rule 0: nothing in `09` is gated); §14.6 (plist and entitlement additions); **§14.7 rewritten**; **new §14.8–§14.11**; §15.1 (points at `09` §4); §19 (door-open rows rewritten); §20 (three traceability rows); §21.1 (`background-audio-pip` row); **new §21.3** |
| `03-data-and-networking.md` | §7.4 (no Keychain sync); §8.1 (five new keys: `feedback.haptics`, `feedback.offerTranslate`, `sync.icloud`, `sync.handoff`, `sync.lastAppliedAt`); **new §8.3** iCloud-synced keys with the last-writer-wins rule; **new §8.4** Spotlight index schema; **new §12.5** Handoff payload; §13 (three traceability rows) |
| `04a-feeds-posts-comments.md` | §2.4, §2.5, §6, §7.1, §7.2, §7.4, §7.5, §7.6, §9, §11, §3.5.5, §15.1, §15.4, §16.1, §16.2, §16.5 (haptic/transition pointers); §21.1 and §21.2 (traceability and seven new decision ids) |
| `04b-media.md` | §2.3, §2.4, §3.2, §3.4, §7.3, §7.4, §8.1 (PiP row rewritten, background-audio row rewritten), §10.4, §14 (component table), §16.2 (five new decision ids) |
| `04c-accounts-inbox-search-subs-settings.md` | §2.4, §2.7, §4.4, §7.1 (`Tab(role: .search)`), §7.4, §13 (five entry points, one intake path), **new §17.4 Feedback** (Haptic feedback, Offer Translate), §18.4, §19, **new "iCloud" section in §20.4** (Sync settings and themes, Handoff), §24.1, §24.2 (twelve new decision ids) |
| `05-monetization.md` | §3.1 row X (rewritten as an OWNER row, default free); §3.2 (free-tier statement); §4.1 (nothing in `09` is a gate; no twelfth id). **The eleven gate ids are unchanged** |
| `06-build-plan-and-acceptance.md` | §1.2 (layout, `WidgetsExtension`, two new packages, three entitlements files); §1.3 (five plist/entitlement rows added, "deliberately absent" table rewritten); §1.6 (three new CI jobs: `build-extensions`, `graph`, `haptics-lint`); §2 Phase 0 (20 packages, both extensions, the haptics facade, the full entitlement set); §2 **Phase 9 rewritten** with the eight-part native-polish deliverable, the haptics audit, the accessibility audit and a native-polish device smoke; §3 (verification steps 1, 7, 8); §4 intro and **new area Z (41 items)**; §5 (new risks R16–R19); §6 (two new packages, one new target, revised totals and calibration); Traceability |
| `07-one-shot-prompt.md` | §A step 5 (capabilities), **new step 5a** (the PiP/background-mode decision), **new steps 17–18**; Step 0 reading order and tag/precedence paragraphs; **new non-negotiable 12**; non-negotiable 11 (iCloud is not a backend); the assumed-decisions block (six new bullets, the PiP bullet rewritten); Guardrails (entitlements, 20 packages, two hard graph edges, no `[GATE:]` in `09`); Output artifacts 1, 3, 4; Traceability |
| `08-decisions-and-drift.md` | Header counts (100 → 127); #16 and #68 extended; **#52 split**; **new §1.5 with #101–#127**; §4 (#1–#127, `09` included in the tag namespace); Traceability |
| `spec/REVIEW-consistency.md` | This section |

**Not touched:** `spec/01`–`spec/10` (the surveys and the platform baseline are inputs, not outputs),
and the eleven gate ids in `05` §4.

### 6.4 New decision ids (`08` §1.5, #101–#127)

`native-haptic-map` (101) · `haptics-toggle` (102) · `haptics-implementation-split` (103) ·
`core-haptics-not-used` (104) · `widgets-homescreen` (105) · `widget-write-actions-deferred` (106) ·
`control-center-controls` (107) · `app-intents-shortcuts` (108) · `spotlight-index` (109) ·
`handoff-continuity` (110) · `icloud-kvs-sync` (111) · `icloud-keychain-sessions-no` (112) ·
`cloudkit-dataset-sync-deferred` (113) · `pip-fullscreen-video` (114) ·
`background-mode-audio-pip-only` (115) · `zoom-transitions-everywhere` (116) · `symbol-effects` (117) ·
`search-tab-role` (118) · `translation-optional` (119) · `writing-tools-not-adopted` (120) ·
`accessibility-baseline-normative` (121) · `motion-reduce-parity` (122) · `mac-designed-for-ipad` (123) ·
`visionos-compat-app-store` (124) · `live-activities-rejected` (125) · `no-in-app-app-lock` (126) ·
`native-polish-free` (127)

### 6.5 Platform facts verified for this pass

All read **2026-09-17** through the `developer.apple.com/tutorials/data/...json` DocC endpoints (the
same data the rendered docs site serves, so the availability annotations are authoritative) except
the two Apple Support pages, which were read as rendered HTML. The complete list also appears in
`09` §6.3.

**Haptics — the API surface and, critically, the per-case platform notes**

- [`SensoryFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback) (iOS 17.0) and its three modifier forms: [`sensoryFeedback(_:trigger:)`](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(_:trigger:)), [`sensoryFeedback(_:trigger:condition:)`](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(_:trigger:condition:)), [`sensoryFeedback(trigger:_:)`](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(trigger:_:))
- Plays on iOS: [`.impact(weight:intensity:)`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/impact(weight:intensity:)) · [`.impact(flexibility:intensity:)`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/impact(flexibility:intensity:)) · [`.selection`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/selection) · [`.success`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/success) · [`.warning`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/warning) · [`.error`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/error) · [`.alignment`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/alignment) · [`.pathComplete`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/pathcomplete) (iOS 17.5)
- **Does not play on iOS:** [`.levelChange`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/levelchange) (macOS only) · [`.increase`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/increase) and [`.decrease`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/decrease) (watchOS, visionOS) · [`.start`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/start) and [`.stop`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/stop) (watchOS)
- iOS 26 control family: [`.press(_:)`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/press(_:)) · [`PressFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/pressfeedback) · [`ReleaseFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/releasefeedback) · [`SelectionFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/selectionfeedback)
- Weights and flexibilities: [`SensoryFeedback.Weight`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/weight) · [`SensoryFeedback.Flexibility`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/flexibility)
- UIKit tier: [`UIFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uifeedbackgenerator) · [`prepare()`](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/prepare()) · [`init(view:)`](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/init(view:)) (iOS 17.5; `init()` and `init(style:)` are deprecated) · [`UIImpactFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator) · [`impactOccurred(at:)`](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator/impactoccurred(at:)) (iOS 17.5) · [`UISelectionFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uiselectionfeedbackgenerator) · [`UINotificationFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator)
- Custom: [`CHHapticEngine`](https://developer.apple.com/documentation/corehaptics/chhapticengine) — considered and rejected for v1
- Guidance: [HIG — Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) ("Make haptics optional", "Avoid overusing haptics", and the note that switches, sliders and pickers already play system haptics)

**Platform surfaces**

- [WidgetKit](https://developer.apple.com/documentation/widgetkit) · [`ControlWidget`](https://developer.apple.com/documentation/swiftui/controlwidget) (iOS 18.0) · [ActivityKit](https://developer.apple.com/documentation/activitykit) (rejected) · [Run shortcuts with the Action button](https://support.apple.com/guide/shortcuts/run-shortcuts-with-the-action-button-apdfea15680b/ios)
- [App Intents](https://developer.apple.com/documentation/appintents) · [`AppIntent`](https://developer.apple.com/documentation/appintents/appintent) · [`AppShortcutsProvider`](https://developer.apple.com/documentation/appintents/appshortcutsprovider) (iOS 16.0) · [App Shortcuts](https://developer.apple.com/documentation/appintents/app-shortcuts) · [`IndexedEntity`](https://developer.apple.com/documentation/appintents/indexedentity) (iOS 18.0) · [`CSSearchableItem`](https://developer.apple.com/documentation/corespotlight/cssearchableitem) · [Configuring Siri support](https://developer.apple.com/documentation/xcode/configuring-siri-support) (the capability belongs to SiriKit Intents extensions, which we do not ship)
- [`NSUserActivity`](https://developer.apple.com/documentation/foundation/nsuseractivity) · [`NSUserActivityTypes`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsuseractivitytypes) · [`userActivity(_:isActive:_:)`](https://developer.apple.com/documentation/swiftui/view/useractivity(_:isactive:_:)) · [`onContinueUserActivity(_:perform:)`](https://developer.apple.com/documentation/swiftui/view/oncontinueuseractivity(_:perform:))
- [`NSUbiquitousKeyValueStore`](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore) — 1 024 keys, 1 MB total, 1 MB per value, 128-character keys, and the explicit warning not to store sensitive information · [iCloud Key-Value Store Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.ubiquity-kvstore-identifier)
- [`AVPictureInPictureController`](https://developer.apple.com/documentation/avkit/avpictureinpicturecontroller) · [Adopting Picture in Picture in a standard player](https://developer.apple.com/documentation/avkit/adopting-picture-in-picture-in-a-standard-player) · [Configuring your app for media playback](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback) — the source of the "PiP needs the Audio, AirPlay, and Picture in Picture background mode" requirement

**SwiftUI polish, translation, distribution**

- [`navigationTransition(_:)`](https://developer.apple.com/documentation/swiftui/view/navigationtransition(_:)) (iOS 18.0) · [`SymbolEffect`](https://developer.apple.com/documentation/symbols/symboleffect) · [`.drawOn`](https://developer.apple.com/documentation/symbols/symboleffect/drawon) (iOS 26.0) · [`ContentTransition.symbolEffect`](https://developer.apple.com/documentation/swiftui/contenttransition/symboleffect) · [`TabRole.search`](https://developer.apple.com/documentation/swiftui/tabrole/search) (iOS 18.0) · [`scrollEdgeEffectStyle(_:for:)`](https://developer.apple.com/documentation/swiftui/view/scrolledgeeffectstyle(_:for:)) (iOS 26.0) · [`accessibilityAction(named:_:)`](https://developer.apple.com/documentation/swiftui/view/accessibilityaction(named:_:)) · [`RequestReviewAction`](https://developer.apple.com/documentation/storekit/requestreviewaction)
- [Translation framework](https://developer.apple.com/documentation/translation) (iOS 17.4) · [Writing Tools (UIKit)](https://developer.apple.com/documentation/uikit/writing-tools) — the source of the "system-provided large language models (LLMs) and Apple Intelligence" wording · [`writingToolsBehavior(_:)`](https://developer.apple.com/documentation/swiftui/view/writingtoolsbehavior(_:))
- [Lock or hide an app on iPhone](https://support.apple.com/guide/iphone/lock-or-hide-an-app-iph00f208d05/ios) — the system app lock is user-controlled, per-device and needs no developer work
- [Manage availability of iPhone and iPad apps on Macs with Apple silicon](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon/) · [Manage availability of iPhone and iPad apps on Apple Vision Pro](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro/)

**One advisory finding, recorded without changing anything.**
[`RequestReviewAction`](https://developer.apple.com/documentation/storekit/requestreviewaction) says
"don't call it in response to a button tap or other user action", while `04c` §21.1's pre-prompt card
calls it from a "Rate now" button (`08` #87). The design is deliberate and every exit path sets the
asked-flag regardless, so #87 is unchanged; the tension is noted in `09` §6.3 so it is not discovered
in review.

### 6.6 Programmatic checks after this pass

The checker of §5.4 was extended to cover `09` and area Z and re-run over all eleven `0*.md` files.
Additions: the decision-register range is now #1–#127; `09`'s `§` cross-references into `02`–`06`
resolve; area Z's 41 items are present and each names either a decision id or a `09` §; the
"no `UIBackgroundModes`" statement no longer appears anywhere except as the superseded history in
`08` #52; no `TODO`/`TBD`/`FIXME` placeholder text; and a scan for AI, push and backend terms
("Foundation Models", "Apple Intelligence", "Writing Tools", `UNUserNotificationCenter`
registration, "APNs", `SystemLanguageModel`) confirms every occurrence sits in a rejected,
not-used or explicitly-bounded context.

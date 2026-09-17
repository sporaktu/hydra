# 06 — Build Plan, Verification Gates and Acceptance Checklist

This is the execution plan for building `APPNAME` from scratch in a new, empty repository, in one
agentic pass, with a compile-and-test gate at the end of every phase.

Read alongside: `02-architecture.md`, `03-data-and-networking.md`,
`04a-feeds-posts-comments.md`, `04b-media.md`, `04c-accounts-inbox-search-subs-settings.md`,
`05-monetization.md`, `08-decisions-and-drift.md`, and `spec/01`–`spec/10` as the behavioural
reference corpus.

---

## 1. New repository bootstrap

### 1.1 Repository

| Item | Value |
|---|---|
| Repo name | `appname-ios` (placeholder; `[DECISION: app-name]`) |
| Visibility | Private until the first TestFlight build |
| Default branch | `main`; work branches `phase/NN-slug`; one squashed commit per phase onto `main` |
| Licence | Owner's choice — **not** AGPL-3.0, and with no derivation from the original. Recommended: proprietary (`LICENSE` stating all rights reserved) since the app is sold |
| `.gitignore` | Swift/Xcode template + `*.xcuserdatad`, `.DS_Store`, `DerivedData/`, `fastlane/report.xml`, `*.mobileprovision`, `*.p8`, `.env` |

**Clean-room boundary, restated:** the new repository contains no file, string, asset, palette,
icon, font or sentence copied from the original. The `docs/` folder carries behavioural
specifications written for this project; it is the only permitted channel of information from the
old app to the new one.

### 1.2 Directory layout

```
appname-ios/
├── APPNAME.xcodeproj                 # committed; see §1.3
├── APPNAME/                          # app target — thin shell only
│   ├── APPNAMEApp.swift              # @main, scene lifecycle (required by the iOS 27 SDK)
│   ├── RootView.swift                # TabView + 5 tab roots
│   ├── AppEnvironment.swift          # AppGraph composition root: wires stores into @Environment
│   ├── Info.plist                    # UILaunchScreen (required), URL types, usage strings
│   ├── APPNAME.entitlements
│   └── Resources/
│       ├── Assets.xcassets           # app icon sets, colors, symbols
│       ├── AppIcon.icon              # Icon Composer document (default)
│       └── AltIcon*.icon             # 3 alternates ([DECISION: app-icons-new-art])
├── ShareExtension/                   # NSExtensionActivationSupportsWebURLWithMaxCount = 1
│   ├── ShareViewController.swift
│   └── Info.plist
├── Packages/                         # the 18 packages of 02-architecture.md §2.2/§3.1, verbatim
│   ├── AppCore/                      # domain values, RedditLink, formatters, Feature, filters
│   ├── RedditAPI/                    # RedditClient actor, endpoint catalog, SessionStore, Redgifs
│   ├── Persistence/                  # GRDB stack, schema, seen/hidden/drafts/themes/stats, settings
│   ├── RedditMarkdown/               # Reddit-flavored markdown → AST → SwiftUI; composer preview
│   ├── Theming/                      # Theme model, ThemeStore, import/export codec, glass rules
│   ├── Entitlements/                 # StoreKit 2, Feature enum, paywall (05-monetization.md)
│   ├── MediaKit/                     # image pipeline, player registry, focus engine, viewer
│   ├── AppRouting/                   # Route enum, per-tab Router, RouteResolver, LinkIntake, modals
│   ├── DesignSystem/                 # shared SwiftUI primitives, swipe row, haptics facade
│   └── Features/
│       ├── FeedFeature/
│       ├── PostDetailFeature/
│       ├── ComposerFeature/
│       ├── MediaFeature/
│       ├── AccountsFeature/
│       ├── InboxFeature/
│       ├── SearchFeature/
│       ├── SubredditsFeature/
│       └── SettingsFeature/
├── Tests/
│   ├── UITests/                      # XCUITest smoke only (Swift Testing can't drive UI)
│   └── Fixtures/                     # recorded Reddit JSON, see §1.7
├── Fixtures/
│   ├── reddit/                       # *.json captures, committed, redacted
│   └── StoreKit/APPNAME.storekit
├── Scripts/
│   ├── bootstrap.sh                  # resolve packages, install tools
│   ├── lint.sh                       # swift format --lint + swiftlint
│   ├── test.sh                       # xcodebuild test + swift test per package
│   └── replay-fixtures.sh            # see §3 verification method
├── fastlane/
│   ├── Fastfile
│   ├── Appfile
│   └── Matchfile                     # only if match is used; otherwise ASC API key
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── docs/                             # this folder, copied from the survey repo
├── PROGRESS.md                       # acceptance checklist ↔ status, maintained per phase
├── CHANGELOG.md
└── README.md
```

Rule the agent must hold: **the app target contains no feature code.** Everything lives in a
package with its own tests. If a file in `APPNAME/` grows past ~200 lines it belongs in a package.

### 1.3 Project generation

Follow `02-architecture.md`. If it does not state a choice, the default is:

**A plain `.xcodeproj`, committed to the repo, with local Swift packages referenced by path.**

Reasons: an AI agent editing a project file is now a supported path (Xcode 27's JSON `.xcproj`
format exists but is **beta** as of 2026-09-17 — `spec/10` Part B item 2 — so it is not bet on
here); XcodeGen/Tuist add a generation step, a manifest DSL and a toolchain install that the CI
must also perform, for a single app target plus one extension; and local packages already give the
merge-friendliness that project generators are usually adopted for, because package targets are
declared in `Package.swift`, not in the project file. Adding one file to a feature package requires
**no** `.xcodeproj` change at all.

Build settings that are not optional:

| Setting | Value | Source |
|---|---|---|
| `IPHONEOS_DEPLOYMENT_TARGET` | `26.0` | `[DECISION: min-ios]` |
| `SWIFT_VERSION` | `6.0` — this build setting is the **language mode**, not the toolchain. The toolchain is Swift **6.4**, shipped in Xcode 27, and each `Package.swift` declares `swift-tools-version: 6.4` | `02-architecture.md` §1.4; `spec/10` §A1 |
| `SWIFT_STRICT_CONCURRENCY` | `complete` | `spec/10` §A3 |
| `SWIFT_APPROACHABLE_CONCURRENCY` | `YES` | `spec/10` §A3 |
| `SWIFT_DEFAULT_ACTOR_ISOLATION` | `MainActor` | SE-0466; `spec/10` §A3 |
| `TARGETED_DEVICE_FAMILY` | `1` (iPhone only) | `[DECISION: ipad-split-view-deferred]` |
| `UILaunchScreen` in Info.plist | present | Required by the iOS 27 SDK (`spec/10` §A1) |
| `ITSAppUsesNonExemptEncryption` | `false` | `spec/08` §6 |
| `UIDesignRequiresCompatibility` | **absent** | Ignored on the 27 SDK; `spec/10` §A2 |
| `UISupportedInterfaceOrientations` | Portrait only at the app level; the media viewer and in-app browser opt into rotation per-scene | `spec/01` §1.5 |

Every package's `Package.swift` uses `swift-tools-version: 6.4` (which turns on Swift Testing's
Complete XCTest interop mode — `spec/10` §A3).

### 1.4 Dependencies (the allow-list)

Nothing outside this list without an explicit owner decision. Pin exact versions in
`Package.resolved` and commit it.

| Package | Why | Notes |
|---|---|---|
| `GRDB.swift` | Local database | `spec/10` §A3 storage recommendation; `[DECISION: unpruned-tables]` |
| `Nuke` | Feed + viewer image pipeline | `spec/10` §A3 images: `AsyncImage` + `asyncImageURLSession` for avatars/icons, Nuke for the feed. Pin before moving Xcode versions |
| `swift-cmark-gfm` (or `swift-markdown`, which vends the same core) | **The whole markdown pipeline** — fetched post/comment bodies *and* composer previews, one parser and one renderer (`02-architecture.md` §9) | `[DECISION: snudown-renderer]` |
| `sentry-cocoa` | Crash reporting | **Only if** `[DECISION: sentry-or-not]` resolves to "include" |

Deliberately **not** used: any purchase SDK (StoreKit 2 direct), any networking library
(`URLSession`), any navigation library, any DI container, any reactive framework, TCA
(`spec/10` §A3 architecture consensus), SwiftData (`spec/10` §A3 storage).

### 1.5 Lint and format

- **`swift format`** (ships in the toolchain) is the formatter. Commit `.swift-format` at the repo
  root: 2-space indent, 100-column line length, `respectsExistingLineBreaks: true`,
  `lineBreakBeforeEachArgument: true` for multiline calls.
- **SwiftLint** is the rule linter, configured in `.swiftlint.yml`. Beyond the defaults, these are
  **errors**, not warnings, because they encode `07-one-shot-prompt.md`'s guardrails:
  `force_unwrapping`, `force_try`, `force_cast`, `implicitly_unwrapped_optional`,
  `todo` (no `TODO:` left in shipped code — use `PROGRESS.md` deferrals instead),
  plus custom rules banning `ObservableObject`, `@StateObject`, `@Published`, `XCTAssert` outside
  `Tests/UITests`, and `UIDesignRequiresCompatibility`.
- `Scripts/lint.sh` runs both; CI runs `Scripts/lint.sh` first and fails the job on any violation.

### 1.6 CI

**Recommended: GitHub Actions on a macOS runner with Xcode 27, plus fastlane for TestFlight.**

`.github/workflows/ci.yml` — on every push and PR:

| Job | Steps |
|---|---|
| `lint` | checkout → `Scripts/lint.sh` |
| `test` | checkout → select Xcode 27 (`sudo xcode-select -s /Applications/Xcode_27.app`) → cache `~/Library/Developer/Xcode/DerivedData` and `.build` → `swift test` in each `Packages/*` → `xcodebuild test -scheme APPNAME -destination 'platform=iOS Simulator,name=iPhone 17,OS=27.0' -resultBundlePath Results.xcresult` → upload the result bundle |
| `ui-smoke` | same setup → `xcodebuild test -scheme APPNAMEUITests -only-testing:UITests/SmokeTests` (launch, tab through all five tabs, open a post from a fixture-backed feed, open settings, dismiss) |
| `fixtures` | `Scripts/replay-fixtures.sh` — decodes every committed fixture through `RedditAPI`'s parsers and asserts no throw and no field regressions (§3.3) |

`.github/workflows/release.yml` — on a `v*` tag:
checkout → Xcode 27 → decode the App Store Connect API key from a base64 secret →
`bundle exec fastlane beta` → which runs `increment_build_number`, `build_app` (automatic signing
with the ASC key), `upload_to_testflight(skip_waiting_for_build_processing: true)`, and posts the
build number to the job summary. Secrets required: `ASC_KEY_ID`, `ASC_ISSUER_ID`,
`ASC_KEY_P8_BASE64`, `TEAM_ID`, `APP_IDENTIFIER`. Code signing uses **automatic signing with the
ASC API key** (no `match`, no committed certificates) unless the owner already runs a `match` repo.

**If the owner prefers to stay on CircleCI** (the original repo used CircleCI + EAS): the shape is
identical, with three differences. First, CircleCI must use a `macos` executor with an Xcode 27
image (`macos.m1.medium.gen1` class or better) rather than a Linux box, because unlike EAS there is
no cloud build service doing the compiling — EAS was doing the macOS work in the old setup, which is
why that repo's CircleCI job could be Linux. Second, secrets live in a CircleCI **context** (the
original used one named for the project) holding the same five values, and the `.p8` key is written
to disk from a base64 env var at job start exactly as in the old `ios_build_and_submit` job. Third,
the workflow is filtered to `v*` tags with `branches: ignore: /.*/`, matching the original's
tag-triggered release; the per-commit lint/test workflow runs on all branches. Everything else —
`fastlane beta`, automatic signing, TestFlight upload — is byte-for-byte the same, since fastlane
does not care which CI invoked it. Budget for CircleCI macOS minutes being considerably more
expensive than GitHub's included macOS minutes for a private repo.

### 1.7 Fixtures

Recorded Reddit JSON is committed and is the substrate for every unit test (**no unit test may
touch the network** — `07-one-shot-prompt.md` guardrail).

Minimum fixture set, captured once by hand with the app's own User-Agent and redacted of any
personal identifiers:

| Fixture | Covers |
|---|---|
| `home_best.json`, `subreddit_hot.json`, `subreddit_top_week.json` | Listing shape, `sr_detail`, pagination cursor |
| `post_text.json`, `post_link_og.json`, `post_image.json`, `post_gallery.json`, `post_video_hls.json`, `post_video_fallback.json`, `post_gif_mp4.json`, `post_crosspost.json`, `post_crosscomment.json`, `post_poll.json`, `post_nsfw_spoiler.json` | Every branch of the media/link classification ladder (`spec/02` §4.1.1–4.1.3) |
| `comments_small.json`, `comments_deep.json`, `comments_2000.json`, `comments_more_stub.json`, `comments_more_count_zero.json`, `comments_automod.json` | Tree flattening, load-more, AutoMod collapse, the `count: 0` stub |
| `subreddits_mine.json`, `subreddits_mine_moderator.json`, `multi_mine.json`, `multi_definition.json`, `about.json`, `about_rules.json`, `trending.json` | Subreddit hub, multireddits, sidebar |
| `inbox.json`, `message_thread.json` | Inbox item kinds, reply nesting, the empty-string `replies` case |
| `user_about.json`, `user_about_me.json`, `user_content.json`, `user_suspended.json`, `user_404.json` | Profile, own-profile detection via `inbox_count`, error envelopes |
| `search_link.json`, `search_sr.json`, `search_user.json` | Three search scopes |
| `error_private.json`, `error_banned.json`, `error_quarantine.json`, `error_gated.json`, `error_403_envelope.json` | Access-failure mapping (`spec/02` §2.1, §2.12) |
| `redgifs_token.json`, `redgifs_gif.json` | Lazy resolution |
| `flair_v2.json` | Post flair list |

### 1.8 Assets required (human or design task, blocking Phase 0 completion)

| Asset | Spec |
|---|---|
| App icon (default) | Icon Composer document with background / middle / foreground layers; light, dark, clear and tinted variants are system-generated (`spec/10` §A2). Must not use Reddit's wordmark, Snoo or trade dress |
| 3 alternate icons | One Icon Composer document each, added to the *Alternate App Icon Sets* build setting so Xcode writes `CFBundleAlternateIcons` |
| Launch screen | `UILaunchScreen` dictionary in Info.plist with the app's background colour and, optionally, the icon image. **Required by the iOS 27 SDK.** Not a storyboard |
| Paywall review screenshot | One capture of the paywall sheet per IAP product, uploaded in App Store Connect |
| App Store screenshots | 6.9" and 6.5" classes; produced with `fastlane snapshot` against the fixture-backed UI tests so they are reproducible |
| Fonts | **None.** System font only. The original bundled a monospace face for code blocks; `.monospaced` design covers that |
| Colours | Defined as semantic tokens in `Theming`/`DesignSystem`, not as asset-catalogue colours, because themes are runtime data (`[DECISION: theme-count]`) |

---

## 2. Phased build order

Each phase ends at a **gate**. The gate is not "it looks right" — it is: the project builds for the
simulator with zero warnings from our own code, `swift test` passes in every package, the
`xcodebuild test` scheme passes, `Scripts/lint.sh` is clean, `PROGRESS.md` is updated, and a commit
is made. **The agent does not start phase N+1 until phase N's gate is green.** If a gate cannot be
made green, the agent records the blocker in `PROGRESS.md` and continues only with work that does
not depend on it.

### Phase 0 — Skeleton

- **Inputs:** `02-architecture.md`; `spec/01` §§1–4, §16; `spec/10` §§A1–A3; this doc §1.
- **Deliverables:** repo, `.xcodeproj`, all 18 package stubs with `Package.swift`, app target with
  scene lifecycle and launch screen; `AppCore` with the domain value types and the `Feature` enum;
  `Theming` with the `Theme` model (19 colour roles × 4 renditions + mode/status-bar flags) and a
  `ThemeStore` in `@Environment`, plus two of the new starter themes; `DesignSystem`'s token layer;
  `AppRouting`'s `Route` enum and per-tab `Router`; five `NavigationStack`s inside a `TabView` with
  the five tabs (Posts / Inbox / Account / Search / Settings) and the tab-retap and tab-long-press
  hooks stubbed; an empty Settings root list; SwiftLint/swift-format configs, `Scripts/*`, both CI
  workflows; `PROGRESS.md` seeded with every checklist item from §4 marked `TODO`.
- **DoD:** app launches in the simulator to a five-tab shell; switching tabs preserves each stack;
  theme switch visibly repaints; CI green on a pushed branch.
- **Tests:** `Theming` — theme merge/resolution (custom over base), colour-token validation
  (including the fixed `validateHex-bug` rules, i.e. an anchored validator and a `hexToRgb` that
  handles the 3-, 6- and 8-digit forms); `AppRouting` — `Route` round-trips.
- **Smoke:** launch; tap each tab; rotate (stays portrait); toggle system dark mode (theme follows
  when the light/dark pairing is on); background and foreground.

### Phase 1 — RedditAPI: networking, models, auth

- **Inputs:** `03-data-and-networking.md`; `spec/02` in full; `spec/09` §2.2.
- **Deliverables:** `RedditClient` actor over `URLSession` (10 s timeout, body-shape error
  classification **plus** the new explicit status handling from `[DECISION: no-429-handling]`,
  cookie-enabled session, one well-formed randomized Safari UA per launch
  (`[DECISION: user-agent-string]`), form-encoded writes, `X-Modhash` header, `raw_json=1` and
  `sr_detail=true` on every listing (`[DECISION: raw-json-param]` — **no client-side entity
  decoding anywhere**), depagination); the `RedditLink` value type reproducing the normalization
  table, the 17-row page-type ladder, sort read/write, short-link resolution (HEAD→GET), and
  `applyPreferredSorts`; all model types with `Decodable` conformances; the error taxonomy (banned/private/quarantined/gated/multireddit-
  unavailable/user-404/user-banned/listing/filter-limit/offline/rate-limited); cookie + Keychain
  session storage with the expiry rewrite (**once per app session per account**,
  `[DECISION: cookie-expiry-rewrite]`) and the pre-expire-then-clear logout ordering; the
  `AccountsStore` with modhash lifecycle and multi-account switching; the fixtures from §1.7.
  **Not built:** the `old.reddit.com/prefs` scrape and rewrite (`[DECISION: prefs-force-over18-on-login]`).
- **DoD:** every fixture decodes; every model field in `spec/02` §4 is populated and asserted; the
  page-type ladder matches the table row for row.
- **Tests (Swift Testing, no network):** URL normalization and page-type table-driven tests
  (one case per row, plus the spoof cases like `redd.it.evil.com`); `jsonify()` examples; sort
  parse/rewrite per page type; post media classification ladder (all 8 rules) against fixtures;
  comment tree building including `more` stubs and `count: 0`; time and number formatters (including
  the fixed year seam and the abbreviated feed counts, `[DECISION: number-format-parity]`);
  error-envelope mapping; pagination cursor selection; cookie expiry-rewrite frequency.
- **Smoke:** none (no UI yet) — run `Scripts/replay-fixtures.sh`.

### Phase 2 — Feeds

- **Inputs:** `04a-feeds-posts-comments.md` (feed sections); `spec/03` §§1–8, §§10–14, §§16–23;
  `spec/02` §5.
- **Deliverables:** the generic paged-list store (dedupe by id+type, filter-retry with the
  `10,20,40,70,100` limit ramp, `fullyLoaded`, `hitFilterLimit`, refresh semantics, 2-screen
  load-more threshold); post card in normal and compact layouts with every appearance setting
  wired; metadata footer; saved notch; seen dimming and the per-post seen pub/sub; swipe actions
  via `DesignSystem.SwipeActionsRow` (75/130 pt bands, one haptic per band transition, action on release,
  scroll lock) — `[GATE: gate.gestures]` on reassignment only; long-press context menu with the
  full ordered action list; sorting UI including the two-step Top picker; filters (text trie with
  whole-word matching, subreddit filters with durations, hidden posts, hide-seen with per-page
  override) — `[GATE: gate.filters]`; the Subreddits hub with sections and the A–Z scroller; the
  subreddit switcher header and quick-search modal.
- **DoD:** a fixture-backed feed scrolls, filters, sorts, dedupes, and reports every access-failure
  state with the right copy.
- **Tests:** paged-list state machine (dedupe, retry ladder, filter starvation, refresh clearing);
  text-filter whole-word matcher (including "cat" vs "caterpillar" and multi-word phrases); swipe
  band classification at 74/75/129/130 px in both directions and under swipe-anywhere; seen-state
  pub/sub ordering (write completes before the event fires); hide-seen override resolution
  including deletion when it equals the global; subreddit-filter expiry.
- **Smoke:** scroll a 500-post fixture feed at 120 Hz with no hitches; swipe every band on a row;
  long-press every action; change sort; filter a subreddit for a day; toggle compact mode.

### Phase 3 — Post detail and comments

- **Inputs:** `04a` (post detail + comments); `spec/04` in full; `spec/02` §2.2.
- **Deliverables:** post header with action bar; flattened comment tree rendered in a `List`
  (`[DECISION: comment-tree-renderer]`) with depth indentation and the depth-colour rail;
  collapse / collapse-children-only / collapse-thread; load-more (10 ids in parallel);
  AutoMod auto-collapse; comment swipe actions and context menu (9 items incl. Copy Text);
  comment sorting (six options in the in-post menu); scroll-to-next/previous floating button with
  the 10 snap positions; the **markdown → AST → SwiftUI** renderer in `RedditMarkdown`
  (`[DECISION: snudown-renderer]`) covering every construct in `04a` §18.1 — spoilers, tables, code
  blocks, blockquotes, correctly numbered nested lists, inline images, Giphy interception, true
  superscript (`[DECISION: superscript-baseline]`), clamped emoji runs, and the link-tap routing
  rules — with inline text selection **disabled** on bodies; the text-selection sheet; read-only
  polls.
- **DoD:** the 2,000-comment fixture renders its first screen in well under a second and memory
  does not scale with thread size; collapsing a 500-child thread does not re-render the list.
- **Tests:** flattening (port every case of the original's ~20-case suite: emission order,
  filtered-subtree removal, both collapse modes, sibling independence, root trailing load-more,
  stable keys); a ~2,000-node synthetic tree flattens in <100 ms; the markdown golden-file corpus
  (`02-architecture.md` §9.1) plus one AST-to-render test per block type; composer toolbar
  transforms including the fixed first-line quote (`[DECISION: quote-first-line]`).
- **Smoke:** open a megathread; collapse/expand at several depths; tap "N more replies" twice;
  jump with the floating button; reveal a spoiler; scroll a wide table; select text.

### Phase 4 — Media

- **Inputs:** `04b-media.md`; `spec/05` in full; `spec/03` §9; `spec/10` §A3 (images, media).
- **Deliverables:** image pipeline (Nuke for feed and viewer, `AsyncImage` + a tuned `URLCache` for
  icons/avatars); full-screen viewer with the 2-D paging model (vertical = posts, horizontal =
  gallery items), the tap classifier (10 pt / 300 ms tap, 280 ms / 45 pt double tap, 30% side
  zones), double-tap zoom to 3×, pinch 1–10 with focal-jump guard, edge-clamped pan with decay,
  overscroll-flick dismiss at 50 pt / 40 pt, post overlay with share; shared player registry
  (ref-counted, deferred release, LRU 12); feed focus engine on
  `onScrollTargetVisibilityChange` with the 70%/60% thresholds, 150 ms settle, lenient stop,
  immediate release, remembered positions (LRU 200); Redgifs lazy resolution with the exact
  concurrency/backoff contract; query-param-trim fallback with signed-host exclusions; reload
  watchdog; overlay state machine; the viewer's zoom navigation transition
  (`[DECISION: viewer-zoom-transition]`) and its tappable-to-retry hard-error state
  (`[DECISION: fullscreen-player-retry]`); Gallery Mode grid (masonry, 2 columns) **with NSFW blur**
  (`[DECISION: gallery-mode-no-blur]`), a **4-player ceiling** (`[DECISION: gallery-video-cap]`) and
  the `[GATE: gate.galleryMode]` 100-item inline footer; download/share/save flows with add-only
  Photos permission (`[GATE: gate.downloads]`); the new video long-press menu
  (`[DECISION: no-video-longpress-menu]`); Live Text via `ImageAnalysisInteraction`
  (`[DECISION: live-text-dead-setting]`); the 6-concurrent OpenGraph cap
  (`[DECISION: og-concurrency-cap]`); low-data-mode rules.
- **DoD:** a 100%-video fixture feed plays exactly one video at a time, never exceeds 12 live
  players, and survives a 10-second fling with no black tiles.
- **Tests:** tap classifier (pure, table-driven, every threshold boundary); overlay state machine
  priority order; focus selection and hysteresis given synthetic visibility snapshots; registry
  ref-counting, deferred release and LRU eviction; Redgifs id extraction for all five URL shapes;
  backoff/cooldown arithmetic; `makeCachedVideoSource` exclusions (`.m3u8`, `.gif`).
- **Smoke:** scroll a video feed; fling; tap into fullscreen and back (no reload, position kept);
  rotate in the viewer; scrub; change playback rate; save an image (paywall appears when locked);
  open Gallery Mode and hit the 100 cap.

### Phase 5 — Accounts, inbox, messages, user, search, subreddits, sidebar, wiki

- **Inputs:** `04c-…`; `spec/07` in full; `spec/02` §§2.5–2.9.
- **Deliverables:** login via SwiftUI `WebView`/`WebPage` against the **shared persistent**
  `WKWebsiteDataStore` (so the cookie lands in the app's jar), both success detectors (navigation off
  the four-entry allow-list + the 500 ms cookie poll), temp-logout and restore-on-cancel, **no CSS
  injection** (`[DECISION: login-css-injection]`) and one line of explanatory copy
  (`[DECISION: login-no-instructions]`); the one-time NSFW-visibility banner that replaces the
  `/prefs` rewrite (`[DECISION: prefs-force-over18-on-login]`); accounts list with swipe/long-press
  delete **behind a confirmation** (`[DECISION: no-confirm-account-delete]`) and the "Logged Out" row;
  `[GATE: gate.multiAccount]` on the second account and on quick swap; inbox list with the two item
  kinds, swipe and long-press actions, mark-all-read, 60 s poll, badge; message thread with bubbles
  and reply; new message composer; user profile with stats, avatar
  (`[DECISION: user-page-minimal]`), section buttons, sorting, context menu (block / message /
  share); search with three scopes, trending, the `/r/` query rewrite, and the users-no-pagination
  rule; in-subreddit search page; quick subreddit search with debounce and exact-match row;
  subreddit sidebar; wiki via themed `WebView`; multireddit listing, merged-feed resolution with
  the full fallback chain, add/remove subreddit.
- **DoD:** a real login works end-to-end on device; switching between two accounts swaps
  subscriptions, favourites and inbox correctly.
- **Tests:** conversation flattening from the fixture (including the empty-string `replies` case);
  inbox item kind filtering and unread counting; search query rewriting per scope; users-scope
  pagination refusal; multireddit fallback ordering and the empty-vs-unavailable distinction;
  favourites keyed per account id; session save/restore/delete against a fake Keychain.
- **Smoke:** log in; add a second account (paywall); switch; long-press the Account tab; read and
  reply to a message; mark all read; search each scope; open a sidebar and a wiki; expand a
  multireddit and remove a subreddit.

### Phase 6 — Compose

- **Inputs:** `04a` (composers); `spec/04` §11; `spec/02` §2.4.
- **Deliverables:** shared composer shell (cancel / title / submit, keyboard avoidance); markdown
  editor with the six toolbar actions and the exact quote-insertion semantics; live preview tab
  (Parent / Preview, or Preview / Old Version when editing); drafts in GRDB keyed per context
  (`newCommentDraft-<parentId>`, per-subreddit post title/body, per-recipient message subject/body,
  per-thread reply) written on change; new post with the three kinds — **separate text fields per
  kind** (`[DECISION: newpost-type-switch-keeps-text]`), flair picker filtering mod-only flairs,
  image pick + S3 upload + submit; edit post/comment; delete with confirmation; captcha web-view
  fallback; locked/archived guard before opening the editor.
- **DoD:** a comment and a self-post can be created, edited and deleted against a real account.
- **Tests:** toolbar transformations (wrap with and without a selection; quote in all three
  states, including the first-line case the original mishandled); draft key construction and
  isolation across accounts and contexts; draft cleared only on success; submit error mapping
  (captcha / parseable / unknown — alert once, never re-throw).
- **Smoke:** write a comment, leave, return (draft restored); submit; edit; delete; create each of
  the three post kinds.

### Phase 7 — Settings, themes, icons, stats, help

- **Inputs:** `04c-…` (settings); `spec/06` in full.
- **Deliverables:** the full settings tree (General → Gestures / Sorting / Filters / Open in
  APPNAME / Startup / Legal / External Links; Theme; Appearance; App Icon; Account; Data Use;
  Stats; Privacy; Advanced) with every toggle, picker and range from `spec/06` §§2–10 and the
  defaults from its §11.2 table (minus removed rows per `08-decisions-and-drift.md`); theme list
  and Theme Maker with the five colour groups, the colour picker (hex + RGB sliders), live
  app-wide preview that excludes the editor itself, and save/overwrite/delete
  (`[GATE: gate.customThemes]`); the **new 6–8 theme built-in catalogue**
  (`[DECISION: theme-count]`); theme share/import with the **new** base64url sentinel format
  (`[DECISION: theme-import-format-compat]`); the alternate-icons grid with no artist-credit pages
  (`[GATE: gate.appIcons]`, `[DECISION: app-icons-new-art]`); the Gestures screen
  (`[GATE: gate.gestures]`) and the Sorting screen (`[GATE: gate.sortMemory]`); Stats screen with all
  six sections including achievements and fun facts (`[GATE: gate.stats]`); the reduced help section
  with **SQLite FTS5 + BM25 search, no embeddings and no answer card**
  (`[DECISION: guide-included-or-not]`, `[DECISION: guide-ai-answer-drop]`);
  external-link browser routing with the seven targets and the not-installed fallback; cache
  clearing (image immediate, video deferred to next launch); startup tab and startup URL.
- **DoD:** every setting persists across a cold launch and takes effect **without a restart** — no
  setting shows a restart alert (`[DECISION: mark-seen-live]`, `[DECISION: error-reporting-default]`).
  The single deferred-to-next-launch operation is clearing the **video** cache, which is not a
  setting.
- **Tests:** settings defaults table (one assertion per key); theme resolution order (built-in →
  custom by name → default, plus live draft overlay); theme import parsing including malformed and
  nested-brace payloads; stats arithmetic (distance conversions, ratios, achievement thresholds,
  the exact-equality milestone messages); sort-key clearing by prefix.
- **Smoke:** walk every settings screen; build and save a custom theme; import one from a comment;
  change the app icon; open Stats; clear both caches.

### Phase 8 — Entitlements and paywall

- **Inputs:** `05-monetization.md` in full; `spec/10` §A3 (IAP).
- **Deliverables:** the `Entitlements` package exactly as specified in `05` §5 — `Feature` enum,
  `@Observable Entitlements`, `Transaction.updates` listener started before the first
  `currentEntitlements` read, renewal-state mapping, offline cache with 16-day leeway, purchase
  and restore, `requiresEntitlement(_:style:)` with its four gate styles, `PaywallPresenter` with
  the pending-action replay, `SubscriptionStoreView`-based paywall, Settings → APPNAME Plus screen
  with `manageSubscriptionsSheet`; then a sweep applying every `[GATE: gate.*]` tag across the `04*`
  docs to the code built in Phases 2–7.
- **DoD:** with the StoreKit configuration file active, all eleven gates lock and unlock correctly
  across purchase, cancel, expire, grace, retry, refund and family-share revocation.
- **Tests:** the state-machine and truth-table suites from `05` §9, driven through an injected
  snapshot seam — **no StoreKit and no network in unit tests**.
- **Smoke:** the full StoreKit-configuration matrix in `05` §9, plus: tap a locked feature →
  paywall → purchase → sheet dismisses → **the original action completes by itself**.

### Phase 9 — Integration, polish, audits

- **Inputs:** `spec/01` §§6–9, §§12–20; `spec/10` §A2; `08-decisions-and-drift.md` §2.
- **Deliverables:** Share Extension; custom URL scheme + the `openurl` wrapper; "Open in APPNAME"
  App Intent (`[DECISION: shortcuts-intent]`); **no Associated Domains**
  (`[DECISION: universal-links-absent]`); clipboard link detection (default off,
  `[DECISION: clipboard-read-default]`); startup modals — what's new, then the review prompt via
  `requestReview` (`[DECISION: review-prompt-mechanism]`, `[DECISION: startup-modals]`) and **no
  community-subscribe nudge** (`[DECISION: subscribe-nag-removed]`); haptics policy applied at every
  call site; one-time tips;
  the fix-forward sweep over `08` §2; a **Liquid Glass audit** (remove custom backgrounds from
  bars/tab bar/toolbars, verify scroll-edge effects, verify all themes against Reduce Transparency,
  Reduce Motion and Increase Contrast — `spec/10` §A2); an **accessibility audit** (VoiceOver
  labels and custom actions on every post and comment — the original exposed its whole action
  catalogue as VoiceOver actions and the rewrite must too; Dynamic Type through XXL on every
  screen; contrast; hit targets ≥44 pt; the "Read post contents" announcement action);
  a **performance pass** with Instruments against the 2,000-comment and 500-post fixtures.
- **DoD:** no accessibility warnings from the Accessibility Inspector audit; no hitches above the
  MetricKit threshold in a 60-second scroll; every item in `08` §2 either fixed or explicitly
  deferred in `PROGRESS.md` with a reason.
- **Tests:** XCUITest smoke covering launch → each tab → post → comments → media → settings;
  snapshot-free (avoid brittle image diffs at this scale).
- **Smoke:** the consolidated manual list assembled from all prior phases, run on a real device.

### Phase 10 — Release

- **Inputs:** `05-monetization.md` §7; this doc §1.6, §1.8.
- **Deliverables:** App Store Connect record complete; IAP products in "Ready to Submit"; privacy
  nutrition label; age rating (17+, UGC questions answered, block/report paths documented);
  screenshots; description and keywords avoiding Reddit trademark misuse; `CHANGELOG.md`;
  `v1.0.0` tag → `release.yml` → TestFlight; internal testing pass; submission.
- **DoD:** TestFlight build installs and runs on a clean device with no account, completes a
  sandbox purchase, and passes the §7 compliance checklist of `05-monetization.md` line by line.

---

## 3. Verification method

1. **Compile gate.** `xcodebuild build -scheme APPNAME -destination 'platform=iOS Simulator,name=iPhone 17,OS=27.0'` with zero warnings from first-party code.
2. **Unit gate.** `swift test` in every package (Swift Testing) + `xcodebuild test` for the app
   scheme. No network, no StoreKit, no filesystem outside a temp directory.
3. **Fixtures replay.** `Scripts/replay-fixtures.sh` walks `Fixtures/reddit/*.json`, decodes each
   through the real parsers, and asserts a golden summary per file (counts, ids, classified media
   type, error mapping). A parser change that silently drops a field fails here.
4. **UI smoke.** One XCUITest target, kept deliberately small, launched with
   `-UITestFixtureMode 1` so `RedditAPI` serves fixtures instead of the network.
5. **Manual smoke.** The per-phase lists above, consolidated in `PROGRESS.md`, run on a device
   before Phase 10.

---

## 4. Acceptance checklist

Transcribed from `spec/08-feature-inventory.md` §1 (items 1–327), grouped by its areas A–X, adjusted
per `08-decisions-and-drift.md`, with a new area **Y** for the subscription. Pointers name the doc
section that specifies each item. **CUT** items are deliberately not built and must be recorded as
such in `PROGRESS.md`. **CHANGED** items are built differently from the original by decision.

### A. Browsing / feed → `04a`

- [ ] 1. Home feed of subscribed subreddits, opened from the Posts tab.
- [ ] 2. Infinite scroll loads more posts automatically.
- [ ] 3. Pull-to-refresh reloads any feed.
- [ ] 4. Already-loaded pages remain when scrolling back up.
- [ ] 5. Compact mode: denser card, reduced spacing.
- [ ] 6. Tapping a card opens post detail.
- [ ] 7. Detail shows content, author, subreddit, media, votes, comments, action bar.
- [ ] 8. Comments below the post; swipe-back or back button returns.
- [ ] 9. Tap post content to collapse media (setting "Tap to Collapse", default on).
- [ ] 10. Feed interactions: tap, configurable swipes, long-press menu, vote, save — without opening.
- [ ] 11. Post types: text (configurable preview length), link with preview, image, gallery, video, poll, crosspost.
- [ ] 12. NSFW and spoiler media blurred by default, tap to reveal.
- [ ] 13. Each card shows title, subreddit, author, time, score, comment count, flair.
- [ ] 14. Sorts: Best, Hot, New, Top (+ time), Rising; multireddits substitute Controversial for Best.
- [ ] 15. **CHANGED** Filtering by text, hide-seen and subreddit filters (`[GATE: gate.filters]`). AI filters **CUT** (`[DECISION: ai-removed]`).
- [ ] 16. Posts marked seen on open, vote, comment, or (optional) scroll-past; seen posts dim to 0.75 opacity.
- [ ] 17. "Hide Seen Posts" filters previously seen posts (`[GATE: gate.filters]`).
- [ ] 18. **CHANGED** "Mark as Seen on Scroll" — takes effect immediately, no restart required.
- [ ] 19. Manual "Mark as Read"/"Mark as Unread" from the long-press menu.
- [ ] 20. Per-page override of hide-seen via the "…" menu; overridden pages listed in Filters settings.
- [ ] 21. Gallery Mode: two-column masonry of media-only posts, entered from the "…" menu.
- [ ] 22. **CHANGED** Automatic one-time Gallery Mode suggestion on a media-heavy feed (≥100 posts, ≥85% media, non-combined feed); the one-time flag is written on **either** answer (`[DECISION: gallery-offer-cancel]`).
- [ ] 23. Gallery Mode fullscreen: horizontal between items, vertical between posts, pinch zoom, tap for overlay, swipe/✕ to close; at most 4 grid videos play at once (`[DECISION: gallery-video-cap]`).
- [ ] 24. Gallery overlay shows title, text preview, subreddit, author; tap opens the post; share button shares the media.
- [ ] 25. **CHANGED** Gallery Mode applies text filters, hide-seen and subreddit filters, **and NSFW/spoiler blur** (`[DECISION: gallery-mode-no-blur]`).
- [ ] 26. **CHANGED** Gallery Mode capped at 100 items without a subscription (`[GATE: gate.galleryMode]`), as an inline footer rather than a hard stop.
- [ ] 27. Activity indicators during load and paging.
- [ ] 28. Non-focused feed videos show a static poster with a play icon; at most one video plays.
- [ ] 29. Focus requires ≥70% of the post visible or ≥60% viewport coverage; keeping focus is more lenient than gaining it.
- [ ] 30. **CHANGED** Global feed-audio toggle (floating button + settings row) unmutes the focused video; interrupts other audio and plays through the silent switch (`[GATE: gate.videoAutoplay]` — OWNER, default free).
- [ ] 31. Playback position remembered across focus loss and restored on regain.
- [ ] 32. Animated GIF *images* keep animating regardless of focus.

### B. Creating / editing / deleting posts → `04a`

- [ ] 33. "New Post" from a subreddit's "…" menu only.
- [ ] 34. Composer: type selector, title, content area, optional flair, submit.
- [ ] 35. Text posts: markdown body, formatting toolbar, live preview.
- [ ] 36. Link posts: title + URL.
- [ ] 37. Image posts: single image from the library, uploaded with a preview before submit; multi-image unsupported.
- [ ] 38. Toolbar: link, bold, italic, quote, strikethrough, spoiler; wraps a selection; raw markdown typeable.
- [ ] 39. Flair picker when the subreddit offers non-mod-only flairs, including "No Flair".
- [ ] 40. **CHANGED** Post drafts autosave per subreddit **and per post kind**, using the `03` §7.5 key formats, and restore; cleared only on success (`[DECISION: newpost-type-switch-keeps-text]`, `[DECISION: settings-key-rename]`).
- [ ] 41. Editing a post changes body text only; edited indicator shown; cancelling with unsaved changes confirms first (`[DECISION: composer-no-discard-confirm]`).
- [ ] 42. Deleting a post requires confirmation.
- [ ] 43. Captcha fallback opens Reddit's submit page in a web view; self-post body copied to the clipboard.
- [ ] 44. Posting requires login; subreddit age/karma errors surfaced verbatim.

### C. Comments → `04a`

- [ ] 45. Reply to the post from the detail action bar.
- [ ] 46. Reply to a comment via long-press or a configured swipe.
- [ ] 47. Comment composer tabs: Parent / Preview (new), Preview / Old Version (edit).
- [ ] 48. Comment drafts autosave per reply target and restore; cleared on submit.
- [ ] 49. Same formatting toolbar as the post composer.
- [ ] 50. Edit own comments; edited indicator with time.
- [ ] 51. Delete own comments with confirmation.
- [ ] 52. **CHANGED** Long-press menu: Upvote, Downvote, Collapse, Collapse Thread, **Copy Text**, Select Text, Reply, Save, Share; Edit/Delete on own comments (`[DECISION: comment-sort-six]` neighbours; Copy Text was undocumented but real).
- [ ] 53. Commenting requires login; blocked on locked/archived posts with an explanatory alert.
- [ ] 54. Threaded replies with correct parent/child structure.
- [ ] 55. Indentation plus a fixed-palette depth rail indicates reply depth.
- [ ] 56. Each comment shows author (with mod/OP treatment), score, time, flair, edited state.
- [ ] 57. Tap to collapse/expand (setting, default on) — takes effect without a refresh.
- [ ] 58. Collapsed threads keep children's own collapsed state across cycles.
- [ ] 59. "N more replies" loads 10 further children per tap.
- [ ] 60. Pull to refresh reloads the whole thread.
- [ ] 61. **CHANGED** Reddit's "continue this thread" stub is detected and navigates to the permalink (`[DECISION: more-stub-count-zero]`).
- [ ] 62. Comment sorts: Best, New, Top (+ time), Controversial, Old, Q&A (six; `[DECISION: comment-sort-six]`).
- [ ] 63. Default comment sort configurable; optional per-subreddit memory (`[GATE: gate.sortMemory]`).
- [ ] 64. Vote on comments by tapping the score control or swiping; same direction again retracts.
- [ ] 65. Comment swipe actions configurable per direction (`[GATE: gate.gestures]`).
- [ ] 66. Stickied comments pinned with a pin icon.
- [ ] 67. Moderator comments coloured distinctly.
- [ ] 68. OP comments coloured distinctly.
- [ ] 69. AutoModerator top-level comments auto-collapsed (setting, default on).
- [ ] 70. Deleted/removed comments render as placeholders with structure intact.
- [ ] 71. Right-side vote indicator option adds a coloured right edge on voted comments.
- [ ] 72. Score-hidden comments show "–" until the user votes.
- [ ] 73. Floating scroll-to-next-comment button; long-press for previous (`[DECISION: scroll-to-next-button]`).
- [ ] 74. **CUT** AI comment summaries (`[DECISION: ai-removed]`).

### D. Media → `04b`

- [ ] 75. Inline images with gallery support for multi-image posts.
- [ ] 76. **CHANGED** Fullscreen viewer entered with a zoom transition from the thumbnail (`[DECISION: viewer-zoom-transition]`); double-tap zooms to 3×, again to fit; pinch 1–10×; pan while zoomed.
- [ ] 77. Multi-image posts: horizontal paging with an "n / total" indicator and prev/next buttons.
- [ ] 78. Long-press an image: Share / Save / Copy Link (`[GATE: gate.downloads]` on Save).
- [ ] 79. Collection navigation arrows in the viewer, dimmed at the ends.
- [ ] 80. Viewer overlay shows title, text preview, subreddit, author; each navigates.
- [ ] 81. Viewer dismisses by overscroll flick up or down.
- [ ] 82. **CHANGED** Live Text on images actually implemented via `ImageAnalysisInteraction` (`[DECISION: live-text-dead-setting]`).
- [ ] 83. Live Text off by default.
- [ ] 84. With Live Text on, the long-press context menu requires a longer hold.
- [ ] 85. Live Text limitations documented in help text, not worked around.
- [ ] 86. Playback-rate button cycles 0.5× / 1× / 1.5× / 2× with pitch preserved.
- [ ] 87. Horizontal drag scrubs a fullscreen video (engages after 20 pt horizontal, <30 pt vertical).
- [ ] 88. **CUT** Picture-in-Picture (`[DECISION: background-audio-pip]`).
- [ ] 89. **CHANGED** Long-press a video: Share / Save / Copy Link (`[DECISION: no-video-longpress-menu]`).
- [ ] 90. Rotation supported in the media viewer and the in-app browser; portrait-locked elsewhere.
- [ ] 91. Auto-play toggle for feed videos.
- [ ] 92. Redgifs resolved lazily at display time, cached in memory only (`[DECISION: redgifs-memory-only]`).
- [ ] 93. One shared player per video between inline and fullscreen; no reload on open or rotate.
- [ ] 94. Scrubbing in Gallery Mode locks vertical scrolling.
- [ ] 95. Posts containing several videos display all of them.
- [ ] 96. Low data: videos not loaded while scrolling; poster with a label; load on tap.
- [ ] 97. Low data: images show the smallest variant, one per post, until tapped.
- [ ] 98. Low data: link-preview images not loaded.
- [ ] 99. Low data: subreddit icons not loaded.
- [ ] 100. Image disk cache with a size readout and a clear action in Advanced settings.
- [ ] 101. Best-fit image resolution chosen per display context.
- [ ] 102. The correct image shows immediately (no wrong-image flash on recycle).

### E. Accounts / login → `04c`

- [ ] 103. **CHANGED** Multiple accounts, switchable (`[GATE: gate.multiAccount]` beyond the first).
- [ ] 104. Full logged-out browsing; write actions require login.
- [ ] 105. Account tab shows "Account" when logged out and the username when logged in (setting).
- [ ] 106. No in-app account creation; help text points to reddit.com.
- [ ] 107. Login via Reddit's own web page in a web view, including 2FA.
- [ ] 108. Additional accounts added from the Accounts screen "+" (paywalled).
- [ ] 109. Switching accounts by tapping a row.
- [ ] 110. Removing an account by swipe or long-press.
- [ ] 111. "Logged Out" is a selectable row that keeps saved accounts.
- [ ] 112. Sessions stored in the Keychain; no password ever reaches the app.
- [ ] 113. Removing an account deletes its stored session.
- [ ] 114. **N/A** Google sign-in presence is Reddit's own page's business (`[DECISION: D17]`).
- [ ] 114a. Account tab and "+" pulse while zero accounts are saved.
- [ ] 114b. One-time tip: long-press the Account tab to swap accounts.
- [ ] 114c. **CUT** The silent `/prefs` NSFW/media normalization is **not built**; a one-time dismissible banner points at Reddit's own settings instead (`[DECISION: prefs-force-over18-on-login]`).

### F. Inbox / messages → `04c`

- [ ] 115. Inbox lists comment replies and private messages.
- [ ] 116. Unread badge on the Inbox tab, hidden at zero.
- [ ] 117. Refresh on open, pull-to-refresh, infinite scroll.
- [ ] 118. Reply rows show post title, subreddit, author, body, score, relative time.
- [ ] 119. Message rows show subject, sender, body, time, read/unread icon treatment.
- [ ] 120. Tapping a reply opens it in context and marks it read.
- [ ] 121. Reply swipes: right = upvote (short) / downvote (long); left = toggle read.
- [ ] 122. Message swipes: toggle read.
- [ ] 123. Long-press a reply: Upvote / Downvote / Mark Read / Mark Unread.
- [ ] 124. **CHANGED** Long-press a message: Mark Read **or** Mark Unread, label reflecting state (`[DECISION: message-modal-copy-bugs]`).
- [ ] 125. "Mark All Read" with confirmation, success alert and a delayed re-check.
- [ ] 126. Message thread view: chronological bubbles, own messages right-aligned.
- [ ] 127. New message from a profile's "…" menu: subject + body + send.
- [ ] 128. Message composer has the markdown toolbar and live preview.
- [ ] 129. Message drafts (new and reply) autosave and restore.
- [ ] 130. **CHANGED** Reply from the thread; the modal is titled "Reply" and its failure alert reads "Failed to send message" (`[DECISION: message-modal-copy-bugs]`).
- [ ] 131. **CUT** Inbox Alerts / push notifications (`[DECISION: push-removed]`).
- [ ] 131a. 60-second foreground poll updates the count and the app-icon badge; no background delivery.

### G. Search → `04c`

- [ ] 132. Search tab with Posts / Subreddits / Users scopes.
- [ ] 133. Posts and subreddits paginate; users are one page only (Reddit limitation).
- [ ] 134. Trending subreddits shown when the query is empty.
- [ ] 135. In-subreddit search bar at the top of a subreddit feed.
- [ ] 136. Subreddit-scoped search sorts: Relevance, Hot, New, Top (+ time), Comment Count.
- [ ] 137. Quick subreddit search on long-pressing the Search tab, with an exact-match row.
- [ ] 138. Reddit search operators work because they are passed through verbatim.
- [ ] 139. Search returns posts only; removed posts do not appear.

### H. Subreddits / multireddits → `04c`

- [ ] 140. Subreddits hub with Home / Popular / All buttons plus Favorites, Multireddits, Moderator, Subscribed (or Trending when logged out).
- [ ] 141. A–Z scroller jumps within subscribed (or trending) entries, with a hovering letter bubble.
- [ ] 142. Trending shown instead of subscriptions when logged out.
- [ ] 143. A subreddit feed has its own search bar and sort control.
- [ ] 144. Subreddit "…" menu: Subscribe/Unsubscribe, Favorite/Unfavorite, Add to Multireddit, New Post, Gallery Mode, Sidebar, Wiki, Share.
- [ ] 145. Subscribe/unsubscribe updates the hub and confirms.
- [ ] 146. Favorites pin to the top, require a subscription, are stored per account locally.
- [ ] 147. Favorite toggled from the hub's star or the "…" menu.
- [ ] 148. Multireddits appear automatically; they cannot be created in-app.
- [ ] 149. Tapping a multireddit opens its combined feed; the chevron expands its members.
- [ ] 150. Add a subreddit to a multireddit from the subreddit's "…" menu.
- [ ] 151. Remove a subreddit by long-pressing it inside an expanded multireddit.
- [ ] 152. "Filter Subreddit" from a post's long-press menu hides it from combined feeds only (`[GATE: gate.filters]`).
- [ ] 153. Filter durations: a day, a week, forever.
- [ ] 154. Filtered subreddits listed and removable in Filters settings.
- [ ] 155. Sidebar view: subscriber count, expandable rules, description HTML.
- [ ] 156. Wiki opens in a themed web view with in-app link hand-off (`[DECISION: wiki-webview]`).
- [ ] 157. "Subreddit at top" appearance option.
- [ ] 158. "Subreddit icons" appearance option (also suppressed in low-data mode).
- [ ] 159. A multireddit named "All" does not hide the built-in All button.

### I. Voting → `04a`

- [ ] 160. **CHANGED** Up/down arrows colour and adjust the score **optimistically**, rolling back with a transient error on failure; the same arrow again retracts (`[DECISION: vote-no-optimistic-rollback]`, `[DECISION: unhandled-save-failure]`).
- [ ] 161. Voting via configured swipe gestures on posts and comments.
- [ ] 162. Swiping the same action again undoes the vote.
- [ ] 163. **CHANGED** Score is upvotes minus downvotes, abbreviated on feed cards (`[DECISION: number-format-parity]`); hidden scores show "–"; Reddit fuzzes counts.
- [ ] 164. **CHANGED (FIXED)** Voting in post detail is reflected in the feed behind it (`[DECISION: postdetail-vote-not-reflected]`).

### J. Saving → `04a`

- [ ] 165. Bookmark control in the post detail action bar.
- [ ] 166. Save from a long-press menu in feeds and comment threads.
- [ ] 167. Save via a configured swipe.
- [ ] 168. Saved items show a bookmark notch in lists.
- [ ] 169. Saved Posts and Saved Comments reachable from the profile, with refresh and paging.
- [ ] 170. Unsaving through the same affordances removes the item from the saved list.
- [ ] 171. Saves sync through the Reddit account.
- [ ] 172. No folders, tags, sort or search for saved items (Reddit limitation — **not** a defect).
- [ ] 173. Saved-item search explicitly not implemented.

### K. Sharing / downloading → `04b`

- [ ] 174. System share sheet for posts, comments, images, videos, subreddits and multireddits.
- [ ] 175. Posts/comments share as permalinks; media shares as files; subreddits as page links.
- [ ] 176. Share entry points: long-press menu, configured swipe, detail action bar, "…" menu, media long-press, gallery overlay.
- [ ] 177. Shared links carry no account identity.
- [ ] 178. Save video to Photos (`[GATE: gate.downloads]`).
- [ ] 179. Save image to Photos, direct or via the share sheet (`[GATE: gate.downloads]`).
- [ ] 180. Add-only Photos permission requested, with a clear denial message.
- [ ] 181. The app appears as a share destination for a single web URL (Share Extension).
- [ ] 182. "Save post as image" explicitly not implemented.

### L. External links / browser → `04c`

- [ ] 183. Reddit links open in-app; other links open in the chosen browser.
- [ ] 184. Browser choice: in-app, default, Chrome, Brave, Firefox, Edge, Opera.
- [ ] 185. Fallback alert with "Open in Default Browser" when the chosen browser is missing.
- [ ] 186. Reader mode option for the in-app browser.
- [ ] 187. **CHANGED** "Open in APPNAME" ships as an App Intent instead of an iCloud Shortcut (`[DECISION: shortcuts-intent]`).
- [ ] 188. **CHANGED** Clipboard Reddit-link detection, default **off** (`[DECISION: clipboard-read-default]`).
- [ ] 189. In-app browser rotates to landscape.
- [ ] 190. Link previews use Open Graph only; no favicon fallback.
- [ ] 191. Link-metadata fetches time out at 1.75 s and are skipped on failure.
- [ ] 192. Sites that previously failed to yield a preview image now show one.
- [ ] 193. Reddit links inside post/comment bodies render as in-app links.
- [ ] 194. Landscape in the browser works (was a known defect).

### M. Navigation (structural) → `02`, `04a`

- [ ] 195. Five-tab bar: Posts, Inbox, Account, Search, Settings.
- [ ] 196. Tapping the active tab pops one level.
- [ ] 197. Long-pressing the Search tab opens quick subreddit search.
- [ ] 198. Edge-swipe back and the back button.
- [ ] 199. Long-press context menus on posts, comments, subreddits and accounts.
- [ ] 200. "…" menu on subreddit and profile pages.
- [ ] 201. Custom URL scheme deep links plus ordinary Reddit URLs resolving in-app.
- [ ] 202. "Swipe Anywhere to Navigate" disables right-side swipe actions while enabled.
- [ ] 203. Pull to refresh; swipe down to dismiss sheets.
- [ ] 204. **CUT** iPad split view (`[DECISION: ipad-split-view-deferred]`).
- [ ] 205. **CUT** Split-view default-on and its Appearance toggle.
- [ ] 206. **CUT** Split-view Close / Fullscreen controls.
- [ ] 207. **CUT** Post interactions inside the split view.
- [ ] 208. **CUT** Multi-pane iPad support.
- [ ] 208a. Incoming URLs always land on the Posts tab's stack; unknown URLs show an explanatory alert.
- [ ] 208b. Hide-tab-bar-on-scroll option.
- [ ] 208c. **CUT** Right-edge swipe-forward gesture (`[DECISION: swipe-forward-gesture]`).

### N. Gesture configuration → `04c`

- [ ] 209. Four swipe slots per item type: short right, long right, short left, long left (`[GATE: gate.gestures]`).
- [ ] 210. Post actions: Upvote, Downvote, Mark as Read, Bookmark, Share, Disabled; defaults as in the original.
- [ ] 211. Comment actions: Upvote, Downvote, Reply, Bookmark, Share, Collapse, Collapse Thread, Disabled; defaults as in the original.
- [ ] 212. Coloured background and icon reveal during the swipe, differing by band.
- [ ] 213. One light haptic per band transition.
- [ ] 214. Swipe tracking stays smooth while the feed is loading.
- [ ] 214a. Assigning an action already in use swaps the two slots; "Disabled" never swaps.

### O. Sorting → `04a`, `04c`

- [ ] 215. Post sorts with the Top time submenu.
- [ ] 216. Multireddit sorts substitute Controversial for Best.
- [ ] 217. Comment sorts (six).
- [ ] 218. Sort changes apply immediately and update the header icon.
- [ ] 219. Default post/comment sort and default Top range configurable (`[GATE: gate.sortMemory]`).
- [ ] 220. "Apply sort to home" (`[GATE: gate.sortMemory]`).
- [ ] 221. Remember-sort-per-subreddit for posts and comments, with a "clear custom sorts (N)" action (`[GATE: gate.sortMemory]`).

### P. Filters → `04a`, `04c`

- [ ] 222. Text filters: case-insensitive, whole-word, multi-word phrases exact (`[GATE: gate.filters]`).
- [ ] 223. Filter list entered comma- or newline-separated, autosaved.
- [ ] 224. Post haystack: title, body, author, poll options, link title, link description. Comment haystack: body, author.
- [ ] 225. Filters apply to feeds, subreddits, multireddits and Gallery Mode — never to search or profiles.
- [ ] 226. Literal matching only; no logic operators.
- [ ] 227. Heavy filtering slows loading; the filter-retry ladder and the "filters too strict" footer explain it.
- [ ] 228. **CUT** AI filters (`[DECISION: ai-removed]`).
- [ ] 229. **CUT** AI filters analyse text only.
- [ ] 230. **CUT** AI filter scope rules.
- [ ] 231. **CUT** AI filter presets.
- [ ] 232. **CUT** Preset replaces filter text.
- [ ] 233. **CUT** AI filters require connectivity and a subscription.

### Q. Themes and appearance → `04c`

- [ ] 234. **CHANGED** New built-in theme set of 6–8 themes with new palettes, all free (`[DECISION: theme-count]`).
- [ ] 235. **CUT** Timed previews of locked themes (dark pattern).
- [ ] 236. Tapping a theme applies it immediately and persists it.
- [ ] 237. Separate light/dark theme pairing following the system appearance (`[GATE: gate.customThemes]`).
- [ ] 238. **CHANGED** Shared themes embedded in post/comment text are detected and offered for import, in the new format (`[DECISION: theme-import-format-compat]`).
- [ ] 239. **CHANGED** Theme Maker (`[GATE: gate.customThemes]`), no timed trial.
- [ ] 240. Theme name required and unique to save.
- [ ] 241. Theme "UI mode" (light/dark) controls system chrome.
- [ ] 242. Theme status-bar style setting.
- [ ] 243. Five colour groups covering 19 roles.
- [ ] 244. Unset colours show "(default)" and inherit the base theme.
- [ ] 245. Comment depth colours are a fixed 6-colour cycle, shared across themes and not customisable — **with new colours**, not the original's (`[DECISION: theme-count]`).
- [ ] 246. Theme edits preview live app-wide but not inside the editor; unsaved edits end when leaving.
- [ ] 247. Save requires a name; overwriting prompts; saved themes appear in the list immediately.
- [ ] 248. Edit an existing custom theme by long-pressing it.
- [ ] 249. Delete by swipe or long-press; deleting the active theme reverts to the default.
- [ ] 250. Attach a custom theme to a comment/message from the composer toolbar.
- [ ] 251. Import or Import & Apply from the detected theme card (`[GATE: gate.customThemes]`).
- [ ] 252. Appearance — Make posts compact.
- [ ] 253. **CUT** Appearance — Enable split view.
- [ ] 254. Appearance — Show subreddit at top.
- [ ] 255. Appearance — Show subreddit icons.
- [ ] 256. Appearance — Post title max lines (1–10).
- [ ] 257. Appearance — Post text max lines (0–10).
- [ ] 258. Appearance — Link description max lines (0–30).
- [ ] 259. Appearance — Show post flairs.
- [ ] 260. Appearance — Blur spoilers.
- [ ] 261. Appearance — Blur NSFW.
- [ ] 262. **CUT** Appearance — Show post summary (`[DECISION: post-summary-dead-setting]`).
- [ ] 263. Appearance — Auto-play videos.
- [ ] 264. Appearance — Live Text (now functional).
- [ ] 265. Appearance — Tap to collapse post content.
- [ ] 266. Appearance — Thumbnails on the right in compact mode.
- [ ] 267. Appearance — Right-side vote indicators.
- [ ] 268. Appearance — Collapse AutoModerator.
- [ ] 269. Appearance — Show comment flairs.
- [ ] 270. **CUT** Appearance — Show comment summary (`[DECISION: comment-summary-dead-setting]`).
- [ ] 271. **CHANGED** Appearance — Tap to collapse comments; no refresh needed.
- [ ] 272. Appearance — Collapse children only.
- [ ] 273. Appearance — Show username in the tab bar.
- [ ] 274. Appearance — Hide tab bar on scroll.
- [ ] 275. **CHANGED** The Settings-root search bar is a shortcut into the Guide's own FTS5 search; there is no AI question box (`[DECISION: guide-included-or-not]`, `[DECISION: guide-ai-answer-drop]`).

### R. AI summaries → **entire area CUT** (`[DECISION: ai-removed]`)

- [ ] 276. **CUT** Post summaries.
- [ ] 277. **CUT** Comment summaries.
- [ ] 278. **CUT** Summaries regenerated per open.
- [ ] 279. **CUT** Post summary feeding the comment summary.
- [ ] 280. **CUT** Summary toggles on by default.

### S. Paid tier → replaced by area Y (`[DECISION: pro-removed]`)

- [ ] 281. **CUT/REPLACED** Monthly subscription with a region-varying price → area Y.
- [ ] 282. **CUT/REPLACED** Upgrade flow unlocking features immediately → Y3, Y8.
- [ ] 283. **CUT/REPLACED** Cancellation via the system; access through the period end → Y10.
- [ ] 284. **CUT/REPLACED** Grace period keeping features active → Y6.
- [ ] 285. **CUT/REPLACED** The old feature set → `05-monetization.md` §3.
- [ ] 286. **CUT** Self-hosted server as an alternate unlock (`[DECISION: self-hosted-server-row]`).
- [ ] 287. **CUT** Customer ID display.

### T. Stats → `04c`, `[GATE: gate.stats]`

- [ ] 288. **CHANGED** Stats screen gated; locked state describes what is tracked; no fake asterisks (`[DECISION: stats-obfuscation]`).
- [ ] 289. "Your journey" header from the install date.
- [ ] 290. Activity cards: posts explored, distance scrolled (with the fun comparison), upvotes given, downvotes given, content created — each with its breakdown.
- [ ] 291. Usage patterns: launches, opens per day, total opens, upvote ratio (only once votes exist).
- [ ] 292. Top 10 most-visited subreddits with proportional bars.
- [ ] 293. Seven achievements with the original thresholds, appearing only once unlocked.
- [ ] 294. Fun facts computed only when their inputs are non-zero.
- [ ] 295. Milestone easter eggs on exact counter values.
- [ ] 296. All stats stored locally and never transmitted; stated on the screen.
- [ ] 297. Vote statistics included in the above.
- [ ] 297a. Counters keep incrementing while the screen is locked.

### U. Privacy, data and general settings → `04c`

- [ ] 298. **CHANGED** Error-reporting toggle, default on, **no restart required** (`[DECISION: error-reporting-default]`, `[DECISION: sentry-or-not]`).
- [ ] 299. No other data leaves the device.
- [ ] 300. Reddit credentials never stored; only the session cookie, in the Keychain.
- [ ] 301. Privacy Policy and EULA links in Legal.
- [ ] 302. Independent low-data settings for Wi-Fi and cellular, auto-selected by connection type.
- [ ] 303. Clear Image Cache with a live size readout.
- [ ] 304. **CUT** Self-hosted server section (`[DECISION: self-hosted-server-row]`).
- [ ] 305. Startup: start on a chosen tab.
- [ ] 306. Startup: startup URL overriding the tab, with validation feedback.
- [ ] 307. **CHANGED** Settings root lists, in order: Guide, General, Theme, Appearance, App Icon (device-conditional), Account, **APPNAME Plus**, Data Use, Stats, Privacy, Advanced, Patch Notes, Request A Feature (`04c` §15).
- [ ] 308. "What's New" shows the current release notes.
- [ ] 309. **CHANGED** Feedback links to the owner's chosen destination (no third-party subreddit by default).
- [ ] 310. All settings autosave and persist.
- [ ] 311. **CHANGED** Gated settings stay visible with a Plus badge rather than being hidden (`05` §5.9).
- [ ] 312. **CHANGED** Device-conditional settings: App Icon only where alternates are supported. Split view no longer exists.
- [ ] 312a. Clear Video Cache, deferred to the next launch, with an explanatory alert.

### V. App icons → `04c`, `[GATE: gate.appIcons]`

- [ ] 313. App Icon section shown only where alternate icons are supported.
- [ ] 314. Tapping an icon in the grid sets it directly; immediate effect, no restart; the active icon is badged. Alternates carry a Plus badge while locked (`[GATE: gate.appIcons]`); reverting to the default is always free.
- [ ] 315. **CHANGED** No per-icon detail page and no artist-credit card; the grid is the whole screen (`[DECISION: app-icons-new-art]`).
- [ ] 316. **CHANGED** One default plus three new alternates, authored for this app.

### W. Help → `04c`

- [ ] 317. **CHANGED** A small hand-written help section replaces the 38-topic guide (`[DECISION: guide-included-or-not]`).
- [ ] 318. **CHANGED** Help topics are reachable by deep link from settings rows.
- [ ] 319. A "not found" state for unresolved help links.
- [ ] 320. **CHANGED** Topics limited to what the rewrite actually does; nothing describes removed features (`[DECISION: guide-prose-rewrite]`).

### X. Cross-cutting → all

- [ ] 321. Drafts autosave and restore across post, comment and message composers.
- [ ] 322. "Mark as seen on scroll" + "hide seen posts" work well together, with the cost explained.
- [ ] 323. Background audio from other apps is not interrupted while scrolling unless feed audio is on.
- [ ] 324. Shadowbanned accounts can still sign in.
- [ ] 325. Markdown URLs containing backslashes render as links.
- [ ] 326. Replying in a locked or archived post warns before opening the editor.
- [ ] 327. **CUT** Android (`[DECISION: android-out-of-scope]`).

### Y. Subscription — `APPNAME Plus` → `05-monetization.md`

- [ ] 328. A subscription group with a monthly and an annual product, priced from StoreKit and never hard-coded (`05` §2.2, §6.5).
- [ ] 329. A 7-day introductory free trial, offered only when the account is eligible (`05` §2.2).
- [ ] 330. Family Sharing enabled; family-shared entitlements honoured and revocations handled (`05` §2.2, §5.3).
- [ ] 331. `Transaction.updates` listener started before the first entitlement read and never cancelled (`05` §5.3).
- [ ] 332. Entitlement derived from `Transaction.currentEntitlements`, verified results only, latest expiry wins (`05` §5.3).
- [ ] 333. Renewal state mapped so grace period and billing retry keep features unlocked (`05` §5.3).
- [ ] 334. Offline cache with a 16-day leeway; downgrades applied immediately, upgrades optimistic (`05` §5.5).
- [ ] 335. On-device verification only; no receipt upload, no shared secret, no anti-piracy code (`05` §5.4).
- [ ] 336. Restore Purchases on the paywall and in settings, only from an explicit tap (`05` §5.8).
- [ ] 337. `Feature` enum with the eleven cases and the OWNER switches for the three arguable gates (`05` §4).
- [ ] 338. `requiresEntitlement(_:style:)` with all four gate styles; gated affordances remain visible (`05` §5.9).
- [ ] 339. Paywall presented only from a user tap, contextualised by the triggering feature, dismissible, single-instance (`05` §5.10).
- [ ] 340. After purchase the sheet dismisses and the original action completes automatically (`05` §5.10).
- [ ] 341. No gate blocks already-entered content; composer gates check before the editor opens (`05` §3.3, §5.10).
- [ ] 342. Lapsing preserves all user data: custom themes, filters, extra accounts (`05` §3.3).
- [ ] 343. Settings → APPNAME Plus with status, renewal date, plan switching, Manage Subscription, Restore, Terms and Privacy (`05` §6.4).
- [ ] 344. The App Store compliance checklist passes line by line (`05` §7).
- [ ] 345. Sandbox, StoreKit-configuration and TestFlight purchase paths all verified (`05` §9).

---

## 5. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Reddit blocks the keyless model** — UA fingerprinting, mandatory OAuth, or blanket 403s on `www.reddit.com` JSON | Medium | Fatal | Isolate all of it behind the `RedditAPI` package's `RedditClient` actor so the transport can change in one place. Ship the randomized-UA strategy from day one. Build `[DECISION: no-429-handling]` so throttling degrades gracefully instead of looking like corruption. Keep the fixture suite so a protocol change is diagnosed in minutes. Have a contingency: a Reddit OAuth app with the installed-client flow is a two-day change if `RedditAPI` is clean |
| R2 | **Cookie login fragility** — Reddit changes its login page, the success heuristics stop firing, or WebKit cookie behaviour shifts | High | High | Keep **both** success detectors (navigation allow-list **and** a cookie poll). Use `WebPage.Configuration` with an explicit `websiteDataStore` so each login attempt starts clean. Never parse Reddit's DOM for anything but cosmetics. Reproduce the expire-then-clear logout ordering exactly. Add an explicit "login timed out" state after 120 s with a retry, instead of hanging |
| R3 | **App Store review of a third-party Reddit client** — 4.2 minimum functionality, 5.2.5 trademark, UGC/age-rating, or the login-in-a-web-view pattern | Medium | High | 17+ rating with the UGC questions answered; block and report paths present and named in review notes; no Reddit wordmark or Snoo anywhere; the app is a native client with web views only for login, wiki and report; review notes explain the access model and that no demo account is needed; the free tier is fully functional without login |
| R4 | **Liquid Glass regressions** — themed backgrounds fight the material; custom colours fail Increase Contrast / Reduce Transparency | High | Medium | Phase 9 audit is a gate, not a nicety. Rule: no custom background on any bar, tab bar or toolbar. `glassEffect` only on the media viewer chrome and the paywall header. Every theme ships light and dark variants and is checked against the three accessibility settings. Theme roles that must meet contrast (text on background, text on tint) are validated at save time in the Theme Maker |
| R5 | **AVPlayer memory and decoder exhaustion** — black tiles after a fast fling | High | High | The registry (cap 12, ref-counted, deferred release) plus focused-only playback plus the reload watchdog are all mandatory, not optional. Phase 4's DoD includes a 10-second fling on a 100%-video feed. Instruments memory-graph check in Phase 9 |
| R6 | **Comment-tree performance** — a 2,000-comment thread janks or blows memory | Medium | High | Flatten to rows, render in `List` (recycling), never `LazyVStack`. Static subview count per row (`spec/10` §A3). Collapse is an array splice. Phase 3 DoD measures it |
| R7 | **Markdown/HTML fidelity** — Reddit's HTML has constructs the renderer mishandles; composer preview diverges from what Reddit renders | High | Medium | Golden tests per tag against fixtures. Accept ~95% composer-preview fidelity as a documented decision (`[DECISION: snudown-renderer]`). Keep a fallback that renders unknown tags as their text content rather than dropping them |
| R8 | **StoreKit edge cases in review** — reviewer cannot complete a purchase, or the paywall lacks a required disclosure | Medium | Medium | The `05` §7 checklist is a Phase 10 gate. Paywall screenshot uploaded per product. Sandbox-verified before submission |
| R9 | **One-shot agent drift** — the agent invents behaviour, skips a checklist item, or silently degrades scope | High | High | Per-phase gates; `PROGRESS.md` mapping every one of the ~350 checklist items to done/deferred-with-reason; a commit per phase so a bad phase can be reverted; guardrails encoded as *lint errors*, not prose |
| R10 | **Redgifs rate-limiting the developer's IP during development** | Medium | Low | The lazy-resolution contract is reproduced exactly; fixtures replace live calls in tests; avoid scroll-testing Redgifs-heavy subreddits |
| R11 | **iOS 27.x toolchain churn** — Xcode 27.1/27.2 not yet shipped as of the baseline date; the JSON project format is beta | Medium | Medium | Pin the Xcode version in CI by path; do not adopt the `.xcproj` JSON format; re-check `spec/10` Part B before upgrading |
| R12 | **Owner decisions arriving mid-build** — a gate flips after the code is written | Medium | Low | Gates are a single table (`Feature.isGated`) and tags in docs; flipping one is a one-line change plus a checklist annotation |

---

## 6. Size estimate

Ballpark, to calibrate the one-shot. Swift lines, excluding tests, comments and generated code.

| Package / target | Files | LoC | Notes |
|---|---|---|---|
| `AppCore` | 30–40 | 2,400 | Domain values, `RedditLink` + `PageKind`, sort types, error taxonomy, formatters (time/number), the `Feature` enum, pure filter predicates, comment flattening |
| `RedditAPI` | 45–60 | 5,500 | `RedditClient` actor, request builder, endpoint catalog, decoding, `SessionStore`, cookies/Keychain, `RedgifsResolver`, `OpenGraphFetcher`, login policy |
| `Persistence` | 15–20 | 1,400 | GRDB stack, 6 tables, migrations, maintenance, seen pub/sub, `SettingsStore` |
| `RedditMarkdown` | 20–25 | 2,800 | cmark-gfm bridge, Reddit-dialect pre/post passes, AST, SwiftUI block renderer, composer toolbar transforms |
| `Theming` | 10–14 | 900 | `Theme`/`ThemeColor` model, resolution order, custom-theme merge, import/export codec, glass tint rules |
| `Entitlements` | 12–16 | 1,100 | StoreKit 2, `Feature.isGated`, paywall, Plus settings screen, `requiresEntitlement` modifier |
| `MediaKit` | 40–50 | 5,000 | Image pipeline, viewer, tap classifier, zoom/pan, player registry, focus engine, watchdog, gallery grid, download/share, Live Text bridge |
| `AppRouting` | 12–16 | 1,000 | `Route`, per-tab `Router` + forward history, `RouteResolver`, `LinkIntake`, `ModalCoordinator` |
| `DesignSystem` | 30–40 | 2,500 | Rows, list primitives, four-band swipe container, context menus, badges, refresh, access-failure views, haptics facade |
| `Features/FeedFeature` | 25–35 | 3,200 | Feed screens, post card (2 layouts), filters, sorting, subreddit switcher |
| `Features/PostDetailFeature` | 20–25 | 2,600 | Header, action bar, flattened tree, comment row, collapse, load-more, scroll-to-next |
| `Features/ComposerFeature` | 15–20 | 1,800 | Shell, editor, toolbar, preview, drafts, four composers, image upload |
| `Features/MediaFeature` | 10–14 | 900 | Fullscreen viewer screen and Gallery Mode screen over `MediaKit` |
| `Features/AccountsFeature` | 15–20 | 1,500 | Login web view, accounts list, quick swap, NSFW-visibility banner |
| `Features/InboxFeature` | 12–15 | 1,100 | List, two row kinds, thread view, poller/badge wiring |
| `Features/SearchFeature` | 10–14 | 900 | Three scopes, trending, in-subreddit, quick search |
| `Features/SubredditsFeature` | 14–18 | 1,400 | Hub, A–Z rail, sidebar, wiki, multireddits |
| `Features/SettingsFeature` | 40–55 | 4,200 | ~19 screens, theme maker, colour picker, stats, help |
| App target + ShareExtension | 12–15 | 700 | Composition root, scene, tabs, extension |
| **Total (production)** | **~380–480** | **~40,900** | 18 packages plus two non-package targets |
| Tests | ~120–160 | ~12,000 | Swift Testing; roughly 30% of production LoC |
| Fixtures | ~40 JSON | — | A few MB |


For calibration: this is a 10–14 week build for one experienced iOS engineer working full time, or
roughly 60–90 agent-hours of well-gated generation with human review at each phase boundary. The
three most expensive single items are `MediaKit` (video is where all the subtlety lives),
`RedditMarkdown` (breadth of constructs), and `Features/SettingsFeature` (sheer surface area).

---

## Traceability

| Section here | Derived from | Feeds into |
|---|---|---|
| §1.2 layout, §1.3 project | `02-architecture.md` (packages, stores, routing); `spec/10` §A1 (SDK gates), Part B item 2 (`.xcproj` beta) | `07-one-shot-prompt.md` §"working method" |
| §1.4 dependency allow-list | `spec/10` §A3 (GRDB, Nuke, Swift Testing, no TCA, no SwiftData) | `07` guardrails |
| §1.5 lint rules | `spec/10` Part C (deprecations); `07` guardrails | `.swiftlint.yml` |
| §1.6 CI | `spec/08` §7 (the original's CircleCI + EAS pipeline, for the contrast paragraph) | `07` kickoff checklist |
| §1.7 fixtures | `spec/02` §§2, 4 (every endpoint and model) | Phase 1 DoD; §3.3 replay |
| §1.8 assets | `spec/10` §A2 (Icon Composer, layered icons); `spec/01` §21; `spec/08` §4 | `[DECISION: app-icons-new-art]` |
| §2 Phase 0 | `spec/01` §§1–4, §16; `spec/06` §3 | `02-architecture.md` |
| §2 Phase 1 | `spec/02` entire; `spec/09` §2.2 | `03-data-and-networking.md` |
| §2 Phase 2 | `spec/03` §§1–8, 10–23; `spec/02` §5 | `04a-feeds-posts-comments.md` |
| §2 Phase 3 | `spec/04` entire | `04a-feeds-posts-comments.md` |
| §2 Phase 4 | `spec/05` entire; `spec/03` §9 | `04b-media.md` |
| §2 Phase 5 | `spec/07` entire; `spec/02` §§2.5–2.9 | `04c-accounts-inbox-search-subs-settings.md` |
| §2 Phase 6 | `spec/04` §11; `spec/02` §2.4 | `04a` composers |
| §2 Phase 7 | `spec/06` entire | `04c` settings |
| §2 Phase 8 | `05-monetization.md` §§4–6, 9 | Area Y of the checklist |
| §2 Phase 9 | `spec/01` §§6–20; `spec/10` §A2; `08` §2 | `07` verification method |
| §4 checklist | `spec/08-feature-inventory.md` §1 items 1–327, adjusted by `08-decisions-and-drift.md` | `PROGRESS.md` in the new repo |
| §5 risks | `spec/02` §§1.3, 3.1, 7, 8; `spec/05` §§4–5; `spec/04` §12; `spec/10` §§A2–A3, Part B | `07` guardrails |
| §6 sizing | Derived from the feature surface catalogued across `spec/01`–`spec/09` | Calibration of the one-shot prompt |

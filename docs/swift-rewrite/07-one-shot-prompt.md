# 07 — The One-Shot Build Prompt

This file contains two things:

1. **§A — the kickoff checklist for the human**, to be completed *before* the prompt is run.
2. **§B — the prompt itself**, to be pasted verbatim into an AI coding agent (Claude Code) opened
   in the new, empty repository.

Everything between the `=== BEGIN PROMPT ===` and `=== END PROMPT ===` markers is the prompt.
Replace `APPNAME`, `com.OWNER.appname` and `<path-to-spec-repo>` with real values first; leave
everything else exactly as written.

---

## §A — Kickoff checklist for the human

Do these first. The agent cannot do them and will stall or invent values without them.

- [ ] **1. Decide the name.** Pick `APPNAME` (`[DECISION: app-name]`). It must not contain
      "Reddit", must not evoke Hydra, and must be clear of Reddit's trademark and trade dress.
      Check availability in App Store Connect before committing to it.
- [ ] **2. Decide the bundle id** (`[DECISION: bundle-id]`), e.g. `com.OWNER.appname`. The share
      extension will be `com.OWNER.appname.ShareExtension`. This cannot change after release.
- [ ] **3. Create the GitHub repository**, empty, private, default branch `main`. Clone it locally.
- [ ] **4. Have the spec repo available locally** — the agent copies `docs/swift-rewrite/` out of
      it in its very first step.
- [ ] **5. Apple Developer Program** membership active. Create the App ID with the bundle id,
      enable the capabilities the app needs and create the App Store Connect app record. Exactly
      **two** capabilities: **App Groups** (`group.com.OWNER.appname`, on the app, the share
      extension **and** the widgets extension) and **iCloud → Key-value storage** (app target only,
      `09` §3.7). **Not** Push Notifications, **not** CloudKit containers, **not** Associated
      Domains, and **not** Siri — App Intents and App Shortcuts need no capability at all; the Siri
      capability belongs to SiriKit Intents extensions, which this app does not ship (`09` §3.4).
- [ ] **5a. Decide about the `audio` background mode.** The app declares
      `UIBackgroundModes = ["audio"]` for **Picture in Picture in the fullscreen video viewer and
      nothing else** (`[DECISION: pip-fullscreen-video]`, `[DECISION: background-mode-audio-pip-only]`,
      `09` §3.8.1). It is the only entitlement the native-polish work costs and the only App Review
      question it creates (`06` risk R16). If you would rather not have that conversation, say so
      now: rejecting PiP is four edits, listed in `09` §3.8.1, and is much cheaper before the build
      than after.
- [ ] **6. Agreements, Tax and Banking** — Paid Apps agreement signed and active, or IAP products
      will sit in "Missing Metadata" forever.
- [ ] **7. Enroll in the App Store Small Business Program** (15% commission).
- [ ] **8. Create the subscription group and products** exactly as specified in
      `05-monetization.md` §2.2: group `APPNAME Plus`, products
      `com.OWNER.appname.plus.monthly` ($0.99) and `com.OWNER.appname.plus.yearly` ($9.99),
      both with a 7-day introductory free trial and Family Sharing on. Enable **Billing Grace
      Period**. (Localizations and the review screenshot can wait until Phase 10.)
- [ ] **9. Create an App Store Connect API key** (Users and Access → Integrations → App Store
      Connect API, role: App Manager). Save the `.p8`, the Key ID and the Issuer ID. Base64 the
      `.p8` and add `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `TEAM_ID`,
      `APP_IDENTIFIER` as GitHub Actions repository secrets.
- [ ] **10. Signing**: enable automatic signing with the ASC API key; no certificates in the repo.
- [ ] **11. Answer the three OWNER gate questions** in `05-monetization.md` §4:
      `gate.sortMemory` (default: **gated**), `gate.videoAutoplay` (default: **free**),
      `gate.compose` (default: **free**). Every other gate is on. Also settle
      `[DECISION: sentry-or-not]` — if yes, have the Sentry DSN ready; if no, tell the agent to skip
      it and note that the privacy label then stays "Data Not Collected".
- [ ] **12. Icon assets.** Either have the four Icon Composer documents ready — one default plus
      three alternates, all **new artwork** (`[DECISION: app-icons-new-art]`) — or accept that the
      agent will ship placeholder icons and mark items 313–316 as deferred in `PROGRESS.md`.
- [ ] **13. Privacy Policy URL** hosted somewhere the owner controls. Required by the paywall, by
      the Settings → Legal screen and by App Store Connect. The EULA may be Apple's standard one.
- [ ] **13a. Author the 12 built-in theme palettes.** `04c` §18.2 is the contract: **12** themes, at
      least 4 light and at least 4 dark, all 20 colour roles plus the UI-mode and status-bar flags per
      theme, a new 6-colour comment-depth cycle, new names under §18.2's naming rules (no third-party
      brand or character names), and WCAG AA on text-on-background and text-on-tint at both contrast
      settings. The agent cannot invent these from nothing and must not copy the original's
      (`[DECISION: theme-count]`). Either supply them, or accept two starter themes in Phase 0 and
      the remaining ten deferred in `PROGRESS.md`.
      **This item stands even though the theme migration bridge exists.** The bridge (`02` §8.5a)
      only lets you import your own *custom* themes out of the app you are replacing, using its share
      feature; the **built-ins ship inside the app** and have to be authored.
- [ ] **13b. Decide three owner-configured destinations, or accept that their rows disappear.**
      `feedbackDestinationURL` (Settings → Feedback, `04c` §15 row 13), `themeCommunityURL`
      ("Explore Community Themes", `04c` §18.1) and `themeSharingSubreddits` (the composer's Attach
      Theme button, `04c` §18.5). Each has **no default** and names no third-party community; an
      unset value means the row or button is simply not rendered.
- [ ] **13c. Have an iPad to test on**, or accept that the iPad half of the app is only ever verified
      in the simulator. The app ships `TARGETED_DEVICE_FAMILY = 1,2` and its split view (`02` §5.15,
      `04a` §3.5) is a Phase 9 device item: Stage Manager, window tiling, a window narrow enough to
      collapse the pane, all four orientations, a trackpad (hover and secondary click), a hardware
      keyboard (the shortcut set and the iPadOS 26 menu bar) and Apple Pencil taps cannot be judged
      honestly on a simulator. An iPad-class device running iPadOS 26 or 27 is enough; a Magic
      Keyboard or any Bluetooth keyboard and a trackpad or mouse cover the rest.
- [ ] **13d. Plan for iPad App Store screenshots.** App Store Connect requires an iPad screenshot set
      for a `1,2` device family and will not accept the submission without one. At least one shot must
      show the two-pane split view. Capture them during the Phase 9 device pass rather than at
      submission time (`06` Phase 10, risk R15).
- [ ] **14. Xcode 27** installed (Swift 6.4, iOS 27 SDK) on macOS Tahoe 26.6+. Have **both** an iPhone
      and an iPad simulator runtime installed (`iPhone 17` and `iPad Pro 13-inch (M5)`, OS 27.0) —
      every phase gate builds for both.
- [ ] **15. Capture the Reddit JSON fixtures** listed in `06-build-plan-and-acceptance.md` §1.7, or
      let the agent stub them and fill them in at the end of Phase 1. Capturing them by hand first
      is strongly recommended — every unit test in the build depends on them.
- [ ] **17. Two devices on one Apple Account, for the sync and Handoff pass.** Handoff
      (`09` §3.6) and iCloud settings sync (`09` §3.7) cannot be verified on one device or in a
      simulator pair that is not signed in. The Phase 9 smoke opens a post on the iPhone and
      continues it on the iPad, and changes a theme on one and watches it arrive on the other. If
      that is not possible, accept that both land in `PROGRESS.md` as "could not verify without two
      signed-in devices".
- [ ] **18. Read `09-native-polish-and-platform-features.md` §3's summary table (§3.1) once, top to
      bottom.** Nineteen features ship, one ships off by default, four are deferred and eight are
      rejected, each with a decision id in `08` §1.5 (#101–#127). Every one is **free**
      (`[DECISION: native-polish-free]`). Veto anything you do not want now — each row is
      independent, and the two worth a moment's thought are Picture in Picture (step 5a) and
      Spotlight indexing (`09` §3.5 notes that `IndexedEntity` is described by Apple as making
      entities discoverable by Apple Intelligence; dropping that conformance keeps the feature and
      removes the association, in two lines).
- [ ] **16. Run the prompt below** in the new repo.

---

## §B — The prompt

=== BEGIN PROMPT ===

You are building a brand-new native iOS app from scratch, in this repository, which is currently
empty. Work through it phase by phase. This is a long build; pace yourself, commit often, and never
skip a verification gate.

## Mission

Build **APPNAME**, a native SwiftUI Reddit client for **iPhone and iPad**, to the behavioural specification in
`docs/`. The specification describes, in exhaustive detail, how an existing React Native app
behaves. You are reproducing that **behaviour**, from scratch, in Swift. You are not porting code —
there is no code to port, and copying any would be a licence violation.

## Step 0 — Import the specification

Before anything else:

1. Copy the folder `<path-to-spec-repo>/docs/swift-rewrite/` into this repository as `docs/`.
2. Read it in this order, in full, before writing a single line of Swift:
   - `00-README.md` — orientation: scope, principles, the owner decisions already made
   - `02-architecture.md` — the app's structure: Observation stores, per-tab `NavigationStack`
     plus a `Route` enum, the `RedditClient` actor, GRDB, the Theme environment, the Entitlements
     seam, and the **18-package split (§2.2 and §3.1 are the canonical package list)**
   - `03-data-and-networking.md` — the network layer and data model contract
   - `04a-feeds-posts-comments.md`, `04b-media.md`,
     `04c-accounts-inbox-search-subs-settings.md` — per-screen specifications, carrying
     `[GATE: gate.*]` and `[DECISION: <id>]` tags
   - `05-monetization.md` — the subscription, the entitlement architecture, and the definition of
     every `[GATE: gate.*]` identifier
   - `06-build-plan-and-acceptance.md` — your build plan, your verification gates, and the
     ~350-item acceptance checklist you must satisfy
   - `08-decisions-and-drift.md` — the resolved decisions behind every `[DECISION: <id>]` tag, plus
     the list of original-app bugs you must **not** reproduce
   - `09-native-polish-and-platform-features.md` — **normative** for haptics (§2), the modern
     platform surfaces (§3), the accessibility baseline (§4) and motion (§5). Read it before Phase 2,
     because the haptics facade is a Phase 0 deliverable and every later phase attaches cues through
     it, and read it again in full at the start of Phase 9
   - `docs/spec/01` through `docs/spec/10` — the raw behavioural surveys. These are reference
     material: when a `04*` document is ambiguous, the corresponding `spec/` file has the exact
     thresholds, constants, orderings and edge cases. `spec/10-swiftui-2026-baseline.md` is the
     verified platform baseline; treat its API availability claims as authoritative.
3. Then write `PROGRESS.md`, seeded with every item from the acceptance checklist in
   `06-build-plan-and-acceptance.md` §4, each marked `TODO`, grouped by area, with a column for the
   phase that will deliver it. Commit: `chore: import specification and seed progress tracker`.

Tag spellings: **there are no aliases.** Every `[GATE: gate.*]` tag names one of the eleven gate ids
defined in `05-monetization.md` §4, and every `[DECISION: <id>]` tag names a numbered entry in
`08-decisions-and-drift.md` §1 (#1–#127, where #101–#127 are the native-polish decisions in §1.5), a
bug id in its §2, or a drift row `D1`–`D20` in its §3. A
gate not defined in `05` §4 does not exist — treat that feature as free. A decision id you cannot find
is an error: record it in `PROGRESS.md` under "Open questions" and match the code as `spec/` describes
it. Do not invent register entries.

Precedence, when documents disagree: `08-decisions-and-drift.md` > `05-monetization.md` >
`09-native-polish-and-platform-features.md` > `04a`/`04b`/`04c` > `02`/`03` > `spec/01`–`spec/10`.
`09` sits above the `04*` documents **only** for haptics, the platform surfaces, accessibility and
motion; for everything else the `04*` documents win as before. The set has been reconciled, so a material
conflict is a defect rather than a choice: record it in `PROGRESS.md` under "Open questions", pick the
option that best matches `spec/`'s description of the current code, and continue. Do not stop to ask.

## Non-negotiables

1. **Clean room.** Nothing — no code, no artwork, no icon, no font, no colour palette, no help
   text, no alert string, no settings description, no README sentence — comes from the original
   app or its documentation. The original is AGPL-3.0. Behaviour may be reproduced; expression may
   not. Every user-visible string in this app is written by you, fresh. If you catch yourself
   copying a sentence out of a `spec/` file because it reads well, stop and rewrite it.
2. **iPhone and iPad.** `TARGETED_DEVICE_FAMILY = 1,2`. The iPad split view is **in scope** and is
   specified in `02-architecture.md` §5.15 (shell contract) and `04a-feeds-posts-comments.md` §3.5
   (feed behaviour): a two-column layout, active only while the window is ≥ 768 pt wide and the
   horizontal size class is regular, gated additionally on the Appearance → "Enable split view"
   setting (default on for iPad-class devices), with selection state **per feed screen instance** and
   Close / Fullscreen pane controls. **Do not use `NavigationSplitView`** — build the explicit
   `HStack` of feed column + detail `NavigationStack` that `02` §5.15.2 specifies, and read its five
   reasons before you are tempted otherwise. Do **not** apply `.tabViewStyle(.sidebarAdaptable)`. Gate
   on the **container's** width via `onGeometryChange`, never on `UIScreen`. Do **not** declare
   `UIRequiresFullScreen`. iPhone is portrait-only; iPad supports all four orientations.
3. **Deployment target iOS 26.0**, built with the **iOS 27 SDK**, **Xcode 27**, **Swift 6.4**.
   iOS 27-only APIs go behind `@available`. The app uses the scene-based lifecycle and ships a
   `UILaunchScreen` — both are hard requirements of the 27 SDK.
4. **Liquid Glass is not optional.** Design for it from the first view. Do not set
   `UIDesignRequiresCompatibility` — it is ignored on this SDK. Do not put custom backgrounds on
   navigation bars, the tab bar, or toolbars. Use `glassEffect` sparingly and only on the media
   viewer chrome and the paywall header.
5. **Observation, not Combine.** `@Observable` classes held in `@State` or `@Environment`.
   `ObservableObject`, `@StateObject` and `@Published` are banned outright.
6. **Approachable concurrency.** `SWIFT_APPROACHABLE_CONCURRENCY = YES`,
   `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, `SWIFT_STRICT_CONCURRENCY = complete`. Anything
   that must run off the main actor — database work, JSON decoding, image decoding, network
   parsing — is marked `@concurrent` explicitly. With MainActor-by-default inference, an
   unannotated `nonisolated async` function runs on the main actor and will silently destroy your
   scroll performance.
7. **GRDB** for local storage. Not SwiftData, not Core Data, not raw SQLite.
8. **Swift Testing** for all unit tests. XCTest only for the one XCUITest smoke target, because UI
   automation has no Swift Testing equivalent.
9. **No AI features and no push notifications.** No summaries, no smart filters, no Foundation
   Models, no `UNUserNotificationCenter` registration, no background refresh, no APNs entitlement.
   The inbox is a 60-second foreground poll that sets the app-icon badge.
10. **StoreKit 2 subscription**, exactly as specified in `05-monetization.md`. No purchase SDK, no
    server, no receipt upload.
11. **No backend of any kind.** The app talks to `www.reddit.com`, `old.reddit.com`, Reddit's media
    hosts, `api.redgifs.com`, arbitrary hosts for Open Graph link previews, and Apple. Nothing else.
    iCloud key-value storage and Handoff are Apple-operated services inside the user's own Apple
    Account — **not** a server we run, not a service we can read, and not a change to the privacy
    label.
12. **Native quality of life is not optional.** Implement the complete haptic map and the platform
    features in `09-native-polish-and-platform-features.md`.
    - **No gesture ships without its haptic.** Every interaction in `04a`/`04b`/`04c` appears in
      `09` §2's Maps A–F with either a cue or an explicit "none, and why". A gesture that changes
      state and fires nothing, with no row saying it should, is a defect.
    - **Never more than one haptic per user action**, and **never a haptic the user did not cause**.
      An in-gesture cue suppresses the commit cue; a failure always fires `.error`. `09` §2.10's
      ten-item do-not list is a review checklist, not advice.
    - **One facade, in `DesignSystem`, built in Phase 0.** `sensoryFeedback`,
      `UIImpactFeedbackGenerator`, `UISelectionFeedbackGenerator`, `UINotificationFeedbackGenerator`
      and `CHHapticEngine` are lint errors everywhere else. `.start`, `.stop`, `.increase`,
      `.decrease` and `.levelChange` are lint errors **everywhere** — Apple documents all five as
      silent on iOS.
    - **Never add a haptic to a system `Toggle`, `Picker`, `Slider`, alert, sheet or
      `.contextMenu`.** iOS already plays one; the second is audible as a bug.
    - Ship the platform surfaces of `09` §3: widgets, Control Center and Action-button controls, App
      Intents with App Shortcuts, Spotlight indexing, Handoff, iCloud settings sync, Picture in
      Picture, zoom transitions, symbol effects and `Tab(role: .search)`. All free, none gated.
    - **The accessibility audit is a gate**, not a nicety: `09` §4.2's eight parts, written up in
      `PROGRESS.md` as an accessibility audit report before Phase 10 begins. So is the haptics audit
      (`09` §2.11).

## Working method

Follow `06-build-plan-and-acceptance.md` §2 phase by phase: Phase 0 skeleton, 1 networking,
2 feeds, 3 post detail and comments, 4 media, 5 accounts/inbox/search/subreddits, 6 compose,
7 settings/themes/icons/stats/help, 8 entitlements and paywall, 9 integration and audits,
10 release preparation.

For each phase:

1. Re-read that phase's **Inputs** (the named doc sections) before writing code. Do not work from
   memory of a document you read three phases ago.
2. Build the phase's **Deliverables** in full.
3. Write the phase's **Tests** as you go, not at the end.
4. Run the **gate** (below). It must be green.
5. Update `PROGRESS.md`: every checklist item this phase touched moves to `DONE`, or to
   `DEFERRED` with a one-line reason and the phase it moves to. Never silently leave an item at
   `TODO` after the phase that owns it.
6. Commit with a conventional-commit message naming the phase, e.g.
   `feat(phase-4): media viewer, player registry, focus engine, gallery mode`.
7. Only then start the next phase.

**The gate**, run at the end of every phase, all five parts:

```
Scripts/lint.sh                       # swift format --lint + swiftlint, zero violations
for p in Packages/*/; do (cd "$p" && swift test); done
xcodebuild build -scheme APPNAME \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=27.0'   # zero warnings from our code
xcodebuild build -scheme APPNAME \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=27.0'   # ships 1,2 — build both
xcodebuild test  -scheme APPNAME \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=27.0'
Scripts/replay-fixtures.sh            # every committed fixture decodes, golden summaries match
```

If the gate fails, fix it before moving on. If it cannot be made green after a genuine attempt,
write the blocker into `PROGRESS.md` under "Blocked", and continue only with work that does not
depend on the blocked piece.

From Phase 4 onward, also run the phase's **manual smoke list** from
`06-build-plan-and-acceptance.md` §2 in the simulator, and record the result in `PROGRESS.md`.
Where you cannot verify something without a real device or a real Reddit account (login, purchase,
Photos permission, app-icon switching), say so explicitly in `PROGRESS.md` rather than claiming it
passes.

## Verification method

- **Compile**: `xcodebuild build` for the simulator on **two destinations** — one iPhone and one iPad
  (`iPad Pro 13-inch (M5)`) — zero warnings from first-party code on both. Warnings from dependencies
  are acceptable; warnings from `Packages/*` and `APPNAME/` are not. The app ships for iPhone **and**
  iPad, so a build that only ever compiles for an iPhone destination is not a build of the product.
- **Unit**: `swift test` in every package. Tests must be hermetic — **no network, no real StoreKit,
  no Keychain, no filesystem outside a temp directory, no wall-clock dependence**. Inject clocks,
  inject the transport, inject entitlement snapshots.
- **Fixtures replay**: `Scripts/replay-fixtures.sh` walks `Fixtures/reddit/*.json`, decodes each
  through the real production parsers, and compares a golden summary per file (item counts, ids,
  the classified media type, the mapped error). This is what catches a parser change that silently
  drops a field. Write it in Phase 1 and keep it green thereafter.
- **UI smoke**: one XCUITest target, kept small, launched with `-UITestFixtureMode 1` so the
  network layer serves fixtures. It must cover: launch, each of the five tabs, opening a post,
  scrolling comments, opening the media viewer, opening settings, and backing out. It runs on **both**
  destinations; on the **iPad** destination it additionally asserts that opening a post populates the
  detail pane rather than pushing, that **Close** returns the feed to full width, and that
  **Fullscreen** pushes over both columns.
- **iPad manual smoke**: from Phase 0 onward, each phase's iPad smoke list in
  `06-build-plan-and-acceptance.md` §2, run on an iPad simulator — and in Phase 9 on a real iPad,
  including Stage Manager, window tiling, a narrow window, all four orientations, a trackpad and a
  hardware keyboard.
- **Manual smoke**: the per-phase lists, consolidated before Phase 10 and run once on a device.

## Decisions you must assume

These come from `08-decisions-and-drift.md`, which is authoritative and has the full reasoning.
Restated here so you never have to guess:

- The original's paid tier, all AI features, and push notifications are **gone**. A new
  `APPNAME Plus` StoreKit 2 subscription replaces the paid tier.
- Dead settings that did nothing in the original — post summary, comment summary — are **deleted**.
  Live Text, which also did nothing, is **actually implemented**.
- Polls render **read-only**, with per-option results when Reddit supplies them. No fake vote button.
- Votes and saves apply **optimistically and roll back** on failure, and a vote cast in post detail
  patches the feed row behind it. No rejection is ever swallowed.
- One markdown pipeline: Reddit's **markdown source** is parsed into a typed AST and rendered from it,
  for fetched content and composer previews alike. Reddit's `body_html` is not the rendering path.
- Gallery Mode **does** blur NSFW and spoiler media. Videos **do** get a long-press
  Share/Save/Copy menu. Both are gaps in the original that you fix.
- The silent `/prefs` NSFW normalization on login is **dropped entirely** — no `old.reddit.com/prefs`
  scrape, no `/post/options` write, no throttle. A one-time dismissible banner points the user at
  Reddit's own settings instead. The app never writes to a user's Reddit account preferences.
- The session-cookie expiry rewrite is kept (sessions die without it) but runs once per app session
  per account, not after every response. The pre-expire-then-clear logout ordering is kept verbatim.
- Redgifs lazy resolution is reproduced **exactly**: 2 concurrent, LIFO queue, abort on scroll-off,
  3 retries, 1s/2s/3s escalating cooldown, 30s global cooldown on HTTP 429, memory-only cache,
  playback error busts the cache and re-resolves once.
- Reddit HTTP status codes **are** inspected (the original ignored them): 429 with `Retry-After`,
  5xx, and offline are three distinct, distinguishable states with distinct messages.
- `raw_json=1` **is** sent on every read, and there is **no** client-side HTML-entity decoding
  anywhere — the original decoded ~30 fields by hand and missed `hls_url`. Consequence to accept:
  text containing the literal characters `&amp;` now renders as `&amp;`, not `&`.
- Pagination uses the **last item's own fullname**, not the listing envelope's `after`, with a
  separately-tracked unfiltered cursor.
- Time and number formatting reproduce the original's bucket arithmetic exactly, except the
  360–365-day "0 years" seam, which is fixed; and feed cards **do** abbreviate vote and comment
  counts.
- The in-post comment sort menu offers exactly six options; the Settings picker adds the `default`
  sentinel, which is not a seventh sort. The inbox is a single list with no filter tabs. The profile
  page is minimal, but **does** show the user's avatar.
- Themes: a new built-in set of **12** themes with new names and new palettes and a new
  comment-depth cycle, all free (`04c` §18.2 is the contract); the Theme Maker is gated; theme sharing
  **emits** only the new `::appname-theme::` base64url sentinel, while the **importer also accepts**
  the original's `::hydra-theme-import::{…}` form so the owner can migrate their own saved themes in
  (`02` §8.5a — read-only, one-way, and the legacy string appears nowhere but the import scanner); no
  timed previews of locked features, ever. Do not copy a single hex value or a single theme name from
  the surveys' palette tables.
- App icons: all-new artwork, one default plus three alternates, no artist-credit pages.
- **iPad ships in v1 with the original's split view, at parity.** Two panes, feed left and the tapped
  post's comments right, active only while the window is ≥ 768 pt wide (with a 752 pt collapse
  threshold for hysteresis) and the horizontal size class is regular, and only while Appearance →
  "Enable split view" is on — a setting that defaults to **on** for iPad-class devices, **off**
  elsewhere, and whose row is rendered only where it can be true. Selection is **per feed screen
  instance**. The pane has **Close** and **Fullscreen**; Fullscreen pushes the pane's current top route
  onto the tab's stack and leaves the pane intact underneath. With nothing selected there is **no
  pane and no placeholder** — the feed is simply full width. Build it as an explicit `HStack`, not a
  `NavigationSplitView`, and keep a plain `TabView`. The pane owns its own `NavigationStack` and
  `Router`; `RouteDestination.for(_:)` decides which pushes stay in the pane and which escape to the
  tab's stack. `post.compactMode` goes back to defaulting to **on** for iPad-class devices, as in the
  original. Gallery Mode's column count becomes width-derived (2–5); every current iPhone width still
  yields exactly 2. The media viewer stays full-window over both panes, and its flick thresholds are
  deliberately **not** scaled with the window.
- The Settings root's first row is **Help**, and its last two are **What's New** and **Feedback**; the
  original's "Guide", "Patch Notes" and "Request A Feature" labels are not carried over, and neither
  is a paid tier called "Pro" — the row above Data Use is **APPNAME Plus** and it is not a gate.
  The Settings search bar filters settings rows locally and falls through to Help search; there is no
  "ask a question" box.
- The in-app help section shrinks to a 10–14 topic hand-written corpus. Its search is **SQLite FTS5
  with BM25 ranking, entirely on-device** — no embeddings, no vectors, no cosine similarity, no AI
  answer card, and no self-hosted-server setting.
- The right-edge swipe-forward gesture is reproduced (`02` §5.8). The scroll-to-next-comment
  button is reproduced with strict parity: tap = next, 300 ms hold = previous, ~1 s hold =
  reposition, 10 snap positions (`04a` §15.4) — with the four haptic cues of `09` §2.5 rows
  H2.08–H2.13, including `.alignment` on slot entry and an explicit `.impact` (**not** `.start`) on
  entering reposition mode.
- Universal links are not configured (we cannot host an AASA file for `reddit.com`); the entry
  points are the Share Extension, an "Open in APPNAME" App Intent, the custom URL scheme, and
  clipboard detection (default **off**).
- **Picture in Picture ships**, in the fullscreen video viewer only, and it is the reason
  `UIBackgroundModes = ["audio"]` is declared — the app's one background mode, for PiP and nothing
  else. **Background audio still does not ship**: inline feed and gallery players are unmounted on
  `.background`, the audio session is activated only while a viewer video plays or PiP is active, and
  the player is torn down when PiP stops while backgrounded. `09` §3.8.1 has the five guardrails.
- **The haptic map in `09` §2 is the contract** — 153 rows across feeds, comments, media,
  accounts, settings, purchase and iPad, each with a trigger moment, a cue and an intensity, plus an
  explicit "none, and why" for every interaction that gets no cue. One facade in `DesignSystem`,
  built in Phase 0; two tiers (`sensoryFeedback` by default, `prepare()`-backed generators for twelve
  latency-critical rows); no Core Haptics; a `feedback.haptics` kill switch, default on; and five
  `SensoryFeedback` cases banned outright because Apple documents them as silent on iOS.
- **The app ships the modern platform surfaces**, all free: three widgets and two Control Center /
  Action-button controls in a new `WidgetsExtension` that **must not link `RedditAPI`**; four App
  Intents plus an `AppShortcutsProvider` in a new `AppIntentsKit`; Core Spotlight indexing of saved
  posts and subscribed subreddits only; Handoff of the open route between the owner's devices; and
  iCloud **key-value** sync of settings, filters and custom themes in a new `SyncKit`, with
  last-writer-wins on an explicit `{v, t}` timestamp envelope.
- **Reddit sessions never sync.** No Keychain item carries `kSecAttrSynchronizable`; everything is
  `…AfterFirstUnlockThisDeviceOnly`. Nothing sensitive is ever written to the iCloud key-value store,
  which Apple documents as unencrypted on disk.
- **Live Activities, Writing Tools adoption, an in-app Face ID lock and CloudKit dataset sync are
  not built**, each for a written reason in `09` §3.14–§3.15. Writing Tools is neither adopted **nor
  suppressed** — it is a system affordance in every text view and we leave the default alone.
- **Nothing in `09` is gated.** No twelfth gate id exists or may be created.
- The full list of original-app bugs to fix rather than reproduce is `08-decisions-and-drift.md`
  §2. Read it before Phase 2 and again before Phase 9.

## Guardrails

Violating any of these is a defect even if the code compiles and the tests pass.

- **Never copy from the original app.** Not code, not strings, not palettes, not icons, not
  documentation prose. Write everything fresh.
- **No third-party dependency outside the allow-list** in `02-architecture.md` §3.4 (mirrored in
  `06-build-plan-and-acceptance.md` §1.4): GRDB, Nuke, `swift-cmark-gfm` (the whole markdown
  pipeline, not just previews), and optionally Sentry. Nothing else — no networking library, no navigation library, no DI
  container, no purchase SDK, no snapshot-testing library, no SwiftUI-helper grab-bags. If you
  believe you need one, write the 200 lines instead.
- **No network access in unit tests.** Ever. Not "only in this one integration test". Inject the
  transport.
- **No force-unwraps, no `try!`, no `as!`, no implicitly-unwrapped optionals in production code.**
  These are lint errors. In tests, `#require` is the Swift Testing equivalent and is fine.
- **No `ObservableObject`, `@StateObject`, `@Published`, or Combine** in this codebase.
- **No `XCTest` for unit tests** — Swift Testing only. XCTest lives exclusively in
  `Tests/UITests`.
- **No `UIDesignRequiresCompatibility`**, and no attempt to opt out of Liquid Glass by any other
  means.
- **Declare every Info.plist key and entitlement in `06-build-plan-and-acceptance.md` §1.3, and
  declare nothing that is not on that list.** The blockers are `NSPhotoLibraryAddUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `CFBundleURLTypes` for the `appname://` scheme, the App Group
  `group.com.OWNER.appname` on **all three** targets (app, share extension, widgets extension),
  `NSUserActivityTypes` for Handoff, and the iCloud key-value entitlement on the **app target only**.
  Alternate icons come from the *Alternate App Icon Sets* build setting, which is what writes
  `CFBundleIcons` / `CFBundleAlternateIcons`. **`UIBackgroundModes` is exactly `["audio"]`, for
  Picture in Picture and nothing else** — no other value, no background refresh, no
  `BGAppRefreshTask`. No `aps-environment`, no `NSSupportsLiveActivities`, no CloudKit container, no
  Associated Domains, no Siri capability, and no `LSApplicationQueriesSchemes` — `canOpenURL` is
  never called, so there is nothing to declare.
- **No `TODO:` or `FIXME:` comments** in shipped code. Unfinished work goes in `PROGRESS.md` as a
  `DEFERRED` line with a reason; the lint config fails the build on `TODO`.
- **No restart alerts.** Every setting takes effect immediately. The one deferred-to-next-launch
  operation is clearing the video cache, and that is an action, not a setting.
- **No feature code in the app target.** It holds `@main`, the scene, the tab shell, the Handoff
  activity modifiers and the `AppGraph` composition root. Everything else lives in one of the **20**
  packages named in `02-architecture.md` §2.2/§3.1 — use those names verbatim; do not invent a
  package layout — or in one of the two extension targets, `ShareExtension` and `WidgetsExtension`.
- **`WidgetsExtension` must never link `RedditAPI`, and `AppIntentsKit` must never link
  `FoundationModels`.** Both are CI-enforced hard edges. The first is what guarantees a widget can
  never make a network request; the second is what keeps the intent surface inside the no-AI rule.
- **Never add a `[GATE:]` tag to anything specified in `09`**, and never add a twelfth case to
  `Feature`. All of `09` is free.
- **No hard-coded prices, currencies or subscription periods.** Every price string comes from
  `Product.displayPrice` and friends.
- **No paywall on launch, on a timer, after N sessions, or on backgrounding.** The paywall appears
  only as the direct result of a tap on a gated affordance, or from Settings → APPNAME Plus.
- **Never gate Reddit's own functionality**: browsing, reading comments, voting, saving,
  subscribing, searching, messaging and composing are free. Only the eleven gates defined in
  `05-monetization.md` §4 exist, and **two** of them — `gate.videoAutoplay` and `gate.compose` — are
  switched off (free) by default, with `gate.sortMemory` the third OWNER row and gated by default.
  The Settings → APPNAME Plus row, the inbox badge and the built-in themes are **not** gates
  (`05` §4.1).
- **Never block content the user has already entered.** Gates check before an editor opens, never
  on submit. Drafts save regardless of subscription state.
- **Never delete user data on lapse.** Custom themes, filters and saved accounts survive an expired
  subscription; they simply stop being applied or selectable.
- **Never skip a checklist item silently.** Every one of the ~350 items in
  `06-build-plan-and-acceptance.md` §4 ends the build as `DONE`, `CUT` (because a `[DECISION: <id>]`
  says so), or `DEFERRED` with a written reason.
- **Do not invent behaviour.** If the specs do not say, the `spec/` surveys are the tiebreaker; if
  they do not say either, choose the simplest behaviour consistent with the platform's defaults and
  write the choice into `PROGRESS.md` under "Open questions".
- **Do not silently reduce scope.** Rewriting a 2,000-comment virtualized tree as "load the first
  200 comments" is a scope cut, not an implementation detail. Flag it.
- **Respect the performance contracts**: at most one feed video plays; at most 12 live players;
  comment trees render in a recycling `List`, never a `LazyVStack`; row subview counts are static;
  scroll-position work uses `ScrollPosition` and `onScrollTargetVisibilityChange`, not estimated
  content offsets.

## Output artifacts

At the end of the run, this repository contains:

1. **A buildable Xcode project** — `xcodebuild build -scheme APPNAME` succeeds with zero first-party
   warnings on **both** an iPhone and an iPad simulator destination, and the app runs on both.
   `TARGETED_DEVICE_FAMILY = 1,2`; no `UIRequiresFullScreen`; `UISupportedInterfaceOrientations~ipad`
   lists all four orientations. The **`ShareExtension` and `WidgetsExtension` schemes also build**
   with zero first-party warnings, and `Scripts/check-package-graph.sh` is green, including the two
   hard edges (`WidgetsExtension → RedditAPI`, `AppIntentsKit → FoundationModels`).
2. **Passing tests** — `swift test` green in every package; `xcodebuild test` green; the fixture
   replay green; the UI smoke test green **on both the iPhone and the iPad destination**, with the
   iPad run covering tap-to-pane, Close and Fullscreen.
3. **`PROGRESS.md`** — every acceptance-checklist item marked `DONE`, `CUT` (with the
   `[DECISION: <id>]` that cuts it), or `DEFERRED` (with a reason and a suggested follow-up),
   **including all 41 items of area Z**. Plus a "Blocked", an "Open questions", a "Could not verify
   without a device/account" section, a **"iPad smoke results"** section recording each phase's iPad
   manual list and its outcome, a **"Haptics audit"** section with the per-map results of the three
   Phase 9 passes (`09` §2.11), and an **"Accessibility audit report"** section with the eight parts
   of `09` §4.2 written out — Inspector results per screen on both device classes, the six VoiceOver
   flows, the Dynamic Type `.accessibility5` screenshot set, the Reduce Motion run against `09` §5.2,
   Reduce Transparency / Increase Contrast on the four glass sites, Smart Invert, Voice Control
   naming, and the Assistive Access non-support statement.
4. **`README.md`** — what the app is (an iPhone **and iPad** client, with widgets, Control Center
   controls, Shortcuts/Siri actions, Handoff and iCloud settings sync); the iOS/Xcode/Swift versions;
   the two simulator destinations the gate uses; how to build, test and run;
   the package layout and what each package owns; how fixtures work and how to record new ones;
   how to run the StoreKit configuration file; the dependency allow-list and why each one is there;
   and a clear statement that this is an independent client not affiliated with Reddit.
5. **`CHANGELOG.md`** — one entry per phase, in Keep-a-Changelog form, ready to become the 1.0.0
   release notes.
6. **CI that passes** — `.github/workflows/ci.yml` green on the final commit.
7. **One commit per phase** on `main`, each with a message naming the phase and its deliverables.

## Start now

Begin with Step 0: copy `docs/`, read it in the stated order, write `PROGRESS.md`, commit. Then
start Phase 0.

Report at each phase boundary with: the phase number, what you built, the gate result, the count of
checklist items moved to `DONE` / `CUT` / `DEFERRED`, and anything you had to decide that the specs
did not cover.

=== END PROMPT ===

---

## §C — Notes for whoever runs the prompt

- **Do not run this unattended end to end.** The phase boundaries exist so a human can look. Review
  at least after Phases 1, 3, 4 and 8 — networking, comments, media and money are where a wrong
  turn is expensive to unwind.
- **If the agent's context runs out mid-build**, restart it with: *"Read `PROGRESS.md` and
  `docs/06-build-plan-and-acceptance.md`, determine the current phase, and resume from its gate."*
  `PROGRESS.md` is the resumption point; that is its main job.
- **If a phase gate stays red for more than one honest attempt**, take the wheel. The agent is
  instructed to continue around blockers, which is right for throughput and wrong for a blocker
  that is actually a design error in the specs.
- **Expect to re-read `08-decisions-and-drift.md` yourself** when the agent asks a question. Most
  "the specs don't say" questions are actually answered there.
- **The three OWNER gate switches** (`gate.sortMemory`, `gate.videoAutoplay`, `gate.compose`) are
  the only product decisions still open when the prompt runs. Settle them in step A-11; flipping one
  later is a one-line change in the `Feature.isGated` table (`02` §13.2) plus a checklist annotation,
  but it is much cheaper to decide first.
- **The 100 numbered decisions in `08` §1 all carry a default.** The agent does not need any of them
  answered to start; it needs them *not contradicted* mid-build. Read §1's "Default (assumed)"
  column top to bottom once before kickoff and flag anything you disagree with.

---

## Traceability

| Section here | Derived from | Feeds into |
|---|---|---|
| §A kickoff steps 1–2, 11 | `08-decisions-and-drift.md` items 4, 5, 12, 13 (`monetization-model`, `gate-matrix`, `app-name`, `bundle-id`); `05-monetization.md` §4 OWNER rows | The agent's assumed-decisions block in §B |
| §A steps 5–10 | `05-monetization.md` §2.4 (App Store Connect checklist); `06-build-plan-and-acceptance.md` §1.6 (CI secrets, signing) | `release.yml`, fastlane |
| §A step 14 | `spec/10-swiftui-2026-baseline.md` §A1 (Xcode 27 / Swift 6.4 / macOS Tahoe 26.6+) | Non-negotiable 3 |
| §A step 15 | `06-build-plan-and-acceptance.md` §1.7 (fixture list) | Verification method, Phase 1 |
| §B "Mission" and "Step 0" | `06-build-plan-and-acceptance.md` §1.1 (clean-room boundary), §2 (phases) | `PROGRESS.md` |
| §B non-negotiables 2–8 | `spec/10` §§A1–A3 and Part C; `02` §5.15; `08-decisions-and-drift.md` items 6, 14, 39, 93–100 | Build settings in `06` §1.3 |
| §B non-negotiables 9–11 | `08-decisions-and-drift.md` items 2, 3, 10; `05-monetization.md` §5.4 | Phases 5, 7, 8 |
| §A steps 5, 5a, 17, 18; §B non-negotiable 12, the native-polish assumed decisions, the guardrails and output artifacts 1, 3, 4 | **`09-native-polish-and-platform-features.md`** §§2–5; `08` §1.5 (#101–#127); `06` §1.3, §1.6, Phase 0, Phase 9, §4 area Z, risks R16–R19 | Phase 0 (the haptics facade and the full entitlement set), Phase 9 (the native-polish block and both audits) |
| §B working method and gate | `06-build-plan-and-acceptance.md` §2 (per-phase DoD), §3 (verification method) | CI workflows |
| §B assumed decisions | `08-decisions-and-drift.md` §§1–3 in condensed form — **that file remains authoritative** | Every `[DECISION: <id>]` tag in `02`–`06` |
| §B guardrails | `06-build-plan-and-acceptance.md` §1.4 (dependency allow-list), §1.5 (lint rules encoding these guardrails), §5 (risk R9 agent drift); `05-monetization.md` §§3.3, 5.10; `spec/10` Part C | `.swiftlint.yml`, `.swift-format` |
| §B output artifacts | `06-build-plan-and-acceptance.md` §2 Phase 10; §3 | Release readiness |
| §C operator notes | `06-build-plan-and-acceptance.md` §5 risk R9 | — |

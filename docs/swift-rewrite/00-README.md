# APPNAME — native SwiftUI rewrite plan

This folder is the complete, self-contained plan for rebuilding this app as a
**native SwiftUI iPhone and iPad app in a new repository that reuses none of
this repository's code**. It was produced on 2026-09-17 by a survey swarm that read
the entire current codebase and the current Apple platform documentation, and it
is written so that an engineer or an AI coding agent can build the new app in
one pass from these documents alone, without consulting this codebase.

## Reading order

| # | File | What it is | Read when |
|---|------|------------|-----------|
| 00 | `00-README.md` | This page: scope, principles, owner decisions, how to use the plan | First |
| 02 | `02-architecture.md` | Targets, toolchain, module layout, app shell, state, concurrency, theming, markdown, media, persistence, testing | Before writing any code |
| 03 | `03-data-and-networking.md` | Swift domain models with exact derivation rules from Reddit JSON, the complete endpoint catalog, auth/cookie sessions, persistence DDL, consolidated settings-key table | Phase 1 |
| 04a | `04a-feeds-posts-comments.md` | Screen specs: feeds, post card, interactions, sorting, filters, inline video, post details, comment tree, markdown, compose/edit | Phases 2, 3, 6 |
| 04b | `04b-media.md` | Screen specs: fullscreen viewer, video, galleries, gallery mode, caches, downloads, Live Text | Phase 4 |
| 04c | `04c-accounts-inbox-search-subs-settings.md` | Screen specs: accounts/login, inbox, messages, user, search, sidebar, wiki, multireddits, web view, the full settings tree, themes, icons, stats, help | Phases 5, 7 |
| 05 | `05-monetization.md` | StoreKit 2 subscription design, free/paid feature matrix, entitlement seam, paywall, compliance | Phase 8 |
| 06 | `06-build-plan-and-acceptance.md` | New-repo bootstrap, CI, phased build order with gates, the full acceptance checklist, risks | Throughout |
| 07 | `07-one-shot-prompt.md` | The prompt to hand a coding agent in the new empty repo | Kickoff |
| 08 | `08-decisions-and-drift.md` | The decision register: 127 numbered decisions with the default the plan assumes, 16 original-app bugs fixed forward, 20 doc-vs-code drift rows | Before kickoff |
| 09 | `09-native-polish-and-platform-features.md` | **Native quality of life:** the complete haptic map over every gesture in 04a/04b/04c, the modern platform surfaces (widgets, Control Center controls, App Intents/Siri/Spotlight, Handoff, iCloud sync, Picture in Picture, zoom transitions, SF Symbols effects), the normative accessibility baseline, and the motion policy | Before Phase 2, and again in Phase 9 |
| spec/01–09 | `spec/*.md` | The raw behavioral surveys of the current app, area by area (~88k words). Normative where 02–05 are silent. | As reference |
| spec/10 | `spec/10-swiftui-2026-baseline.md` | Verified platform baseline as of 2026-09-17 with citations | Before 02 |

## Scope and principles

1. **Clean room.** Behavior is reproduced; nothing else is. No source code,
   artwork, app icons, fonts, or documentation prose from this repository may
   be copied into the new one. This repository is AGPL-3.0-licensed fork
   material; the new app is the owner's own work. All user-visible text is
   written fresh; short functional labels such as "Upvote" will inevitably
   coincide, and that is fine, but no sentence is copied.
2. **Fidelity target is the current code, not the current docs.** The in-app
   guide and `documentation/` describe a paid "Hydra Pro" tier, AI summaries,
   AI filters, and push notifications. The owner removed all of those on
   purpose. The surveys record every such doc/code drift; `08-decisions-and-drift.md`
   lists each one with the default the plan assumes.
3. **iPhone and iPad.** `TARGETED_DEVICE_FAMILY = 1,2`. The original's iPad
   split view — feed on the left, the tapped post's comments in a right-hand
   pane, per feed screen, with Close and Fullscreen controls — is **in scope for
   v1** and is specified with the same rigour as every other screen:
   `02-architecture.md` §5.15 for the shell contract and `04a-feeds-posts-comments.md`
   §3.5 for the feed-side behaviour. iPhone stays portrait-only; iPad supports all
   four orientations. Split view is structural navigation and is never gated.
4. **Latest platform, verified.** Deployment floor iOS 26.0, built with the
   iOS 27 SDK in Xcode 27 with Swift 6.4, Liquid Glass throughout, Observation,
   approachable concurrency with MainActor default isolation, Swift Testing,
   GRDB for SQLite. `spec/10` carries the citations; do not downgrade any of
   these without re-verifying.
5. **Monetized, cheaply.** The new app ships with a StoreKit 2 auto-renewable
   subscription at roughly $1/month that unlocks most features, with a free tier
   that remains a genuinely usable reader. `05-monetization.md` defines the
   matrix and the **eleven** canonical gate ids (`gate.multiAccount`,
   `gate.customThemes`, `gate.gestures`, `gate.filters`, `gate.galleryMode`,
   `gate.downloads`, `gate.stats`, `gate.appIcons`, `gate.sortMemory`,
   `gate.videoAutoplay`, `gate.compose`); every gated feature is tagged
   `[GATE: gate.*]` in the 04 docs, so the matrix can change without touching
   feature code.
6. **No AI features, no push notifications in v1.** Inbox uses the same
   60-second foreground poll and app badge as the current app. This survives everything in
   principle 8: the widgets read only the local database, the intents are declarative and never
   generative, Writing Tools is neither adopted nor suppressed, and no APNs entitlement is added.
7. **Fix-forward on known bugs.** Bugs the surveys found in the current app
   (listed in `08` §2) are not reproduced unless the owner says otherwise.
8. **Native quality of life.** The app must feel like Apple wrote it. Every gesture that
   changes something carries an appropriate haptic, never more than one per action, never one
   the user did not cause; and the app ships the modern platform surfaces a 2026 native client
   is expected to have — widgets, Control Center and Action-button controls, App Intents with
   Siri and Spotlight, Handoff, iCloud sync of settings and themes, Picture in Picture, zoom
   transitions and SF Symbols effects — plus a normative accessibility floor.
   `09-native-polish-and-platform-features.md` is the contract: §2 for haptics, §3 for the
   platform features, §4 for accessibility, §5 for motion. **None of it is gated, and none of it
   introduces AI, push or a backend** — iCloud is Apple-hosted storage in the user's own account,
   not a server we run.
9. **One vocabulary.** Every `[GATE: gate.*]` tag names one of the eleven gate ids in
   `05` §4, and every `[DECISION: <id>]` tag names a numbered entry in `08` §1
   (#1–#127), a bug id in `08` §2, or a drift row `D1`–`D20` in `08` §3. There are
   no aliases and no placeholder tags anywhere in the set.

## Owner decisions already made

| Decision | Value |
|----------|-------|
| Platform | iPhone **and iPad**, iOS/iPadOS 26.0+, SwiftUI only, no UIKit view controllers except where SwiftUI has no equivalent (documented in 02) |
| iPad split view | **In scope for v1**, at full parity with the original (`02` §5.15, `04a` §3.5, `04c` §17.1). Not `NavigationSplitView` — see `02` §5.15 |
| Code reuse | None |
| Pro / AI / push from the original | Not carried over |
| Native polish | **In scope for v1** and free: the full haptic map, widgets, controls, App Intents/Siri/Spotlight, Handoff, iCloud settings sync, Picture in Picture (`09`). The one entitlement it costs is `UIBackgroundModes = ["audio"]`, for PiP only (`09` §3.8.1) |
| Monetization | Subscription, about $1/month, most features paid |
| App name, bundle id | Placeholders `APPNAME`, `com.OWNER.appname` until chosen |

## How the plan was produced

- Nine survey agents each read one functional area of this codebase in full and
  wrote a behavioral specification (`spec/01`–`09`). One built a 327-item
  user-facing feature inventory from the docs and changelog (`spec/08`), which
  `06` turns into the acceptance checklist.
- One research agent verified the current Apple toolchain and SwiftUI API state
  from first-party sources (`spec/10`).
- Three architecture and planning agents wrote `02`–`08` from the surveys, and a
  reviewer cross-checked them against the inventory for gaps and contradictions.
  The cross-document reconciliation that followed — one gate vocabulary, one
  decision vocabulary, and every behavioural contradiction resolved — is logged in
  `spec/REVIEW-consistency.md`.

## Using the plan

1. Read `08` and settle each decision (or accept the defaults).
2. Complete the human kickoff checklist at the end of `07`.
3. Create the new empty repository and copy this folder into it as `docs/`.
4. Hand `07-one-shot-prompt.md` to the coding agent.

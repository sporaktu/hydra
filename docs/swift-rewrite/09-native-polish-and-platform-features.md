# 09 — Native Polish and Platform Features

**Project:** `APPNAME` — a native SwiftUI iPhone and iPad Reddit client, written from scratch.
**Status:** design document, **normative**. It is the single source of truth for haptic feedback,
for the modern-platform surfaces the app ships outside its own windows, for the accessibility floor,
and for motion polish. Where `02-architecture.md` §5.13 and the `04*` screen specs previously
sketched haptics, **this document supersedes them**; they now point here.
**Companion documents:** `02-architecture.md` (module map, shell, entitlements),
`03-data-and-networking.md` (settings keys, persistence), `04a`/`04b`/`04c` (the interactions this
document attaches feedback to), `05-monetization.md` (gates — nothing here is gated),
`06-build-plan-and-acceptance.md` (targets, entitlements, checklist area Z, audits),
`07-one-shot-prompt.md` (the build prompt), `08-decisions-and-drift.md` (decisions #101–#127),
`spec/10-swiftui-2026-baseline.md` (verified platform baseline).

**Research date for every API claim below: 2026-09-17.** Every claim carries a first-party URL in
§6.3. Anything not first-party-verified is marked **(not first-party-verified)** at the point of use.

---

## 1. Principles

### 1.1 The eight rules

1. **Native feel first.** The app should feel like Apple wrote it. Where the system already provides
   a behaviour — a context-menu press, a paging scroll view, a `Toggle`'s own haptic — we use the
   system's, we do not re-implement it, and we do not add a second one on top.
2. **Every gesture that changes something has feedback.** A gesture that commits a state change
   without a visible *and* tactile acknowledgement is a defect, not a style choice. §2 enumerates all 153 such
   interactions in `04a`/`04b`/`04c` and assigns each one a cue, or an explicit silence.
3. **Never more than one haptic per user action.** If a gesture already fired a cue while it was in
   progress (a swipe-band crossing, a drag-dismiss threshold, a zoom limit), its commit is
   **silent**. Doubling up is the single most common way a haptic map becomes noise. The rule has
   exactly one exception: a commit that **fails** always fires `.error`, because the rollback is the
   information.
4. **Never fire a haptic the user did not cause.** No haptic on an inbox poll result, on a focused
   video changing during a scroll, on a window resize, on a background refresh of anything. Haptics
   are a response to touch, never a notification channel.
5. **Respect system settings, and add our own.** The system suppresses haptics under *Settings →
   Sounds & Haptics → System Haptics*, in Low Power Mode, while the app is backgrounded, and on
   devices with no Taptic Engine; `sensoryFeedback` and `UIFeedbackGenerator` both honour that and we
   never try to detect or defeat it. On top of that, Apple's own guidance is explicit — *"Make haptics
   optional. Let people turn off or mute haptics, and make sure people can still enjoy your app or
   game without them"* — so we also ship our own kill switch (§2.3).
6. **Nothing in this document introduces AI, push, or a backend.** No Foundation Models, no
   `SystemLanguageModel`, no Writing Tools adoption, no generative anything (§3.15). No
   `UNUserNotificationCenter` registration, no APNs entitlement, no push-driven widget or Live
   Activity reloads (§3.2, §3.15). No server we operate: **iCloud is Apple-hosted infrastructure the
   user already owns, not a backend of ours** (§3.7) — we write to the user's own iCloud account with
   their Apple Account, we run nothing, we see nothing, and the App Privacy label is unaffected.
7. **Everything here is free.** Not one feature, cue, widget, control, intent or sync key sits behind
   any of the eleven gates in `05-monetization.md` §4, and no twelfth gate is created.
   `[DECISION: native-polish-free]`
8. **Every addition beyond the original carries a decision id.** The original app has three haptic
   helpers and no widgets, no intents beyond a hand-installed Shortcut, no sync, no PiP and no
   Spotlight presence. Everything this document adds is tagged `[DECISION: <id>]` and has a numbered
   entry in `08-decisions-and-drift.md` §1.5 (#101–#127) so the owner can veto any single item
   without unpicking the rest.

### 1.2 What this document may not introduce

| Forbidden | Restated from | How §3 stays inside it |
|---|---|---|
| Any AI/ML *generative* feature | `[DECISION: ai-removed]` | Writing Tools is not adopted (§3.15); Translation is on-device statistical/ML translation, ships **off by default**, and is separately vetoable (§3.12) |
| Push notifications, APNs, background refresh | `[DECISION: push-removed]`, `[DECISION: background-inbox-refresh]` | Widgets refresh from timelines and from in-app reloads only; controls refresh when used or when the app reloads them; **no Live Activities at all** (§3.15) |
| A first-party backend | `[DECISION: self-hosted-server-row]` | iCloud KVS and Handoff are Apple-operated services bound to the user's own Apple Account (§3.6, §3.7) |
| A twelfth gate id | `05` §4 | §3 features are free; §2 cues are free (`[DECISION: native-polish-free]`) |
| Reading Reddit content in the background | `02` §14.7 | Widgets render **only** what is already in the app's own GRDB database inside the App Group; a widget never makes a network request |

### 1.3 Decision tags and gating

Every `[DECISION: <id>]` in this document resolves to a numbered entry in `08` §1.5. Every id is new
in this document except `viewer-zoom-transition` (#68), `background-audio-pip` (#52),
`shortcuts-intent` (#16), `live-text-dead-setting` (#19) and `scroll-to-next-button` (#41), which this
document extends or supersedes and names explicitly where it does so. No gate tag appears in this
document, and none may be added to anything it specifies.

---

## 2. The haptic feedback map

`[DECISION: native-haptic-map]` — the 153 rows of §2.4–§2.9 are the normative contract; `02` §5.13 and the
haptic sentences in the `04*` documents are summaries of it.

### 2.1 Vocabulary: what actually plays on iOS

This is the part of the research that changes the design. `SensoryFeedback` (SwiftUI, iOS 17.0+) has
fourteen cases, **and several of them are documented as no-ops on iOS.** Apple's own discussion text
per case:

| Cue | iOS | Plays on iOS? | Documented meaning | Our use |
|---|---|---|---|---|
| `.impact(weight:intensity:)` | 17.0 | **Yes** | "a physical metaphor… for UI elements colliding" | Thresholds, detents, limits, objects leaving a list |
| `.impact(flexibility:intensity:)` | 17.0 | **Yes** | Same, expressed as `.rigid`/`.solid`/`.soft` | Votes (`.rigid`), soft dismissals (`.soft`) |
| `.selection` | 17.0 | **Yes** | "a UI element's values are changing" | Discrete choice, toggle-like state flips, collapse/expand |
| `.success` | 17.0 | **Yes** | "a task or action has completed" | A committed write that succeeded |
| `.warning` | 17.0 | **Yes** | "a task or action has produced a warning" | Destructive completions, blocked actions |
| `.error` | 17.0 | **Yes** | "an error has occurred" | Failed writes and rollbacks |
| `.alignment` | 17.0 | **Yes** | "the alignment of a dragged item… when the user drags a shape into alignment with another shape" | The floating button snapping to one of its ten slots (§2.5) — the only place in the app this cue fits |
| `.pathComplete` | 17.5 | **Yes** | "a drawn path has completed and/or recognized" | **Unused.** The app draws nothing |
| `.levelChange` | 17.0 | **No — macOS only** | "movement between discrete levels of pressure" | **Must not be used.** It is silent on iPhone |
| `.increase` / `.decrease` | 17.0 | **No — watchOS and visionOS only** | "an important value increased/decreased above/below a significant threshold" | **Must not be used** for sliders or counters on iOS. Use `.selection(_:)` (below) or `.impact` |
| `.start` / `.stop` | 17.0 | **No — watchOS only** | "an activity started/stopped" | **Must not be used** for reposition-mode entry or player start/stop |

> **Normative consequence.** Three of the cues a naive haptic map reaches for first — `.start` for
> "entering a mode", `.increase`/`.decrease` for a slider, `.levelChange` for stepped values — are
> **silent on iPhone**. Any row in §2.4–§2.9 that would have used them uses an explicit `.impact`
> instead, and a code review that proposes one of them is rejecting this section.

**iOS 26 adds a control-semantic family** — `SensoryFeedback.press(_:)`, `.release(_:)` and
`.selection(_:)` — which is the Liquid Glass control vocabulary and is available at our deployment
floor with no `@available` branch:

| Constructor | Options | Availability |
|---|---|---|
| `.press(_:)` | `.button`, `.buttonIconOnly`, `.slider`, `.tab`, `.toggle` | iOS 26.0 |
| `.release(_:)` | `.slider` | iOS 26.0 |
| `.selection(_:)` | `.on`, `.off`, `.minimum`, `.maximum` | iOS 26.0 |

We use `.selection(.minimum)` / `.selection(.maximum)` for the Theme Maker's **custom** RGB sliders
(§2.8) and nothing else from this family, because every other control in the app is a *system*
control, and **system controls already play Apple's own haptics**: the HIG states plainly that
"components like switches, sliders, and pickers automatically play haptic feedback on supported
iPhone models". Adding our own on top of a `Toggle` or a `Picker` produces a double tap. That is a
`[DECISION: haptics-implementation-split]` rule, not a preference.

### 2.2 Implementation pattern

`DesignSystem` already owns "a haptics facade" (`02` §3.1). It becomes the following, and **no call
site anywhere else in the app touches `UIKit` haptics or `CoreHaptics` directly**; a SwiftLint custom
rule bans `UIImpactFeedbackGenerator`, `UISelectionFeedbackGenerator`, `UINotificationFeedbackGenerator`
and `CHHapticEngine` outside the one file that implements the facade.

```swift
// DesignSystem/Haptics.swift  — the ONLY file allowed to import CoreHaptics/UIKit haptics.
public enum Haptic: Equatable, Sendable {
    case engage           // .impact(weight: .light,  intensity: 0.6)
    case engageStrong     // .impact(weight: .medium, intensity: 0.8)
    case retreat          // .impact(weight: .light,  intensity: 0.4)
    case commitRigid      // .impact(flexibility: .rigid, intensity: 0.7)
    case soft             // .impact(flexibility: .soft,  intensity: 0.6)
    case limit            // .impact(flexibility: .rigid, intensity: 0.5)
    case select           // .selection
    case snap             // .alignment
    case success, warning, failure   // .success / .warning / .error
    case sliderMin, sliderMax        // .selection(.minimum) / .selection(.maximum)  (iOS 26)
}

public extension View {
    /// Declarative path. Fires when `trigger` changes and the haptics setting is on.
    func haptic<T: Equatable>(_ h: Haptic, trigger: T) -> some View
    /// Conditional path, wrapping sensoryFeedback(_:trigger:condition:).
    func haptic<T: Equatable>(_ h: Haptic, trigger: T, when: @escaping (T, T) -> Bool) -> some View
    /// Closure path, wrapping sensoryFeedback(trigger:_:) — different cue per transition.
    func haptic<T: Equatable>(trigger: T, _ h: @escaping (T, T) -> Haptic?) -> some View
}

@MainActor public final class HapticGate {   // imperative path, for gesture recognizers only
    public init(view: UIView?)               // UIFeedbackGenerator.init(view:) — iOS 17.5+
    public func arm()                        // prepare()
    public func fire(_ h: Haptic)            // …Occurred(); then prepare() again if still gesturing
    public func disarm()
}
```

**Three tiers, and which to use where** `[DECISION: haptics-implementation-split]`:

| Tier | Mechanism | Use when | Rows |
|---|---|---|---|
| **1 — default** | `.sensoryFeedback(_:trigger:)` / `(_:trigger:condition:)` / `(trigger:_:)` driven by observable view state | The cue follows a state change the view already renders | Every row in §2.4–§2.9 not named in tier 2 |
| **2 — latency-critical** | A `HapticGate` holding a prepared `UIImpactFeedbackGenerator(style:view:)` / `UISelectionFeedbackGenerator(view:)`, created when the gesture begins, `arm()`ed on the first `onChanged` sample, re-armed after each fire, `disarm()`ed on `onEnded` | A cue must land inside a continuous `DragGesture`/`MagnifyGesture` frame, where routing it through `@State` costs a render pass and is audibly late | H1.05–H1.07 (swipe bands), H2.10–H2.12 (floating-button reposition), H3.07 (drag-dismiss threshold), H3.11–H3.12 (zoom limits), H3.15 (scrub engage) |
| **3 — custom** | Core Haptics (`CHHapticEngine`, transient + continuous `CHHapticEvent`, AHAP, `CHHapticAdvancedPatternPlayer`) | **Never in v1.** | — |

**Why tier 2 exists.** `prepare()` "places the generator into a prepared state… you can trigger
feedback with lower latency", and Apple recommends it explicitly. In a four-band swipe that is the
difference between the detent feeling attached to the finger and attached to the animation. Use the
**non-deprecated** initialisers — `UIFeedbackGenerator.init()` and
`UIImpactFeedbackGenerator.init(style:)` are deprecated; `init(view:)` / `init(style:view:)`
(iOS 17.5+) are current and let the system play on the right display. Pass the gesture's current
point to `impactOccurred(at:)` / `selectionChanged(at:)` / `notificationOccurred(_:at:)` (iOS 17.5+)
on every tier-2 fire so the sensation can be localised.

**Why Core Haptics is not used** `[DECISION: core-haptics-not-used]`. The two candidates — the
swipe-band detent and reposition-mode entry — are each a single transient event with a chosen
sharpness, which is exactly what `.impact(weight:intensity:)` already is. `CHHapticEngine` adds an
engine lifecycle, a `resetHandler`, a `stoppedHandler`, `capabilitiesForHardware()` gating, an
audio-session interaction and AHAP authoring, and Apple warns the OS "could still override the
request with system services" — a lot of machinery for a sensation the user cannot name. Recorded
rather than assumed so the owner can reverse it; if reversed, only the facade changes.

### 2.3 The global toggle

The original app has **no** haptics setting — `spec/01` §14 and `spec/09` §7.4 document three
unconditional helpers. We add one, because the HIG requires it (§1.1 rule 5).

| Where | Row | Key | Type | Default | Behaviour |
|---|---|---|---|---|---|
| Settings → Appearance → **Feedback** (new section, `04c` §17.4) | **Haptic feedback** | `feedback.haptics` | Bool | **`true`** | When `false`, `Haptic.*` becomes a no-op for every tier-1 and tier-2 call site. **System-provided haptics are unaffected** — a `Toggle` still ticks, a context menu still thumps, because those are the OS's and suppressing them would make standard controls feel broken |

`[DECISION: haptics-toggle]`. The key is a plain settings scalar in `03` §8.1 and it is one of the
keys that syncs via iCloud (§3.7). The setting is **not** gated and takes effect immediately, with no
restart alert, like every other setting in the app.

**Reduce Motion does not disable haptics.** They are orthogonal accessibility settings, and for a
user who has turned animations down, tactile confirmation matters *more*, not less. Do not couple
them.

### 2.4 Map A — Feeds and listings (`04a` §2.4, §2.5, §6, §7, §8, §9, §10, §11)

Read the table as: **when exactly** the cue fires, **what** plays, and **why**. "Tier" is §2.2.

| # | Interaction | Trigger moment | Cue | Tier | Notes |
|---|---|---|---|---|---|
| H1.01 | Pull-to-refresh | The drag crosses the refresh threshold, **once per drag**, on the outward crossing only | `.impact(weight: .light, intensity: 0.6)` | 1 | **Changed from `02` §5.13 and `04a` §2.4**, which fired a `.medium` impact when the refresh *committed*. Crossing the threshold *is* the commitment — releasing past it always refreshes — so firing on the crossing puts the feedback where the decision is, and firing on commit as well would break §1.1 rule 3 |
| H1.02 | Pull-to-refresh commits | — | **none** | — | Suppressed by H1.01 |
| H1.03 | Refresh fails | The error surfaces | `.error` | 1 | §1.1 rule 3's only exception |
| H1.04 | Scroll-to-top (status-bar tap) | — | **none** | — | System gesture, system feedback |
| H1.05 | Swipe band 0 → ±1 | `abs(translation)` crosses 75 pt | `.impact(weight: .light, intensity: 0.6)` | **2** | Fires at the pixel, not at the animation |
| H1.06 | Swipe band ±1 → ±2 | crosses 130 pt | `.impact(weight: .medium, intensity: 0.8)` | **2** | The second band is a bigger commitment; the cue is heavier |
| H1.07 | Swipe band ±2 → ±1, ±1 → 0 | the inward crossing | `.impact(weight: .light, intensity: 0.4)` | **2** | The return transitions **do** fire, lighter. `04a` §20.2's `oneHapticPerTransition` test asserts 0→80→140→80→0 yields exactly four haptics and that is the original's behaviour; keep it |
| H1.08 | Swipe released in a non-zero band, action runs | — | **none** | — | §1.1 rule 3: H1.05–H1.07 already spoke. The row spring-back and the icon swap are the visual commit |
| H1.09 | A swipe-committed action **fails** and rolls back | The rollback lands | `.error` | 1 | |
| H1.10 | Upvote (tap or menu) | Optimistic state applied | `.impact(flexibility: .rigid, intensity: 0.7)` | 1 | Paired with `.symbolEffect(.bounce)` on the arrow (§5.1). `.rigid` is the "crisp, mechanical" metaphor — the right one for a discrete, reversible commitment |
| H1.11 | Downvote (tap or menu) | Optimistic state applied | `.impact(flexibility: .rigid, intensity: 0.6)` | 1 | Fractionally lighter than the upvote, so the two are distinguishable in the pocket |
| H1.12 | Vote retracted (same direction twice) | Optimistic state applied | `.selection` | 1 | A retraction is a value change, not an impact |
| H1.13 | Vote fails and rolls back | Rollback lands | `.error` | 1 | `[DECISION: vote-no-optimistic-rollback]` |
| H1.14 | Save | Optimistic flip to saved | `.success` | 1 | Paired with `.contentTransition(.symbolEffect(.replace))` on the bookmark glyph |
| H1.15 | Unsave | Optimistic flip to unsaved | `.selection` | 1 | Undoing is not an achievement |
| H1.16 | Save/unsave fails and rolls back | Rollback lands | `.error` | 1 | `[DECISION: unhandled-save-failure]` |
| H1.17 | Hide Post | The row is removed from the list | `.impact(flexibility: .soft, intensity: 0.7)` | 1 | Something left the stack; `.soft` is the "muffled" metaphor |
| H1.18 | Unhide Post | The row returns / the management row is deleted | `.selection` | 1 | |
| H1.19 | Mark as Read / Unread | The `seen_posts` write lands | `.selection` | 1 | Deliberately quiet: this is the most-repeated discrete toggle in the app |
| H1.20 | Filter Subreddit (day / week / forever) | The filter is written and the post is removed | `.success` | 1 | A real, durable configuration change |
| H1.21 | Long-press opens the context menu | — | **none from us** | — | `.contextMenu` plays the system's own press feedback. Adding ours is the classic double-tap bug. **Never attach a haptic to a `.onLongPressGesture` that shares a surface with a `.contextMenu`** |
| H1.22 | A context-menu item is chosen | The item's action runs, after the menu dismisses | the action's own row above | 1 | The menu's dismissal is not itself a cue |
| H1.23 | NSFW / spoiler cover tapped to reveal | The blur clears | `.impact(flexibility: .soft, intensity: 0.5)` | 1 | |
| H1.24 | Card body / subreddit / author tapped | — | **none** | — | Navigation is its own feedback; the zoom transition (§5.1) carries it |
| H1.25 | Compact thumbnail tapped (opens the viewer) | — | **none** | — | As H1.24 |
| H1.26 | Poll option tapped (read-only) | — | **none** | — | `[DECISION: poll-voting-stub]`: nothing happened, so nothing is confirmed |
| H1.27 | Subreddit switcher title tapped (quick search opens) | The overlay presents | `.selection` | 1 | Matches the original's `hapticSelection()` on the tab long-press family |
| H1.28 | Tab long-press → quick search / quick account swap | The long press is recognised (0.4 s), **before** the overlay animates | `.selection` | 1 | Parity with `spec/01` §3.2. Fire on recognition, not on presentation, or it feels lagged |
| H1.29 | Tab re-tap pops one level | The pop is issued | `.selection` | 1 | |
| H1.30 | Autoplay FAB pressed | `autoPlayVideos` flips | `.selection` | 1 | Parity: `04a` §9, `04b` §7.3 |
| H1.31 | Audio FAB pressed | `feedVideoAudio` flips | `.selection` | 1 | Parity, as above |
| H1.32 | The Focused Post changes while scrolling | — | **none** | — | §1.1 rule 4. The user did not ask for it and it would fire continuously on a fling |
| H1.33 | A page of the feed finishes loading | — | **none** | — | Not a user action |
| H1.34 | End of feed reached ("you've reached the bottom") | — | **none** | — | The footer copy is the signal |
| H1.35 | Filter limit hit (five retries exhausted) | Footer switches to the filter-limit copy | **none** | — | Not an error the user caused |
| H1.36 | Subreddits page A–Z rail dragged | Each time the resolved letter changes | `.selection` | **2** | The rail is a continuous drag over discrete values — the textbook `.selection` case. One cue per letter, never per pixel |
| H1.37 | Gallery-mode offer alert answered (either button) | — | **none** | — | System alert |
| H1.38 | Subscribe / Favourite / Add-to-multireddit from a feed's "…" menu | The write returns success | `.success` | 1 | Failure → `.error` |

### 2.5 Map B — Post detail and comments (`04a` §12–§18)

| # | Interaction | Trigger moment | Cue | Tier | Notes |
|---|---|---|---|---|---|
| H2.01 | Tap-to-collapse a comment | `collapsed` flips to `true` | `.selection` | 1 | Fires **after** the scroll-repair scroll is issued, so the tactile and visual land together |
| H2.02 | Tap-to-expand a comment | `collapsed` flips to `false` | `.selection` | 1 | |
| H2.03 | Collapse Thread | The top-level ancestor force-collapses | `.impact(flexibility: .soft, intensity: 0.7)` | 1 | Heavier than H2.01 because it removes many rows at once |
| H2.04 | `loadMore` row tapped | — | **none** | — | The spinner is the acknowledgement; the arriving comments are the payoff |
| H2.05 | `collapsedReplies` stub tapped | `collapsed` flips | `.selection` | 1 | Same as H2.02 |
| H2.06 | Comment swipe bands | — | **H1.05–H1.09 verbatim** | **2** | `04a` §16.2: identical mechanics, 15 pt engage threshold |
| H2.07 | Comment sort applied | The route's `sort` is rewritten | `.selection` | 1 | |
| H2.08 | Floating nav button — quick tap (next top-level comment) | Release inside 300 ms with no drag | `.selection` | 1 | |
| H2.09 | Floating nav button — hold reaches 300 ms (previous fires) | **At the 300 ms mark, while still held** | `.selection` | 1 | `04a` §15.4: "previous" fires automatically, not on release; the cue must fire there too or the user cannot tell it happened |
| H2.10 | Floating nav button — enters reposition mode | At ~1 000 ms, or when the drag passes 30 pt | `.impact(weight: .medium, intensity: 0.9)` | **2** | **Not `.start`** — `.start` is silent on iOS (§2.1). This is a mode change and wants a real thump |
| H2.11 | Reposition — the button snaps into a slot | Entering the 40 pt snap radius, **once per slot entry** | `.alignment` | **2** | The one canonical use of `.alignment` in the app: "the alignment of a dragged item". **Leaving** a slot fires nothing |
| H2.12 | Reposition — released on a slot, position persisted | The write to `scrollToNextButtonPosition` lands | `.success` | **2** | |
| H2.13 | Reposition — released off any slot, springs back | The spring starts | `.impact(weight: .light, intensity: 0.4)` | **2** | "Nothing was saved" — deliberately the same cue as a band retreat (H1.07) |
| H2.14 | Copy Text / Copy link (any surface) | The pasteboard write returns | `.success` | 1 | The app shows no toast (`04a` §16.1), so the haptic is the **only** confirmation. This row is load-bearing |
| H2.15 | Select Text sheet opens | — | **none** | — | Sheet presentation is the feedback |
| H2.16 | Reply / Edit composer opens | — | **none** | — | |
| H2.17 | Reply / post / edit submitted successfully | The API call returns success | `.success` | 1 | |
| H2.18 | Submission fails | The error surfaces | `.error` | 1 | |
| H2.19 | Reply blocked because the post is locked/archived | The alert presents | `.warning` | 1 | The user tried and could not — exactly what `.warning` documents |
| H2.20 | Delete post/comment confirmed | The delete returns success | `.warning` | 1 | Destructive completion. `.success` would be tonally wrong |
| H2.21 | Discard unsaved edits confirmed | The sheet dismisses | `.impact(flexibility: .rigid, intensity: 0.6)` | 1 | `[DECISION: composer-no-discard-confirm]` |
| H2.22 | Markdown toolbar button (bold, quote, link…) | — | **none** | — | The text visibly changes under the cursor. Eight cues per sentence is the definition of haptic fatigue |
| H2.23 | Composer tab switch (Write ↔ Preview) | The tab changes | `.selection` | 1 | |
| H2.24 | Draft restored on open | — | **none** | — | Not a user action in this session |
| H2.25 | Forward / back edge-swipe navigation | — | **none** | — | System gesture (`02` §5.8) |
| H2.26 | Post header tap-to-collapse (`tapToCollapsePost`) | `collapsed` flips | `.selection` | 1 | |

### 2.6 Map C — Media (`04b` §2–§10)

| # | Interaction | Trigger moment | Cue | Tier | Notes |
|---|---|---|---|---|---|
| H3.01 | Fullscreen viewer opens | — | **none** | — | The zoom transition (§5.1) is the feedback |
| H3.02 | Single tap toggles the overlay chrome | — | **none** | — | A 150 ms fade is plenty; this tap happens constantly |
| H3.03 | Middle double-tap play/pause | `player.rate` flips | `.selection` | 1 | Parity with `spec/05` §2.4's `hapticSelection()` |
| H3.04 | Side double-tap pages an item | — | **none** | — | The page animation is the feedback; the paging scroll view is the system's |
| H3.05 | Horizontal gallery paging by swipe | — | **none** | — | `.scrollTargetBehavior(.paging)` is a system scroll |
| H3.06 | Vertical post-to-post paging | — | **none** | — | As above |
| H3.07 | Drag-to-dismiss threshold crossed | Vertical overscroll passes 50 pt, or horizontal passes 40 pt — **once per drag, outward crossing only** | `.impact(weight: .medium, intensity: 0.8)` | **2** | The user needs to know "let go now and it closes" *before* letting go. The live background fade is the visual half of the same message |
| H3.08 | Dismissal commits | — | **none** | — | Suppressed by H3.07 |
| H3.09 | Close (X) button | The dismiss animation starts | `.selection` | 1 | An explicit button press with no threshold before it |
| H3.10 | Double-tap to zoom (in to 3× or out to 1×) | The zoom animation starts | `.selection` | 1 | One cue, either direction |
| H3.11 | Pinch reaches the 10× ceiling | The clamp engages, **once per gesture** | `.impact(flexibility: .rigid, intensity: 0.5)` | **2** | "You have hit the wall." The `once per gesture` latch is mandatory or it machine-guns |
| H3.12 | Pinch reaches the 1× floor | The clamp engages, **once per gesture** | `.impact(flexibility: .rigid, intensity: 0.5)` | **2** | Same latch |
| H3.13 | Pinch released below 1.1 and springs back to 1 | The spring starts | `.impact(flexibility: .soft, intensity: 0.4)` | 1 | |
| H3.14 | Pan hits an edge clamp while zoomed | — | **none** | — | **Explicit do-not.** The clamp is hit on most frames of a pan; a cue here is unusable |
| H3.15 | Scrub engages (20 pt horizontal, <30 pt vertical) | The moment skimming starts and playback pauses | `.impact(weight: .light, intensity: 0.5)` | **2** | The gesture has been claimed; say so |
| H3.16 | Scrub released | — | **none** | — | Suppressed by H3.15 |
| H3.17 | Mute / unmute in the viewer | `tappedVideoAudio` flips | `.selection` | 1 | |
| H3.18 | Playback speed stepped (0.5 → 1 → 1.5 → 2) | Rate applied | `.selection` | 1 | |
| H3.19 | Playback speed **wraps** (2 → 0.5) | Rate applied | `.impact(weight: .light, intensity: 0.6)` | 1 | A different cue for the wrap, so the user feels the cycle turn over instead of silently doubling back |
| H3.20 | **Picture in Picture started** (§3.8) | `pictureInPictureControllerDidStartPictureInPicture` | `.impact(flexibility: .soft, intensity: 0.7)` | 1 | The video left the app's window |
| H3.21 | Picture in Picture stopped / restored | `…DidStopPictureInPicture` | `.selection` | 1 | |
| H3.22 | Save image / video to Photos succeeds | The `PHPhotoLibrary` write returns | `.success` | 1 | |
| H3.23 | Save fails, or photo permission is denied | The alert presents | `.error` | 1 | |
| H3.24 | Share sheet presented | — | **none** | — | System sheet |
| H3.25 | Copy Image Link / Copy Video Link | The pasteboard write returns | `.success` | 1 | As H2.14: there is no toast |
| H3.26 | Live Text selection, lookup, translate | — | **none from us** | — | `ImageAnalysisInteraction` is the system's; it brings its own feedback (`[DECISION: live-text-dead-setting]`) |
| H3.27 | Gallery-mode cell tapped | — | **none** | — | The transition is the feedback |
| H3.28 | Gallery mode entered from the "…" menu | The route pushes | `.selection` | 1 | |
| H3.29 | A video hits a hard player error | The error state renders, **once per item** | `.error` | 1 | The reload watchdog and the Redgifs cache-bust retry paths fire **no** further cues, or a flaky video buzzes forever |
| H3.30 | "Tap to retry" on a failed video | The retry is issued | `.selection` | 1 | `[DECISION: fullscreen-player-retry]` |
| H3.31 | Redgifs rate-limit alert presents | The alert presents | `.warning` | 1 | |
| H3.32 | Item-index chevrons (prev/next in a gallery) | The target column changes | `.selection` | 1 | Disabled buttons at the ends fire nothing |

### 2.7 Map D — Accounts, inbox, search, subreddits (`04c` §1–§13)

| # | Interaction | Trigger moment | Cue | Tier | Notes |
|---|---|---|---|---|---|
| H4.01 | Login succeeds | Session written to the Keychain, sheet dismissing | `.success` | 1 | |
| H4.02 | Login fails or times out | The failure state renders | `.error` | 1 | |
| H4.03 | Account switched | The new session is active and reloads begin | `.success` | 1 | A real identity change deserves the strongest positive cue in the set |
| H4.04 | Account removal confirmed | The row is deleted and the Keychain item is destroyed | `.warning` | 1 | Destructive completion (`[DECISION: no-confirm-account-delete]`) |
| H4.05 | Quick Account Swap row tapped | The swap begins | `.selection` | 1 | H4.03 still fires when it completes; they are ~1 s apart and are different events |
| H4.06 | Zero-accounts pulse animation | — | **none** | — | Not a user action |
| H4.07 | Inbox "Mark all read" | The write returns | `.success` | 1 | |
| H4.08 | Inbox row read/unread toggled | Local state flips | `.selection` | 1 | |
| H4.09 | A new inbox item arrives on the 60 s poll | — | **none** | — | **Explicit do-not**, §1.1 rule 4. The badge is the channel. A buzz from a background poll is a push notification wearing a disguise, and we do not ship push |
| H4.10 | Message sent | The write returns | `.success` | 1 | Failure → `.error` |
| H4.11 | Subscribe / unsubscribe a subreddit | The write returns | `.success` / `.selection` | 1 | Subscribing is an achievement; unsubscribing is a value change |
| H4.12 | Favourite / unfavourite | The write returns | `.success` / `.selection` | 1 | As above |
| H4.13 | Add to / remove from a multireddit | The write returns | `.success` / `.selection` | 1 | As above |
| H4.14 | Block user confirmed | The write returns | `.warning` | 1 | |
| H4.15 | Report submitted | The write returns | `.success` | 1 | |
| H4.16 | Search submitted | — | **none** | — | The results are the answer |
| H4.17 | Search scope changed (posts / subreddits / users) | The segment changes | `.selection` | 1 | |
| H4.18 | Trending / suggestion row tapped | — | **none** | — | Navigation |
| H4.19 | Quick Subreddit Search row tapped | Navigation begins | **none** | — | H1.28 already fired when the overlay opened |
| H4.20 | Web view page committed / link intercepted | — | **none** | — | |
| H4.21 | "Open in APPNAME" from the share sheet, a widget, a control, a deep link or Handoff | — | **none** | — | The app was not in the user's hand when the gesture happened (§2.9) |

### 2.8 Map E — Settings, themes, purchase (`04c` §14–§22, `05` §5–§6)

| # | Interaction | Trigger moment | Cue | Tier | Notes |
|---|---|---|---|---|---|
| H5.01 | Any system `Toggle` | — | **none from us** | — | iOS plays `.press(.toggle)` and `.selection(.on/.off)` itself. Adding ours doubles it |
| H5.02 | Any system `Picker` / menu choice | — | **none from us** | — | As above |
| H5.03 | Any system `Slider` | — | **none from us** | — | As above |
| H5.04 | Theme Maker **custom** RGB slider reaches 0 | The value clamps at the minimum, once per drag | `.selection(.minimum)` | **2** | These are hand-built sliders (`04c` §18.4), so they get nothing for free. **Not `.decrease`** — silent on iOS (§2.1) |
| H5.05 | Theme Maker custom RGB slider reaches 255 | The value clamps at the maximum, once per drag | `.selection(.maximum)` | **2** | **Not `.increase`** — silent on iOS |
| H5.06 | Theme Maker custom RGB slider dragged between the ends | — | **none** | — | **Explicit do-not.** A cue per integer over a 0–255 range is 255 cues per drag |
| H5.07 | Theme applied / previewed | `ThemeStore.current` changes | `.selection` | 1 | |
| H5.08 | Custom theme saved | The `custom_themes` upsert lands | `.success` | 1 | |
| H5.09 | Custom theme deleted | The row is removed | `.warning` | 1 | |
| H5.10 | Theme imported successfully | The theme is added and applied | `.success` | 1 | |
| H5.11 | Theme import rejected (malformed payload) | The error alert presents | `.error` | 1 | |
| H5.12 | App icon changed | `setAlternateIconName` completion returns without error | `.success` | 1 | Failure → `.error` |
| H5.13 | Clear Image Cache | The clear completes and the alert presents | `.success` | 1 | |
| H5.14 | Clear Video Cache (deferred to next launch) | The flag is written and the alert presents | `.selection` | 1 | Nothing has actually been cleared yet — `.success` would be a lie |
| H5.15 | "Clear custom post/comment sorts (N subs)" | The dictionaries are emptied | `.success` | 1 | There is no confirmation prompt, so the cue is the acknowledgement |
| H5.16 | Settings search result row tapped | — | **none** | — | Navigation |
| H5.17 | A gated affordance is tapped while locked | The paywall presents | **none** | — | The sheet is the feedback, and buzzing a user for hitting a paywall is punitive |
| H5.18 | Purchase completes | `Transaction` verified and entitlement flips to active | `.success` | 1 | |
| H5.19 | Purchase fails | The failure surfaces | `.error` | 1 | |
| H5.20 | Purchase cancelled by the user | — | **none** | — | The user chose to stop; nothing failed |
| H5.21 | Restore Purchases finds a subscription | Entitlement flips to active | `.success` | 1 | |
| H5.22 | Restore Purchases finds nothing | The "nothing to restore" state renders | `.warning` | 1 | |
| H5.23 | Startup modals, one-time tips, the review card | — | **none** | — | The app spoke first; §1.1 rule 4 |
| H5.24 | iCloud sync applies an incoming change (§3.7) | — | **none** | — | Another device did it, not this hand |

### 2.9 Map F — iPad, hardware input, out-of-process (`02` §5.15, `04a` §3.5, §3)

| # | Interaction | Trigger moment | Cue | Tier | Notes |
|---|---|---|---|---|---|
| H6.01 | Split view: a post loads into the detail pane | The pane's route is set | `.selection` | 1 | Including the first selection, which also causes the pane and divider to appear |
| H6.02 | Split view: **Close** | The pane collapses | `.selection` | 1 | |
| H6.03 | Split view: **Fullscreen** | The route transfers to the tab's stack | `.impact(flexibility: .soft, intensity: 0.6)` | 1 | A layout-scale change, heavier than a selection |
| H6.04 | Split view suppressed or restored by a window resize | — | **none** | — | **Explicit do-not.** The user dragged a *window*, not the app, and R13's live-resize path would fire once per geometry callback |
| H6.05 | Stage Manager / tiling / rotation | — | **none** | — | As above |
| H6.06 | Any keyboard shortcut (⌘1–⌘5, ⌘R, ⌘F, ⌘[, ⌘W, ⌘⇧F, ⌘,) | — | **none** | — | There is no finger on the glass. The Taptic Engine would fire into a device the user is not holding |
| H6.07 | Pointer / trackpad secondary click opens a menu | — | **none from us** | — | System |
| H6.08 | Pointer hover over a row, button, FAB or pane control | — | **none** | — | Hover is not a commitment |
| H6.09 | Apple Pencil tap | — | **same as the equivalent touch row** | — | A Pencil tap is a touch; `04c`/`08` `pencil-modal-close` still applies |
| H6.10 | A widget is tapped on the Home Screen | — | **none from us** | — | Out of process; the system's own launch feedback applies |
| H6.11 | A Control Center / Lock Screen / Action button control is used | — | **none from us** | — | The system plays control feedback; a `ControlWidget` has no Taptic access of its own |
| H6.12 | Handoff continuation arrives | — | **none** | — | The user's gesture happened on the *other* device |

### 2.10 The do-not list (normative)

Each line is a review check, and each is a row above that says "none" for a reason.

1. **Never** attach a haptic to a surface that also carries `.contextMenu` (H1.21).
2. **Never** add a haptic to a system `Toggle`, `Picker`, `Slider`, `Stepper`, `DatePicker`,
   `refreshable` spinner, alert, confirmation dialog, sheet or share sheet (H5.01–H5.03).
3. **Never** fire inside a continuous gesture without a latch that makes it once-per-crossing
   (H1.05–H1.07, H3.07, H3.11–H3.12, H5.04–H5.05).
4. **Never** fire on a scroll event, a focus change, a page load, a poll result, a window resize, a
   timeline refresh or an iCloud change notification (H1.32–H1.35, H4.09, H6.04–H6.05, H5.24).
5. **Never** fire twice for one user action: an in-gesture cue suppresses the commit cue (H1.08,
   H3.08, H3.16).
6. **Never** fire on an edge clamp during a pan (H3.14) or per unit of a continuous value (H5.06).
7. **Never** use `.start`, `.stop`, `.increase`, `.decrease` or `.levelChange` — they are silent on
   iOS (§2.1).
8. **Never** repeat an error cue from a retry loop; one per item, per failure (H3.29).
9. **Never** fire while `feedback.haptics` is off, and never try to detect or work around *System
   Haptics*, Low Power Mode, or a device without a Taptic Engine.
10. **Never** use a haptic as the *only* signal for anything. Every row above is paired with a visual
    change, because a user with haptics off, or on an iPad (which has no Taptic Engine), must lose
    nothing.

### 2.11 How haptics are tested

Haptics cannot be observed by XCUITest, so **the map is tested through the state that drives it.**

| Level | What is asserted | Where |
|---|---|---|
| Unit (Swift Testing) | The pure `Haptic` selection functions: `Haptic.forBandTransition(from:to:)` returns exactly the four cues of H1.05–H1.07 for the sequence 0→1→2→1→0 and `nil` for a within-band move; `Haptic.forVote(old:new:)` covers all nine (old, new) pairs of H1.10–H1.12; `Haptic.forDismissCrossing(_:)` latches | `DesignSystem` tests |
| Unit | Every row of §2.4–§2.9 that says **none** has a corresponding assertion that the selection function returns `nil` for that transition | `DesignSystem` tests |
| Unit | `feedback.haptics == false` makes every facade entry point return `nil` | `DesignSystem` tests |
| UI (XCUITest) | The *state changes* the map keys off — band value, dismiss-threshold flag, zoom-limit latch — are exposed as accessibility values on a debug-only surface under `-UITestFixtureMode 1`, and the smoke test asserts the transition sequence | `Tests/UITests` |
| Manual (Phase 9 audit) | The haptics audit in `06` Phase 9: walk the whole map on a device, once with haptics on and once with the toggle off, and once with *System Haptics* off, confirming nothing is lost but the buzz | `06` §2 Phase 9 |

The lint rule from §2.2 (no direct `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` /
`UINotificationFeedbackGenerator` / `CHHapticEngine` / `.sensoryFeedback` outside `DesignSystem`) is
what keeps the map from being bypassed. `.sensoryFeedback` itself is on the banned list outside the
facade — call sites use `.haptic(_:trigger:)`.

---

## 3. Modern platform features

### 3.1 Summary table

Everything below is **free** (`[DECISION: native-polish-free]`). "Min OS" is the first release the
API is available in; the app's floor is iOS 26.0, so anything at or below 26.0 needs no
`@available` branch.

**Ship in v1**

| Feature | Min OS | Module / target | Settings row | Decision id |
|---|---|---|---|---|
| Complete haptic map (§2) | 17.0 / 26.0 for `.press`/`.selection(_:)` | `DesignSystem` | — | `native-haptic-map` |
| Haptic feedback toggle | — | `SettingsFeature` | Appearance → Feedback | `haptics-toggle` |
| Home-screen and Lock-Screen widgets | 14.0 (17.0 interactive) | **`WidgetsExtension`** (new target) + `AppIntentsKit` | — (configured on the Home Screen) | `widgets-homescreen` |
| Control Center / Lock Screen / Action button controls | **18.0** | `WidgetsExtension` + `AppIntentsKit` | — | `control-center-controls` |
| App Intents + App Shortcuts + Siri (non-generative) | 16.0 | **`AppIntentsKit`** (new package) | — | `app-intents-shortcuts` |
| Spotlight indexing of saved posts and subscribed subreddits | 9.0 (Core Spotlight) | `AppIntentsKit` | — | `spotlight-index` |
| Handoff of the open post/feed between the owner's devices | 8.0 / 14.0 (SwiftUI) | `AppRouting` + app target | Advanced → iCloud | `handoff-continuity` |
| iCloud sync of settings, custom themes and filters | 5.0 | **`SyncKit`** (new package) | Advanced → iCloud | `icloud-kvs-sync` |
| Reddit sessions stay device-local (never synced) | — | `Persistence` | — | `icloud-keychain-sessions-no` |
| Picture in Picture in the fullscreen video viewer | 9.0 | `MediaKit` | `04b` §8.1 PiP button | `pip-fullscreen-video` |
| `UIBackgroundModes = ["audio"]`, PiP only | — | app target | — | `background-mode-audio-pip-only` |
| Zoom navigation transitions for media **and** post opening | **18.0** | `DesignSystem` + feature packages | — | `zoom-transitions-everywhere` |
| SF Symbols effects on vote / save / load / icon | 17.0 (26.0 for `drawOn`) | `DesignSystem` | — | `symbol-effects` |
| `Tab(role: .search)` for the Search tab | **18.0** | app target | — | `search-tab-role` |
| Accessibility baseline (§4) | — | everywhere | — | `accessibility-baseline-normative` |
| Motion polish and Reduce Motion parity (§5) | 26.0 for scroll-edge effects | `DesignSystem` | — | `motion-reduce-parity` |
| Availability on Apple silicon Macs ("Designed for iPad") | — | App Store Connect | — | `mac-designed-for-ipad` |
| Availability on Apple Vision Pro (compatible-app mode) | — | App Store Connect | — | `visionos-compat-app-store` |

**Ship in v1 as an optional setting, default off**

| Feature | Min OS | Module | Settings row | Decision id |
|---|---|---|---|---|
| System Translation of post and comment text | **17.4** | `RedditMarkdown` + `SettingsFeature` | Appearance → Feedback → "Offer Translate" | `translation-optional` |

**Deferred**

| Feature | Why | Decision id |
|---|---|---|
| Vote / save / reply **from** a widget or control | `widget-write-actions-deferred` | `widget-write-actions-deferred` |
| CloudKit / `CKSyncEngine` sync of datasets (seen, hidden, drafts, stats) | `cloudkit-dataset-sync-deferred` | `cloudkit-dataset-sync-deferred` |
| Now Playing framework / `MediaSessionRepresentable` | `02` §19 already lists it | `background-audio-pip` (#52), unchanged for this half |

**Rejected**

| Feature | Why | Decision id |
|---|---|---|
| Live Activities / Dynamic Island | `live-activities-rejected` | `live-activities-rejected` |
| Writing Tools adoption | Apple Intelligence / LLM — violates `ai-removed` | `writing-tools-not-adopted` |
| In-app Face ID / passcode lock | iOS 18 does it system-wide, better | `no-in-app-app-lock` |
| Background audio (playing with the app backgrounded and no PiP window) | `background-mode-audio-pip-only` | `background-mode-audio-pip-only` |
| Custom Core Haptics patterns | §2.2 | `core-haptics-not-used` |

### 3.2 Widgets (home screen and Lock Screen) `[DECISION: widgets-homescreen]`

**What.** A `WidgetsExtension` target containing a `WidgetBundle` with three widgets, all rendering
**only** data already in the app's own GRDB database inside the App Group
`group.com.OWNER.appname`. None of them makes a network request; none of them needs a push.

| Widget | Families | Content | Tap target |
|---|---|---|---|
| **Saved** | `.systemSmall`, `.systemMedium`, `.accessoryRectangular` | The N most recently saved posts: title, subreddit, age | `appname://openurl?url=<permalink>` via `widgetURL(_:)` |
| **Subreddit** | `.systemSmall`, `.systemMedium` | A user-chosen subreddit's most recently *seen-in-app* posts, from the local cache; configurable via an `AppIntentConfiguration` whose parameter is a `SubredditEntity` | The subreddit feed route |
| **Inbox badge** | `.accessoryCircular`, `.accessoryInline` | The last unread count the app wrote | The Inbox tab |

**Why.** Widgets are the single most-expected "this is a 2026 native app" surface, and the app
already stores everything they show. A Reddit reader with no Home-Screen presence reads as a port.

**How it maps onto the architecture.** New non-package target `WidgetsExtension` (`02` §2.2, §3.1
row 15), depending on `AppCore`, `Persistence`, `Theming`, `DesignSystem` and `AppIntentsKit`. It
must **not** link `RedditAPI` — a CI check enforces that, and it is what guarantees "a widget never
makes a network request". The App Group and the GRDB file path are already shared with
`ShareExtension`; the database is opened **read-only** from the extension.

**Timeline policy (normative).** `TimelineReloadPolicy.never`. The app calls
`WidgetCenter.shared.reloadTimelines(ofKind:)` when, and only when: a post is saved or unsaved, the
unread count changes, or the app enters the background. This is the cheapest possible policy against
WidgetKit's daily refresh budget and it is correct — the data only changes when the app changes it.
**No `TimelineProvider` ever schedules a speculative future entry.**

**Theme.** The widget renders in the user's current theme, read from the synced settings mirror
(§3.7) so it is correct even on a device where the app has not been foregrounded since the theme
changed. Widgets must respect `.widgetAccentable` and the system's tinted/clear rendering modes.

**Acceptance.** `06` §4 area Z items Z-04…Z-07: the extension builds for both destinations; a saved
post appears in the Saved widget within one reload; tapping opens the post; the widget renders
correctly in light, dark, tinted and the accessory families; the extension contains no `RedditAPI`
import; the widget renders with an empty database without crashing.

**Interactive writes are deferred** `[DECISION: widget-write-actions-deferred]`. Buttons and toggles
in widgets (iOS 17+) would let a user upvote or save from the Home Screen, but every such action is a
Reddit **write** that needs the cookie session, which lives in the Keychain and is
`…ThisDeviceOnly`-scoped and not shared with the extension (§3.7). Sharing it would widen the
session's blast radius for a convenience. Revisit when the session model is revisited.

### 3.3 Control Center, Lock Screen and Action button controls `[DECISION: control-center-controls]`

**What.** Two `ControlWidget`s (`ControlWidget`, iOS **18.0**+), which the user can place in Control
Center, on the Lock Screen, or assign to the **Action button** on the iPhone models that have one:

| Control | Kind | Behaviour |
|---|---|---|
| **Open APPNAME** | `ControlWidgetButton` running `OpenAppIntent` | Opens the app on the startup tab |
| **Open a subreddit** | `ControlWidgetButton` with an `AppIntentControlConfiguration` taking a `SubredditEntity` | Opens that subreddit's feed |

**Why.** The Action button is the iPhone's only user-assignable hardware key, and per Apple Support
it runs a **Shortcut** — which means an app with App Shortcuts (§3.4) is already reachable from it.
A `ControlWidget` additionally puts the app in Control Center, which is where iOS 18+ users look for
a one-tap launch. Both are a handful of lines on top of intents we are shipping anyway.

**Minimum OS: iOS 18.0.** Below our floor, so no `@available` branch is needed.

**Refresh.** Controls "update their content when someone uses them, the app reloads them, or the
system receives a remote push notification from APNs". We use the first two only; **APNs is not
configured and no push entitlement is added.**

**Acceptance.** `06` area Z items Z-08…Z-09: both controls appear in the Control Center gallery;
"Open a subreddit" offers the user's subscribed list as its parameter; assigning "Open APPNAME" to
the Action button launches the app.

### 3.4 App Intents, App Shortcuts and Siri `[DECISION: app-intents-shortcuts]`

**What.** `08` #16 (`shortcuts-intent`) already commits to one App Intent, `OpenRedditLinkIntent`.
This expands it into a small, coherent intent surface in a new package, `AppIntentsKit`:

| Intent | Parameters | Result | Runs |
|---|---|---|---|
| `OpenRedditLinkIntent` | `URL` | Opens the resolved route | Foreground |
| `OpenSubredditIntent` | `SubredditEntity` | Opens that feed | Foreground |
| `OpenSavedIntent` | — | Opens the saved-posts list | Foreground |
| `SearchRedditIntent` | `String` | Opens the Search tab with the query applied | Foreground |

plus an `AppShortcutsProvider` (iOS 16.0+) exposing all four with spoken phrases, which is what puts
them in **Siri**, in **Spotlight**'s "Actions" results, in the **Shortcuts** app and on the **Action
button**. Entities: `SubredditEntity: AppEntity, IndexedEntity` and `SavedPostEntity: AppEntity,
IndexedEntity` (§3.5), each with an `EntityQuery` reading the local database.

**Why.** It is the modern replacement for the original's "install this iCloud Shortcut" flow, it
costs one package, and it is the substrate that §3.3 and §3.5 are both built on.

**Siri is allowed here and is not an AI feature.** App Intents are a declarative action vocabulary;
matching a spoken phrase to a registered `AppShortcut` is system speech recognition, not generation.
Nothing in `AppIntentsKit` may import `FoundationModels`, and no intent may return generated text.
Apple discloses that it "may extract anonymized App Shortcuts data such as localized phrases…
[used by] machine learning models… when training to help improve the App Shortcuts experience" —
platform behaviour for every app shipping an App Shortcut, involving none of our users' Reddit
content. Recorded so it is not discovered late.

**Entitlement/capability: none.** App Intents requires no entitlement and no capability. The **Siri**
capability documented for Xcode belongs to SiriKit *Intents App Extensions*, which this app does not
ship. The kickoff checklist says so explicitly (`07` §A step 5a).

**Size cap.** `AppEntity` instances carry a cumulative **10 MB** cap including child properties
(`spec/10` §A3). `SubredditEntity` is a name, a display name and an icon URL; `SavedPostEntity` is a
title, subreddit, author and permalink. Neither carries image data. Assert it in a unit test.

**Acceptance.** `06` area Z items Z-10…Z-13.

### 3.5 Spotlight indexing `[DECISION: spotlight-index]`

**What.** The app's own content becomes findable from the Home Screen search field:

| Indexed | Identifier | Attributes | Written when | Removed when |
|---|---|---|---|---|
| Subscribed subreddits | `sub:<lowercased name>` | `title` = `r/<name>`, `contentDescription` = public description, `thumbnailURL` = icon | The subscription list is fetched | A subreddit is unsubscribed; the whole domain is cleared on logout |
| Saved posts | `saved:<fullname>` | `title`, `contentDescription` = subreddit + author, `contentURL` = permalink | A post is saved | A post is unsaved |

**Two routes, and which we take.** `IndexedEntity` (App Intents, iOS **18.0**+) will index an
`AppEntity` automatically, but Apple's own description is that "adding entities to Spotlight makes
them discoverable by **Apple Intelligence**". We conform to `IndexedEntity` **and** we set
`hideInSpotlight` to `false` for both entities, because the index itself is an on-device Core
Spotlight index and is not generative — but the *canonical* write path is `CSSearchableIndex`
(Core Spotlight, iOS 9+) with `CSSearchableItem(appEntity:)`, so the behaviour is identical on a
device with Apple Intelligence off or unavailable. If the owner reads "discoverable by Apple
Intelligence" as crossing the `ai-removed` line, **dropping `IndexedEntity` conformance and keeping
the plain `CSSearchableItem` indexing is a two-line change** and the feature still works. That
fallback is why this row is not simply "rejected".

**Privacy.** Only *subscribed subreddit names* and *saved post titles* are indexed — content the user
explicitly curated. Nothing from a feed, nothing from the inbox, nothing from a private message, no
browsing history. The whole `domainIdentifier` is deleted on logout and on account removal. This is
an on-device index; nothing leaves the device.

**Module.** `AppIntentsKit`, called from `Persistence`'s save/subscribe write paths through a
protocol so `Persistence` does not link Core Spotlight.

**Acceptance.** `06` area Z items Z-14…Z-16.

### 3.6 Handoff `[DECISION: handoff-continuity]`

**What.** The owner has an iPhone and an iPad. Reading a post on one and picking it up on the other
is the exact scenario Handoff exists for.

- Every screen whose `Route` is `Codable` (all of them — `02` §19) advertises an `NSUserActivity`
  with `activityType = "com.OWNER.appname.viewing"`, `isEligibleForHandoff = true`,
  `isEligibleForSearch = false`, `title` = the screen's title, and `userInfo` carrying the encoded
  `Route` plus the canonical Reddit `webpageURL`.
- Declared in `Info.plist` under **`NSUserActivityTypes`**.
- SwiftUI: `.userActivity("com.OWNER.appname.viewing", isActive:) { … }` on the screen root
  (iOS 14+), `.onContinueUserActivity("com.OWNER.appname.viewing") { … }` on the scene root,
  decoding the `Route` and handing it to `LinkIntake` — the **same** entry point the share extension,
  the URL scheme and the widgets use, so there is exactly one intake path (`02` §5.7).
- `webpageURL` is set so a Mac without the app installed still continues to Reddit in a browser.
- Activity is `invalidate()`d on logout and on account switch, so a route belonging to one account is
  never resumed under another.

**Why.** It is a few dozen lines against machinery (`Route: Codable`, `LinkIntake`) the app already
has, and it is the single highest-value quality-of-life addition for a two-device owner.

**Entitlement: none.** Handoff between a user's own devices needs no entitlement and no associated
domain; it needs the Info.plist activity type and the same team identifier and bundle id, which a
single app satisfies by definition.

**Module.** `AppRouting` owns the activity encode/decode (it owns `Route`); the app target attaches
the modifiers.

**Acceptance.** `06` area Z items Z-17…Z-18: opening a post on the iPhone shows the app's Handoff
icon on the iPad's App Switcher and opens the same post; logging out clears it. Requires two devices
on one Apple Account — a `07` §A kickoff item.

### 3.7 iCloud sync of settings, themes and filters `[DECISION: icloud-kvs-sync]`

**What.** `NSUbiquitousKeyValueStore` (iOS 5+) mirrors a **named allow-list** of preference keys to
the user's own iCloud account, so the owner's iPhone and iPad look and behave the same.

**iCloud is not our backend.** It is Apple-operated storage inside the user's own Apple Account. We
operate no server, hold no credentials, and can read nothing. The App Privacy nutrition label is
unchanged, and `[DECISION: self-hosted-server-row]` is untouched — that decision is about *our*
infrastructure, and this adds none.

**What syncs, and what never does:**

| Class | Syncs? | Where | Why |
|---|---|---|---|
| Scalar preferences on the allow-list in `03` §8.3 (appearance, gestures, sorting defaults, data use, feedback, filters-on/off) | **Yes** | KVS | They are small, they are taste, and they are the whole point |
| `filters.text`, `filters.subreddits`, `filters.hiddenKeywords` | **Yes** | KVS | Curation the user typed once and should not type twice |
| Custom themes (`custom_themes` rows) | **Yes**, encoded as one KVS value per theme, keyed `theme.<uuid>` | KVS | Authored content; the export codec (`02` §8.5) already serialises them |
| Per-subreddit sort memory | **Yes** | KVS | Small, and pointless to re-teach on a second device |
| **Reddit session cookies and modhashes** | **Never** | Keychain, device-local | §3.7.1 |
| The cached entitlement snapshot | **Never** | Keychain, device-local | StoreKit already syncs the *subscription* through the Apple Account; a cached snapshot is a device-local performance artefact |
| `seen_posts`, `hidden_posts`, `drafts`, `counter_stats`, `subreddit_visits` | **Never in v1** | GRDB, device-local | Datasets, not settings. KVS is the wrong tool (§3.14) |
| Scroll positions, in-memory caches, image/video caches | **Never** | — | Ephemeral |

**Hard limits, from Apple's own documentation, that the design must respect:** 1 024 keys maximum;
1 MB total; 1 MB per value; 128 UTF-16 characters per key. The allow-list is ~70 scalars plus one
value per custom theme, so the budget is comfortable — but `SyncKit` **must** check
`NSUbiquitousKeyValueStoreQuotaViolationChange` and, on a quota violation, stop syncing themes
(largest values first), keep syncing scalars, and surface it on the Advanced → iCloud row. A unit
test asserts the encoded allow-list fits in 1 MB with 20 custom themes.

**Conflict rule: last-writer-wins, by explicit timestamp.** Every synced key `k` is stored as a
two-field envelope `{ v: <value>, t: <epoch-ms> }`. On a local write, `t = now`. On
`didChangeExternallyNotification`, for each changed key compare the remote `t` with the local `t`
and take the larger; **ties keep the local value** (so a merge is idempotent and never ping-pongs).
`NSUbiquitousKeyValueStoreServerChange` and `…InitialSyncChange` are handled identically;
`…AccountChange` (the user signed into a different Apple Account) **discards the remote snapshot and
re-uploads local**, because the new account's values belong to someone else's device set. Custom
themes merge per-theme, not as a set, so deleting a theme on one device does not resurrect it on the
other: a deletion writes a tombstone `{ v: null, t: now }` that expires after 30 days.

**Settings row.**

| Where | Row | Key | Default | Behaviour |
|---|---|---|---|---|
| Settings → Advanced → **iCloud** (new section, `04c` §20.4) | **Sync settings and themes** | `sync.icloud` | **`true`** | Off stops all reads and writes immediately; already-synced values stay in iCloud untouched |
| Same section | **Handoff** | `sync.handoff` | **`true`** | Off stops advertising activities (§3.6) |
| Same section | *Footer* | — | — | "Last synced <relative time>", or "Sign in to iCloud to sync", or the quota-violation message |

**Entitlement.** `com.apple.developer.ubiquity-kvstore-identifier` on the **app target only**
(Xcode's iCloud capability, "Key-value storage" service). The share and widget extensions do **not**
get it. Requires App Store distribution, which is the plan.

**Module.** New package **`SyncKit`** (`02` §3.1 row 14): the allow-list, the envelope codec, the
merge, the notification observer and the quota handler. Depends on `AppCore` and `Persistence`;
must not depend on `RedditAPI`, SwiftUI feature views, or any Feature package.

**Acceptance.** `06` area Z items Z-19…Z-24.

#### 3.7.1 Reddit sessions are device-local, deliberately `[DECISION: icloud-keychain-sessions-no]`

Keychain items are stored **without** `kSecAttrSynchronizable`, with accessibility
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. Sessions do **not** travel via iCloud Keychain
and are **never** written to KVS.

Three reasons. Apple's warning on KVS is categorical — *"Don't store personal or sensitive
information in the key-value store. The system stores the information on disk in an unencrypted
format"* — so KVS is excluded outright. iCloud Keychain *would* be technically safe, but a session
cookie is a bearer credential: propagating it silently to every device on the Apple Account is a
posture the **owner** should choose, not inherit from a convenience feature. And the cost of not
syncing is one login per device on a flow that already exists.

**The owner can reverse this** by flipping two Keychain attributes (`kSecAttrSynchronizable = true`,
accessibility `…AfterFirstUnlock`); nothing else changes. It is a recorded decision precisely so the
reversal is a choice rather than a diff nobody reviewed.

### 3.8 Picture in Picture `[DECISION: pip-fullscreen-video]`

**What.** `AVPictureInPictureController` (iOS 9+) in the **fullscreen video viewer only** (`04b`
§8.1). A PiP button joins the mute and speed pills in the viewer's top-left cluster, shown only when
`AVPictureInPictureController.isPictureInPictureSupported()`, enabled only when
`isPictureInPicturePossible`. `canStartPictureInPictureAutomaticallyFromInline` is set **`true` for
the viewer's player and `false` everywhere else**, so leaving the app while a video is playing
full-screen continues it in the floating window — which is the behaviour users expect and the reason
the feature is worth having.

**This supersedes half of `08` #52 (`background-audio-pip`).** That entry is amended: **PiP ships**;
**background audio (audio continuing with the app backgrounded and no PiP window) does not.**

#### 3.8.1 The background-mode question, resolved `[DECISION: background-mode-audio-pip-only]`

PiP is the one feature in this document that costs an entitlement, and the plan previously said
`UIBackgroundModes` is **absent** (`02` §14.7, `06` §1.3, `07` guardrails). Apple's requirement is
unambiguous: *"To use Picture in Picture, you need to configure your app to support background audio
playback"*, and the AVFoundation guide is explicit that the `.playback` category "means your app can
play background audio if you're using the **Audio, AirPlay, and Picture in Picture** background
mode". There is no PiP without that mode.

**Decision: declare it, and narrow it in code and in prose.**

```
UIBackgroundModes = [ "audio" ]      // Audio, AirPlay, and Picture in Picture — PiP only
```

The guardrails that make the mode honest, all normative and all testable:

1. **Only the fullscreen viewer's player may set `canStartPictureInPictureAutomaticallyFromInline`.**
   Inline feed players and Gallery Mode players never do.
2. **The inline teardown rule from `04b` §7.4 is unchanged.** Every inline player is *unmounted* on
   `.background`. Nothing in the feed survives backgrounding.
3. **The audio session is activated only while a fullscreen viewer video is actually playing, or
   while PiP is active**, and is deactivated on the viewer's dismissal and on PiP stop — matching
   Apple's advice to "defer this call until your app begins audio playback".
4. **When PiP stops and the app is still backgrounded, the player is torn down**, so audio cannot
   outlive the PiP window. There is no path to "audio playing, nothing on screen".
5. A unit test asserts (1) and (5)'s absence of any other `canStartPictureInPictureAutomatically…`
   assignment; a Phase 9 device test asserts (2) and (4).

**App Review.** The mode is used for exactly the feature it names, which is the answerable case. The
review notes state: "The `audio` background mode is declared for Picture in Picture in the video
viewer. The app does not offer background audio playback." `06` §5 risk R16 tracks it.

**If the owner vetoes PiP**, the reversal is: delete the PiP button, delete `UIBackgroundModes`,
restore `02` §14.7's original wording, and drop `06` risk R16. `08` #52 then reverts to its original
default. Nothing else in this document depends on it.

**Acceptance.** `06` area Z items Z-25…Z-28.

### 3.9 Zoom navigation transitions `[DECISION: zoom-transitions-everywhere]`

`.navigationTransition(.zoom(sourceID:in:))` is iOS **18.0**+, below our floor. `08` #68
(`viewer-zoom-transition`) already adopts it for the fullscreen media viewer. This extends it to:

| From | To | `sourceID` |
|---|---|---|
| Feed card thumbnail / inline media | Fullscreen media viewer | the media item's `VideoSource.key` or image URL (#68, unchanged) |
| Gallery Mode cell | Fullscreen media viewer | the flat cell index |
| Feed **post card** | Post detail (pushed) | the post's `Fullname` |
| Split-view feed card | The detail **pane** | **not applied** — the pane is a sibling column, not a presentation; a zoom into a neighbouring pane is disorienting |

Every zoom transition is suppressed under **Reduce Motion** and becomes the platform default
(`02` §15.1 rule 3, §5.2 below). `08` #68's note about the iOS 27 fix for `fullScreenCover` + zoom +
`@FocusState` applies to the composer sheets and is why they keep the default presentation.

### 3.10 SF Symbols effects and the app icon `[DECISION: symbol-effects]`

`symbolEffect(_:options:isActive:)` is iOS 17+; `.drawOn`/`.drawOff` are iOS **26.0** (SF Symbols 7),
at our floor. The complete, closed list — **no other symbol effect ships**:

| Surface | Effect | Trigger | Haptic pair |
|---|---|---|---|
| Upvote / downvote arrow | `.symbolEffect(.bounce, options: .nonRepeating)` | The optimistic vote lands | H1.10 / H1.11 |
| Save bookmark | `.contentTransition(.symbolEffect(.replace))` outline ↔ filled | The optimistic save flips | H1.14 / H1.15 |
| Collapse chevron | `.contentTransition(.symbolEffect(.replace))` | `collapsed` flips | H2.01 / H2.02 |
| Mute / speaker | `.contentTransition(.symbolEffect(.replace))` | Audio state flips | H3.17 |
| Any inline spinner-adjacent glyph (Redgifs resolving, share in flight) | `.symbolEffect(.variableColor.iterative, isActive:)` | While loading | — |
| The refresh glyph in an empty-state retry button | `.symbolEffect(.rotate, isActive:)` | While refreshing | — |

**Do not** apply `.wiggle`, `.breathe`, `.pulse` or a repeating `.bounce` anywhere: they draw the eye
to chrome in a content app, and `.pulse` in particular reads as an error state. All effects are
suppressed under Reduce Motion (§5.2), where `.replace` becomes an instant swap.

**App icon.** Unchanged from `02` §5.10 rule 6 and `06` §1.8: authored in Icon Composer as a layered
icon, with light, dark, **clear** and **tinted** variants system-generated, and each alternate its own
Icon Composer document in the *Alternate App Icon Sets* build setting. This document adds only the
acceptance requirement that all four variants are visually checked, since clear and tinted are the
two most commonly shipped broken.

### 3.11 The Search tab role and search placement `[DECISION: search-tab-role]`

`TabRole.search` is iOS **18.0**+, below our floor. The app has a Search tab (`02` §5.4), so it
declares:

```swift
Tab(role: .search) { SearchTabRoot() }
```

Apple's documentation: *"Searchable tab views will prefer to have the first tab with this role
implement search. If no tabs are specified as the search tab, the tab view will apply search to all
tabs, resetting search state as the selected tab changes."* Without the role, a `.searchable`
anywhere in the tab view applies to **every** tab and resets on each tab change — exactly the bug an
app with a dedicated Search tab would otherwise ship. On iOS 26+ the role is also what lets the
system place the field in the tab bar's own search affordance, which is the Liquid Glass idiom.

**Consequence to build for:** the Search tab's `.searchable` must be declared on the tab's root, not
inside a pushed screen, and the tab **long-press** quick-search overlay (`04c` §7.4,
`[DECISION: tab-longpress-mechanism]`) must be re-verified against the role, since the role changes
the tab's own hit geometry. That re-verification is a named Phase 9 item.

### 3.12 Translation — optional, owner-vetoable `[DECISION: translation-optional]`

**What.** `.translationPresentation(isPresented:text:…)` from the **Translation** framework (iOS
**17.4**+) on the post-text and comment-body long-press menus, adding one item: **Translate**.

**Is this "AI"?** It is Apple's system translation — the engine behind Safari's translate and the
Translate app — running **on device** with downloadable language assets. It is machine translation,
not a generative assistant; it is not part of Apple Intelligence, needs no Apple-Intelligence-capable
device, and invents no content. That is materially different from Writing Tools (§3.15), which
Apple's own documentation describes as using "system-provided large language models (LLMs) and Apple
Intelligence" and which is therefore excluded.

**Because the boundary is a judgement call, this ships behind a setting that is off by default**, so
the owner can veto it by leaving it off, or delete it by resolving this decision to "no":

| Where | Row | Key | Default |
|---|---|---|---|
| Settings → Appearance → Feedback | **Offer Translate** — *"Adds a Translate item to the long-press menu on post and comment text, using the system translator."* | `feedback.offerTranslate` | **`false`** |

Live Text's own translate action (`04b` §3.3) is **system-provided inside `ImageAnalysisInteraction`**
and is unaffected by this setting; we do not and cannot filter the system's own image menu.

### 3.13 Distribution reach: Mac and Apple Vision Pro

Both are App Store Connect availability switches, not code.

| Surface | Decision | Why |
|---|---|---|
| **"Designed for iPad" on Apple silicon Macs** | **Available** `[DECISION: mac-designed-for-ipad]` | Zero code: the same binary, frameworks and runtime. The app is already adaptive, already pointer- and keyboard-aware (`02` §5.15.6), and already ships all four iPad orientations. Turning it off would be discarding a platform for nothing. Set a sensible minimum macOS version |
| **Apple Vision Pro (compatible-app mode)** | **Available** `[DECISION: visionos-compat-app-store]` | Also zero code; compatible iPad apps run in a window. There is one thing to verify and it is cheap: Live Activities are unsupported on visionOS and a request to start one fails — we ship none (§3.15), so there is nothing to fail. Revisit if it generates support load |

Neither is a v1 *feature*; both are checkboxes that a Phase 10 submission must consciously set.
Neither is tested beyond "it launches", and `PROGRESS.md` says so.

### 3.14 Deferred, with reasons

| Feature | Decision | Reason |
|---|---|---|
| **CloudKit / `CKSyncEngine` dataset sync** — seen posts, hidden posts, drafts, counter stats, subreddit visits | `[DECISION: cloudkit-dataset-sync-deferred]` | KVS is the right size for settings and the wrong size for 5 000 seen-post rows. Real dataset sync means a CloudKit container, a record schema that has to version alongside the GRDB schema, a sync engine with its own conflict model, and a whole new class of "why did my seen posts vanish" bug. The seam is clean: `Persistence`'s six stores already sit behind protocols, and `SyncKit` already owns the merge vocabulary. Revisit when the settings sync has been stable for a release |
| **Interactive widget/control writes** (vote, save, reply) | `[DECISION: widget-write-actions-deferred]` | §3.2: every one is a Reddit write needing the device-local session |
| **Now Playing framework** (`MediaSessionRepresentable`, iOS 27) | `background-audio-pip` (#52), unchanged | Surfacing a Reddit video on the Lock Screen and in the Dynamic Island only makes sense with background audio, which we are not shipping. `02` §19 already records that player ownership is centralised so this stays a contained addition |
| **`BGContinuedProcessingTask` for long downloads** | `background-inbox-refresh` (#91) neighbourhood | The only long operation in the app is a single video download from the viewer, which completes in seconds and already blocks on a visible `ProgressView`. Revisit if batch download ever ships |

### 3.15 Rejected, with reasons

| Feature | Decision | Reason |
|---|---|---|
| **Live Activities / Dynamic Island** | `[DECISION: live-activities-rejected]` | ActivityKit exists for "an event or activity over several hours" — a flight, a game, a delivery. A Reddit reader has **no such event**; the nearest candidate, a media download, finishes in seconds. Shipping one would mean `NSSupportsLiveActivities`, a second presentation family and an `ActivityAttributes` model, to display a progress bar already on screen. Rejected on value, not cost |
| **Writing Tools adoption** | `[DECISION: writing-tools-not-adopted]` | Apple's documentation: Writing Tools lets people "proofread, rewrite, summarize, or compose content with the help of system-provided **large language models (LLMs) and Apple Intelligence**". That is generative AI and `[DECISION: ai-removed]` forbids it. **But we also do not disable it**: `writingToolsBehavior(.disabled)` is *not* applied to the composer, because Writing Tools is a system affordance present in every text view on the OS, the user invokes it themselves, and switching it off in one app is hostile and surprising. The rule is: **do not adopt, do not advertise, do not customise, do not suppress** |
| **Foundation Models / `SystemLanguageModel` / any generated text** | `ai-removed` (#2), `guide-ai-answer-drop` (#88) | Unchanged |
| **Push notifications of any kind**, including APNs-driven widget or control reloads | `push-removed` (#3) | Unchanged. Widgets reload from the app; controls reload when used |
| **In-app Face ID / passcode lock** | `[DECISION: no-in-app-app-lock]` | iOS 18 ships this system-wide: long-press any app icon → Require Face ID. It works better than an in-app lock (it hides the app's content in the App Switcher and its data in Search), it is user-controlled, and per Apple Support "when you lock or hide an app on your iPhone, it's only locked or hidden on that iPhone" — which is also the right privacy model. An in-app `LocalAuthentication` gate would be a worse copy with a launch-time cost. **Ship nothing; mention it in the Help section instead** |
| **Background audio** | `background-mode-audio-pip-only` | §3.8.1 |
| **Camera Control** | — | The app uses no camera. Nothing to bind |
| **Passkeys / `ASAuthorization`** | — | Login is Reddit's own cookie flow in a web view (`04c` §2); the app never sees a credential and has no account of its own |
| **Custom Core Haptics patterns** | `core-haptics-not-used` | §2.2 |
| **Apple Pencil hover / squeeze / double-tap** | — | No drawing, no text entry surface that would benefit. Pencil taps behave as touches (H6.09) |

---

## 4. Accessibility baseline `[DECISION: accessibility-baseline-normative]`

`02` §15.1 sets a seven-point floor. This section makes it **per-surface and testable**, because
accessibility is not a separate concern from "native quality of life" — it is the same concern for
users who cannot see the animation or feel the Taptic Engine. Every row is a Phase 9 gate.

### 4.1 Per-surface requirements

| Surface | Required | Test method |
|---|---|---|
| **Post card** (`04a` §4) | One composed `accessibilityElement(children: .combine)` label: title, subreddit, author, score, comment count, age, and "seen" when dimmed. **Every** long-press-menu item plus the two VoiceOver-only actions ("Read post contents", "Open external link to <host>") exposed as `accessibilityAction(named:)`. The four swipe bands' assigned actions are **also** exposed as named actions, so a VoiceOver user never has to swipe | Accessibility Inspector audit; XCUITest asserts the action list length matches the menu |
| **Comment row** (`04a` §14.2) | Label includes "reply level N" (the colour rail is invisible to VoiceOver); collapse/expand as a named action; OP/MOD as **text badges**, not colour alone (`op-mod-badges` #92); the nine menu items as named actions | As above |
| **Swipe container** (`02` §5.12) | The container itself is not focusable; its actions live on the row as named actions. The band drag is never the only route to an action | XCUITest with VoiceOver traits |
| **Floating comment-nav button** (`04a` §15.4) | Label "Next comment"; named actions "Previous comment" and "Move button"; the reposition overlay's ten slots are each a focusable button labelled by position. The hold-to-reposition gesture is **not** the only way to move it | Manual VoiceOver walkthrough |
| **Media viewer** (`04b` §2) | Close, Share, Info card, index chevrons, mute, speed and PiP are individually focusable and labelled. Zoom exposes `accessibilityZoomAction`. The image exposes its `alt`/`title` when Reddit supplies one, else "Image N of M in <post title>". Drag-to-dismiss has an `accessibilityAction(.escape)` equivalent | Accessibility Inspector + manual |
| **Gallery grid** (`04b` §10) | Each cell labelled with its post title and media kind; the blur pill announces "NSFW, double-tap to reveal" | Inspector |
| **Feed FABs** (`04a` §9) | `accessibilityAddTraits(.isToggle)` with an `accessibilityValue` of on/off, not just a label | Inspector |
| **Split view** (`02` §5.15) | The two columns are separate `accessibilityElement` containers with rotor-reachable headings; Close and Fullscreen are labelled; selecting a post posts an `AccessibilityNotification.LayoutChanged` pointing at the pane | Manual on iPad |
| **Every settings row** | Label + value + hint where the effect is not obvious; conditional rows never leave a focusable empty element behind | Inspector |
| **Theme Maker colour picker** (`04c` §18.4) | The three custom sliders expose `accessibilityValue` as "Red, 128" and support `accessibilityAdjustableAction` in steps of 1 (and 16 with a three-finger swipe) | Manual VoiceOver |
| **Paywall** (`05` §6) | Price, period, trial terms and the two legal links are all in the reading order before the purchase button | Inspector |
| **Widgets** (§3.2) | `accessibilityLabel` on every element; the widget's overall label summarises its content in one sentence | Inspector on the Home Screen |
| **All screens** | Dynamic Type to **`.accessibility5` (XXXL)** with no clipped or truncated-to-nothing text; minimum 44×44 pt hit targets; colour never the only signal; every image that carries meaning has a label and every decorative one is `.accessibilityHidden(true)` | Snapshot matrix + Inspector |

### 4.2 Test method (Phase 9 gate)

1. **Accessibility Inspector audit** on every screen in the `Route` enum, on both an iPhone and an
   iPad simulator. **Zero** warnings. The audit is scripted where possible and its output is attached
   to `PROGRESS.md`.
2. **VoiceOver walkthrough**, on a device, of six flows: launch → feed → post → comments → reply;
   swipe actions via the rotor; media viewer open/zoom/dismiss; account switch; theme change; a
   purchase in the StoreKit sandbox. Recorded as pass/fail per flow in `PROGRESS.md`.
3. **Dynamic Type at `.accessibility5`**: a screenshot of every canonical screen, added to the
   snapshot matrix (`02` §16.3) as a new axis. Clipping is a failure, not a note.
4. **Reduce Motion run**: the whole app driven once with Reduce Motion on, confirming §5.2's
   fallbacks and that **no** information is lost when an animation is removed.
5. **Reduce Transparency and Increase Contrast** are already snapshot axes (`02` §5.10 rule 5); this
   document adds that the **four `glassEffect` sites** (`02` §5.10 rule 2, plus the pane control
   capsule) are each checked by eye under Reduce Transparency on both device classes.
6. **Smart Invert**: every image, thumbnail, gallery cell and video poster carries
   `.accessibilityIgnoresInvertColors(true)`; text and chrome do not. One pass per device class.
7. **Voice Control**: every tappable element has a spoken name that matches its visible label, or an
   `accessibilityLabel` that does. Icon-only controls (FABs, pane controls, viewer pills) are the
   risk; check each by name.
8. **Assistive Access**: **not supported in v1**, and not claimed. The app declares no
   `UISupportsAssistiveAccess` behaviour and appears in the system's default reduced presentation.
   Recorded here so its absence is deliberate.

---

## 5. Motion and animation polish

### 5.1 What ships

| Motion | Where | API | Min OS |
|---|---|---|---|
| Zoom navigation transition | Feed/gallery → media viewer; feed card → post detail | `.navigationTransition(.zoom(sourceID:in:))` | 18.0 |
| Scroll edge effects under custom bars | Feed, comments, both split-view columns | `.scrollEdgeEffectStyle(_:for:)` | 26.0 |
| Tab bar minimisation on scroll | Every feed screen, when `hideTabsOnScroll` is on | `tabBarMinimizeBehavior(.onScrollDown)` (`tab-hide-on-scroll` #89) | 26.0 |
| Liquid Glass morphing between toolbar states | Toolbars whose items change with context (post detail's sort menu, the viewer's chrome) | Let the system morph: **change the items, never the container**. A `GlassEffectContainer` groups the viewer's control pills so they morph as one | 26.0 |
| Symbol effects | §3.10's closed list | `symbolEffect`, `contentTransition(.symbolEffect(.replace))` | 17.0 |
| Swipe row spring-back | `SwipeActionsRow` | damping 100 / stiffness 300, overshoot clamped (`04a` §7.1) | — |
| Live drag-dismiss interpolation | Media viewer | Background fade + container shrink over `[-150, -50, 0]` (`04b` §2.3) | — |
| Pulse highlight | `PulseHighlight` (`02` §3.1) | Unchanged | — |

**ProMotion.** Nothing in the app opts into a high frame rate explicitly, and nothing needs
`CADisableMinimumFrameDurationOnPhone`. SwiftUI animations and scroll views already run at the
display's native rate; the work that makes a 120 Hz device feel 120 Hz is the performance contract in
`02` §18, not a frame-rate flag. **Do not add one.**

### 5.2 Reduce Motion fallbacks (normative, one row per animation)

`[DECISION: motion-reduce-parity]`


`@Environment(\.accessibilityReduceMotion)` is read once into the design system and every row below
has an explicit fallback. "Removed" always means *instant*, never *slower*.

| Animation | Reduce Motion behaviour |
|---|---|
| Zoom navigation transitions (§3.9) | Removed — platform default push/present |
| Modal spring (`02` §5.9) | Removed — instant |
| Swipe row spring-back | Removed — snaps to 0 |
| Media viewer drag-dismiss interpolation | Kept while the finger is down (it is direct manipulation, not decoration); the **release** animation is removed |
| Pinch/zoom, pan flick decay (`04b` §3.2) | Direct manipulation is kept; the **flick decay** is removed (the image stops on release) |
| Symbol effects (§3.10) | `.bounce` removed; `.replace` becomes an instant swap; `.variableColor` and `.rotate` removed, leaving the static glyph plus the existing spinner |
| Tab bar minimisation | Removed — the bar stays put |
| Scroll edge effects | **Kept** — they are a material, not a motion |
| Reposition-mode overlay fade (`04a` §15.4) | Removed — the overlay appears instantly |
| `PulseHighlight` | Removed — a static highlight for the same duration |
| Liquid Glass morphing | System-managed; the OS already reduces it. Do not fight it |
| Gallery/feed image cross-fades | Removed — instant |

**Haptics are not reduced with motion** (§2.3).

### 5.3 The do-not list

1. **Do not** animate anything on the app's launch path; the launch screen must match the first
   painted frame (`02` §1.2).
2. **Do not** put `glassEffect` on anything beyond the four sanctioned sites (`02` §5.10 rule 2); a
   fifth is a review failure, not a judgement call.
3. **Do not** set a custom background on a bar, tab bar, toolbar or sheet to "help" a transition.
4. **Do not** animate list content insertion during pagination — new rows appear, they do not slide.
5. **Do not** use a symbol effect on a control whose state has not changed.
6. **Do not** use motion as the only signal for a state change; every animation in §5.1 has a
   non-animated counterpart (a label, a colour, a haptic).
7. **Do not** animate the split-view pane's appearance during a **live** window resize
   (`.animation(nil)`, `06` risk R13).
8. **Do not** chain two transitions on one navigation (a zoom *and* a fade); pick one.

---

## 6. Traceability

### 6.1 Source → this document

| Section | Implements / supersedes |
|---|---|
| §1 Principles | Owner directive ("quality-of-life features… for ALL gestures… latest modern iPhone capabilities"); `02` §0.4 non-goals; `05` §4 gate list |
| §2 Haptic map | **Supersedes** `02` §5.13 (three semantic calls) and the haptic sentences in `02` §5.12, `04a` §2.4, §7.1, §9, `04b` §2.4, §7.3, `04c` §2.7, §7.4. Source behaviour: `spec/01` §14, §3.2; `spec/09` §6.1, §7.4; `spec/03` §7; `spec/04` §8; `spec/05` §2.4, §7.3; `spec/08` item 213 |
| §2.1 Cue vocabulary | `SensoryFeedback` DocC, per-case "Only plays feedback on…" discussions; HIG *Playing haptics* |
| §2.2 Implementation | `UIFeedbackGenerator.prepare()`, `init(view:)`, `impactOccurred(at:)`; `CHHapticEngine`; `02` §3.1 (DesignSystem haptics facade) |
| §2.3 Toggle | HIG *Playing haptics* ("Make haptics optional"); `03` §8.1 new key `feedback.haptics` |
| §3.2–§3.3 Widgets, controls | WidgetKit, `ControlWidget`; `02` §2.2, §3.1 (new target), §14.3 (App Group) |
| §3.4–§3.5 Intents, Spotlight | `08` #16 `shortcuts-intent` (extended); App Intents, `AppShortcutsProvider`, `IndexedEntity`, `CSSearchableItem`; `03` §12.4 |
| §3.6 Handoff | `NSUserActivity`, `NSUserActivityTypes`, SwiftUI `userActivity`/`onContinueUserActivity`; `02` §5.7 (one intake path), §19 (`Route: Codable`) |
| §3.7 iCloud | `NSUbiquitousKeyValueStore` + its documented quotas; `03` §8.3 (new synced-key table), §7.4 (Keychain); `02` §11.4, §11.5 |
| §3.8 PiP | **Supersedes the PiP half of** `08` #52 `background-audio-pip`; `AVPictureInPictureController`; *Configuring your app for media playback*; `02` §14.7, §19; `06` §1.3; `04b` §7.4, §8.1 |
| §3.9 Zoom transitions | **Extends** `08` #68 `viewer-zoom-transition`; `spec/10` §A3 |
| §3.10 Symbols | `SymbolEffect` DocC; `02` §5.10 rule 6; `06` §1.8 |
| §3.11 Search tab | `TabRole.search` DocC; `02` §5.4; `04c` §7.1, §7.4; `08` #90 `tab-longpress-mechanism` |
| §3.12 Translation | Translation framework DocC; `08` #2 `ai-removed` (boundary argument) |
| §3.15 Rejected | ActivityKit; UIKit *Writing Tools*; Apple Support *Lock or hide an app on iPhone* |
| §4 Accessibility | **Expands** `02` §15.1; `08` #92 `op-mod-badges`; `06` Phase 9 accessibility audit |
| §5 Motion | `02` §5.10, §15.1 rule 3, §18; `spec/10` §A2, §A3; `08` #89 `tab-hide-on-scroll` |

### 6.2 Decision ids introduced here

All twenty-seven are numbered entries in `08-decisions-and-drift.md` §1.5, #101–#127:

`native-haptic-map` · `haptics-toggle` · `haptics-implementation-split` · `core-haptics-not-used` ·
`widgets-homescreen` · `widget-write-actions-deferred` · `control-center-controls` ·
`app-intents-shortcuts` · `spotlight-index` · `handoff-continuity` · `icloud-kvs-sync` ·
`icloud-keychain-sessions-no` · `cloudkit-dataset-sync-deferred` · `pip-fullscreen-video` ·
`background-mode-audio-pip-only` · `zoom-transitions-everywhere` · `symbol-effects` ·
`search-tab-role` · `translation-optional` · `writing-tools-not-adopted` ·
`accessibility-baseline-normative` · `motion-reduce-parity` · `mac-designed-for-ipad` ·
`visionos-compat-app-store` · `live-activities-rejected` · `no-in-app-app-lock` ·
`native-polish-free`

Ids **extended or superseded** by this document, which keep their existing numbers:
`background-audio-pip` (#52, PiP half superseded by #114), `viewer-zoom-transition` (#68, extended by
#116), `shortcuts-intent` (#16, extended by #108), `live-text-dead-setting` (#19, unchanged),
`scroll-to-next-button` (#41, unchanged).

### 6.3 Citations

Every API claim in this document, first-party unless marked. All read 2026-09-17.

**Haptics**
[`SensoryFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback) ·
[`sensoryFeedback(_:trigger:)`](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(_:trigger:)) ·
[`sensoryFeedback(_:trigger:condition:)`](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(_:trigger:condition:)) ·
[`sensoryFeedback(trigger:_:)`](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(trigger:_:)) ·
[`.impact(weight:intensity:)`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/impact(weight:intensity:)) ·
[`.impact(flexibility:intensity:)`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/impact(flexibility:intensity:)) ·
[`SensoryFeedback.Weight`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/weight) ·
[`SensoryFeedback.Flexibility`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/flexibility) ·
[`.selection`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/selection) ·
[`.success`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/success) ·
[`.warning`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/warning) ·
[`.error`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/error) ·
[`.alignment`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/alignment) ·
[`.levelChange`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/levelchange) ·
[`.increase`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/increase) ·
[`.decrease`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/decrease) ·
[`.start`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/start) ·
[`.stop`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/stop) ·
[`.pathComplete`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/pathcomplete) ·
[`.press(_:)`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/press(_:)) ·
[`SensoryFeedback.PressFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/pressfeedback) ·
[`SensoryFeedback.ReleaseFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/releasefeedback) ·
[`SensoryFeedback.SelectionFeedback`](https://developer.apple.com/documentation/swiftui/sensoryfeedback/selectionfeedback) ·
[`UIFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uifeedbackgenerator) ·
[`prepare()`](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/prepare()) ·
[`init(view:)`](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/init(view:)) ·
[`UIImpactFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator) ·
[`impactOccurred(at:)`](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator/impactoccurred(at:)) ·
[`UISelectionFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uiselectionfeedbackgenerator) ·
[`UINotificationFeedbackGenerator`](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator) ·
[`CHHapticEngine`](https://developer.apple.com/documentation/corehaptics/chhapticengine) ·
[HIG — Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)

**Widgets, controls, Live Activities**
[WidgetKit](https://developer.apple.com/documentation/widgetkit) ·
[`ControlWidget`](https://developer.apple.com/documentation/swiftui/controlwidget) ·
[ActivityKit](https://developer.apple.com/documentation/activitykit) ·
[Run shortcuts with the Action button](https://support.apple.com/guide/shortcuts/run-shortcuts-with-the-action-button-apdfea15680b/ios)

**Intents, Spotlight, Handoff**
[App Intents](https://developer.apple.com/documentation/appintents) ·
[`AppIntent`](https://developer.apple.com/documentation/appintents/appintent) ·
[`AppShortcutsProvider`](https://developer.apple.com/documentation/appintents/appshortcutsprovider) ·
[App Shortcuts](https://developer.apple.com/documentation/appintents/app-shortcuts) ·
[`IndexedEntity`](https://developer.apple.com/documentation/appintents/indexedentity) ·
[`CSSearchableItem`](https://developer.apple.com/documentation/corespotlight/cssearchableitem) ·
[Configuring Siri support](https://developer.apple.com/documentation/xcode/configuring-siri-support) ·
[`NSUserActivity`](https://developer.apple.com/documentation/foundation/nsuseractivity) ·
[`NSUserActivityTypes`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsuseractivitytypes) ·
[`userActivity(_:isActive:_:)`](https://developer.apple.com/documentation/swiftui/view/useractivity(_:isactive:_:)) ·
[`onContinueUserActivity(_:perform:)`](https://developer.apple.com/documentation/swiftui/view/oncontinueuseractivity(_:perform:))

**iCloud**
[`NSUbiquitousKeyValueStore`](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore) ·
[iCloud Key-Value Store Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.ubiquity-kvstore-identifier)

**Media**
[`AVPictureInPictureController`](https://developer.apple.com/documentation/avkit/avpictureinpicturecontroller) ·
[Adopting Picture in Picture in a standard player](https://developer.apple.com/documentation/avkit/adopting-picture-in-picture-in-a-standard-player) ·
[Configuring your app for media playback](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback)

**SwiftUI polish**
[`navigationTransition(_:)`](https://developer.apple.com/documentation/swiftui/view/navigationtransition(_:)) ·
[`SymbolEffect`](https://developer.apple.com/documentation/symbols/symboleffect) ·
[`.drawOn`](https://developer.apple.com/documentation/symbols/symboleffect/drawon) ·
[`ContentTransition.symbolEffect`](https://developer.apple.com/documentation/swiftui/contenttransition/symboleffect) ·
[`TabRole.search`](https://developer.apple.com/documentation/swiftui/tabrole/search) ·
[`scrollEdgeEffectStyle(_:for:)`](https://developer.apple.com/documentation/swiftui/view/scrolledgeeffectstyle(_:for:)) ·
[`accessibilityAction(named:_:)`](https://developer.apple.com/documentation/swiftui/view/accessibilityaction(named:_:)) ·
[`RequestReviewAction`](https://developer.apple.com/documentation/storekit/requestreviewaction)

**Translation, Writing Tools, app lock, distribution**
[Translation framework](https://developer.apple.com/documentation/translation) ·
[`translationPresentation(isPresented:text:…)`](https://developer.apple.com/documentation/translation/translationpresentation(ispresented:text:attachmentanchor:arrowedge:replacementaction:)) ·
[Writing Tools (UIKit)](https://developer.apple.com/documentation/uikit/writing-tools) ·
[`writingToolsBehavior(_:)`](https://developer.apple.com/documentation/swiftui/view/writingtoolsbehavior(_:)) ·
[Lock or hide an app on iPhone](https://support.apple.com/guide/iphone/lock-or-hide-an-app-iph00f208d05/ios) ·
[Manage availability of iPhone and iPad apps on Macs with Apple silicon](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon/) ·
[Manage availability of iPhone and iPad apps on Apple Vision Pro](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro/)

**Advisory note, no decision attached.** `RequestReviewAction`'s documentation says *"Because this API
may not present an alert, don't call it in response to a button tap or other user action."* `04c`
§21.1's pre-prompt card calls it from a **"Rate now"** button (`08` #87 `review-prompt-mechanism`).
The design is deliberate — the card is the app's own prompt and the system alert is best-effort on
top of it, and every exit path sets the "asked" flag regardless — but the tension with Apple's
guidance is recorded here rather than discovered in review. No change to #87 is made by this
document.
